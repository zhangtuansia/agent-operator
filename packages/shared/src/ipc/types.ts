/**
 * IPC Types
 *
 * Types for IPC communication between main and renderer processes.
 * These types are framework-agnostic and can be used in any Electron/Node.js app.
 */

import type { Message, TypedError, TokenUsage } from '@agent-operator/core/types'
import type { PermissionMode } from '../agent/mode-types'
import type { ThinkingLevel } from '../agent/thinking-levels'
import type { CredentialAuthRequest, AuthRequest } from '../agent/session-scoped-tools'

// =============================================================================
// Session Types
// =============================================================================

/**
 * Todo state for sessions (user-controlled, never automatic)
 *
 * Dynamic status ID referencing workspace status config.
 * Validated at runtime via validateSessionStatus().
 * Falls back to 'todo' if status doesn't exist.
 */
export type TodoState = string

/** Helper type for TypeScript consumers */
export type BuiltInStatusId = 'todo' | 'in-progress' | 'needs-review' | 'done' | 'cancelled'

/**
 * Session with runtime state (includes messages array and processing state)
 */
export interface Session {
  id: string
  workspaceId: string
  workspaceName: string
  name?: string  // User-defined or AI-generated session name
  /** Preview of first user message (from JSONL header, for lazy-loaded sessions) */
  preview?: string
  lastMessageAt: number
  messages: Message[]
  isProcessing: boolean
  // Session metadata
  isFlagged?: boolean
  // Advanced options (persisted per session)
  /** Permission mode for this session ('safe', 'ask', 'allow-all') */
  permissionMode?: PermissionMode
  // Todo state (user-controlled) - determines open vs closed
  todoState?: TodoState
  // Read/unread tracking - ID of last message user has read
  lastReadMessageId?: string
  // Per-session source selection (source slugs)
  enabledSourceSlugs?: string[]
  // Working directory for this session (used by agent for bash commands)
  workingDirectory?: string
  // Session folder path (for "Reset to Session Root" option)
  sessionFolderPath?: string
  // Shared viewer URL (if shared via viewer)
  sharedUrl?: string
  // Shared session ID in viewer (for revoke)
  sharedId?: string
  // Model to use for this session (overrides global config if set)
  model?: string
  // Thinking level for this session ('off', 'think', 'max')
  thinkingLevel?: ThinkingLevel
  // Role/type of the last message (for badge display without loading messages)
  lastMessageRole?: 'user' | 'assistant' | 'plan' | 'tool' | 'error'
  // Whether an async operation is ongoing (sharing, updating share, revoking, title regeneration)
  isAsyncOperationOngoing?: boolean
  /** @deprecated Use isAsyncOperationOngoing instead */
  isRegeneratingTitle?: boolean
  // Current status for ProcessingIndicator (e.g., compacting)
  currentStatus?: {
    message: string
    statusType?: string
  }
  // Token usage for context tracking
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    contextTokens: number
    costUsd: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    /** Model's context window size in tokens (from SDK modelUsage) */
    contextWindow?: number
  }
  /** When true, session is hidden from session list (e.g., mini edit sessions) */
  hidden?: boolean
}

// CreateSessionOptions is defined in schemas.ts (inferred from Zod schema)
// Re-export it here for convenience
export type { CreateSessionOptions } from './schemas'

// =============================================================================
// Session Events (main → renderer)
// =============================================================================

/**
 * Permission request with session context (for multi-session Electron app)
 */
export interface PermissionRequest {
  requestId: string
  toolName: string
  command: string
  description: string
  type?: 'bash'
  sessionId: string
}

/**
 * Events sent from main to renderer for session updates
 * turnId: Correlation ID from the API's message.id, groups all events in an assistant turn
 */
