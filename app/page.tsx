'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TranscriptPanel from '@/components/TranscriptPanel';
import SuggestionsPanel from '@/components/SuggestionsPanel';
import ChatPanel from '@/components/ChatPanel';
import { AppSettings, ChatMessage, Suggestion, SuggestionBatch, TranscriptChunk } from '@/lib/types';
import { loadSettings } from '@/lib/settings';
import { exportSession } from '@/lib/exportSession';
import { buildTranscriptContext } from '@/lib/buildContext';
import { MicIcon, KeyIcon, ExportIcon, GearIcon } from '@/components/Icons';

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const serverHasKeyRef = useRef(false); // true when GROQ_API_KEY is set in .env

  // Session state
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextChunkIn, setNextChunkIn] = useState<number | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<Suggestion | null>(null);

  // Refs — always up-to-date values for use in callbacks
  const settingsRef = useRef<AppSettings | null>(null);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const latestBatchRef = useRef<SuggestionBatch | null>(null);
  const isRecordingRef = useRef(false);
  const sessionStartRef = useRef(new Date().toISOString());

  // Recording refs
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // setTimeout handle — recursive so each 30s window starts AFTER processing finishes
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Abort controller for the active chat stream — cancelled on unmount
  const chatAbortRef = useRef<AbortController | null>(null);
  // Tracks when the current chunk timer started and its duration, for the countdown display
  const chunkScheduledAtRef = useRef<{ at: number; ms: number } | null>(null);

  const chatMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { transcriptChunksRef.current = transcriptChunks; }, [transcriptChunks]);
  useEffect(() => { latestBatchRef.current = suggestionBatches[0] ?? null; }, [suggestionBatches]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    setSettings(s);
    setHasApiKey(!!s.groqApiKey);
    // Check if the server has a key in .env so we don't block recording unnecessarily
    fetch('/api/health')
      .then((r) => r.json())
      .then(({ hasKey }: { hasKey: boolean }) => {
        serverHasKeyRef.current = hasKey;
        if (hasKey) setHasApiKey(true);
      })
      .catch(() => {});
  }, []);

  // ── Audio helpers ─────────────────────────────────────────────────────────

  const stopRecorderAndGetBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== 'recording') { resolve(null); return; }
      const blobs: Blob[] = [];
      // Safety timeout: if onstop never fires (browser bug), don't block the pipeline
      const timeout = setTimeout(() => resolve(null), 5000);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) blobs.push(e.data); };
      recorder.onstop = () => {
        clearTimeout(timeout);
        const blob = new Blob(blobs, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob.size > 1500 ? blob : null);
      };
      recorder.stop();
    });

  const startNewRecorder = useCallback(() => {
    if (!streamRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = () => {};
    recorder.start();
    recorderRef.current = recorder;
  }, []);

  // ── AI pipeline ───────────────────────────────────────────────────────────

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string> => {
    const s = settingsRef.current;
    // Allow request even if localStorage key is empty — server may have GROQ_API_KEY in .env
    if (!s?.groqApiKey && !serverHasKeyRef.current) return '';
    setIsTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'audio.webm');
      fd.append('apiKey', s?.groqApiKey ?? '');
      fd.append('model', s?.transcriptionModel ?? 'whisper-large-v3');
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Transcription error ${res.status}`);
      const data = await res.json() as { text?: string; error?: string };
      if (data.error) throw new Error(data.error);
      return data.text ?? '';
    } catch (err) {
      setError((err as Error).message);
      return '';
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const isGeneratingRef = useRef(false); // guard against concurrent generation calls

  const generateSuggestions = useCallback(async (chunks: TranscriptChunk[]) => {
    const s = settingsRef.current;
    if ((!s?.groqApiKey && !serverHasKeyRef.current) || chunks.length === 0) return;
    // Prevent race: auto-refresh + manual refresh firing simultaneously
    if (isGeneratingRef.current) return;
    const totalWords = chunks.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
    if (totalWords < 30) return;
    const contextText = buildTranscriptContext(chunks, s?.suggestionContextWords ?? 500);
    isGeneratingRef.current = true;
    setIsGeneratingSuggestions(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: contextText,
          apiKey: s?.groqApiKey ?? '',
          model: s?.model ?? '',
          prompt: s?.suggestionPrompt ?? '',
          previousTitles: latestBatchRef.current?.suggestions.map((sg) => sg.title) ?? [],
        }),
      });
      if (!res.ok) throw new Error(`Suggestions error ${res.status}`);
      const data = await res.json() as { suggestions?: Suggestion[]; error?: string };
      if (data.error) throw new Error(data.error);
      // Require exactly 3 — a partial batch would break the "exactly 3" requirement
      if (data.suggestions && data.suggestions.length === 3) {
        const batch: SuggestionBatch = {
          id: crypto.randomUUID(),
          suggestions: data.suggestions,
          timestamp: new Date().toISOString(),
          transcriptSnapshot: contextText,
        };
        setSuggestionBatches((prev) => [batch, ...prev].slice(0, s?.maxSuggestionBatches ?? 20));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      isGeneratingRef.current = false;
      setIsGeneratingSuggestions(false);
    }
  }, []);

  const processChunk = useCallback(async () => {
    const blob = await stopRecorderAndGetBlob();
    const text = blob ? await transcribeBlob(blob) : '';
    if (text) {
      const chunk: TranscriptChunk = { id: crypto.randomUUID(), text, timestamp: new Date().toISOString() };
      setTranscriptChunks((prev) => {
        const updated = [...prev, chunk];
        transcriptChunksRef.current = updated;
        generateSuggestions(updated);
        return updated;
      });
    }
    // Restart recorder AFTER processing completes so each audio chunk is a full 30s window
    if (isRecordingRef.current) startNewRecorder();
  }, [transcribeBlob, generateSuggestions, startNewRecorder]);

  // Recursive setTimeout — the window begins AFTER the previous chunk finishes processing.
  // firstChunk=true uses a 15 s window so initial suggestions arrive in ~20 s instead of ~35 s.
  const scheduleNextChunk = useCallback((firstChunk = false) => {
    if (!isRecordingRef.current) return;
    const ms = firstChunk ? 15_000 : (settingsRef.current?.autoRefreshInterval ?? 30) * 1000;
    chunkScheduledAtRef.current = { at: Date.now(), ms };
    chunkTimerRef.current = setTimeout(async () => {
      if (!isRecordingRef.current) return;
      chunkScheduledAtRef.current = null;
      await processChunk();
      scheduleNextChunk();
    }, ms);
  }, [processChunk]);

  // Countdown ticker — updates nextChunkIn every 500 ms while recording
  useEffect(() => {
    if (!isRecording) { setNextChunkIn(null); return; }
    const id = setInterval(() => {
      const sched = chunkScheduledAtRef.current;
      if (!sched) { setNextChunkIn(null); return; }
      const remaining = Math.ceil((sched.at + sched.ms - Date.now()) / 1000);
      setNextChunkIn(remaining > 0 ? remaining : 0);
    }, 500);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Recording controls ────────────────────────────────────────────────────

  const startRecording = async () => {
    const s = settingsRef.current;
    if (!s?.groqApiKey && !serverHasKeyRef.current) { router.push('/settings'); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Detect mic disconnection mid-session
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (isRecordingRef.current) {
            setError('Microphone disconnected. Please check your mic and start recording again.');
            stopRecording();
          }
        };
      });

      isRecordingRef.current = true;
      setIsRecording(true);
      setHasStarted(true);
      startNewRecorder();
      scheduleNextChunk(true); // first chunk is 15 s for faster initial suggestions
    } catch {
      setError('Microphone access denied. Please allow microphone access in your browser and try again.');
    }
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null; }
    // Process whatever audio was captured in the current (incomplete) chunk
    const blob = await stopRecorderAndGetBlob();
    if (blob) {
      const text = await transcribeBlob(blob);
      if (text) {
        const chunk: TranscriptChunk = { id: crypto.randomUUID(), text, timestamp: new Date().toISOString() };
        setTranscriptChunks((prev) => {
          const updated = [...prev, chunk];
          transcriptChunksRef.current = updated;
          generateSuggestions(updated);
          return updated;
        });
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  };

  const handleManualRefresh = async () => {
    if (isRecording) {
      // Cancel the pending timer, process current chunk now, then reschedule
      if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null; }
      await processChunk();
      scheduleNextChunk();
    } else {
      await generateSuggestions(transcriptChunksRef.current);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendChatMessage = useCallback(async (userContent: string, fromSuggestion?: Suggestion) => {
    const s = settingsRef.current;
    if ((!s?.groqApiKey && !serverHasKeyRef.current) || !userContent.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', content: userContent,
      timestamp: new Date().toISOString(),
      fromSuggestion: fromSuggestion ? { title: fromSuggestion.title, type: fromSuggestion.type } : undefined,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsChatLoading(true);

    const contextLimit = fromSuggestion
      ? (s?.detailedAnswerContextWords ?? 2000)
      : (s?.chatContextWords ?? 1000);
    const transcriptContext = buildTranscriptContext(transcriptChunksRef.current, contextLimit);

    let systemPrompt: string;
    let apiUserMessage: string;
    const apiKey = s?.groqApiKey ?? '';
    const model = s?.model ?? '';
    if (fromSuggestion) {
      systemPrompt = (s?.detailedAnswerPrompt ?? '')
        .replace('{transcript}', transcriptContext)
        .replace('{suggestion_title}', fromSuggestion.title)
        .replace('{suggestion_preview}', fromSuggestion.preview);
      apiUserMessage = fromSuggestion.title;
    } else {
      systemPrompt = (s?.chatSystemPrompt ?? '').replace('{transcript}', transcriptContext);
      apiUserMessage = userContent;
    }

    // Read latest messages via ref — avoids stale closure without nesting fetch in a state updater
    const history = chatMessagesRef.current
      .filter((m) => m.id !== assistantId)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    chatAbortRef.current?.abort();
    const abort = new AbortController();
    chatAbortRef.current = abort;
    (async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt, userMessage: apiUserMessage, chatHistory: history, apiKey, model }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Chat error ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break;
            try {
              const { text } = JSON.parse(payload) as { text: string };
              if (text) {
                accumulated += text;
                setChatMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m));
              }
            } catch { /* partial line */ }
          }
        }
      } catch (err) {
        // AbortError means the component unmounted or a new message was sent — not a real error
        if ((err as Error).name !== 'AbortError') {
          setChatMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: `Error: ${(err as Error).message}` } : m));
        }
      } finally { setIsChatLoading(false); }
    })();
  }, []);

  const handleSuggestionClick = useCallback((s: Suggestion) => {
    setPendingSuggestion(s);
    sendChatMessage(s.title, s);
  }, [sendChatMessage]);

  // Clear the pending-suggestion pill once the chat response finishes streaming
  useEffect(() => {
    if (!isChatLoading) setPendingSuggestion(null);
  }, [isChatLoading]);

  useEffect(() => () => {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    chatAbortRef.current?.abort();
  }, []);

  // ── LANDING PAGE ──────────────────────────────────────────────────────────
  if (!hasStarted) {
    return (
      <div className="landing-bg min-h-screen flex flex-col">
        {/* Top nav */}
        <nav className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-navy-900/80 backdrop-blur flex items-center justify-center">
              <span className="text-[10px] font-black text-white">TM</span>
            </div>
            <span className="text-sm font-semibold text-navy-900/80">TwinMind Copilot</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="px-4 py-1.5 rounded-full text-sm font-medium text-navy-900/70 bg-white/40 hover:bg-white/60 backdrop-blur transition-all"
            >
              Settings
            </Link>
          </div>
        </nav>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pb-24">
          {/* Error */}
          {error && (
            <div className="mb-6 flex items-center gap-2 bg-red-50/80 border border-red-200 rounded-xl px-4 py-3 max-w-md backdrop-blur">
              <span className="text-sm text-red-700">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 ml-2">✕</button>
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl font-bold text-navy-900 mb-2 tracking-tight">
            Your AI Meeting Copilot
          </h1>
          <p className="text-navy-900/60 text-base mb-10 max-w-sm leading-relaxed">
            Press start to capture your conversation. Get live suggestions and instant answers as you speak.
          </p>

          {/* Main CTA */}
          {hasApiKey ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-3 px-8 py-4 rounded-full bg-navy-900 text-white text-base font-semibold shadow-xl hover:bg-navy-800 hover:shadow-2xl hover:scale-105 transition-all duration-200"
            >
              <MicIcon className="w-5 h-5" />
              Start Recording
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Link
                href="/settings"
                className="flex items-center gap-3 px-8 py-4 rounded-full bg-navy-900 text-white text-base font-semibold shadow-xl hover:bg-navy-800 hover:scale-105 transition-all duration-200"
              >
                <KeyIcon className="w-5 h-5" />
                Set up your Groq API key →
              </Link>
              <p className="text-xs text-navy-900/40">Free at console.groq.com</p>
            </div>
          )}

          {/* How it works */}
          {hasApiKey && (
            <div className="mt-14 flex items-center gap-8 text-navy-900/50">
              <Step icon="🎤" label="Speak naturally" />
              <Arrow />
              <Step icon="✨" label="Get 3 live suggestions" />
              <Arrow />
              <Step icon="💬" label="Click for deep answers" />
            </div>
          )}
        </div>

        {/* Mountain silhouette SVG */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              fill="#0B2D4E"
              fillOpacity="0.08"
              d="M0,320 L0,240 L180,120 L360,200 L480,80 L620,180 L720,60 L860,160 L960,100 L1100,200 L1200,140 L1320,220 L1440,180 L1440,320 Z"
            />
            <path
              fill="#0B2D4E"
              fillOpacity="0.05"
              d="M0,320 L0,280 L120,200 L240,260 L380,160 L500,240 L620,180 L740,260 L860,200 L1000,280 L1120,220 L1260,290 L1440,240 L1440,320 Z"
            />
          </svg>
        </div>
      </div>
    );
  }

  // ── 3-COLUMN APP LAYOUT ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-navy-900 text-white px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (!isRecording) setHasStarted(false); }}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            title={isRecording ? 'Stop recording first' : 'Back to home'}
          >
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">TM</span>
            </div>
          </button>
          <span className="text-sm font-semibold">TwinMind Copilot</span>
          {isRecording && (
            <span className="flex items-center gap-1.5 ml-1">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse-slow" />
              <span className="text-xs text-red-300 font-medium">Live</span>
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 rounded-md px-3 py-1 max-w-sm">
            <span className="text-xs text-red-200 truncate">{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white text-xs flex-shrink-0">✕</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-white text-navy-900 hover:bg-slate-100'
            }`}
          >
            {isRecording ? (
              <><span className="w-2 h-2 rounded-sm bg-white" />Stop</>
            ) : (
              <><MicIcon className="w-4 h-4" />Record</>
            )}
          </button>

          <button
            onClick={() => {
              exportSession(transcriptChunks, suggestionBatches, chatMessages, sessionStartRef.current);
              setExportDone(true);
              setTimeout(() => setExportDone(false), 1500);
            }}
            disabled={transcriptChunks.length === 0 && chatMessages.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ExportIcon className="w-3.5 h-3.5" />
            {exportDone ? 'Downloaded ✓' : 'Export'}
          </button>

          <Link href="/settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all">
            <GearIcon className="w-3.5 h-3.5" />Settings
          </Link>
        </div>
      </header>

      {/* 3 columns */}
      <main className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
        <div className="w-1/4 min-w-0 flex flex-col">
          <TranscriptPanel chunks={transcriptChunks} isRecording={isRecording} isTranscribing={isTranscribing} />
        </div>
        <div className="w-[38%] min-w-0 flex flex-col">
          <SuggestionsPanel
            batches={suggestionBatches}
            isGenerating={isGeneratingSuggestions}
            isRecording={isRecording}
            nextChunkIn={nextChunkIn}
            onSuggestionClick={handleSuggestionClick}
            onManualRefresh={handleManualRefresh}
            hasTranscript={transcriptChunks.length > 0}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <ChatPanel
            messages={chatMessages}
            isLoading={isChatLoading}
            onSend={(content) => sendChatMessage(content)}
            pendingSuggestion={pendingSuggestion}
            onClearPendingSuggestion={() => setPendingSuggestion(null)}
          />
        </div>
      </main>
    </div>
  );
}

// ── Landing-page helpers ──────────────────────────────────────────────────────

function Step({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function Arrow() {
  return <span className="text-navy-900/30 text-lg">→</span>;
}
