'use client';

import { useEffect, useRef } from 'react';
import { TranscriptChunk } from '@/lib/types';

interface Props {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  isTranscribing: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TranscriptPanel({ chunks, isRecording, isTranscribing }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chunks]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-900">Transcript</span>
          {isRecording && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse-slow" />
              <span className="text-xs text-red-500 font-medium">Live</span>
            </span>
          )}
        </div>
        {isTranscribing && (
          <span className="text-xs text-slate-400 italic">processing…</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {chunks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <MicIcon className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 font-medium">No transcript yet</p>
            <p className="text-xs text-slate-300 mt-1">Press Start to begin recording</p>
          </div>
        ) : (
          chunks.map((chunk) => (
            <div key={chunk.id} className="group">
              <time className="text-[10px] text-slate-300 font-mono block mb-0.5">
                {formatTime(chunk.timestamp)}
              </time>
              <p className="text-sm text-slate-700 leading-relaxed">{chunk.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}
