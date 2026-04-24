import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export const maxDuration = 30; // streaming responses need enough headroom

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      systemPrompt: string;
      userMessage: string;
      chatHistory: ChatHistoryItem[];
      apiKey: string;
      model: string;
    };

    const { systemPrompt, userMessage, chatHistory } = body;
    // User's key from Settings takes priority; fall back to server env var
    const apiKey = body.apiKey || process.env.GROQ_API_KEY || null;
    const model = body.model || process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'No Groq API key — add one in Settings or set GROQ_API_KEY in .env.local' }),
        { status: 401 },
      );
    }

    const groq = new Groq({ apiKey });

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-12).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const stream = await groq.chat.completions.create({
      messages,
      model,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
