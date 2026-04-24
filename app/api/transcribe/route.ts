import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const maxDuration = 30; // seconds — Whisper on long audio can be slow

// Whisper hallucinates these strings on silence — filter them out
const HALLUCINATIONS = new Set([
  'thank you.',
  'thanks for watching.',
  'thank you for watching.',
  'you',
  'bye.',
  'bye!',
  'goodbye.',
  '[music]',
  '[applause]',
  'www.mouser.com',
]);

function isValidTranscript(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 6) return false;
  if (HALLUCINATIONS.has(cleaned.toLowerCase())) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    // User's key from Settings takes priority; fall back to server env var
    const apiKey =
      (formData.get('apiKey') as string | null) ||
      process.env.GROQ_API_KEY ||
      null;
    const model =
      (formData.get('model') as string | null) ||
      process.env.GROQ_TRANSCRIPTION_MODEL ||
      'whisper-large-v3';

    if (!apiKey) return NextResponse.json({ error: 'No Groq API key — add one in Settings or set GROQ_API_KEY in .env.local' }, { status: 401 });
    if (!audioFile) return NextResponse.json({ error: 'Missing audio' }, { status: 400 });
    if (audioFile.size < 1500) return NextResponse.json({ text: '' });

    const groq = new Groq({ apiKey });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model,
      response_format: 'json',
      language: 'en',
    });

    const text = transcription.text?.trim() ?? '';
    return NextResponse.json({ text: isValidTranscript(text) ? text : '' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