export type SessionEvent =
  | { type: 'text_delta'; sessionId: string; delta: string; turnId?: string }
  | { type: 'text_complete'; sessionId: string; text: string; isIntermediate?: boolean; turnId?: string; parentToolUseId?: string }
  | { type: 'tool_start'; sessionId: string; toolName: string; toolUseId: string; toolInput: Record<string, unknown>; toolIntent?: string; toolDisplayName?: string; turnId?: string; parentToolUseId?: string }
  | { type: 'tool_result'; sessionId: string; toolUseId: string; toolName: string; result: string; turnId?: string; parentToolUseId?: string; isError?: boolean }
  | { type: 'parent_update'; sessionId: string; toolUseId: string; parentToolUseId: string }
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'typed_error'; sessionId: string; error: TypedError }
  | { type: 'complete'; sessionId: string; tokenUsage?: Session['tokenUsage'] }
  | { type: 'interrupted'; sessionId: string; message?: Message }
  | { type: 'status'; sessionId: string; message: string; statusType?: 'compacting' }
  | { type: 'info'; sessionId: string; message: string; statusType?: 'compaction_complete'; level?: 'info' | 'warning' | 'error' | 'success' }
  | { type: 'title_generated'; sessionId: string; title: string }
  | { type: 'title_regenerating'; sessionId: string; isRegenerating: boolean }
  // Generic async operation state (sharing, updating share, revoking, title regeneration)
  | { type: 'async_operation'; sessionId: string; isOngoing: boolean }
  | { type: 'working_directory_changed'; sessionId: string; workingDirectory: string }
  | { type: 'permission_request'; sessionId: string; request: PermissionRequest }
  | { type: 'credential_request'; sessionId: string; request: CredentialAuthRequest }
  // Permission mode events
  | { type: 'permission_mode_changed'; sessionId: string; permissionMode: PermissionMode }
  | { type: 'plan_submitted'; sessionId: string; message: Message }
  // Source events
  | { type: 'sources_changed'; sessionId: string; enabledSourceSlugs: string[] }
  // Background task/shell events
  | { type: 'task_backgrounded'; sessionId: string; toolUseId: string; taskId: string; intent?: string; turnId?: string }
  | { type: 'shell_backgrounded'; sessionId: string; toolUseId: string; shellId: string; intent?: string; command?: string; turnId?: string }
  | { type: 'task_progress'; sessionId: string; toolUseId: string; elapsedSeconds: number; turnId?: string }
  | { type: 'shell_killed'; sessionId: string; shellId: string }
  // User message events (for optimistic UI with backend as source of truth)
  | { type: 'user_message'; sessionId: string; message: Message; status: 'accepted' | 'queued' | 'processing' }
  // Session metadata events (for multi-window sync)
  | { type: 'session_flagged'; sessionId: string }
  | { type: 'session_unflagged'; sessionId: string }
  | { type: 'session_model_changed'; sessionId: string; model: string | null }
  | { type: 'todo_state_changed'; sessionId: string; todoState: TodoState }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_shared'; sessionId: string; sharedUrl: string }
  | { type: 'session_unshared'; sessionId: string }
  // Auth request events (unified auth flow)
  | { type: 'auth_request'; sessionId: string; message: Message; request: AuthRequest }
  | { type: 'auth_completed'; sessionId: string; requestId: string; success: boolean; cancelled?: boolean; error?: string }
  // Source activation events (for auto-retry on mid-turn activation)
  | { type: 'source_activated'; sessionId: string; sourceSlug: string; originalMessage: string }
  // Real-time usage update during processing (for context display)
  | { type: 'usage_update'; sessionId: string; tokenUsage: { inputTokens: number; contextWindow?: number } }

// =============================================================================
// Session Commands
// =============================================================================

// SessionCommand is defined in schemas.ts (inferred from Zod schema)
// Re-export it here for convenience
export type { SessionCommand } from './schemas'

// =============================================================================
// Result Types
// =============================================================================

/**
 * OAuth result from main process
 */
export interface OAuthResult {
  success: boolean
  error?: string
}

