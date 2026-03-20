import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import { IPC_CHANNELS, type ElectronAPI } from '../shared/types'
import type { ChannelMapEntry } from './build-api'

function invoke(
  channel: string,
  options: Omit<Extract<ChannelMapEntry, { type: 'invoke' }>, 'type' | 'channel'> = {},
): Extract<ChannelMapEntry, { type: 'invoke' }> {
  return { type: 'invoke', channel, ...options }
}

function listener(channel: string): Extract<ChannelMapEntry, { type: 'listener' }> {
  return { type: 'listener', channel }
}

function listenerWithArgs(
  channel: string,
  transformArgs: (...args: any[]) => unknown[],
): Extract<ChannelMapEntry, { type: 'listener' }> {
  return { type: 'listener', channel, transformArgs }
}

type AnyFn = (...args: any[]) => any

type ElectronApiMethodKeys = {
  [K in keyof ElectronAPI]-?: Extract<ElectronAPI[K], AnyFn> extends never ? never : K
}[keyof ElectronAPI] & string

type PreloadOnlyElectronApiMethodKeys =
  | 'performOAuth'
  | 'getTransportConnectionState'
  | 'onTransportConnectionStateChanged'
  | 'reconnectTransport'
  | 'isChannelAvailable'

type ChannelMappedElectronApiMethodKeys = Exclude<ElectronApiMethodKeys, PreloadOnlyElectronApiMethodKeys>

