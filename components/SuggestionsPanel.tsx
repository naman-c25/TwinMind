'use client';

import { useEffect, useRef } from 'react';
import { SuggestionBatch, Suggestion } from '@/lib/types';
import SuggestionCard from './SuggestionCard';

interface Props {
  batches: SuggestionBatch[];
  isGenerating: boolean;
  isRecording: boolean;
  nextChunkIn: number | null;
  onSuggestionClick: (suggestion: Suggestion) => void;
  onManualRefresh: () => void;
  hasTranscript: boolean;
}

function formatBatchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SuggestionsPanel({
  batches,
  isGenerating,
  isRecording,
  nextChunkIn,
  onSuggestionClick,
  onManualRefresh,
  hasTranscript,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestBatchId = batches[0]?.id;

  // Scroll to top whenever a new batch lands so the user always sees the freshest suggestions
  useEffect(() => {
    if (latestBatchId) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [latestBatchId]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-900">Live Suggestions</span>
          {batches.length > 0 && (
            <span className="text-xs text-slate-400">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</span>
          )}
          {/* Countdown chip — shows how long until the next auto-refresh */}
          {isRecording && !isGenerating && nextChunkIn !== null && nextChunkIn > 0 && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              ↻ {nextChunkIn}s
            </span>
          )}
        </div>
        <button
          onClick={onManualRefresh}
          disabled={isGenerating || !hasTranscript}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Refresh suggestions now"
        >
          <RefreshIcon className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating ? 'Thinking…' : 'Refresh'}
        </button>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Generating skeleton */}
        {isGenerating && (
          <div className="space-y-2">
            <div className="text-[10px] text-slate-300 font-medium uppercase tracking-wider px-0.5">
              Generating…
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3.5 animate-pulse">
                <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-slate-100 rounded w-full mb-1" />
                <div className="h-3 bg-slate-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* Suggestion batches — newest first */}
        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {batchIdx === 0 && !isGenerating ? '● Latest' : formatBatchTime(batch.timestamp)}
              </span>
              {batchIdx === 0 && !isGenerating && (
                <span className="text-[10px] text-slate-300">{formatBatchTime(batch.timestamp)}</span>
              )}
            </div>
            {batch.suggestions.map((suggestion, idx) => (
              <SuggestionCard
                key={`${batch.id}-${idx}`}
                suggestion={suggestion}
                onClick={onSuggestionClick}
              />
            ))}
          </div>
        ))}

        {/* Empty state */}
        {batches.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <SparklesIcon className="w-5 h-5 text-slate-400" />
            </div>
            {isRecording && nextChunkIn !== null ? (
              <>
                <p className="text-sm text-slate-500 font-medium">Listening…</p>
                <p className="text-xs text-slate-400 mt-1">
                  First suggestions in <span className="font-mono font-semibold">{nextChunkIn}s</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400 font-medium">Suggestions appear here</p>
                <p className="text-xs text-slate-300 mt-1">
                  {hasTranscript ? 'Press Refresh to generate suggestions' : 'Start recording to get live suggestions'}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}
