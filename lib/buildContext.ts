import { TranscriptChunk } from './types';

/**
 * Builds a structured transcript context from chunks, respecting a word budget.
 * Each chunk is prefixed with an elapsed-time stamp ([M:SS]) so the model
 * understands recency and temporal flow within the context window.
 */
export function buildTranscriptContext(chunks: TranscriptChunk[], wordLimit: number): string {
  if (chunks.length === 0) return '';

  // Select chunks from the end that fit within the word budget
  let wordCount = 0;
  const selected: TranscriptChunk[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunkWords = chunks[i].text.split(/\s+/).filter(Boolean).length;
    if (wordCount + chunkWords > wordLimit) break;
    selected.unshift(chunks[i]);
    wordCount += chunkWords;
  }

  // Edge case: a single chunk exceeds the budget — truncate it
  if (selected.length === 0) {
    const last = chunks[chunks.length - 1];
    return last.text.split(/\s+/).filter(Boolean).slice(-wordLimit).join(' ');
  }

  const sessionStart = new Date(selected[0].timestamp).getTime();
  return selected
    .map((c) => {
      const elapsed = Math.round((new Date(c.timestamp).getTime() - sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return `[${mins}:${String(secs).padStart(2, '0')}] ${c.text.trim()}`;
    })
    .join('\n');
}
