# TwinMind Copilot

A real-time AI meeting copilot that listens to your microphone, transcribes the conversation live, and surfaces three smart suggestions every 30 seconds. Click any suggestion for a detailed answer. Ask follow-up questions in the chat panel. Export the full session when you're done.

Built for the TwinMind SDE-3 assignment.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript) | Server components + API routes in one repo; no separate backend to deploy |
| Styling | Tailwind CSS | Rapid UI iteration without a design system overhead |
| Speech-to-text | Groq Whisper Large V3 | Fastest available Whisper endpoint; ~2–4 s for a 30 s chunk |
| LLM | Groq llama-3.3-70b-versatile | Highest-quality OSS model on Groq; ~1–2 s TTFT for suggestions |
| Hosting | Vercel | Native Next.js support; per-route `maxDuration` for long-running API calls |

---

## Quick start

**1. Clone and install**
```bash
git clone <repo-url>
cd TwinMind
npm install
```

**2. Add your Groq API key**

Option A — paste it in the app (recommended for reviewers):
```
npm run dev → open http://localhost:3000 → Settings → Groq API Key
```

Option B — set it server-side so it applies to all users:
```bash
# .env.local (gitignored)
GROQ_API_KEY=gsk_...
```
Get a free key at https://console.groq.com/keys

**3. Run**
```bash
npm run dev
```
Open http://localhost:3000, click **Start Recording**, and speak.

---

## How it works

```
Mic → 30 s audio chunk → Whisper Large V3 → transcript
                                          ↓
                              llama-3.3-70b-versatile
                             ┌─────────┬──────────────┐
                        Suggestions  Detailed     Free-form
                        (3 per batch) answers     chat
```

1. **Transcript panel (left)** — live text appears chunk by chunk with timestamps.
2. **Suggestions panel (centre)** — three fresh suggestions every 30 seconds, ranked by what's happening *right now*. Five types: Answer, Question, Fact Check, Talking Point, Clarification. Manual refresh available.
3. **Chat panel (right)** — click a suggestion for a detailed answer (uses a separate longer-form prompt). Or type anything directly.
4. **Export** — downloads a timestamped JSON file with the full transcript, every suggestion batch, and the complete chat history.

---

## Prompt strategy

### Context construction

Raw transcript text loses temporal structure. Instead, each chunk is formatted as `[M:SS] <text>` where `M:SS` is elapsed time from session start. This gives the model machine-readable recency signals — it can tell what was said "right now" vs. 10 minutes ago without relying on order alone.

Context is **word-budget-capped per use case**, not a flat truncation:

| Use case | Default word budget | Rationale |
|---|---|---|
| Live suggestions | 500 words (~2–3 min) | Suggestions must reflect *current* conversation, not opening remarks |
| Detailed on-click answer | 2 000 words (~full session) | User asked for depth — give the model the full picture |
| Free-form chat | 1 000 words | Balance between recency and broader context |

The budget walks backwards from the most recent chunk so that when the budget is exhausted, it's always the oldest material that's dropped.

### Suggestion prompt design

The system message is pure instruction; the transcript is the user message. This split gives the model cleaner instruction-following than mixing both in a single user message.

Key decisions:
- **Meeting-type detection** — the prompt includes six named meeting archetypes (technical, sales, interview, brainstorm, decision-making, standup) with different type mixes recommended for each. The model infers the type from the transcript and adjusts accordingly.
- **Thin-context rule** — when fewer than three timestamped chunks are present, the model is constrained to `QUESTION` types only. With less than ~90 s of transcript, making factual claims or specific answers risks hallucination; QUESTION is always safe.
- **Standalone preview rule** — every preview must deliver the full insight without requiring a click. This makes the suggestions useful even in peripheral vision.
- **Anti-repetition** — the client passes the previous batch's suggestion titles as `previousTitles`. These are appended to the user message as a hard constraint. No backend state needed; the constraint travels with the request.
- **First chunk at 15 s** — the first audio chunk is scheduled at 15 s instead of 30 s to cut cold-start latency from ~36 s to ~21 s.

### Detailed answer prompt design

