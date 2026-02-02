// Types shared between main and renderer processes
// Most IPC types are now in @agent-operator/shared/ipc
// This file re-exports them and adds Electron-specific types

// Import and re-export core types
import type {
  Message as CoreMessage,
  MessageRole as CoreMessageRole,
  TypedError,
  TokenUsage as CoreTokenUsage,
  Workspace as CoreWorkspace,
  SessionMetadata as CoreSessionMetadata,
  StoredAttachment as CoreStoredAttachment,
  ContentBadge,
} from '@agent-operator/core/types';

// Import mode types from dedicated subpath export (avoids pulling in SDK)
import type { PermissionMode } from '@agent-operator/shared/agent/modes';
export type { PermissionMode };
export { PERMISSION_MODE_CONFIG } from '@agent-operator/shared/agent/modes';

// Import thinking level types
import type { ThinkingLevel } from '@agent-operator/shared/agent/thinking-levels';
export type { ThinkingLevel };
export { THINKING_LEVELS, DEFAULT_THINKING_LEVEL } from '@agent-operator/shared/agent/thinking-levels';

export type {
  CoreMessage as Message,
  CoreMessageRole as MessageRole,
  TypedError,
  CoreTokenUsage as TokenUsage,
  CoreWorkspace as Workspace,
  CoreSessionMetadata as SessionMetadata,
  CoreStoredAttachment as StoredAttachment,
  ContentBadge,
};

// Import and re-export auth types for onboarding
// Use types-only subpaths to avoid pulling in Node.js dependencies
import type { AuthState, SetupNeeds } from '@agent-operator/shared/auth/types';
import type { AuthType, AgentType } from '@agent-operator/shared/config/types';
export type { AuthState, SetupNeeds, AuthType, AgentType };

// Import source types for session source selection
import type { LoadedSource, FolderSourceConfig, SourceConnectionStatus } from '@agent-operator/shared/sources/types';
export type { LoadedSource, FolderSourceConfig, SourceConnectionStatus };

// Import skill types
import type { LoadedSkill, SkillMetadata } from '@agent-operator/shared/skills/types';
export type { LoadedSkill, SkillMetadata };

// Re-export IPC types from shared package
export type {
  // Session types
  Session,
  CreateSessionOptions,
  TodoState,
  BuiltInStatusId,
  SessionEvent,
  SessionCommand,
  PermissionRequest,
  // Result types
  OAuthResult,
  McpValidationResult,
  McpToolWithPermission,
  McpToolsResult,
  ShareResult,
  RefreshTitleResult,
  OnboardingSaveResult,
  ClaudeOAuthResult,
  // Settings types
  BillingMethodInfo,
  UpdateInfo,
  WorkspaceSettings,
  // File types
  FileAttachment,
  SkillFile,
  SessionFile,
  SessionFilesResult,
  // Plan types
  Plan,
  PlanStep,
  // Credential types
  CredentialResponse,
  CustomModel,
  // Send message types
  SendMessageOptions,
  NewChatActionParams,
  DeepLinkNavigation,
  // Navigation types
  RightSidebarPanel,
  ChatFilter,
  SettingsSubpage,
  ChatsNavigationState,
  SourcesNavigationState,
  SettingsNavigationState,
  SkillsNavigationState,
  NavigationState,
} from '@agent-operator/shared/ipc/types';

// Re-export IPC channels
export { IPC_CHANNELS } from '@agent-operator/shared/ipc/channels';

// Import auth request types for unified auth flow
import type { AuthRequest as SharedAuthRequest, CredentialInputMode as SharedCredentialInputMode, CredentialAuthRequest as SharedCredentialAuthRequest } from '@agent-operator/shared/agent';
export type { SharedAuthRequest as AuthRequest };
export type { SharedCredentialInputMode as CredentialInputMode };
// CredentialRequest is used by UI components for displaying credential input
export type CredentialRequest = SharedCredentialAuthRequest;
export { generateMessageId } from '@agent-operator/core/types';

// Re-export permission types from core
export type { PermissionRequest as BasePermissionRequest } from '@agent-operator/core/types';

// =============================================================================
// Electron-specific Types (not in shared package)
// =============================================================================

/**
 * Git Bash detection status (Windows-only concern)
 */
export interface GitBashStatus {
  found: boolean
  path: string | null
  platform: 'win32' | 'darwin' | 'linux'
}

