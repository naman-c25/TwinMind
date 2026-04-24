export type SuggestionType =
  | 'ANSWER'
  | 'QUESTION'
  | 'FACT_CHECK'
  | 'TALKING_POINT'
  | 'CLARIFICATION';

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: string; // ISO
}

export interface Suggestion {
  type: SuggestionType;
  title: string;
  preview: string;
}

export interface SuggestionBatch {
  id: string;
  suggestions: Suggestion[];
  timestamp: string;
  transcriptSnapshot: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  fromSuggestion?: {
    title: string;
    type: SuggestionType;
  };
}

export interface AppSettings {
  groqApiKey: string;
  model: string;
  transcriptionModel: string;
  suggestionPrompt: string;
  detailedAnswerPrompt: string;
  chatSystemPrompt: string;
  suggestionContextWords: number;
  detailedAnswerContextWords: number;
  chatContextWords: number;
  autoRefreshInterval: number; // seconds
  maxSuggestionBatches: number;
}
