'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { ChatMessage, Suggestion } from '@/lib/types';

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (content: string) => void;
  pendingSuggestion: Suggestion | null;
  onClearPendingSuggestion: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TYPE_LABELS: Record<string, string> = {
  ANSWER: 'Answer',
  QUESTION: 'Question',
  FACT_CHECK: 'Fact Check',
  TALKING_POINT: 'Talking Point',
  CLARIFICATION: 'Clarification',
};

export default function ChatPanel({
  messages,
  isLoading,
  onSend,
  pendingSuggestion,
  onClearPendingSuggestion,
}: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (v: string) => {
    setInput(v);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <span className="text-sm font-semibold text-navy-900">Chat</span>
        <span className="text-xs text-slate-400">
          {messages.length > 0 ? `${Math.ceil(messages.length / 2)} exchange${Math.ceil(messages.length / 2) !== 1 ? 's' : ''}` : 'Ask anything'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <ChatIcon className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400 font-medium">No messages yet</p>
            <p className="text-xs text-slate-300 mt-1">Click a suggestion or type a question</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            {/* Suggestion origin tag */}
            {msg.role === 'user' && msg.fromSuggestion && (
              <span className="text-[10px] text-slate-400 mb-1 mr-1">
                {TYPE_LABELS[msg.fromSuggestion.type] ?? msg.fromSuggestion.type} suggestion
              </span>
            )}

            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-navy-900 text-white'
                  : 'bg-slate-50 border border-slate-200 text-slate-800'
              }`}
            >
              {msg.content ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              ) : (
                // Streaming placeholder
                <div className="flex items-center gap-1 py-0.5">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
            <time className="text-[10px] text-slate-300 mt-1 mx-1">{formatTime(msg.timestamp)}</time>
          </div>
        ))}

        {/* Pending suggestion preview pill */}
        {pendingSuggestion && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <SparkleIcon className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 flex-1 leading-relaxed">
              <span className="font-semibold">Expanding: </span>{pendingSuggestion.title}
            </p>
            <button
              onClick={onClearPendingSuggestion}
              className="text-amber-400 hover:text-amber-600 text-xs ml-1"
              title="Cancel"
            >
              ✕
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-navy-500 focus-within:ring-1 focus-within:ring-navy-500/20 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleTextareaChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the conversation…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none outline-none leading-relaxed"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 flex-shrink-0 rounded-lg bg-navy-900 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy-700 transition-colors"
          >
            <SendIcon className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}
