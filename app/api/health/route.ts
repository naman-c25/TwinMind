import { NextResponse } from 'next/server';

// Client uses this to know whether a server-side key is configured,
// so it doesn't block recording when GROQ_API_KEY is set via .env only.
export async function GET() {
  return NextResponse.json({ hasKey: !!process.env.GROQ_API_KEY });
}
