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
  IMPORT_SESSIONS: 'sessions:import',
  CREATE_SUB_SESSION: 'sessions:createSubSession',
  GET_SESSION_MESSAGES: 'sessions:getMessages',
  SEARCH_SESSION_CONTENT: 'sessions:searchContent',
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
  GET_SESSION_FILES_BY_SCOPE: 'sessions:getFilesByScope',
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
  GET_RELEASE_NOTES: 'releaseNotes:get',
  GET_LATEST_RELEASE_VERSION: 'releaseNotes:getLatestVersion',
  GET_FONTS_PATH: 'system:fontsPath',
  GET_APP_VERSION: 'system:appVersion',
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
  // Get pending deep link for this window (renderer → main, pull-based for reliable timing)
  GET_PENDING_DEEP_LINK: 'deeplink:getPending',

  // Auth
  LOGOUT: 'auth:logout',
  SHOW_LOGOUT_CONFIRMATION: 'auth:showLogoutConfirmation',
  SHOW_DELETE_SESSION_CONFIRMATION: 'auth:showDeleteSessionConfirmation',
  CREDENTIAL_HEALTH_CHECK: 'credentials:healthCheck',
  GET_LLM_API_KEY: 'credentials:getLlmApiKey',

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

  // ChatGPT OAuth (for Codex chatgptAuthTokens mode)
  CHATGPT_START_OAUTH: 'chatgpt:startOAuth',
  CHATGPT_CANCEL_OAUTH: 'chatgpt:cancelOAuth',
  CHATGPT_GET_AUTH_STATUS: 'chatgpt:getAuthStatus',
  CHATGPT_LOGOUT: 'chatgpt:logout',

  // GitHub Copilot OAuth (device flow)
  COPILOT_START_OAUTH: 'copilot:startOAuth',
  COPILOT_CANCEL_OAUTH: 'copilot:cancelOAuth',
  COPILOT_GET_AUTH_STATUS: 'copilot:getAuthStatus',
  COPILOT_LOGOUT: 'copilot:logout',
  COPILOT_DEVICE_CODE: 'copilot:deviceCode',

  // Settings - API Setup
  SETUP_LLM_CONNECTION: 'settings:setupLlmConnection',
  SETTINGS_TEST_API_CONNECTION: 'settings:testApiConnection',
  SETTINGS_TEST_OPENAI_CONNECTION: 'settings:testOpenAiConnection',

  // LLM Connections (provider configurations)
  LLM_CONNECTION_LIST: 'LLM_Connection:list',
  LLM_CONNECTION_LIST_WITH_STATUS: 'LLM_Connection:listWithStatus',
  LLM_CONNECTION_GET: 'LLM_Connection:get',
  LLM_CONNECTION_SAVE: 'LLM_Connection:save',
  LLM_CONNECTION_SET_API_KEY: 'LLM_Connection:setApiKey',
  LLM_CONNECTION_DELETE: 'LLM_Connection:delete',
  LLM_CONNECTION_TEST: 'LLM_Connection:test',
  LLM_CONNECTION_SET_DEFAULT: 'LLM_Connection:setDefault',
  LLM_CONNECTION_SET_WORKSPACE_DEFAULT: 'LLM_Connection:setWorkspaceDefault',

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
  // Default permissions from ~/.cowork/permissions/default.json
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
  STATUSES_REORDER: 'statuses:reorder',
  STATUSES_CHANGED: 'statuses:changed',  // Broadcast event

  // Labels management (workspace-scoped)
  LABELS_LIST: 'labels:list',
  LABELS_CREATE: 'labels:create',
  LABELS_DELETE: 'labels:delete',
  LABELS_CHANGED: 'labels:changed',  // Broadcast event

  // Views management (workspace-scoped)
  VIEWS_LIST: 'views:list',
  VIEWS_SAVE: 'views:save',

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
  // Workspace-level theme overrides
  THEME_GET_WORKSPACE_COLOR_THEME: 'theme:getWorkspaceColorTheme',
  THEME_SET_WORKSPACE_COLOR_THEME: 'theme:setWorkspaceColorTheme',
  THEME_GET_ALL_WORKSPACE_THEMES: 'theme:getAllWorkspaceThemes',
  THEME_WORKSPACE_CHANGED: 'theme:workspaceChanged',

  // Logo URL resolution (uses Node.js filesystem cache)
  LOGO_GET_URL: 'logo:getUrl',

  // Tool icon mappings (for Appearance settings)
  TOOL_ICONS_GET_MAPPINGS: 'toolIcons:getMappings',
  // Appearance settings
  APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS: 'appearance:getRichToolDescriptions',
  APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS: 'appearance:setRichToolDescriptions',

  // Notifications
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_NAVIGATE: 'notification:navigate',  // Broadcast: { workspaceId, sessionId }
  NOTIFICATION_GET_ENABLED: 'notification:getEnabled',
  NOTIFICATION_SET_ENABLED: 'notification:setEnabled',

  // Language
  LANGUAGE_GET: 'language:get',
  LANGUAGE_SET: 'language:set',

  // Input settings
  INPUT_GET_AUTO_CAPITALISATION: 'input:getAutoCapitalisation',
  INPUT_SET_AUTO_CAPITALISATION: 'input:setAutoCapitalisation',
  INPUT_GET_SEND_MESSAGE_KEY: 'input:getSendMessageKey',
  INPUT_SET_SEND_MESSAGE_KEY: 'input:setSendMessageKey',
  INPUT_GET_SPELL_CHECK: 'input:getSpellCheck',
  INPUT_SET_SPELL_CHECK: 'input:setSpellCheck',

  // Git Bash (Windows)
  GITBASH_CHECK: 'gitbash:check',
  GITBASH_BROWSE: 'gitbash:browse',
  GITBASH_SET_PATH: 'gitbash:setPath',

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

  // Power Management
  POWER_GET_KEEP_AWAKE: 'power:getKeepAwake',
  POWER_SET_KEEP_AWAKE: 'power:setKeepAwake',

  // Filesystem search (for @ mention file selection)
  FS_SEARCH: 'fs:search',
  // Debug logging from renderer → main log file
  DEBUG_LOG: 'debug:log',

  // Automations (manual trigger + state management)
  TEST_AUTOMATION: 'automations:test',
  AUTOMATIONS_SET_ENABLED: 'automations:setEnabled',
  AUTOMATIONS_DUPLICATE: 'automations:duplicate',
  AUTOMATIONS_DELETE: 'automations:delete',
  AUTOMATIONS_GET_HISTORY: 'automations:getHistory',
  AUTOMATIONS_GET_LAST_EXECUTED: 'automations:getLastExecuted',
  AUTOMATIONS_CHANGED: 'automations:changed',  // Broadcast event

  // IM Integration (Feishu, Telegram)
  IM_GET_CONFIG: 'im:config:get',
  IM_SET_CONFIG: 'im:config:set',
  IM_GET_SETTINGS: 'im:settings:get',
  IM_SET_SETTINGS: 'im:settings:set',
  IM_START_CHANNEL: 'im:channel:start',
  IM_STOP_CHANNEL: 'im:channel:stop',
  IM_TEST_CHANNEL: 'im:channel:test',
  IM_GET_STATUS: 'im:status:get',
  IM_STATUS_CHANGED: 'im:status:changed',        // Broadcast: main → renderer
  IM_MESSAGE_RECEIVED: 'im:message:received',     // Broadcast: main → renderer (activity log)
  IM_GET_SESSION_MAPPINGS: 'im:sessions:list',
  IM_DELETE_SESSION_MAPPING: 'im:sessions:delete',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
