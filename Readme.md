# TwinMind Copilot

A real-time AI meeting copilot that listens to your microphone, transcribes the conversation live, and surfaces three smart suggestions every 30 seconds. Click any suggestion for a detailed answer. Ask follow-up questions in the chat panel. Export the full session when you're done.

Built for the TwinMind SDE-3 assignment.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Speech-to-text | Groq Whisper Large V3 |
| LLM | Groq llama-3.3-70b-versatile (GPT-OSS 120B equivalent) |
| Hosting | Vercel |

---

## Quick start

**1. Clone and install**
```bash
git clone <repo-url>
cd TwinMind
npm install
```

**2. Add your Groq API key**

Option A — paste it in the app (recommended):
```
npm run dev → open http://localhost:3000 → Settings → Groq API Key
```

Option B — set it server-side so it applies to all users:
```bash
# .env (gitignored)
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