// Import types needed for ElectronAPI
import type { Message } from '@agent-operator/core/types';
import type {
  Session,
  CreateSessionOptions,
  SessionEvent,
  SessionCommand,
  FileAttachment,
  SkillFile,
  SessionFilesResult,
  ShareResult,
  RefreshTitleResult,
  OAuthResult,
  OnboardingSaveResult,
  ClaudeOAuthResult,
  BillingMethodInfo,
  UpdateInfo,
  WorkspaceSettings,
  McpToolsResult,
  CredentialResponse,
  SendMessageOptions,
  DeepLinkNavigation,
  CustomModel,
} from '@agent-operator/shared/ipc/types';

// Type-safe IPC API exposed to renderer
export interface ElectronAPI {
  // Session management
  getSessions(): Promise<Session[]>
  getSessionMessages(sessionId: string): Promise<Session | null>
  createSession(workspaceId: string, options?: CreateSessionOptions): Promise<Session>
  deleteSession(sessionId: string): Promise<void>
  sendMessage(sessionId: string, message: string, attachments?: FileAttachment[], storedAttachments?: CoreStoredAttachment[], options?: SendMessageOptions): Promise<void>
  cancelProcessing(sessionId: string, silent?: boolean): Promise<void>
  killShell(sessionId: string, shellId: string): Promise<{ success: boolean; error?: string }>
  getTaskOutput(taskId: string): Promise<string | null>
  respondToPermission(sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean): Promise<boolean>
  respondToCredential(sessionId: string, requestId: string, response: CredentialResponse): Promise<boolean>

  // Consolidated session command handler
  sessionCommand(sessionId: string, command: SessionCommand): Promise<void | ShareResult | RefreshTitleResult>

  // Pending plan execution (for reload recovery)
  getPendingPlanExecution(sessionId: string): Promise<{ planPath: string; awaitingCompaction: boolean } | null>

  // Workspace management
  getWorkspaces(): Promise<CoreWorkspace[]>
  createWorkspace(folderPath: string, name: string): Promise<CoreWorkspace>
  checkWorkspaceSlug(slug: string): Promise<{ exists: boolean; path: string }>

  // Window management
  getWindowWorkspace(): Promise<string | null>
  getWindowMode(): Promise<string | null>
  openWorkspace(workspaceId: string): Promise<void>
  openSessionInNewWindow(workspaceId: string, sessionId: string): Promise<void>
  switchWorkspace(workspaceId: string): Promise<void>
  closeWindow(): Promise<void>
  confirmCloseWindow(): Promise<void>
  /** Listen for close requests (X button, Cmd+W). Returns cleanup function. */
  onCloseRequested(callback: () => void): () => void
  /** Show/hide macOS traffic light buttons (for fullscreen overlays) */
  setTrafficLightsVisible(visible: boolean): Promise<void>

  // Event listeners
  onSessionEvent(callback: (event: SessionEvent) => void): () => void

  // File operations
  readFile(path: string): Promise<string>
  openFileDialog(): Promise<string[]>
  readFileAttachment(path: string): Promise<FileAttachment | null>
  storeAttachment(sessionId: string, attachment: FileAttachment): Promise<CoreStoredAttachment>
  generateThumbnail(base64: string, mimeType: string): Promise<string | null>

  // Theme
  getSystemTheme(): Promise<boolean>
  onSystemThemeChange(callback: (isDark: boolean) => void): () => void

  // System
  getVersions(): { node: string; chrome: string; electron: string }
  getHomeDir(): Promise<string>
  isDebugMode(): Promise<boolean>

  // Auto-update
  checkForUpdates(): Promise<UpdateInfo>
  getUpdateInfo(): Promise<UpdateInfo>
  installUpdate(): Promise<void>
  dismissUpdate(version: string): Promise<void>
  getDismissedUpdateVersion(): Promise<string | null>
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void
  onUpdateDownloadProgress(callback: (progress: number) => void): () => void

  // Shell operations
  openUrl(url: string): Promise<void>
  openFile(path: string): Promise<void>
  showInFolder(path: string): Promise<void>

  // Menu event listeners
  onMenuNewChat(callback: () => void): () => void
  onMenuOpenSettings(callback: () => void): () => void
  onMenuKeyboardShortcuts(callback: () => void): () => void

  // Deep link navigation listener (for external agentoperator:// URLs)
  onDeepLinkNavigate(callback: (nav: DeepLinkNavigation) => void): () => void

  // Auth
  showLogoutConfirmation(): Promise<boolean>
  showDeleteSessionConfirmation(name: string): Promise<boolean>
  logout(): Promise<void>