The detailed answer prompt explicitly instructs the model **not to restate the preview** the user already read. It builds on it with specifics, evidence, and an actionable implication — making the click feel worthwhile. A separate 2 000-word context window ensures the model has full session context for this response even if the suggestion was generated from a 500-word window.

### Chat prompt design

Short system prompt that foregrounds speed and directness — users may be mid-meeting. The model is told to lead with the answer and expand only when complexity demands it. Default target: 100–200 words.

---

## Tradeoffs

**Chunk size: 30 s**
Shorter chunks (e.g. 10 s) would feel more live but increase transcription API calls 3×, drive up latency variance, and produce fragments too short for useful suggestions. 30 s is the sweet spot: enough semantic content for the model to reason about, and still feels near-real-time.

**Client-side audio capture vs. server-side**
All audio capture runs in the browser via `MediaRecorder`. The alternative — streaming raw PCM to a server — adds websocket complexity and server-side memory. Since Whisper's input is a completed audio file anyway, client-side chunking is simpler and has no quality penalty.

**No streaming for suggestions**
Suggestions are returned as a single JSON array. Streaming partial JSON is fragile to parse mid-flight and suggestions are only useful once all three are present. The ~1–2 s wait for the full batch is acceptable; the skeleton loader communicates progress.

**Streaming for chat**
Chat responses use SSE streaming because conversational answers benefit from perceived immediacy — the user sees the first words in ~0.5 s rather than waiting 3–5 s for the full response. The implementation uses a `ReadableStream` reader with an `AbortController` so the fetch is cleanly cancelled on unmount.

**localStorage for settings and API key**
Settings (including the API key) live in `localStorage`. This avoids any backend auth complexity and is standard for single-user tools. The key is never sent to any endpoint other than Groq's own API. The tradeoff is that keys don't persist across browsers or devices — acceptable for an assignment demo.

**Word-budget context vs. token counting**
The context builder counts words, not tokens (roughly 1.3 tokens/word). Word counting is O(n) with no external dependencies; token counting would require loading a tokeniser. The approximation is close enough — a 500-word budget comfortably fits within the 1 024-token suggestion `max_tokens` budget with room to spare.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Optional* | Server-side Groq key. If set, users don't need to enter one. |
| `GROQ_LLM_MODEL` | No | Override the LLM model (default: `llama-3.3-70b-versatile`) |
| `GROQ_TRANSCRIPTION_MODEL` | No | Override Whisper model (default: `whisper-large-v3`) |

\* If not set, users must provide their own key via Settings.

---

## Customising prompts

All prompts are editable at runtime via **Settings → Prompts**. Changes are saved to `localStorage` and take effect immediately — no restart needed.

Available placeholders:

| Prompt | Placeholders |
|---|---|
| Live suggestion prompt | `{transcript}` |
| Detailed answer prompt | `{transcript}`, `{suggestion_title}`, `{suggestion_preview}` |
| Chat system prompt | `{transcript}` |

Click **Reset to Defaults** to restore the built-in optimised prompts.

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Set `GROQ_API_KEY` in the Vercel dashboard under **Project → Settings → Environment Variables** if you want a shared server-side key.

The `vercel.json` in this repo sets the correct `maxDuration` for each API route (30 s for transcription and chat, 20 s for suggestions).

---

## Project structure

```
app/
  page.tsx              # Main app — landing page + 3-column layout
  settings/page.tsx     # Settings screen
  api/
    transcribe/         # Whisper Large V3 transcription
    suggestions/        # Live suggestion generation
    chat/               # Streaming chat (SSE)
    health/             # Reports whether server has GROQ_API_KEY set

components/
  TranscriptPanel.tsx   # Left column — live transcript
  SuggestionsPanel.tsx  # Centre column — suggestion batches
  SuggestionCard.tsx    # Individual suggestion card with type badge
  ChatPanel.tsx         # Right column — chat + input
  Icons.tsx             # Shared SVG icons

lib/
  types.ts              # Shared TypeScript interfaces
  settings.ts           # Default prompts + settings load/save
  buildContext.ts       # Builds timestamped transcript context for prompts
  exportSession.ts      # JSON session export
```
