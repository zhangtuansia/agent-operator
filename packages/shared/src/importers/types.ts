/**
 * Chat Import Types
 *
 * Types for importing conversation history from external platforms
 * like OpenAI (ChatGPT) and Anthropic (Claude).
 */

/**
 * A single message in an imported conversation
 */
export interface ImportedMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

/**
 * A fully parsed conversation ready for import
 */
export interface ImportedConversation {
  /** Original ID from the source platform */
  id: string
  /** Conversation title */
  title: string
  /** When the conversation was created (Unix ms) */
  createdAt: number
  /** When the conversation was last updated (Unix ms) */
  updatedAt: number
  /** Messages in chronological order */
  messages: ImportedMessage[]
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Successfully parsed conversations */
  conversations: ImportedConversation[]
  /** Number of conversations imported */
  imported: number
  /** Number of conversations that failed to parse */
  failed: number
  /** Error messages for debugging */
  errors: string[]
}

/**
 * Supported import sources
 */
export type ImportSource = 'openai' | 'anthropic'