export const CHANNEL_MAP = {
  // Session management
  getSessions: invoke(IPC_CHANNELS.GET_SESSIONS),
  getSessionMessages: invoke(IPC_CHANNELS.GET_SESSION_MESSAGES),
  searchSessionContent: invoke(IPC_CHANNELS.SEARCH_SESSION_CONTENT),
  createSession: invoke(IPC_CHANNELS.CREATE_SESSION),
  createSubSession: invoke(IPC_CHANNELS.CREATE_SUB_SESSION),
  deleteSession: invoke(IPC_CHANNELS.DELETE_SESSION),
  importSessions: invoke(IPC_CHANNELS.IMPORT_SESSIONS, {
    mapArgs: (workspaceId, source, filePath) => [{ workspaceId, source, filePath }],
  }),
  sendMessage: invoke(IPC_CHANNELS.SEND_MESSAGE),
  cancelProcessing: invoke(IPC_CHANNELS.CANCEL_PROCESSING),
  killShell: invoke(IPC_CHANNELS.KILL_SHELL),
  getTaskOutput: invoke(IPC_CHANNELS.GET_TASK_OUTPUT),
  respondToPermission: invoke(IPC_CHANNELS.RESPOND_TO_PERMISSION),
  respondToCredential: invoke(IPC_CHANNELS.RESPOND_TO_CREDENTIAL),
  sessionCommand: invoke(IPC_CHANNELS.SESSION_COMMAND),
  getPendingPlanExecution: invoke(IPC_CHANNELS.GET_PENDING_PLAN_EXECUTION),

  // Workspace management
  getWorkspaces: invoke(IPC_CHANNELS.GET_WORKSPACES),
  createWorkspace: invoke(IPC_CHANNELS.CREATE_WORKSPACE),
  checkWorkspaceSlug: invoke(IPC_CHANNELS.CHECK_WORKSPACE_SLUG),

  // Window management
  getWindowWorkspace: invoke(IPC_CHANNELS.GET_WINDOW_WORKSPACE),
  getWindowMode: invoke(IPC_CHANNELS.GET_WINDOW_MODE),
  openWorkspace: invoke(IPC_CHANNELS.OPEN_WORKSPACE),
  openSessionInNewWindow: invoke(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW),
  switchWorkspace: invoke(IPC_CHANNELS.SWITCH_WORKSPACE),
  closeWindow: invoke(IPC_CHANNELS.CLOSE_WINDOW),
  confirmCloseWindow: invoke(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE),
  onCloseRequested: listener(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED),
  setTrafficLightsVisible: invoke(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS),
  setTrayPanelHeight: invoke(IPC_CHANNELS.WINDOW_SET_TRAY_PANEL_HEIGHT),

  // Event listeners
  onSessionEvent: listener(IPC_CHANNELS.SESSION_EVENT),

  // File operations
  readFile: invoke(IPC_CHANNELS.READ_FILE),
  readFileOptional: invoke(IPC_CHANNELS.READ_FILE_OPTIONAL),
  openFileDialog: invoke(IPC_CHANNELS.OPEN_FILE_DIALOG),
  readFileAttachment: invoke(IPC_CHANNELS.READ_FILE_ATTACHMENT),
  storeAttachment: invoke(IPC_CHANNELS.STORE_ATTACHMENT),
  generateThumbnail: invoke(IPC_CHANNELS.GENERATE_THUMBNAIL),

  // Theme
  getSystemTheme: invoke(IPC_CHANNELS.GET_SYSTEM_THEME),
  onSystemThemeChange: listener(IPC_CHANNELS.SYSTEM_THEME_CHANGED),

  // System
  getVersions: invoke(IPC_CHANNELS.GET_VERSIONS),
  getAppVersion: invoke(IPC_CHANNELS.GET_APP_VERSION),
  getHomeDir: invoke(IPC_CHANNELS.GET_HOME_DIR),
  isDebugMode: invoke(IPC_CHANNELS.IS_DEBUG_MODE),
  getReleaseNotes: invoke(IPC_CHANNELS.GET_RELEASE_NOTES),
  getLatestReleaseVersion: invoke(IPC_CHANNELS.GET_LATEST_RELEASE_VERSION),

  // Auto-update
  checkForUpdates: invoke(IPC_CHANNELS.UPDATE_CHECK),
  getUpdateInfo: invoke(IPC_CHANNELS.UPDATE_GET_INFO),
  installUpdate: invoke(IPC_CHANNELS.UPDATE_INSTALL),
  dismissUpdate: invoke(IPC_CHANNELS.UPDATE_DISMISS),
  getDismissedUpdateVersion: invoke(IPC_CHANNELS.UPDATE_GET_DISMISSED),
  onUpdateAvailable: listener(IPC_CHANNELS.UPDATE_AVAILABLE),
  onUpdateDownloadProgress: listener(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS),

  // Shell operations
  openUrl: invoke(IPC_CHANNELS.OPEN_URL),
  openFile: invoke(IPC_CHANNELS.OPEN_FILE),
  showInFolder: invoke(IPC_CHANNELS.SHOW_IN_FOLDER),
  listOpenTargets: invoke(IPC_CHANNELS.OPEN_TARGETS_LIST),
  openFileWithTarget: invoke(IPC_CHANNELS.OPEN_FILE_WITH_TARGET),
  setOpenTargetPreference: invoke(IPC_CHANNELS.SET_OPEN_TARGET_PREFERENCE),

  // Menu event listeners
  onMenuNewChat: listener(IPC_CHANNELS.MENU_NEW_CHAT),
  onMenuOpenSettings: listener(IPC_CHANNELS.MENU_OPEN_SETTINGS),
  onMenuOpenSettingsSubpage: listener(IPC_CHANNELS.MENU_OPEN_SETTINGS_SUBPAGE),
  onMenuKeyboardShortcuts: listener(IPC_CHANNELS.MENU_KEYBOARD_SHORTCUTS),

  // Menu role actions
  menuUndo: invoke(IPC_CHANNELS.MENU_UNDO),
  menuRedo: invoke(IPC_CHANNELS.MENU_REDO),
  menuCut: invoke(IPC_CHANNELS.MENU_CUT),
  menuCopy: invoke(IPC_CHANNELS.MENU_COPY),
  menuPaste: invoke(IPC_CHANNELS.MENU_PASTE),
  menuSelectAll: invoke(IPC_CHANNELS.MENU_SELECT_ALL),
  menuZoomIn: invoke(IPC_CHANNELS.MENU_ZOOM_IN),
  menuZoomOut: invoke(IPC_CHANNELS.MENU_ZOOM_OUT),
  menuZoomReset: invoke(IPC_CHANNELS.MENU_ZOOM_RESET),
  menuMinimize: invoke(IPC_CHANNELS.MENU_MINIMIZE),
  menuMaximize: invoke(IPC_CHANNELS.MENU_MAXIMIZE),
  newWindow: invoke(IPC_CHANNELS.MENU_NEW_WINDOW_ACTION),

  // Deep link navigation
  onDeepLinkNavigate: listener(IPC_CHANNELS.DEEP_LINK_NAVIGATE),
  getPendingDeepLink: invoke(IPC_CHANNELS.GET_PENDING_DEEP_LINK),

  // Auth
  showLogoutConfirmation: invoke(IPC_CHANNELS.SHOW_LOGOUT_CONFIRMATION),
  showDeleteSessionConfirmation: invoke(IPC_CHANNELS.SHOW_DELETE_SESSION_CONFIRMATION),
  logout: invoke(IPC_CHANNELS.LOGOUT),
  getCredentialHealth: invoke(IPC_CHANNELS.CREDENTIAL_HEALTH_CHECK),
  getLlmApiKey: invoke(IPC_CHANNELS.GET_LLM_API_KEY),

  // Onboarding
  getAuthState: invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE, {
    transform: result => result.authState,
  }),
  getSetupNeeds: invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE, {
    transform: result => result.setupNeeds,
  }),
  startWorkspaceMcpOAuth: invoke(IPC_CHANNELS.ONBOARDING_START_MCP_OAUTH),
  getExistingClaudeToken: invoke(IPC_CHANNELS.ONBOARDING_GET_EXISTING_CLAUDE_TOKEN),
  isClaudeCliInstalled: invoke(IPC_CHANNELS.ONBOARDING_IS_CLAUDE_CLI_INSTALLED),
  runClaudeSetupToken: invoke(IPC_CHANNELS.ONBOARDING_RUN_CLAUDE_SETUP_TOKEN),
  startClaudeOAuth: invoke(IPC_CHANNELS.ONBOARDING_START_CLAUDE_OAUTH),
  exchangeClaudeCode: invoke(IPC_CHANNELS.ONBOARDING_EXCHANGE_CLAUDE_CODE),
  hasClaudeOAuthState: invoke(IPC_CHANNELS.ONBOARDING_HAS_CLAUDE_OAUTH_STATE),
  clearClaudeOAuthState: invoke(IPC_CHANNELS.ONBOARDING_CLEAR_CLAUDE_OAUTH_STATE),

  // ChatGPT OAuth
  startChatGptOAuth: invoke(IPC_CHANNELS.CHATGPT_START_OAUTH),
  cancelChatGptOAuth: invoke(IPC_CHANNELS.CHATGPT_CANCEL_OAUTH),
  getChatGptAuthStatus: invoke(IPC_CHANNELS.CHATGPT_GET_AUTH_STATUS),
  chatGptLogout: invoke(IPC_CHANNELS.CHATGPT_LOGOUT),

  // GitHub Copilot OAuth
  startCopilotOAuth: invoke(IPC_CHANNELS.COPILOT_START_OAUTH),
  cancelCopilotOAuth: invoke(IPC_CHANNELS.COPILOT_CANCEL_OAUTH),
  getCopilotAuthStatus: invoke(IPC_CHANNELS.COPILOT_GET_AUTH_STATUS),
  logoutCopilot: invoke(IPC_CHANNELS.COPILOT_LOGOUT),
  copilotLogout: invoke(IPC_CHANNELS.COPILOT_LOGOUT),
  onCopilotDeviceCode: listener(IPC_CHANNELS.COPILOT_DEVICE_CODE),

  // Unified API setup flow
  setupLlmConnection: invoke(IPC_CHANNELS.SETUP_LLM_CONNECTION),
  testApiConnection: {
    type: 'invoke',
    channel: IPC_CHANNELS.SETTINGS_TEST_LLM_CONNECTION_SETUP,
    mapArgs: (apiKey: string, baseUrl?: string, models?: string[]) => [{
      provider: 'anthropic',
      apiKey,
      baseUrl,
      model: models?.[0],
      models,
    }],
  },
  testOpenAiConnection: {
    type: 'invoke',
    channel: IPC_CHANNELS.SETTINGS_TEST_LLM_CONNECTION_SETUP,
    mapArgs: (apiKey: string, baseUrl?: string, models?: string[]) => [{
      provider: 'openai',
      apiKey,
      baseUrl,
      model: models?.[0],
      models,
    }],
  },

  // LLM Connections
  listLlmConnections: invoke(IPC_CHANNELS.LLM_CONNECTION_LIST),
  listLlmConnectionsWithStatus: invoke(IPC_CHANNELS.LLM_CONNECTION_LIST_WITH_STATUS),
  getLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_GET),
  saveLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SAVE),
  setLlmConnectionApiKey: invoke(IPC_CHANNELS.LLM_CONNECTION_SET_API_KEY),
  deleteLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_DELETE),
  testLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_TEST),
  setDefaultLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SET_DEFAULT),
  setWorkspaceDefaultLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SET_WORKSPACE_DEFAULT),
  refreshLlmConnectionModels: invoke(IPC_CHANNELS.LLM_CONNECTION_REFRESH_MODELS),

  // Settings - Billing
  getBillingMethod: invoke(IPC_CHANNELS.SETTINGS_GET_BILLING_METHOD),
  updateBillingMethod: invoke(IPC_CHANNELS.SETTINGS_UPDATE_BILLING_METHOD),

  // Settings - Agent Type
  getAgentType: invoke(IPC_CHANNELS.SETTINGS_GET_AGENT_TYPE),
  setAgentType: invoke(IPC_CHANNELS.SETTINGS_SET_AGENT_TYPE),
  checkCodexAuth: invoke(IPC_CHANNELS.SETTINGS_CHECK_CODEX_AUTH),
  startCodexLogin: invoke(IPC_CHANNELS.SETTINGS_START_CODEX_LOGIN),

  // Settings - Provider Config
  getStoredConfig: invoke(IPC_CHANNELS.SETTINGS_GET_STORED_CONFIG),
  updateProviderConfig: invoke(IPC_CHANNELS.SETTINGS_UPDATE_PROVIDER_CONFIG),
  getNetworkProxySettings: invoke(IPC_CHANNELS.SETTINGS_GET_NETWORK_PROXY),
  setNetworkProxySettings: invoke(IPC_CHANNELS.SETTINGS_SET_NETWORK_PROXY),

  // Settings - Model
  getModel: invoke(IPC_CHANNELS.SETTINGS_GET_MODEL),
  setModel: invoke(IPC_CHANNELS.SETTINGS_SET_MODEL),
  getSessionModel: invoke(IPC_CHANNELS.SESSION_GET_MODEL),
  setSessionModel: invoke(IPC_CHANNELS.SESSION_SET_MODEL),

  // Custom Models
  getCustomModels: invoke(IPC_CHANNELS.CUSTOM_MODELS_GET),
  setCustomModels: invoke(IPC_CHANNELS.CUSTOM_MODELS_SET),
  addCustomModel: invoke(IPC_CHANNELS.CUSTOM_MODELS_ADD),
  updateCustomModel: invoke(IPC_CHANNELS.CUSTOM_MODELS_UPDATE),
  deleteCustomModel: invoke(IPC_CHANNELS.CUSTOM_MODELS_DELETE),
  reorderCustomModels: invoke(IPC_CHANNELS.CUSTOM_MODELS_REORDER),

  // Workspace Settings
  getWorkspaceSettings: invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_GET),
  updateWorkspaceSetting: invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_UPDATE),

  // Folder dialog
  openFolderDialog: invoke(IPC_CHANNELS.OPEN_FOLDER_DIALOG),

  // User Preferences
  readPreferences: invoke(IPC_CHANNELS.PREFERENCES_READ),
  writePreferences: invoke(IPC_CHANNELS.PREFERENCES_WRITE),

  // Session Drafts
  getDraft: invoke(IPC_CHANNELS.DRAFTS_GET),
  setDraft: invoke(IPC_CHANNELS.DRAFTS_SET),
  deleteDraft: invoke(IPC_CHANNELS.DRAFTS_DELETE),
  getAllDrafts: invoke(IPC_CHANNELS.DRAFTS_GET_ALL),

  // Session Info Panel
  listDocuments: invoke(IPC_CHANNELS.DOCUMENTS_LIST),
  getSessionFiles: invoke(IPC_CHANNELS.GET_SESSION_FILES),
  getSessionFilesByScope: invoke(IPC_CHANNELS.GET_SESSION_FILES_BY_SCOPE),
  getSessionNotes: invoke(IPC_CHANNELS.GET_SESSION_NOTES),
  setSessionNotes: invoke(IPC_CHANNELS.SET_SESSION_NOTES),
  watchSessionFiles: invoke(IPC_CHANNELS.WATCH_SESSION_FILES),
  unwatchSessionFiles: invoke(IPC_CHANNELS.UNWATCH_SESSION_FILES),
  onSessionFilesChanged: listener(IPC_CHANNELS.SESSION_FILES_CHANGED),

  // Sources
  getSources: invoke(IPC_CHANNELS.SOURCES_GET),
  createSource: invoke(IPC_CHANNELS.SOURCES_CREATE),
  updateSource: invoke(IPC_CHANNELS.SOURCES_UPDATE),
  deleteSource: invoke(IPC_CHANNELS.SOURCES_DELETE),
  startSourceOAuth: invoke(IPC_CHANNELS.SOURCES_START_OAUTH),
  saveSourceCredentials: invoke(IPC_CHANNELS.SOURCES_SAVE_CREDENTIALS),
  getSourcePermissionsConfig: invoke(IPC_CHANNELS.SOURCES_GET_PERMISSIONS),
  getWorkspacePermissionsConfig: invoke(IPC_CHANNELS.WORKSPACE_GET_PERMISSIONS),
  getDefaultPermissionsConfig: invoke(IPC_CHANNELS.DEFAULT_PERMISSIONS_GET),
  getMcpTools: invoke(IPC_CHANNELS.SOURCES_GET_MCP_TOOLS),
  ensureGwsInstalled: invoke(IPC_CHANNELS.SOURCES_ENSURE_GWS_INSTALLED),
  onSourcesChanged: listenerWithArgs(IPC_CHANNELS.SOURCES_CHANGED, (_workspaceId, sources) => [sources]),
  onDefaultPermissionsChanged: listenerWithArgs(IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED, () => []),

  // Skills
  getSkills: invoke(IPC_CHANNELS.SKILLS_GET),
  getSkillFiles: invoke(IPC_CHANNELS.SKILLS_GET_FILES),
  deleteSkill: invoke(IPC_CHANNELS.SKILLS_DELETE),
  openSkillInEditor: invoke(IPC_CHANNELS.SKILLS_OPEN_EDITOR),
  openSkillInFinder: invoke(IPC_CHANNELS.SKILLS_OPEN_FINDER),
  importSkillFromUrl: invoke(IPC_CHANNELS.SKILLS_IMPORT_URL),
  importSkillFromContent: invoke(IPC_CHANNELS.SKILLS_IMPORT_CONTENT),
  onSkillsChanged: listenerWithArgs(IPC_CHANNELS.SKILLS_CHANGED, (_workspaceId, skills) => [skills]),

  // Statuses
  listStatuses: invoke(IPC_CHANNELS.STATUSES_LIST),
  reorderStatuses: invoke(IPC_CHANNELS.STATUSES_REORDER),
  onStatusesChanged: listener(IPC_CHANNELS.STATUSES_CHANGED),

  // Labels
  listLabels: invoke(IPC_CHANNELS.LABELS_LIST),
  createLabel: invoke(IPC_CHANNELS.LABELS_CREATE),
  deleteLabel: invoke(IPC_CHANNELS.LABELS_DELETE),
  onLabelsChanged: listener(IPC_CHANNELS.LABELS_CHANGED),

  // Views
  listViews: invoke(IPC_CHANNELS.VIEWS_LIST),
  saveViews: invoke(IPC_CHANNELS.VIEWS_SAVE),

  // Workspace images
  readWorkspaceImage: invoke(IPC_CHANNELS.WORKSPACE_READ_IMAGE),
  writeWorkspaceImage: invoke(IPC_CHANNELS.WORKSPACE_WRITE_IMAGE),

  // Theme (app-level and workspace-level)
  getAppTheme: invoke(IPC_CHANNELS.THEME_GET_APP),
  loadPresetThemes: invoke(IPC_CHANNELS.THEME_GET_PRESETS),
  loadPresetTheme: invoke(IPC_CHANNELS.THEME_LOAD_PRESET),
  getColorTheme: invoke(IPC_CHANNELS.THEME_GET_COLOR_THEME),
  setColorTheme: invoke(IPC_CHANNELS.THEME_SET_COLOR_THEME),
  getWorkspaceColorTheme: invoke(IPC_CHANNELS.THEME_GET_WORKSPACE_COLOR_THEME),
  setWorkspaceColorTheme: invoke(IPC_CHANNELS.THEME_SET_WORKSPACE_COLOR_THEME),
  getAllWorkspaceThemes: invoke(IPC_CHANNELS.THEME_GET_ALL_WORKSPACE_THEMES),
  broadcastWorkspaceThemeChange: invoke(RPC_CHANNELS.theme.BROADCAST_WORKSPACE_THEME),
  onWorkspaceThemeChange: listener(RPC_CHANNELS.theme.WORKSPACE_THEME_CHANGED),
  getToolIconMappings: invoke(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS),
  getRichToolDescriptions: invoke(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS),
  setRichToolDescriptions: invoke(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS),
  getFontsPath: invoke(IPC_CHANNELS.GET_FONTS_PATH),
  onAppThemeChange: listener(RPC_CHANNELS.theme.APP_CHANGED),
  getLogoUrl: invoke(IPC_CHANNELS.LOGO_GET_URL),

  // Notifications
  showNotification: invoke(IPC_CHANNELS.NOTIFICATION_SHOW),
  getNotificationsEnabled: invoke(IPC_CHANNELS.NOTIFICATION_GET_ENABLED),
  setNotificationsEnabled: invoke(IPC_CHANNELS.NOTIFICATION_SET_ENABLED),
  updateBadgeCount: invoke(IPC_CHANNELS.BADGE_UPDATE),
  clearBadgeCount: invoke(IPC_CHANNELS.BADGE_CLEAR),
  setDockIconWithBadge: invoke(IPC_CHANNELS.BADGE_SET_ICON),
  onBadgeDraw: listener(IPC_CHANNELS.BADGE_DRAW),
  onNotificationNavigate: listener(IPC_CHANNELS.NOTIFICATION_NAVIGATE),

  // Language
  getLanguage: invoke(IPC_CHANNELS.LANGUAGE_GET),
  setLanguage: invoke(IPC_CHANNELS.LANGUAGE_SET),

  // Input settings
  getAutoCapitalisation: invoke(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION),
  setAutoCapitalisation: invoke(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION),
  getSendMessageKey: invoke(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY),
  setSendMessageKey: invoke(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY),
  getSpellCheck: invoke(IPC_CHANNELS.INPUT_GET_SPELL_CHECK),
  setSpellCheck: invoke(IPC_CHANNELS.INPUT_SET_SPELL_CHECK),

  // Power Management
  getKeepAwakeWhileRunning: invoke(IPC_CHANNELS.POWER_GET_KEEP_AWAKE),
  setKeepAwakeWhileRunning: invoke(IPC_CHANNELS.POWER_SET_KEEP_AWAKE),

  // Filesystem search and renderer diagnostics
  searchFiles: invoke(IPC_CHANNELS.FS_SEARCH),
  debugLog: invoke(IPC_CHANNELS.DEBUG_LOG),

  // Git Bash
  checkGitBash: invoke(IPC_CHANNELS.GITBASH_CHECK),
  browseForGitBash: invoke(IPC_CHANNELS.GITBASH_BROWSE),
  setGitBashPath: invoke(IPC_CHANNELS.GITBASH_SET_PATH),

  // Window focus
  getWindowFocusState: invoke(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE),
  onWindowFocusChange: listener(IPC_CHANNELS.WINDOW_FOCUS_STATE),

  // Theme preferences sync across windows
  broadcastThemePreferences: invoke(RPC_CHANNELS.theme.BROADCAST_PREFERENCES),
  onThemePreferencesChange: listener(RPC_CHANNELS.theme.PREFERENCES_CHANGED),

  // System Permissions
  checkFullDiskAccess: invoke(IPC_CHANNELS.PERMISSIONS_CHECK_FULL_DISK_ACCESS),
  openFullDiskAccessSettings: invoke(IPC_CHANNELS.PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS),
  promptFullDiskAccess: invoke(IPC_CHANNELS.PERMISSIONS_PROMPT_FULL_DISK_ACCESS),
  checkAccessibilityAccess: invoke(IPC_CHANNELS.PERMISSIONS_CHECK_ACCESSIBILITY),
  openAccessibilitySettings: invoke(IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS),
  getAllPermissions: invoke(IPC_CHANNELS.PERMISSIONS_GET_ALL),

  // IM Integration
  imGetConfig: invoke(IPC_CHANNELS.IM_GET_CONFIG),
  imSetConfig: invoke(IPC_CHANNELS.IM_SET_CONFIG),
  imGetSettings: invoke(IPC_CHANNELS.IM_GET_SETTINGS),
  imSetSettings: invoke(IPC_CHANNELS.IM_SET_SETTINGS),
  imStartChannel: invoke(IPC_CHANNELS.IM_START_CHANNEL),
  imStopChannel: invoke(IPC_CHANNELS.IM_STOP_CHANNEL),
  imTestChannel: invoke(IPC_CHANNELS.IM_TEST_CHANNEL),
  imGetStatus: invoke(IPC_CHANNELS.IM_GET_STATUS),
  onImStatusChanged: listener(IPC_CHANNELS.IM_STATUS_CHANGED),
  onImMessageReceived: listener(IPC_CHANNELS.IM_MESSAGE_RECEIVED),
  imGetSessionMappings: invoke(IPC_CHANNELS.IM_GET_SESSION_MAPPINGS),
  imDeleteSessionMapping: invoke(IPC_CHANNELS.IM_DELETE_SESSION_MAPPING),

  // Automations
  testAutomation: invoke(IPC_CHANNELS.TEST_AUTOMATION),
  setAutomationEnabled: invoke(IPC_CHANNELS.AUTOMATIONS_SET_ENABLED),
  duplicateAutomation: invoke(IPC_CHANNELS.AUTOMATIONS_DUPLICATE),
  deleteAutomation: invoke(IPC_CHANNELS.AUTOMATIONS_DELETE),
  getAutomationHistory: invoke(IPC_CHANNELS.AUTOMATIONS_GET_HISTORY),
  getAutomationLastExecuted: invoke(IPC_CHANNELS.AUTOMATIONS_GET_LAST_EXECUTED),
  replayAutomation: invoke(IPC_CHANNELS.AUTOMATIONS_REPLAY),
  onAutomationsChanged: listener(IPC_CHANNELS.AUTOMATIONS_CHANGED),

  // Browser pane management
  'browserPane.create': invoke(IPC_CHANNELS.BROWSER_PANE_CREATE),
  'browserPane.destroy': invoke(IPC_CHANNELS.BROWSER_PANE_DESTROY),
  'browserPane.list': invoke(IPC_CHANNELS.BROWSER_PANE_LIST),
  'browserPane.navigate': invoke(IPC_CHANNELS.BROWSER_PANE_NAVIGATE),
  'browserPane.goBack': invoke(IPC_CHANNELS.BROWSER_PANE_GO_BACK),
  'browserPane.goForward': invoke(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD),
  'browserPane.reload': invoke(IPC_CHANNELS.BROWSER_PANE_RELOAD),
  'browserPane.stop': invoke(IPC_CHANNELS.BROWSER_PANE_STOP),
  'browserPane.focus': invoke(IPC_CHANNELS.BROWSER_PANE_FOCUS),
  'browserPane.emptyStateLaunch': invoke(IPC_CHANNELS.BROWSER_PANE_LAUNCH),
  'browserPane.snapshot': invoke(IPC_CHANNELS.BROWSER_PANE_SNAPSHOT),
  'browserPane.click': invoke(IPC_CHANNELS.BROWSER_PANE_CLICK),
  'browserPane.clickAt': invoke(IPC_CHANNELS.BROWSER_PANE_CLICK_AT),
  'browserPane.drag': invoke(IPC_CHANNELS.BROWSER_PANE_DRAG),
  'browserPane.fill': invoke(IPC_CHANNELS.BROWSER_PANE_FILL),
  'browserPane.select': invoke(IPC_CHANNELS.BROWSER_PANE_SELECT),
  'browserPane.upload': invoke(IPC_CHANNELS.BROWSER_PANE_UPLOAD),
  'browserPane.type': invoke(IPC_CHANNELS.BROWSER_PANE_TYPE),
  'browserPane.key': invoke(IPC_CHANNELS.BROWSER_PANE_KEY),
  'browserPane.screenshot': invoke(IPC_CHANNELS.BROWSER_PANE_SCREENSHOT),
  'browserPane.evaluate': invoke(IPC_CHANNELS.BROWSER_PANE_EVALUATE),
  'browserPane.scroll': invoke(IPC_CHANNELS.BROWSER_PANE_SCROLL),
  'browserPane.wait': invoke(IPC_CHANNELS.BROWSER_PANE_WAIT),
  'browserPane.console': invoke(IPC_CHANNELS.BROWSER_PANE_CONSOLE),
  'browserPane.network': invoke(IPC_CHANNELS.BROWSER_PANE_NETWORK),
  'browserPane.downloads': invoke(IPC_CHANNELS.BROWSER_PANE_DOWNLOADS),
  'browserPane.setClipboard': invoke(IPC_CHANNELS.BROWSER_PANE_SET_CLIPBOARD),
  'browserPane.getClipboard': invoke(IPC_CHANNELS.BROWSER_PANE_GET_CLIPBOARD),
  'browserPane.paste': invoke(IPC_CHANNELS.BROWSER_PANE_PASTE),
  'browserPane.onStateChanged': listener(IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED),
  'browserPane.onRemoved': listener(IPC_CHANNELS.BROWSER_PANE_REMOVED),
  'browserPane.onInteracted': listener(IPC_CHANNELS.BROWSER_PANE_INTERACTED),
} satisfies Record<ChannelMappedElectronApiMethodKeys, ChannelMapEntry>
