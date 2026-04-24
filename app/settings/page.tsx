'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppSettings } from '@/lib/types';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/settings';

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<AppSettings>({ groqApiKey: '', ...DEFAULT_SETTINGS });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setForm(loadSettings());
    setMounted(true);
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAndReturn = () => {
    saveSettings(form);
    router.push('/');
  };

  const handleReset = () => {
    const current = loadSettings();
    const reset: AppSettings = {
      groqApiKey: current.groqApiKey, // preserve API key
      ...DEFAULT_SETTINGS,
    };
    setForm(reset);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-navy-900 text-white px-6 py-3.5 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/70 hover:text-white transition-colors">
            <BackIcon className="w-5 h-5" />
          </Link>
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={handleSaveAndReturn}
            className="px-4 py-1.5 rounded-full text-sm font-semibold bg-white text-navy-900 hover:bg-slate-100 transition-all"
          >
            Save & Return
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* ── API & Model ── */}
        <Section title="API & Model" description="Your Groq API key is stored locally and never sent anywhere except directly to Groq.">
          <Field label="Groq API Key" hint="Starts with gsk_">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.groqApiKey}
                onChange={(e) => update('groqApiKey', e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-navy-600 hover:underline mt-1 inline-block"
            >
              Get a Groq API key →
            </a>
          </Field>

          <Field
            label="LLM Model"
            hint="Used for suggestions and chat. Default: meta-llama/llama-4-maverick-17b-128e-instruct (GPT-OSS 120B equivalent)"
          >
            <input
              type="text"
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 font-mono"
            />
          </Field>

          <Field label="Transcription Model" hint="Whisper model for speech-to-text">
            <input
              type="text"
              value={form.transcriptionModel}
              onChange={(e) => update('transcriptionModel', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 font-mono"
            />
          </Field>
        </Section>

        {/* ── Timing & Context ── */}
        <Section title="Timing & Context" description="Control when suggestions refresh and how much transcript context is fed to each prompt.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Auto-refresh interval" hint="Seconds between automatic suggestion refreshes">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={form.autoRefreshInterval}
                  onChange={(e) => update('autoRefreshInterval', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">sec</span>
              </div>
            </Field>

            <Field label="Suggestion context" hint="Words of transcript sent to the live suggestion prompt">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={100}
                  max={2000}
                  step={50}
                  value={form.suggestionContextWords}
                  onChange={(e) => update('suggestionContextWords', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">words</span>
              </div>
            </Field>

            <Field label="Expanded answer context" hint="Words of transcript sent when a suggestion card is clicked">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={200}
                  max={8000}
                  step={100}
                  value={form.detailedAnswerContextWords}
                  onChange={(e) => update('detailedAnswerContextWords', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">words</span>
              </div>
            </Field>

            <Field label="Chat context" hint="Words of transcript available to free-form chat questions">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={200}
                  max={8000}
                  step={100}
                  value={form.chatContextWords}
                  onChange={(e) => update('chatContextWords', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">words</span>
              </div>
            </Field>
          </div>
        </Section>

        {/* ── Prompts ── */}
        <Section title="Prompts" description="Tune the AI behaviour. Use {transcript}, {suggestion_title}, and {suggestion_preview} as placeholders.">
          <Field
            label="Live Suggestion Prompt"
            hint="Sent every refresh cycle. Must return a JSON array of exactly 3 suggestions."
          >
            <PromptTextarea
              value={form.suggestionPrompt}
              onChange={(v) => update('suggestionPrompt', v)}
              rows={18}
            />
          </Field>

          <Field
            label="Detailed Answer Prompt (on-click)"
            hint="Used when a suggestion card is clicked. Placeholders: {transcript}, {suggestion_title}, {suggestion_preview}"
          >
            <PromptTextarea
              value={form.detailedAnswerPrompt}
              onChange={(v) => update('detailedAnswerPrompt', v)}
              rows={14}
            />
          </Field>

          <Field
            label="Chat System Prompt"
            hint="Used for free-form chat questions. Placeholder: {transcript}"
          >
            <PromptTextarea
              value={form.chatSystemPrompt}
              onChange={(v) => update('chatSystemPrompt', v)}
              rows={10}
            />
          </Field>
        </Section>

        {/* Save footer */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Reset Prompts to Defaults
          </button>
          <button
            onClick={handleSaveAndReturn}
            className="px-6 py-2 rounded-lg text-sm font-semibold bg-navy-900 text-white hover:bg-navy-800 transition-colors"
          >
            Save & Return to App
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function PromptTextarea({ value, onChange, rows = 8 }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-500 resize-y leading-relaxed"
    />
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
