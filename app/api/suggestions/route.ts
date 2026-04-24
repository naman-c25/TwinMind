import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { Suggestion } from '@/lib/types';

export const maxDuration = 20;

function parseSuggestions(raw: string): Suggestion[] {
  // Strip markdown code fences if the model wraps the JSON
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract the first JSON array found
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    const valid: Suggestion[] = [];

    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        'title' in item &&
        'preview' in item
      ) {
        const s = item as Record<string, unknown>;
        const type = String(s.type).toUpperCase();
        const allowedTypes = ['ANSWER', 'QUESTION', 'FACT_CHECK', 'TALKING_POINT', 'CLARIFICATION'];
        valid.push({
          type: allowedTypes.includes(type) ? (type as Suggestion['type']) : 'TALKING_POINT',
          title: String(s.title).slice(0, 120),
          preview: String(s.preview).slice(0, 400),
        });
        if (valid.length === 3) break;
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      transcript: string;
      apiKey: string;
      model: string;
      prompt: string;
    };

    // User's key from Settings takes priority; fall back to server env var
    const apiKey = body.apiKey || process.env.GROQ_API_KEY || null;
    const model = body.model || process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile';
    const { transcript, prompt } = body;
    if (!apiKey) return NextResponse.json({ error: 'No Groq API key — add one in Settings or set GROQ_API_KEY in .env.local' }, { status: 401 });
    if (!transcript?.trim()) return NextResponse.json({ suggestions: [] });

    const groq = new Groq({ apiKey });
    const filledPrompt = prompt.replace('{transcript}', transcript);

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: filledPrompt }],
      model,
      temperature: 0.65,
      max_tokens: 900,
    });

    const content = completion.choices[0]?.message?.content ?? '[]';
    const suggestions = parseSuggestions(content);

    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suggestion generation failed';
    // Log server-side so you can see the real Groq error in terminal
    console.error('[/api/suggestions]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
