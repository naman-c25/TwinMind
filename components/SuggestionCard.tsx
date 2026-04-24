'use client';

import { Suggestion } from '@/lib/types';

interface Props {
  suggestion: Suggestion;
  onClick: (suggestion: Suggestion) => void;
}

const TYPE_CONFIG: Record<
  Suggestion['type'],
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  ANSWER: {
    label: 'Answer',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  QUESTION: {
    label: 'Question',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  FACT_CHECK: {
    label: 'Fact Check',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  TALKING_POINT: {
    label: 'Talking Point',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  CLARIFICATION: {
    label: 'Clarification',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500',
  },
};

export default function SuggestionCard({ suggestion, onClick }: Props) {
  const cfg = TYPE_CONFIG[suggestion.type] ?? TYPE_CONFIG.TALKING_POINT;

  return (
    <button
      onClick={() => onClick(suggestion)}
      className="w-full text-left bg-white border border-slate-200 rounded-lg p-3.5 hover:border-slate-300 hover:shadow-md transition-all duration-150 active:scale-[0.99] group"
    >
      {/* Type badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-1.5 group-hover:text-navy-900">
        {suggestion.title}
      </p>

      {/* Preview — standalone value */}
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
        {suggestion.preview}
      </p>

      {/* Click hint */}
      <p className="text-[10px] text-slate-300 mt-2 group-hover:text-slate-400 transition-colors">
        Click for detailed answer →
      </p>
    </button>
  );
}