  // Onboarding
  getAuthState(): Promise<AuthState>
  getSetupNeeds(): Promise<SetupNeeds>
  startWorkspaceMcpOAuth(mcpUrl: string): Promise<OAuthResult & { accessToken?: string; clientId?: string }>
  saveOnboardingConfig(config: {
    authType?: AuthType
    workspace?: { name: string; iconUrl?: string; mcpUrl?: string }
    credential?: string
    mcpCredentials?: { accessToken: string; clientId?: string }
    providerConfig?: {
      provider: string
      baseURL: string
      apiFormat: 'anthropic' | 'openai'
    }
  }): Promise<OnboardingSaveResult>
  // Claude OAuth
  getExistingClaudeToken(): Promise<string | null>
  isClaudeCliInstalled(): Promise<boolean>
  runClaudeSetupToken(): Promise<ClaudeOAuthResult>
  // Native Claude OAuth (two-step flow)
  startClaudeOAuth(): Promise<{ success: boolean; authUrl?: string; error?: string }>
  exchangeClaudeCode(code: string): Promise<ClaudeOAuthResult>
  hasClaudeOAuthState(): Promise<boolean>
  clearClaudeOAuthState(): Promise<{ success: boolean }>

  // Settings - Billing
  getBillingMethod(): Promise<BillingMethodInfo>
  updateBillingMethod(authType: AuthType, credential?: string): Promise<void>

  // Settings - Provider Config (for third-party APIs)
  getStoredConfig(): Promise<{
    providerConfig?: {
      provider: string
      baseURL: string
      apiFormat: 'anthropic' | 'openai'
    }
  } | null>
  updateProviderConfig(config: {
    provider: string
    baseURL: string
    apiFormat: 'anthropic' | 'openai'
  }): Promise<void>

  // Settings - Model (global default)
  getModel(): Promise<string | null>
  setModel(model: string): Promise<void>
  // Session-specific model (overrides global)
  getSessionModel(sessionId: string, workspaceId: string): Promise<string | null>
  setSessionModel(sessionId: string, workspaceId: string, model: string | null): Promise<void>

  // Custom Models (for Custom provider)
  getCustomModels(): Promise<CustomModel[]>
  setCustomModels(models: CustomModel[]): Promise<void>
  addCustomModel(model: CustomModel): Promise<CustomModel[]>
  updateCustomModel(modelId: string, updates: Partial<Omit<CustomModel, 'id'>>): Promise<CustomModel[]>
  deleteCustomModel(modelId: string): Promise<CustomModel[]>
  reorderCustomModels(modelIds: string[]): Promise<CustomModel[]>

  // Workspace Settings (per-workspace configuration)
  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null>
  updateWorkspaceSetting<K extends keyof WorkspaceSettings>(workspaceId: string, key: K, value: WorkspaceSettings[K]): Promise<void>

  // Folder dialog
  openFolderDialog(): Promise<string | null>

  // User Preferences
  readPreferences(): Promise<{ content: string; exists: boolean; path: string }>
  writePreferences(content: string): Promise<{ success: boolean; error?: string }>

  // Session Drafts (persisted input text)
  getDraft(sessionId: string): Promise<string | null>
  setDraft(sessionId: string, text: string): Promise<void>
  deleteDraft(sessionId: string): Promise<void>
  getAllDrafts(): Promise<Record<string, string>>

  // Session Info Panel
  getSessionFiles(sessionId: string): Promise<SessionFilesResult>
  getSessionNotes(sessionId: string): Promise<string>
  setSessionNotes(sessionId: string, content: string): Promise<void>
  watchSessionFiles(sessionId: string): Promise<void>
  unwatchSessionFiles(): Promise<void>
  onSessionFilesChanged(callback: (sessionId: string) => void): () => void

  // Sources
  getSources(workspaceId: string): Promise<LoadedSource[]>
  createSource(workspaceId: string, config: Partial<FolderSourceConfig>): Promise<FolderSourceConfig>
  deleteSource(workspaceId: string, sourceSlug: string): Promise<void>
  startSourceOAuth(workspaceId: string, sourceSlug: string): Promise<{ success: boolean; error?: string; accessToken?: string }>
  saveSourceCredentials(workspaceId: string, sourceSlug: string, credential: string): Promise<void>
  getSourcePermissionsConfig(workspaceId: string, sourceSlug: string): Promise<import('@agent-operator/shared/agent').PermissionsConfigFile | null>
  getWorkspacePermissionsConfig(workspaceId: string): Promise<import('@agent-operator/shared/agent').PermissionsConfigFile | null>
  getDefaultPermissionsConfig(): Promise<{ config: import('@agent-operator/shared/agent').PermissionsConfigFile | null; path: string }>
  getMcpTools(workspaceId: string, sourceSlug: string): Promise<McpToolsResult>

