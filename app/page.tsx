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

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Session state
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<Suggestion | null>(null);

  // Refs — always up-to-date values for use in callbacks
  const settingsRef = useRef<AppSettings | null>(null);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const isRecordingRef = useRef(false);
  const sessionStartRef = useRef(new Date().toISOString());

  // Recording refs
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { transcriptChunksRef.current = transcriptChunks; }, [transcriptChunks]);

  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    setSettings(s);
    setHasApiKey(!!s.groqApiKey);
  }, []);

  // ── Audio helpers ─────────────────────────────────────────────────────────

  const stopRecorderAndGetBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== 'recording') { resolve(null); return; }
      const blobs: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) blobs.push(e.data); };
      recorder.onstop = () => {
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
    if (!s?.groqApiKey) return '';
    setIsTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'audio.webm');
      fd.append('apiKey', s.groqApiKey);
      fd.append('model', s.transcriptionModel);
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

  const generateSuggestions = useCallback(async (chunks: TranscriptChunk[]) => {
    const s = settingsRef.current;
    if (!s?.groqApiKey || chunks.length === 0) return;
    const fullText = chunks.map((c) => c.text).join(' ');
    const words = fullText.split(/\s+/).filter(Boolean);
    if (words.length < 15) return;
    const contextText = words.slice(-s.suggestionContextWords).join(' ');
    setIsGeneratingSuggestions(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: contextText, apiKey: s.groqApiKey, model: s.model, prompt: s.suggestionPrompt }),
      });
      if (!res.ok) throw new Error(`Suggestions error ${res.status}`);
      const data = await res.json() as { suggestions?: Suggestion[]; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.suggestions && data.suggestions.length > 0) {
        const batch: SuggestionBatch = {
          id: crypto.randomUUID(),
          suggestions: data.suggestions,
          timestamp: new Date().toISOString(),
          transcriptSnapshot: contextText,
        };
        setSuggestionBatches((prev) => [batch, ...prev].slice(0, s.maxSuggestionBatches));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
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
    if (isRecordingRef.current) startNewRecorder();
  }, [transcribeBlob, generateSuggestions, startNewRecorder]);

  // ── Recording controls ────────────────────────────────────────────────────

  const startRecording = async () => {
    const s = settingsRef.current;
    if (!s?.groqApiKey) { router.push('/settings'); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);
      setHasStarted(true);
      startNewRecorder();
      const ms = (s.autoRefreshInterval ?? 30) * 1000;
      intervalRef.current = setInterval(processChunk, ms);
    } catch {
      setError('Microphone access denied. Please allow microphone access in your browser and try again.');
    }
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      await processChunk();
      const ms = (settingsRef.current?.autoRefreshInterval ?? 30) * 1000;
      intervalRef.current = setInterval(processChunk, ms);
    } else {
      await generateSuggestions(transcriptChunksRef.current);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendChatMessage = useCallback(async (userContent: string, fromSuggestion?: Suggestion) => {
    const s = settingsRef.current;
    if (!s?.groqApiKey || !userContent.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', content: userContent,
      timestamp: new Date().toISOString(),
      fromSuggestion: fromSuggestion ? { title: fromSuggestion.title, type: fromSuggestion.type } : undefined,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsChatLoading(true);

    const fullText = transcriptChunksRef.current.map((c) => c.text).join(' ');
    const transcriptContext = fullText.split(/\s+/).filter(Boolean).slice(-s.chatContextWords).join(' ');

    let systemPrompt: string;
    let apiUserMessage: string;
    if (fromSuggestion) {
      systemPrompt = s.detailedAnswerPrompt
        .replace('{transcript}', transcriptContext)
        .replace('{suggestion_title}', fromSuggestion.title)
        .replace('{suggestion_preview}', fromSuggestion.preview);
      apiUserMessage = `Please provide a detailed explanation of: ${fromSuggestion.title}`;
    } else {
      systemPrompt = s.chatSystemPrompt.replace('{transcript}', transcriptContext);
      apiUserMessage = userContent;
    }

    setChatMessages((prev) => {
      const history = prev.filter((m) => m.id !== assistantId).slice(-12).map((m) => ({ role: m.role, content: m.content }));
      (async () => {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt, userMessage: apiUserMessage, chatHistory: history, apiKey: s.groqApiKey, model: s.model }),
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
          setChatMessages((p) => p.map((m) => m.id === assistantId ? { ...m, content: `Error: ${(err as Error).message}` } : m));
        } finally { setIsChatLoading(false); }
      })();
      return prev;
    });
  }, []);

  const handleSuggestionClick = useCallback((s: Suggestion) => {
    setPendingSuggestion(null);
    setHasStarted(true);
    sendChatMessage(s.title, s);
  }, [sendChatMessage]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
            onClick={() => exportSession(transcriptChunks, suggestionBatches, chatMessages, sessionStartRef.current)}
            disabled={transcriptChunks.length === 0 && chatMessages.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ExportIcon className="w-3.5 h-3.5" />Export
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

// ── Helper components ─────────────────────────────────────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
