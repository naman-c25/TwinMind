import { TranscriptChunk, SuggestionBatch, ChatMessage } from './types';

export function exportSession(
  transcriptChunks: TranscriptChunk[],
  suggestionBatches: SuggestionBatch[],
  chatMessages: ChatMessage[],
  sessionStart: string,
): void {
  const fullTranscript = transcriptChunks.map((c) => c.text).join(' ');

  const payload = {
    meta: {
      sessionStart,
      exportTime: new Date().toISOString(),
      totalTranscriptWords: fullTranscript.split(/\s+/).filter(Boolean).length,
      totalSuggestionBatches: suggestionBatches.length,
      totalChatMessages: chatMessages.length,
    },
    transcript: {
      full: fullTranscript,
      chunks: transcriptChunks.map((c) => ({
        timestamp: c.timestamp,
        text: c.text,
      })),
    },
    suggestions: suggestionBatches.map((b) => ({
      timestamp: b.timestamp,
      items: b.suggestions.map((s) => ({
        type: s.type,
        title: s.title,
        preview: s.preview,
      })),
    })),
    chat: chatMessages.map((m) => ({
      timestamp: m.timestamp,
      role: m.role,
      content: m.content,
      ...(m.fromSuggestion && { fromSuggestion: m.fromSuggestion }),
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `twinmind-session-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