  // Sources change listener (live updates when sources are added/removed)
  onSourcesChanged(callback: (sources: LoadedSource[]) => void): () => void

  // Default permissions change listener (live updates when default.json changes)
  onDefaultPermissionsChanged(callback: () => void): () => void

  // Skills
  getSkills(workspaceId: string): Promise<LoadedSkill[]>
  getSkillFiles?(workspaceId: string, skillSlug: string): Promise<SkillFile[]>
  deleteSkill(workspaceId: string, skillSlug: string): Promise<void>
  openSkillInEditor(workspaceId: string, skillSlug: string): Promise<void>
  openSkillInFinder(workspaceId: string, skillSlug: string): Promise<void>
  importSkillFromUrl(workspaceId: string, url: string, customSlug?: string): Promise<import('@agent-operator/shared/skills').ImportSkillResult>
  importSkillFromContent(workspaceId: string, content: string, customSlug?: string): Promise<import('@agent-operator/shared/skills').ImportSkillResult>

  // Skills change listener (live updates when skills are added/removed/modified)
  onSkillsChanged(callback: (skills: LoadedSkill[]) => void): () => void

  // Statuses (workspace-scoped)
  listStatuses(workspaceId: string): Promise<import('@agent-operator/shared/statuses').StatusConfig[]>
  // Statuses change listener (live updates when statuses config or icon files change)
  onStatusesChanged(callback: (workspaceId: string) => void): () => void

  // Labels (workspace-scoped)
  listLabels(workspaceId: string): Promise<import('@agent-operator/shared/labels').LabelConfig[]>
  // Labels change listener (live updates when labels config changes)
  onLabelsChanged(callback: (workspaceId: string) => void): () => void

  // Views (workspace-scoped)
  listViews(workspaceId: string): Promise<import('@agent-operator/shared/views').ViewConfig[]>

  // Generic workspace image loading/saving (returns data URL for images, raw string for SVG)
  readWorkspaceImage(workspaceId: string, relativePath: string): Promise<string>
  writeWorkspaceImage(workspaceId: string, relativePath: string, base64: string, mimeType: string): Promise<void>

  // Theme (app-level only)
  getAppTheme(): Promise<import('@config/theme').ThemeOverrides | null>
  // Preset themes (app-level)
  loadPresetThemes(): Promise<import('@config/theme').PresetTheme[]>
  loadPresetTheme(themeId: string): Promise<import('@config/theme').PresetTheme | null>
  getColorTheme(): Promise<string>
  setColorTheme(themeId: string): Promise<void>

  // Fonts (local font files)
  getFontsPath(): string

  // Theme change listeners (live updates when theme.json files change)
  onAppThemeChange(callback: (theme: import('@config/theme').ThemeOverrides | null) => void): () => void

  // Logo URL resolution (uses Node.js filesystem cache for provider domains)
  getLogoUrl(serviceUrl: string, provider?: string): Promise<string | null>

  // Notifications
  showNotification(title: string, body: string, workspaceId: string, sessionId: string): Promise<void>
  getNotificationsEnabled(): Promise<boolean>
  setNotificationsEnabled(enabled: boolean): Promise<void>

  // Language
  getLanguage(): Promise<'en' | 'zh' | null>
  setLanguage(language: 'en' | 'zh'): Promise<void>

  // Input settings
  getAutoCapitalisation(): Promise<boolean>
  setAutoCapitalisation(enabled: boolean): Promise<void>
  getSendMessageKey(): Promise<'enter' | 'cmd-enter'>
  setSendMessageKey(key: 'enter' | 'cmd-enter'): Promise<void>
  getSpellCheck(): Promise<boolean>
  setSpellCheck(enabled: boolean): Promise<void>

  updateBadgeCount(count: number): Promise<void>
  clearBadgeCount(): Promise<void>
  setDockIconWithBadge(dataUrl: string): Promise<void>
  onBadgeDraw(callback: (data: { count: number; iconDataUrl: string }) => void): () => void
  getWindowFocusState(): Promise<boolean>
  onWindowFocusChange(callback: (isFocused: boolean) => void): () => void
  onNotificationNavigate(callback: (data: { workspaceId: string; sessionId: string }) => void): () => void

  // Theme preferences sync across windows (mode, colorTheme, font)
  broadcastThemePreferences(preferences: { mode: string; colorTheme: string; font: string }): Promise<void>
  onThemePreferencesChange(callback: (preferences: { mode: string; colorTheme: string; font: string }) => void): () => void

