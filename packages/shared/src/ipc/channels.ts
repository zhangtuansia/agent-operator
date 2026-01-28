/**
 * IPC Channel Names
 *
 * Constants for all IPC channels used between main and renderer processes.
 * Centralized here for type safety and easy discovery.
 */

export const IPC_CHANNELS = {
  // Session management
  GET_SESSIONS: 'sessions:get',
  CREATE_SESSION: 'sessions:create',
  DELETE_SESSION: 'sessions:delete',
  GET_SESSION_MESSAGES: 'sessions:getMessages',
  SEND_MESSAGE: 'sessions:sendMessage',
  CANCEL_PROCESSING: 'sessions:cancel',
  KILL_SHELL: 'sessions:killShell',
  GET_TASK_OUTPUT: 'tasks:getOutput',
  RESPOND_TO_PERMISSION: 'sessions:respondToPermission',
  RESPOND_TO_CREDENTIAL: 'sessions:respondToCredential',

  // Consolidated session command
  SESSION_COMMAND: 'sessions:command',

  // Pending plan execution (for reload recovery)
  GET_PENDING_PLAN_EXECUTION: 'sessions:getPendingPlanExecution',

  // Workspace management
  GET_WORKSPACES: 'workspaces:get',
  CREATE_WORKSPACE: 'workspaces:create',
  CHECK_WORKSPACE_SLUG: 'workspaces:checkSlug',

  // Window management
  GET_WINDOW_WORKSPACE: 'window:getWorkspace',
  GET_WINDOW_MODE: 'window:getMode',
  OPEN_WORKSPACE: 'window:openWorkspace',
  OPEN_SESSION_IN_NEW_WINDOW: 'window:openSessionInNewWindow',
  SWITCH_WORKSPACE: 'window:switchWorkspace',
  CLOSE_WINDOW: 'window:close',
  // Close request events (main → renderer, for intercepting X button / Cmd+W)
  WINDOW_CLOSE_REQUESTED: 'window:closeRequested',
  WINDOW_CONFIRM_CLOSE: 'window:confirmClose',
  // Traffic light visibility (macOS only - hide when fullscreen overlays are open)
  WINDOW_SET_TRAFFIC_LIGHTS: 'window:setTrafficLights',

  // Events from main to renderer
  SESSION_EVENT: 'session:event',

  // File operations
  READ_FILE: 'file:read',
  OPEN_FILE_DIALOG: 'file:openDialog',
  READ_FILE_ATTACHMENT: 'file:readAttachment',
  STORE_ATTACHMENT: 'file:storeAttachment',
  GENERATE_THUMBNAIL: 'file:generateThumbnail',

  // Session info panel
  GET_SESSION_FILES: 'sessions:getFiles',
  GET_SESSION_NOTES: 'sessions:getNotes',
  SET_SESSION_NOTES: 'sessions:setNotes',
  WATCH_SESSION_FILES: 'sessions:watchFiles',      // Start watching session directory
  UNWATCH_SESSION_FILES: 'sessions:unwatchFiles',  // Stop watching
  SESSION_FILES_CHANGED: 'sessions:filesChanged',  // Event: main → renderer

  // Theme
  GET_SYSTEM_THEME: 'theme:getSystemPreference',
  SYSTEM_THEME_CHANGED: 'theme:systemChanged',

  // System
  GET_VERSIONS: 'system:versions',
  GET_HOME_DIR: 'system:homeDir',
  IS_DEBUG_MODE: 'system:isDebugMode',

  // Auto-update
  UPDATE_CHECK: 'update:check',
  UPDATE_GET_INFO: 'update:getInfo',
  UPDATE_INSTALL: 'update:install',
  UPDATE_DISMISS: 'update:dismiss',  // Dismiss update for this version (persists across restarts)
  UPDATE_GET_DISMISSED: 'update:getDismissed',  // Get dismissed version
  UPDATE_AVAILABLE: 'update:available',  // main → renderer broadcast
  UPDATE_DOWNLOAD_PROGRESS: 'update:downloadProgress',  // main → renderer broadcast

  // Shell operations (open external URLs/files)
  OPEN_URL: 'shell:openUrl',
  OPEN_FILE: 'shell:openFile',
  SHOW_IN_FOLDER: 'shell:showInFolder',

  // Menu actions (main → renderer)
  MENU_NEW_CHAT: 'menu:newChat',
  MENU_NEW_WINDOW: 'menu:newWindow',
  MENU_OPEN_SETTINGS: 'menu:openSettings',
  MENU_KEYBOARD_SHORTCUTS: 'menu:keyboardShortcuts',
  // Deep link navigation (main → renderer, for external agentoperator:// URLs)
  DEEP_LINK_NAVIGATE: 'deeplink:navigate',

  // Auth
  LOGOUT: 'auth:logout',
  SHOW_LOGOUT_CONFIRMATION: 'auth:showLogoutConfirmation',
  SHOW_DELETE_SESSION_CONFIRMATION: 'auth:showDeleteSessionConfirmation',

  // Onboarding
  ONBOARDING_GET_AUTH_STATE: 'onboarding:getAuthState',
  ONBOARDING_VALIDATE_MCP: 'onboarding:validateMcp',
  ONBOARDING_START_MCP_OAUTH: 'onboarding:startMcpOAuth',
  ONBOARDING_SAVE_CONFIG: 'onboarding:saveConfig',
  // Claude OAuth
  ONBOARDING_GET_EXISTING_CLAUDE_TOKEN: 'onboarding:getExistingClaudeToken',
  ONBOARDING_IS_CLAUDE_CLI_INSTALLED: 'onboarding:isClaudeCliInstalled',
  ONBOARDING_RUN_CLAUDE_SETUP_TOKEN: 'onboarding:runClaudeSetupToken',
  // Native Claude OAuth (two-step flow)
  ONBOARDING_START_CLAUDE_OAUTH: 'onboarding:startClaudeOAuth',
  ONBOARDING_EXCHANGE_CLAUDE_CODE: 'onboarding:exchangeClaudeCode',
  ONBOARDING_HAS_CLAUDE_OAUTH_STATE: 'onboarding:hasClaudeOAuthState',
  ONBOARDING_CLEAR_CLAUDE_OAUTH_STATE: 'onboarding:clearClaudeOAuthState',

  // Settings - Billing
  SETTINGS_GET_BILLING_METHOD: 'settings:getBillingMethod',
  SETTINGS_UPDATE_BILLING_METHOD: 'settings:updateBillingMethod',

  // Settings - Agent Type (Claude vs Codex)
  SETTINGS_GET_AGENT_TYPE: 'settings:getAgentType',
  SETTINGS_SET_AGENT_TYPE: 'settings:setAgentType',
  SETTINGS_CHECK_CODEX_AUTH: 'settings:checkCodexAuth',
  SETTINGS_START_CODEX_LOGIN: 'settings:startCodexLogin',

  // Settings - Provider Config
  SETTINGS_GET_STORED_CONFIG: 'settings:getStoredConfig',
  SETTINGS_UPDATE_PROVIDER_CONFIG: 'settings:updateProviderConfig',

  // Settings - Model
  SETTINGS_GET_MODEL: 'settings:getModel',
  SETTINGS_SET_MODEL: 'settings:setModel',
  SESSION_GET_MODEL: 'session:getModel',
  SESSION_SET_MODEL: 'session:setModel',

  // Custom Models (for Custom provider)
  CUSTOM_MODELS_GET: 'customModels:get',
  CUSTOM_MODELS_SET: 'customModels:set',
  CUSTOM_MODELS_ADD: 'customModels:add',
  CUSTOM_MODELS_UPDATE: 'customModels:update',
  CUSTOM_MODELS_DELETE: 'customModels:delete',
  CUSTOM_MODELS_REORDER: 'customModels:reorder',

  // Folder dialog (for selecting working directory)
  OPEN_FOLDER_DIALOG: 'dialog:openFolder',

  // User Preferences
  PREFERENCES_READ: 'preferences:read',
  PREFERENCES_WRITE: 'preferences:write',

  // Session Drafts (input text persisted across app restarts)
  DRAFTS_GET: 'drafts:get',
  DRAFTS_SET: 'drafts:set',
  DRAFTS_DELETE: 'drafts:delete',
  DRAFTS_GET_ALL: 'drafts:getAll',

  // Sources (workspace-scoped)
  SOURCES_GET: 'sources:get',
  SOURCES_CREATE: 'sources:create',
  SOURCES_DELETE: 'sources:delete',
  SOURCES_START_OAUTH: 'sources:startOAuth',
  SOURCES_SAVE_CREDENTIALS: 'sources:saveCredentials',
  SOURCES_CHANGED: 'sources:changed',

  // Source permissions config
  SOURCES_GET_PERMISSIONS: 'sources:getPermissions',
  // Workspace permissions config (for Explore mode)
  WORKSPACE_GET_PERMISSIONS: 'workspace:getPermissions',
  // Default permissions from ~/.agent-operator/permissions/default.json
  DEFAULT_PERMISSIONS_GET: 'permissions:getDefaults',
  // Broadcast when default permissions change (file watcher)
  DEFAULT_PERMISSIONS_CHANGED: 'permissions:defaultsChanged',
  // MCP tools listing
  SOURCES_GET_MCP_TOOLS: 'sources:getMcpTools',

  // Skills (workspace-scoped)
  SKILLS_GET: 'skills:get',
  SKILLS_GET_FILES: 'skills:getFiles',
  SKILLS_DELETE: 'skills:delete',
  SKILLS_OPEN_EDITOR: 'skills:openEditor',
  SKILLS_OPEN_FINDER: 'skills:openFinder',
  SKILLS_CHANGED: 'skills:changed',
  SKILLS_IMPORT_URL: 'skills:importUrl',
  SKILLS_IMPORT_CONTENT: 'skills:importContent',

  // Status management (workspace-scoped)
  STATUSES_LIST: 'statuses:list',
  STATUSES_CHANGED: 'statuses:changed',  // Broadcast event

  // Labels management (workspace-scoped)
  LABELS_LIST: 'labels:list',
  LABELS_CHANGED: 'labels:changed',  // Broadcast event

  // Views management (workspace-scoped)
  VIEWS_LIST: 'views:list',

  // Theme management (cascading: app → workspace)
  THEME_APP_CHANGED: 'theme:appChanged',        // Broadcast event

  // Generic workspace image loading/saving (for icons, etc.)
  WORKSPACE_READ_IMAGE: 'workspace:readImage',
  WORKSPACE_WRITE_IMAGE: 'workspace:writeImage',

  // Workspace settings (per-workspace configuration)
  WORKSPACE_SETTINGS_GET: 'workspaceSettings:get',
  WORKSPACE_SETTINGS_UPDATE: 'workspaceSettings:update',

  // Theme (app-level only)
  THEME_GET_APP: 'theme:getApp',
  THEME_GET_PRESETS: 'theme:getPresets',
  THEME_LOAD_PRESET: 'theme:loadPreset',
  THEME_GET_COLOR_THEME: 'theme:getColorTheme',
  THEME_SET_COLOR_THEME: 'theme:setColorTheme',
  THEME_BROADCAST_PREFERENCES: 'theme:broadcastPreferences',  // Send preferences to main for broadcast
  THEME_PREFERENCES_CHANGED: 'theme:preferencesChanged',  // Broadcast: preferences changed in another window

  // Logo URL resolution (uses Node.js filesystem cache)
  LOGO_GET_URL: 'logo:getUrl',

  // Notifications
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_NAVIGATE: 'notification:navigate',  // Broadcast: { workspaceId, sessionId }
  NOTIFICATION_GET_ENABLED: 'notification:getEnabled',
  NOTIFICATION_SET_ENABLED: 'notification:setEnabled',

  // Language
  LANGUAGE_GET: 'language:get',
  LANGUAGE_SET: 'language:set',

  BADGE_UPDATE: 'badge:update',
  BADGE_CLEAR: 'badge:clear',
  BADGE_SET_ICON: 'badge:setIcon',
  BADGE_DRAW: 'badge:draw',  // Broadcast: { count: number, iconDataUrl: string }
  WINDOW_FOCUS_STATE: 'window:focusState',  // Broadcast: boolean (isFocused)
  WINDOW_GET_FOCUS_STATE: 'window:getFocusState',

  // System Permissions (macOS)
  PERMISSIONS_CHECK_FULL_DISK_ACCESS: 'permissions:checkFullDiskAccess',
  PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS: 'permissions:openFullDiskAccessSettings',
  PERMISSIONS_PROMPT_FULL_DISK_ACCESS: 'permissions:promptFullDiskAccess',
  PERMISSIONS_CHECK_ACCESSIBILITY: 'permissions:checkAccessibility',
  PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS: 'permissions:openAccessibilitySettings',
  PERMISSIONS_GET_ALL: 'permissions:getAll',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
