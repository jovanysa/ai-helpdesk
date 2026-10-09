export interface KnowledgeRef {
  title: string;
  file: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** The knowledge chunks the server read for this reply (assistant messages only). */
  sources?: KnowledgeRef[];
  /** The customer already gave 👍 or 👎 (kept here so it survives leaving the page). */
  rated?: boolean;
}