/**
 * MCP connection validation result
 */
export interface McpValidationResult {
  success: boolean
  error?: string
  tools?: string[]
}

/**
 * MCP tool with safe mode permission status
 */
export interface McpToolWithPermission {
  name: string
  description?: string
  allowed: boolean  // true if allowed in safe mode, false if requires permission
}

/**
 * Result of fetching MCP tools with permission status
 */
export interface McpToolsResult {
  success: boolean
  error?: string
  tools?: McpToolWithPermission[]
}

/**
 * Result of sharing or revoking a session
 */
export interface ShareResult {
  success: boolean
  url?: string
  error?: string
}

/**
 * Result of refreshing/regenerating a session title
 */
export interface RefreshTitleResult {
  success: boolean
  title?: string
  error?: string
}

/**
 * Result of saving onboarding configuration
 */
export interface OnboardingSaveResult {
  success: boolean
  error?: string
  workspaceId?: string
}

/**
 * Result from Claude OAuth (setup-token) flow
 */
export interface ClaudeOAuthResult {
  success: boolean
  token?: string
  error?: string
}

// =============================================================================
// Settings Types
// =============================================================================

/**
 * Current billing method info for settings
 */
export interface BillingMethodInfo {
  authType: 'api_key' | 'oauth_token' | 'bedrock'
  hasCredential: boolean
  /** Provider ID if using third-party API (e.g., 'glm', 'minimax', 'deepseek') */
  provider?: string
}

/**
 * Auto-update information
 */
export interface UpdateInfo {
  /** Whether an update is available */
  available: boolean
  /** Current installed version */
  currentVersion: string
  /** Latest available version (null if check failed) */
  latestVersion: string | null
  /** Download URL for the update DMG */
  downloadUrl: string | null
  /** Download state */
  downloadState: 'idle' | 'downloading' | 'ready' | 'installing' | 'error'
  /** Download progress (0-100) */
  downloadProgress: number
  /** Error message if download/install failed */
  error?: string
}

/**
 * Per-workspace settings
 */
export interface WorkspaceSettings {
  name?: string
  model?: string
  permissionMode?: PermissionMode
  /** Permission modes available for SHIFT+TAB cycling (min 2 modes) */
  cyclablePermissionModes?: PermissionMode[]
  /** Default thinking level for new sessions ('off', 'think', 'max'). Defaults to 'think'. */
  thinkingLevel?: ThinkingLevel
  workingDirectory?: string
  /** Whether local (stdio) MCP servers are enabled */
  localMcpEnabled?: boolean
}

// =============================================================================
// File Types
// =============================================================================

// FileAttachment is defined in schemas.ts (inferred from Zod schema)
export type { FileAttachment } from './schemas'

/**
 * File/directory entry in a skill folder
 */
export interface SkillFile {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillFile[]
}

/**
 * File/directory entry in a session folder
 * Supports recursive tree structure with children for directories
 */
export interface SessionFile {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: SessionFile[]  // Recursive children for directories
}

/**
 * Combined session and workspace files response
 */
export interface SessionFilesResult {
  sessionFiles: SessionFile[]
  workspaceFiles: SessionFile[]
}

// =============================================================================
// Plan Types
// =============================================================================

/**
 * Step in a plan
 */
export interface PlanStep {
  id: string
  description: string
  tools?: string[]
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
}

/**
 * Plan from the agent
 */
export interface Plan {
  id: string
  title: string
  summary?: string
  steps: PlanStep[]
  questions?: string[]
  state?: 'creating' | 'refining' | 'ready' | 'executing' | 'completed' | 'cancelled'
  createdAt?: number
  updatedAt?: number
}

// =============================================================================
// Credential Types
// =============================================================================

// CredentialResponse is defined in schemas.ts (inferred from Zod schema)
export type { CredentialResponse } from './schemas'

// =============================================================================
// Custom Model Types
// =============================================================================