  // System Permissions (macOS)
  checkFullDiskAccess(): Promise<boolean>
  openFullDiskAccessSettings(): Promise<void>
  promptFullDiskAccess(): Promise<boolean>
  checkAccessibilityAccess(): Promise<boolean>
  openAccessibilitySettings(): Promise<void>
  getAllPermissions(): Promise<{ fullDiskAccess: boolean; accessibility: boolean }>
}

// ============================================
// Navigation State Utilities (types imported from shared)
// ============================================

import type {
  NavigationState,
  ChatsNavigationState,
  SourcesNavigationState,
  SettingsNavigationState,
  SkillsNavigationState,
  ChatFilter,
  SettingsSubpage,
} from '@agent-operator/shared/ipc/types'

/**
 * Type guard to check if state is chats navigation
 */
export const isChatsNavigation = (
  state: NavigationState
): state is ChatsNavigationState => state.navigator === 'chats'

/**
 * Type guard to check if state is sources navigation
 */
export const isSourcesNavigation = (
  state: NavigationState
): state is SourcesNavigationState => state.navigator === 'sources'

/**
 * Type guard to check if state is settings navigation
 */
export const isSettingsNavigation = (
  state: NavigationState
): state is SettingsNavigationState => state.navigator === 'settings'

/**
 * Type guard to check if state is skills navigation
 */
export const isSkillsNavigation = (
  state: NavigationState
): state is SkillsNavigationState => state.navigator === 'skills'

/**
 * Default navigation state - allChats with no selection
 */
export const DEFAULT_NAVIGATION_STATE: NavigationState = {
  navigator: 'chats',
  filter: { kind: 'allChats' },
  details: null,
}

/**
 * Get a persistence key for localStorage from NavigationState
 */
export const getNavigationStateKey = (state: NavigationState): string => {
  if (state.navigator === 'sources') {
    if (state.details) {
      return `sources/source/${state.details.sourceSlug}`
    }
    return 'sources'
  }
  if (state.navigator === 'skills') {
    if (state.details) {
      return `skills/skill/${state.details.skillSlug}`
    }
    return 'skills'
  }
  if (state.navigator === 'settings') {
    return `settings:${state.subpage}`
  }
  // Chats
  const f = state.filter
  let base: string
  if (f.kind === 'state') base = `state:${f.stateId}`
  else base = f.kind
  if (state.details) {
    return `${base}/chat/${state.details.sessionId}`
  }
  return base
}

/**
 * Parse a persistence key back to NavigationState
 * Returns null if the key is invalid
 */
export const parseNavigationStateKey = (key: string): NavigationState | null => {
  // Handle sources
  if (key === 'sources') return { navigator: 'sources', details: null }
  if (key.startsWith('sources/source/')) {
    const sourceSlug = key.slice(15)
    if (sourceSlug) {
      return { navigator: 'sources', details: { type: 'source', sourceSlug } }
    }
    return { navigator: 'sources', details: null }
  }

  // Handle skills
  if (key === 'skills') return { navigator: 'skills', details: null }
  if (key.startsWith('skills/skill/')) {
    const skillSlug = key.slice(13)
    if (skillSlug) {
      return { navigator: 'skills', details: { type: 'skill', skillSlug } }
    }
    return { navigator: 'skills', details: null }
  }

  // Handle settings
  if (key === 'settings') return { navigator: 'settings', subpage: 'app' }
  if (key.startsWith('settings:')) {
    const subpage = key.slice(9) as SettingsSubpage
    if (['app', 'workspace', 'api', 'input', 'permissions', 'shortcuts', 'preferences'].includes(subpage)) {
      return { navigator: 'settings', subpage }
    }
  }

  // Handle chats - parse filter and optional session
  const parseChatsKey = (filterKey: string, sessionId?: string): NavigationState | null => {
    let filter: ChatFilter
    if (filterKey === 'allChats') filter = { kind: 'allChats' }
    else if (filterKey === 'flagged') filter = { kind: 'flagged' }
    else if (filterKey.startsWith('state:')) {
      const stateId = filterKey.slice(6)
      if (!stateId) return null
      filter = { kind: 'state', stateId }
    } else {
      return null
    }
    return {
      navigator: 'chats',
      filter,
      details: sessionId ? { type: 'chat', sessionId } : null,
    }
  }

  // Check for chat details
  if (key.includes('/chat/')) {
    const [filterPart, , sessionId] = key.split('/')
    return parseChatsKey(filterPart, sessionId)
  }

  // Simple filter key
  return parseChatsKey(key)
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
