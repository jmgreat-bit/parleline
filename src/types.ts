export type StageNumber = 1 | 2 | 3 | 4;

export interface GrammarSideNote {
  phrase: string;
  literalMeaning: string;
  naturalExplanation: string;
  patternTip: string;
  examples: string[];
}

export interface ChatMessage {
  id: string;
  workspaceId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  mode: 'chat' | 'call';
  stageAtTurn: StageNumber;
  englishGloss?: string;
  suggestedReplies?: string[];
  detectedPhrases?: string[];
  whyNote?: GrammarSideNote;
}

export interface LanguageWorkspace {
  id: string;
  target_language: string;
  language_code: string;
  anchor_language: string;
  companion_name: string;
  companion_role: string;
  city_line: string;
  dial_code: string;
  avatar_url: string;
  current_stage: StageNumber;
  mastered_phrases: string[];
  active_practice_topics: string[];
  grammar_unlocked: boolean;
  last_session_summary: string;
  voice_name: string;
  updated_at: string;
}

export interface CallRecord {
  id: string;
  workspaceId: string;
  companionName: string;
  durationSeconds: number;
  stageAtCall: number;
  summary: string;
  phrasesMastered: string[];
  transcriptTurnsCount: number;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
}

export interface UserMemoryState {
  user_id: string;
  active_workspace: string;
  workspaces: Record<string, LanguageWorkspace>;
}

export interface StageDefinition {
  stage: StageNumber;
  title: string;
  shortLabel: string;
  targetLength: string;
  description: string;
  samplePrompts: string[];
  unlockCriteria: string;
}