// CustomModel is defined in schemas.ts (inferred from Zod schema)
export type { CustomModel } from './schemas'

// =============================================================================
// Send Message Types
// =============================================================================

// SendMessageOptions is defined in schemas.ts (inferred from Zod schema)
export type { SendMessageOptions } from './schemas'

/**
 * Parameters for opening a new chat session
 */
export interface NewChatActionParams {
  /** Text to pre-fill in the input (not sent automatically) */
  input?: string
  /** Session name */
  name?: string
}

/**
 * Navigation payload for deep links (main → renderer)
 */
export interface DeepLinkNavigation {
  /** Compound route format (e.g., 'allChats/chat/abc123', 'settings/shortcuts') */
  view?: string
  /** Tab type */
  tabType?: string
  tabParams?: Record<string, string>
  action?: string
  actionParams?: Record<string, string>
}

// =============================================================================
// Navigation State Types (for routing)
// =============================================================================

/**
 * Right sidebar panel types
 * Defines the content displayed in the right sidebar
 */
export type RightSidebarPanel =
  | { type: 'sessionMetadata' }
  | { type: 'files'; path?: string }
  | { type: 'history' }
  | { type: 'none' }

/**
 * Chat filter options - determines which sessions to show
 * - 'allChats': All sessions regardless of status
 * - 'flagged': Only flagged sessions
 * - 'state': Sessions with specific status ID
 */
export type ChatFilter =
  | { kind: 'allChats' }
  | { kind: 'flagged' }
  | { kind: 'state'; stateId: string }

/**
 * Settings subpage options
 */
export type SettingsSubpage = 'app' | 'workspace' | 'api' | 'input' | 'permissions' | 'shortcuts' | 'preferences'

/**
 * Chats navigation state - shows SessionList in navigator
 */
export interface ChatsNavigationState {
  navigator: 'chats'
  filter: ChatFilter
  /** Selected chat details, or null for empty state */
  details: { type: 'chat'; sessionId: string } | null
  /** Optional right sidebar panel state */
  rightSidebar?: RightSidebarPanel
}

/**
 * Sources navigation state - shows SourcesListPanel in navigator
 */
export interface SourcesNavigationState {
  navigator: 'sources'
  /** Selected source details, or null for empty state */
  details: { type: 'source'; sourceSlug: string } | null
  /** Optional right sidebar panel state */
  rightSidebar?: RightSidebarPanel
}

/**
 * Settings navigation state - shows SettingsNavigator in navigator
 * Settings subpages are the details themselves (no separate selection)
 */
export interface SettingsNavigationState {
  navigator: 'settings'
  subpage: SettingsSubpage
  /** Optional right sidebar panel state */
  rightSidebar?: RightSidebarPanel
}

/**
 * Skills navigation state - shows SkillsListPanel in navigator
 */
export interface SkillsNavigationState {
  navigator: 'skills'
  /** Selected skill details, or null for empty state */
  details: { type: 'skill'; skillSlug: string } | null
  /** Optional right sidebar panel state */
  rightSidebar?: RightSidebarPanel
}

/**
 * Unified navigation state - single source of truth for all 3 panels
 *
 * From this state we can derive:
 * - LeftSidebar: which item is highlighted (from navigator + filter/subpage)
 * - NavigatorPanel: which list/content to show (from navigator)
 * - MainContentPanel: what details to display (from details or subpage)
 */
export type NavigationState =
  | ChatsNavigationState
  | SourcesNavigationState
  | SettingsNavigationState
  | SkillsNavigationState

// =============================================================================
// Tool Icons Types
// =============================================================================

/**
 * Tool icon mapping entry from tool-icons.json (with icon resolved to data URL)
 * Used in Appearance settings to show CLI tool icons configuration
 */
export interface ToolIconMapping {
  id: string
  displayName: string
  /** Data URL of the icon (e.g., data:image/png;base64,...) */
  iconDataUrl: string
  commands: string[]
}
