import { AppSettings } from './types';

// ─── Optimal default prompts ──────────────────────────────────────────────────

export const DEFAULT_SUGGESTION_PROMPT = `You are an elite AI copilot running live during a conversation. Surface exactly 3 high-value suggestions that would help the speaker RIGHT NOW.

## Suggestion types — pick the mix that creates the most value at this moment:
- ANSWER       → Direct answer to a question just raised in the conversation
- QUESTION     → A sharp follow-up that would deepen understanding or unblock the discussion
- FACT_CHECK   → Verify, correct, or add critical nuance to a claim just stated
- TALKING_POINT → A relevant insight, statistic, or angle worth raising now
- CLARIFICATION → Disambiguate something unclear, ambiguous, or likely misunderstood

## Hard rules:
1. PREVIEW = STANDALONE VALUE. Write 1–2 sentences with the actual insight, answer, or data. The user must benefit from reading the preview alone — never write "Click for details" style teasers.
2. SPECIFICITY IS NON-NEGOTIABLE. Every suggestion must reference something actually said. No generic advice.
3. READ THE ROOM. If a question was just asked → lead with ANSWER. If a bold claim was made → consider FACT_CHECK. If momentum stalled → use a sharp QUESTION.
4. TITLE = ACTION. 5–8 words, verb-first. "Python's GIL blocks true parallelism" beats "About Python threads."
5. MIX TYPES unless the conversation strongly calls for one type.

Return ONLY a JSON array — no markdown fences, no commentary:
[
  {"type": "ANSWER|QUESTION|FACT_CHECK|TALKING_POINT|CLARIFICATION", "title": "...", "preview": "..."},
  {"type": "...", "title": "...", "preview": "..."},
  {"type": "...", "title": "...", "preview": "..."}
]

Recent transcript:
{transcript}`;

export const DEFAULT_DETAILED_ANSWER_PROMPT = `A meeting copilot user clicked a suggestion for deeper context. They are in an active conversation — deliver maximum value immediately.

Structure your response as:
1. Lead with the core answer or insight (no preamble, no "great question")
2. Support with concrete evidence, examples, or specific data
3. Reference what was actually said in the conversation where relevant
4. Use short paragraphs or bullets for fast scanning
5. Close with the single most actionable implication for their specific situation

Target: 150–300 words. Dense with insight, zero filler.

Conversation transcript:
{transcript}

---
Suggestion: {suggestion_title}
Preview context: {suggestion_preview}`;

export const DEFAULT_CHAT_SYSTEM_PROMPT = `You are a sharp AI copilot with full access to an ongoing conversation. The user may be in an active meeting — answer fast and direct.

Guidelines:
- Lead with the answer, then provide supporting context
- Reference specific quotes or moments from the transcript when they're directly relevant
- 100–200 words by default; expand only when complexity demands it
- If something can't be answered from the transcript, answer from general knowledge and say so clearly
- No filler, no meta-commentary, no restating the question

Current conversation transcript:
---
{transcript}
---`;

// ─── Default settings ─────────────────────────────────────────────────────────

// "GPT-OSS 120B" per assignment spec — using Groq's most capable OSS model.
// Update this model ID in Settings if Groq releases a newer flagship.
// llama-3.3-70b-versatile is Groq's most capable reliably-available OSS model.
// Update to a newer model in Settings once confirmed available on your Groq account.
export const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-large-v3';

export const DEFAULT_SETTINGS: Omit<AppSettings, 'groqApiKey'> = {
  model: DEFAULT_LLM_MODEL,
  transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL,
  suggestionPrompt: DEFAULT_SUGGESTION_PROMPT,
  detailedAnswerPrompt: DEFAULT_DETAILED_ANSWER_PROMPT,
  chatSystemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT,
  suggestionContextWords: 500,   // ~2–3 min of conversation
  chatContextWords: 2000,         // full session context for chat
  autoRefreshInterval: 30,        // seconds between auto-refreshes
  maxSuggestionBatches: 20,
};

const STORAGE_KEY = 'twinmind_settings';

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return { groqApiKey: '', ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULT_SETTINGS, groqApiKey: '', ...parsed };
    }
  } catch {
    // corrupted storage — fall through to defaults
  }
  return { groqApiKey: '', ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hasApiKey(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return typeof parsed.groqApiKey === 'string' && parsed.groqApiKey.length > 0;
  } catch {
    return false;
  }
}
