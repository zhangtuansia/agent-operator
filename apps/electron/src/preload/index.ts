import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type SessionEvent, type ElectronAPI, type FileAttachment, type AuthType, type LlmConnectionSetup } from '../shared/types'

const api: ElectronAPI = {
  // Session management
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),
  getSessionMessages: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_MESSAGES, sessionId),
  searchSessionContent: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_SESSION_CONTENT, query),
  createSession: (workspaceId: string, options?: import('../shared/types').CreateSessionOptions) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, workspaceId, options),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_SESSION, sessionId),
  importSessions: (workspaceId: string, source: 'openai' | 'anthropic', filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_SESSIONS, { workspaceId, source, filePath }),
  sendMessage: (sessionId: string, message: string, attachments?: FileAttachment[], storedAttachments?: import('../shared/types').StoredAttachment[], options?: import('../shared/types').SendMessageOptions) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, sessionId, message, attachments, storedAttachments, options),
  cancelProcessing: (sessionId: string, silent?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_PROCESSING, sessionId, silent),
  killShell: (sessionId: string, shellId: string) => ipcRenderer.invoke(IPC_CHANNELS.KILL_SHELL, sessionId, shellId),
  getTaskOutput: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_TASK_OUTPUT, taskId),
  respondToPermission: (sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESPOND_TO_PERMISSION, sessionId, requestId, allowed, alwaysAllow),
  respondToCredential: (sessionId: string, requestId: string, response: import('../shared/types').CredentialResponse) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESPOND_TO_CREDENTIAL, sessionId, requestId, response),

  // Consolidated session command handler
  sessionCommand: (sessionId: string, command: import('../shared/types').SessionCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_COMMAND, sessionId, command),

  // Pending plan execution (for reload recovery)
  getPendingPlanExecution: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PENDING_PLAN_EXECUTION, sessionId),

  // Workspace management
  getWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACES),
  createWorkspace: (folderPath: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_WORKSPACE, folderPath, name),
  checkWorkspaceSlug: (slug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_WORKSPACE_SLUG, slug),

  // Window management
  getWindowWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_WORKSPACE),
  getWindowMode: () => ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_MODE),
  openWorkspace: (workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_WORKSPACE, workspaceId),
  openSessionInNewWindow: (workspaceId: string, sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW, workspaceId, sessionId),
  switchWorkspace: (workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS.SWITCH_WORKSPACE, workspaceId),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_WINDOW),
  confirmCloseWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE),
  onCloseRequested: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED, handler)
  },
  setTrafficLightsVisible: (visible: boolean) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS, visible),

  // Event listeners
  onSessionEvent: (callback: (event: SessionEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessionEvent: SessionEvent) => {
      callback(sessionEvent)
    }
    ipcRenderer.on(IPC_CHANNELS.SESSION_EVENT, handler)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SESSION_EVENT, handler)
    }
  },

  // File operations
  readFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, path),
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE_DIALOG, options),
  readFileAttachment: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_ATTACHMENT, path),
  storeAttachment: (sessionId: string, attachment: FileAttachment) => ipcRenderer.invoke(IPC_CHANNELS.STORE_ATTACHMENT, sessionId, attachment),
  generateThumbnail: (base64: string, mimeType: string) => ipcRenderer.invoke(IPC_CHANNELS.GENERATE_THUMBNAIL, base64, mimeType),

  // Theme
  getSystemTheme: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_THEME),
  onSystemThemeChange: (callback: (isDark: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean) => {
      callback(isDark)
    }
    ipcRenderer.on(IPC_CHANNELS.SYSTEM_THEME_CHANGED, handler)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_THEME_CHANGED, handler)
    }
  },

  // System
  getVersions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VERSIONS),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  getHomeDir: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HOME_DIR),
  isDebugMode: () => ipcRenderer.invoke(IPC_CHANNELS.IS_DEBUG_MODE),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  getUpdateInfo: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_INFO),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  dismissUpdate: (version: string) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DISMISS, version),
  getDismissedUpdateVersion: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_DISMISSED),
  onUpdateAvailable: (callback: (info: import('../shared/types').UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: import('../shared/types').UpdateInfo) => {
      callback(info)
    }
    ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_AVAILABLE, handler)
  },
  onUpdateDownloadProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, handler)
  },

  // Shell operations
  openUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_URL, url),
  openFile: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, path),
  showInFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_IN_FOLDER, path),

  // Menu event listeners
  onMenuNewChat: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.MENU_NEW_CHAT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_NEW_CHAT, handler)
  },
  onMenuOpenSettings: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_SETTINGS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_OPEN_SETTINGS, handler)
  },
  onMenuOpenSettingsSubpage: (callback: (subpage: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, subpage: string) => callback(subpage)
    ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_SETTINGS_SUBPAGE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_OPEN_SETTINGS_SUBPAGE, handler)
  },
  onMenuKeyboardShortcuts: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.MENU_KEYBOARD_SHORTCUTS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_KEYBOARD_SHORTCUTS, handler)
  },

  // Menu role actions (renderer → main)
  menuUndo: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_UNDO),
  menuRedo: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_REDO),
  menuCut: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_CUT),
  menuCopy: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_COPY),
  menuPaste: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_PASTE),
  menuSelectAll: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_SELECT_ALL),
  menuZoomIn: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_ZOOM_IN),
  menuZoomOut: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_ZOOM_OUT),
  menuZoomReset: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_ZOOM_RESET),
  menuMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_MINIMIZE),
  menuMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_MAXIMIZE),
  newWindow: () => ipcRenderer.invoke(IPC_CHANNELS.MENU_NEW_WINDOW_ACTION),

  // Deep link navigation listener (for external agentoperator:// URLs)
  onDeepLinkNavigate: (callback: (nav: import('../shared/types').DeepLinkNavigation) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, nav: import('../shared/types').DeepLinkNavigation) => {
      callback(nav)
    }
    ipcRenderer.on(IPC_CHANNELS.DEEP_LINK_NAVIGATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DEEP_LINK_NAVIGATE, handler)
  },
  // Get pending deep link for this window (pull-based for reliable timing)
  getPendingDeepLink: (): Promise<import('../shared/types').DeepLinkNavigation | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PENDING_DEEP_LINK),

  // Auth
  showLogoutConfirmation: () => ipcRenderer.invoke(IPC_CHANNELS.SHOW_LOGOUT_CONFIRMATION),
  showDeleteSessionConfirmation: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_DELETE_SESSION_CONFIRMATION, name),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.LOGOUT),
  getCredentialHealth: () => ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_HEALTH_CHECK),
  getLlmApiKey: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_LLM_API_KEY, connectionSlug),

  // Onboarding
  getAuthState: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE).then(r => r.authState),
  getSetupNeeds: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE).then(r => r.setupNeeds),
  startWorkspaceMcpOAuth: (mcpUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_START_MCP_OAUTH, mcpUrl),
  saveOnboardingConfig: (config: {
    authType?: AuthType
    workspace?: { name: string; iconUrl?: string; mcpUrl?: string }
    credential?: string
    mcpCredentials?: { accessToken: string; clientId?: string }
    providerConfig?: {
      provider: string
      baseURL: string
      apiFormat: 'anthropic' | 'openai'
    }
  }) => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_SAVE_CONFIG, config),
  // Claude OAuth
  getExistingClaudeToken: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_EXISTING_CLAUDE_TOKEN),
  isClaudeCliInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_IS_CLAUDE_CLI_INSTALLED),
  runClaudeSetupToken: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_RUN_CLAUDE_SETUP_TOKEN),
  // Native Claude OAuth (two-step flow)
  startClaudeOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_START_CLAUDE_OAUTH),
  exchangeClaudeCode: (code: string, connectionSlug?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_EXCHANGE_CLAUDE_CODE, code, connectionSlug),
  hasClaudeOAuthState: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_HAS_CLAUDE_OAUTH_STATE),
  clearClaudeOAuthState: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_CLEAR_CLAUDE_OAUTH_STATE),
  // ChatGPT OAuth (for Codex chatgptAuthTokens mode)
  startChatGptOAuth: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_START_OAUTH, connectionSlug),
  cancelChatGptOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_CANCEL_OAUTH),
  getChatGptAuthStatus: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_GET_AUTH_STATUS, connectionSlug),
  chatGptLogout: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.CHATGPT_LOGOUT, connectionSlug),
  // GitHub Copilot OAuth (device flow)
  startCopilotOAuth: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_START_OAUTH, connectionSlug),
  cancelCopilotOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_CANCEL_OAUTH),
  getCopilotAuthStatus: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_GET_AUTH_STATUS, connectionSlug),
  logoutCopilot: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_LOGOUT, connectionSlug),
  copilotLogout: (connectionSlug: string) => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_LOGOUT, connectionSlug),
  onCopilotDeviceCode: (callback: (deviceCode: { userCode: string; verificationUri: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, deviceCode: { userCode: string; verificationUri: string }) => callback(deviceCode)
    ipcRenderer.on(IPC_CHANNELS.COPILOT_DEVICE_CODE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COPILOT_DEVICE_CODE, handler)
  },

  // Settings - API setup (unified connection bootstrap)
  setupLlmConnection: (setup: LlmConnectionSetup) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_LLM_CONNECTION, setup),
  testApiConnection: (apiKey: string, baseUrl?: string, models?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_API_CONNECTION, apiKey, baseUrl, models),
  testOpenAiConnection: (apiKey: string, baseUrl?: string, models?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_OPENAI_CONNECTION, apiKey, baseUrl, models),

  // LLM Connections (provider configurations)
  listLlmConnections: () => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_LIST),
  listLlmConnectionsWithStatus: () => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_LIST_WITH_STATUS),
  getLlmConnection: (slug: string) => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_GET, slug),
  saveLlmConnection: (connection: import('../shared/types').LlmConnection) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_SAVE, connection),
  setLlmConnectionApiKey: (slug: string, apiKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_SET_API_KEY, slug, apiKey),
  deleteLlmConnection: (slug: string) => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_DELETE, slug),
  testLlmConnection: (slug: string) => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_TEST, slug),
  setDefaultLlmConnection: (slug: string) => ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_SET_DEFAULT, slug),
  setWorkspaceDefaultLlmConnection: (workspaceId: string, slug: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_SET_WORKSPACE_DEFAULT, workspaceId, slug),
  refreshLlmConnectionModels: (slug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_CONNECTION_REFRESH_MODELS, slug),

  // Settings - Billing
  getBillingMethod: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_BILLING_METHOD),
  updateBillingMethod: (authType: AuthType, credential?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE_BILLING_METHOD, authType, credential),

  // Settings - Agent Type (Claude vs Codex)
  getAgentType: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_AGENT_TYPE),
  setAgentType: (agentType: 'claude' | 'codex') =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_AGENT_TYPE, agentType),
  checkCodexAuth: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CHECK_CODEX_AUTH),
  startCodexLogin: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_START_CODEX_LOGIN),

  // Settings - Provider Config
  getStoredConfig: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_STORED_CONFIG),
  updateProviderConfig: (config: { provider: string; baseURL: string; apiFormat: 'anthropic' | 'openai' }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE_PROVIDER_CONFIG, config),

  // Settings - Model (global default)
  getModel: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_MODEL),
  setModel: (model: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_MODEL, model),
  // Session-specific model (overrides global)
  getSessionModel: (sessionId: string, workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_MODEL, sessionId, workspaceId),
  setSessionModel: (sessionId: string, workspaceId: string, model: string | null, connection?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_SET_MODEL, sessionId, workspaceId, model, connection),

  // Custom Models (for Custom provider)
  getCustomModels: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_GET),
  setCustomModels: (models: import('../shared/types').CustomModel[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_SET, models),
  addCustomModel: (model: import('../shared/types').CustomModel) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_ADD, model),
  updateCustomModel: (modelId: string, updates: Partial<import('../shared/types').CustomModel>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_UPDATE, modelId, updates),
  deleteCustomModel: (modelId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_DELETE, modelId),
  reorderCustomModels: (modelIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOM_MODELS_REORDER, modelIds),

  // Workspace Settings (per-workspace configuration)
  getWorkspaceSettings: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_GET, workspaceId),
  updateWorkspaceSetting: <K extends string>(workspaceId: string, key: K, value: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_UPDATE, workspaceId, key, value),

  // Folder dialog
  openFolderDialog: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER_DIALOG),

  // User Preferences
  readPreferences: () => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_READ),
  writePreferences: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_WRITE, content),

  // Session Drafts (persisted input text)
  getDraft: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.DRAFTS_GET, sessionId),
  setDraft: (sessionId: string, text: string) => ipcRenderer.invoke(IPC_CHANNELS.DRAFTS_SET, sessionId, text),
  deleteDraft: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.DRAFTS_DELETE, sessionId),
  getAllDrafts: () => ipcRenderer.invoke(IPC_CHANNELS.DRAFTS_GET_ALL),

  // Session Info Panel
  getSessionFiles: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_FILES, sessionId),
  getSessionFilesByScope: (sessionId: string, scope: 'session' | 'workspace') =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_FILES_BY_SCOPE, sessionId, scope),
  getSessionNotes: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_NOTES, sessionId),
  setSessionNotes: (sessionId: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_SESSION_NOTES, sessionId, content),
  watchSessionFiles: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_SESSION_FILES, sessionId),
  unwatchSessionFiles: (sessionId?: string) => ipcRenderer.invoke(IPC_CHANNELS.UNWATCH_SESSION_FILES, sessionId),
  onSessionFilesChanged: (callback: (event: { sessionId: string; scope: 'session' | 'workspace'; changedPath?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { sessionId: string; scope: 'session' | 'workspace'; changedPath?: string }) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.SESSION_FILES_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_FILES_CHANGED, handler)
  },

  // Sources
  getSources: (workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS.SOURCES_GET, workspaceId),
  createSource: (workspaceId: string, config: Partial<import('@agent-operator/shared/sources').FolderSourceConfig>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_CREATE, workspaceId, config),
  deleteSource: (workspaceId: string, sourceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_DELETE, workspaceId, sourceSlug),
  startSourceOAuth: (workspaceId: string, sourceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_START_OAUTH, workspaceId, sourceSlug),
  saveSourceCredentials: (workspaceId: string, sourceSlug: string, credential: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_SAVE_CREDENTIALS, workspaceId, sourceSlug, credential),
  getSourcePermissionsConfig: (workspaceId: string, sourceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_GET_PERMISSIONS, workspaceId, sourceSlug),
  getWorkspacePermissionsConfig: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_PERMISSIONS, workspaceId),
  getDefaultPermissionsConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DEFAULT_PERMISSIONS_GET),
  // Default permissions change listener (live updates when default.json changes)
  onDefaultPermissionsChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED, handler)
    }
  },
  getMcpTools: (workspaceId: string, sourceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_GET_MCP_TOOLS, workspaceId, sourceSlug),

  // Status management
  listStatuses: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATUSES_LIST, workspaceId),
  reorderStatuses: (workspaceId: string, orderedIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATUSES_REORDER, workspaceId, orderedIds),

  // Generic workspace image loading/saving
  readWorkspaceImage: (workspaceId: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_READ_IMAGE, workspaceId, relativePath),
  writeWorkspaceImage: (workspaceId: string, relativePath: string, base64: string, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_WRITE_IMAGE, workspaceId, relativePath, base64, mimeType),

  // Sources change listener (live updates when sources are added/removed)
  onSourcesChanged: (callback: (sources: import('@agent-operator/shared/sources').LoadedSource[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sources: import('@agent-operator/shared/sources').LoadedSource[]) => {
      callback(sources)
    }
    ipcRenderer.on(IPC_CHANNELS.SOURCES_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SOURCES_CHANGED, handler)
    }
  },

  // Skills
  getSkills: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET, workspaceId),
  getSkillFiles: (workspaceId: string, skillSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET_FILES, workspaceId, skillSlug),
  deleteSkill: (workspaceId: string, skillSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, workspaceId, skillSlug),
  openSkillInEditor: (workspaceId: string, skillSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_OPEN_EDITOR, workspaceId, skillSlug),
  openSkillInFinder: (workspaceId: string, skillSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_OPEN_FINDER, workspaceId, skillSlug),
  importSkillFromUrl: (workspaceId: string, url: string, customSlug?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_IMPORT_URL, workspaceId, url, customSlug),
  importSkillFromContent: (workspaceId: string, content: string, customSlug?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILLS_IMPORT_CONTENT, workspaceId, content, customSlug),

  // Skills change listener (live updates when skills are added/removed/modified)
  onSkillsChanged: (callback: (skills: import('@agent-operator/shared/skills').LoadedSkill[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, skills: import('@agent-operator/shared/skills').LoadedSkill[]) => {
      callback(skills)
    }
    ipcRenderer.on(IPC_CHANNELS.SKILLS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SKILLS_CHANGED, handler)
    }
  },

  // Statuses change listener (live updates when statuses config or icon files change)
  onStatusesChanged: (callback: (workspaceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspaceId: string) => {
      callback(workspaceId)
    }
    ipcRenderer.on(IPC_CHANNELS.STATUSES_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STATUSES_CHANGED, handler)
    }
  },

  // Labels
  listLabels: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LABELS_LIST, workspaceId),
  createLabel: (workspaceId: string, input: import('@agent-operator/shared/labels').CreateLabelInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.LABELS_CREATE, workspaceId, input),
  deleteLabel: (workspaceId: string, labelId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LABELS_DELETE, workspaceId, labelId),

  // Labels change listener (live updates when labels config changes)
  onLabelsChanged: (callback: (workspaceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspaceId: string) => {
      callback(workspaceId)
    }
    ipcRenderer.on(IPC_CHANNELS.LABELS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LABELS_CHANGED, handler)
    }
  },

  // Views
  listViews: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIEWS_LIST, workspaceId),
  saveViews: (workspaceId: string, views: import('@agent-operator/shared/views').ViewConfig[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIEWS_SAVE, workspaceId, views),

  // Theme (app-level only)
  getAppTheme: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_APP),
  // Preset themes (app-level)
  loadPresetThemes: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_PRESETS),
  loadPresetTheme: (themeId: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME_LOAD_PRESET, themeId),
  getColorTheme: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_COLOR_THEME),
  setColorTheme: (themeId: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME_SET_COLOR_THEME, themeId),
  getWorkspaceColorTheme: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_WORKSPACE_COLOR_THEME, workspaceId) as Promise<string | null>,
  setWorkspaceColorTheme: (workspaceId: string, themeId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_SET_WORKSPACE_COLOR_THEME, workspaceId, themeId),
  getAllWorkspaceThemes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_ALL_WORKSPACE_THEMES),
  broadcastWorkspaceThemeChange: (workspaceId: string, themeId: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_WORKSPACE_CHANGED, workspaceId, themeId),
  onWorkspaceThemeChange: (callback: (data: { workspaceId: string; themeId: string | null }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { workspaceId: string; themeId: string | null }) => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.THEME_WORKSPACE_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.THEME_WORKSPACE_CHANGED, handler)
    }
  },

  // Fonts (local font files path)
  // In development: relative to app root
  // In production: uses Electron's resourcesPath
  getFontsPath: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FONTS_PATH),

  // Logo URL resolution (uses Node.js filesystem cache for provider domains)
  getLogoUrl: (serviceUrl: string, provider?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LOGO_GET_URL, serviceUrl, provider),

  // Tool icon mappings (for Appearance settings page)
  getToolIconMappings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS) as Promise<import('@agent-operator/shared/ipc').ToolIconMapping[]>,
  // Appearance settings
  getRichToolDescriptions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS) as Promise<boolean>,
  setRichToolDescriptions: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS, enabled),

  // Theme change listeners (live updates when theme.json files change)
  onAppThemeChange: (callback: (theme: import('@agent-operator/shared/config').ThemeOverrides | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: import('@agent-operator/shared/config').ThemeOverrides | null) => {
      callback(theme)
    }
    ipcRenderer.on(IPC_CHANNELS.THEME_APP_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.THEME_APP_CHANGED, handler)
    }
  },
  // Theme preferences sync across windows (mode, colorTheme, font)
  broadcastThemePreferences: (preferences: { mode: string; colorTheme: string; font: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_BROADCAST_PREFERENCES, preferences),
  onThemePreferencesChange: (callback: (preferences: { mode: string; colorTheme: string; font: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, preferences: { mode: string; colorTheme: string; font: string }) => {
      callback(preferences)
    }
    ipcRenderer.on(IPC_CHANNELS.THEME_PREFERENCES_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.THEME_PREFERENCES_CHANGED, handler)
    }
  },

  // Notifications
  showNotification: (title: string, body: string, workspaceId: string, sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SHOW, title, body, workspaceId, sessionId),
  getNotificationsEnabled: () =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_GET_ENABLED) as Promise<boolean>,
  setNotificationsEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SET_ENABLED, enabled),

  // Language
  getLanguage: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LANGUAGE_GET) as Promise<'en' | 'zh' | null>,
  setLanguage: (language: 'en' | 'zh') =>
    ipcRenderer.invoke(IPC_CHANNELS.LANGUAGE_SET, language),

  // Input settings
  getAutoCapitalisation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION) as Promise<boolean>,
  setAutoCapitalisation: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION, enabled),
  getSendMessageKey: () =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY) as Promise<'enter' | 'cmd-enter'>,
  setSendMessageKey: (key: 'enter' | 'cmd-enter') =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY, key),
  getSpellCheck: () =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_GET_SPELL_CHECK) as Promise<boolean>,
  setSpellCheck: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.INPUT_SET_SPELL_CHECK, enabled),
  // Power Management
  getKeepAwakeWhileRunning: () =>
    ipcRenderer.invoke(IPC_CHANNELS.POWER_GET_KEEP_AWAKE) as Promise<boolean>,
  setKeepAwakeWhileRunning: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.POWER_SET_KEEP_AWAKE, enabled),
  // Git Bash (Windows)
  checkGitBash: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GITBASH_CHECK) as Promise<import('../shared/types').GitBashStatus>,
  browseForGitBash: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GITBASH_BROWSE) as Promise<string | null>,
  setGitBashPath: (path: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GITBASH_SET_PATH, path) as Promise<{ success: boolean; error?: string }>,

  updateBadgeCount: (count: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.BADGE_UPDATE, count),
  clearBadgeCount: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BADGE_CLEAR),
  setDockIconWithBadge: (dataUrl: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BADGE_SET_ICON, dataUrl),
  onBadgeDraw: (callback: (data: { count: number; iconDataUrl: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { count: number; iconDataUrl: string }) => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.BADGE_DRAW, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.BADGE_DRAW, handler)
    }
  },
  getWindowFocusState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE),
  onWindowFocusChange: (callback: (isFocused: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isFocused: boolean) => {
      callback(isFocused)
    }
    ipcRenderer.on(IPC_CHANNELS.WINDOW_FOCUS_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_FOCUS_STATE, handler)
    }
  },
  onNotificationNavigate: (callback: (data: { workspaceId: string; sessionId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { workspaceId: string; sessionId: string }) => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_NAVIGATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_NAVIGATE, handler)
    }
  },

  // System Permissions (macOS)
  checkFullDiskAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_CHECK_FULL_DISK_ACCESS) as Promise<boolean>,
  openFullDiskAccessSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS),
  promptFullDiskAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_PROMPT_FULL_DISK_ACCESS) as Promise<boolean>,
  checkAccessibilityAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_CHECK_ACCESSIBILITY) as Promise<boolean>,
  openAccessibilitySettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS),
  getAllPermissions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_GET_ALL) as Promise<{ fullDiskAccess: boolean; accessibility: boolean }>,

  // IM Integration (Feishu, Telegram)
  imGetConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_GET_CONFIG),
  imSetConfig: (config: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_SET_CONFIG, config),
  imGetSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_GET_SETTINGS),
  imSetSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_SET_SETTINGS, settings),
  imStartChannel: (platform: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_START_CHANNEL, platform),
  imStopChannel: (platform: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_STOP_CHANNEL, platform),
  imTestChannel: (platform: string, config?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_TEST_CHANNEL, platform, config),
  imGetStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_GET_STATUS),
  onImStatusChanged: (callback: (statuses: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, statuses: unknown[]) => {
      callback(statuses)
    }
    ipcRenderer.on(IPC_CHANNELS.IM_STATUS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IM_STATUS_CHANGED, handler)
    }
  },
  imGetSessionMappings: (platform?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_GET_SESSION_MAPPINGS, platform),
  imDeleteSessionMapping: (conversationId: string, platform: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IM_DELETE_SESSION_MAPPING, conversationId, platform),

  // Automations
  testAutomation: (payload: { workspaceId: string; automationId: string; actions: unknown[]; permissionMode?: string; labels?: string[] }) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEST_AUTOMATION, payload),
  setAutomationEnabled: (workspaceId: string, event: string, matcherIndex: number, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOMATIONS_SET_ENABLED, workspaceId, event, matcherIndex, enabled),
  duplicateAutomation: (workspaceId: string, event: string, matcherIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOMATIONS_DUPLICATE, workspaceId, event, matcherIndex),
  deleteAutomation: (workspaceId: string, event: string, matcherIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOMATIONS_DELETE, workspaceId, event, matcherIndex),
  getAutomationHistory: (workspaceId: string, automationId: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOMATIONS_GET_HISTORY, workspaceId, automationId, limit),
  getAutomationLastExecuted: (workspaceId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOMATIONS_GET_LAST_EXECUTED, workspaceId),
  onAutomationsChanged: (callback: () => void) => {
    const handler = () => { callback() }
    ipcRenderer.on(IPC_CHANNELS.AUTOMATIONS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTOMATIONS_CHANGED, handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
