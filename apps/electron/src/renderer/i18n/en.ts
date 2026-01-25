/**
 * English translations
 */
export const en = {
  // Common
  common: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    search: 'Search',
    clear: 'Clear',
    change: 'Change',
    uploading: 'Uploading...',
    notSet: 'Not set',
    none: 'None',
    enabled: 'Enabled',
    disabled: 'Disabled',
    allowed: 'Allowed',
    blocked: 'Blocked',
    default: 'Default',
    custom: 'Custom',
    openInNewWindow: 'Open in New Window',
    editFile: 'Edit File',
    tryAgain: 'Try Again',
    validating: 'Validating...',
    connecting: 'Connecting...',
    connected: 'Connected!',
    failed: 'Failed',
    add: 'Add',
    remove: 'Remove',
    update: 'Update',
    configure: 'Configure',
  },

  // Settings
  settings: {
    title: 'Settings',
    app: 'App',
    workspace: 'Workspace',
    api: 'API',
    permissions: 'Permissions',
    shortcuts: 'Shortcuts',
    preferences: 'Preferences',
    appDescription: 'Appearance, notifications, billing',
    workspaceDescription: 'Model, mode cycling, advanced',
    apiDescription: 'Provider, endpoint, API key',
    permissionsDescription: 'Allowed commands in Explore mode',
    shortcutsDescription: 'Keyboard shortcuts reference',
    preferencesDescription: 'Your personal preferences',
  },

  // App Settings
  appSettings: {
    title: 'App Settings',

    // Appearance
    appearance: 'Appearance',
    mode: 'Mode',
    modeSystem: 'System',
    modeLight: 'Light',
    modeDark: 'Dark',
    colorTheme: 'Color theme',
    colorThemeDefault: 'Default',
    font: 'Font',

    // Language
    language: 'Language',
    languageDescription: 'Choose the display language for the app',
    languageEnglish: 'English',
    languageChinese: '中文',

    // Notifications
    notifications: 'Notifications',
    desktopNotifications: 'Desktop notifications',
    desktopNotificationsDesc: 'Get notified when AI finishes working in a chat.',

    // Billing
    billing: 'Billing',
    billingDescription: 'Choose how you pay for AI usage',
    paymentMethod: 'Payment method',
    apiKeyConfigured: 'API key configured',
    claudeConnected: 'Claude connected',
    selectMethod: 'Select a method',
    claudeProMax: 'Claude Pro/Max',
    claudeProMaxDesc: 'Use your Pro or Max subscription',
    apiKey: 'API Key',
    apiKeyDesc: 'Pay-as-you-go with your Anthropic key',
    configureApiKey: 'Configure your Anthropic API key',
    configureClaudeMax: 'Connect your Claude subscription',
    payAsYouGo: 'Pay-as-you-go with your own API key.',
    getApiKeyFrom: 'Get one from Anthropic',
    unlimitedAccess: 'Use your Claude Pro or Max subscription for unlimited access.',
    updateKey: 'Update Key',

    // About
    about: 'About',
    version: 'Version',
    checkForUpdates: 'Check for updates',
    checkNow: 'Check Now',
    checking: 'Checking...',
    updateTo: 'Update to',
    restartToUpdate: 'Restart to Update',
    installUpdate: 'Install update',
    downloading: 'Downloading...',
    downloadProgress: 'Downloading {progress}%',
    downloadUpdate: 'Download Update',
    downloadFailed: 'Download failed',
    retryDownload: 'Retry Download',
  },

  // API Settings
  apiSettings: {
    title: 'API Configuration',
    provider: 'Provider',
    providerDescription: 'Select the AI service provider',
    baseUrl: 'Base URL',
    baseUrlDescription: 'API endpoint URL',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    apiFormat: 'API Format',
    apiFormatDescription: 'API protocol format',
    apiFormatAnthropic: 'Anthropic Compatible',
    apiFormatAnthropicDesc: 'Anthropic Messages API format',
    apiFormatOpenAI: 'OpenAI Compatible',
    apiFormatOpenAIDesc: 'OpenAI Chat Completions format',
    apiKeyLabel: 'API Key',
    apiKeyDescription: 'Your API key for authentication',
    apiKeyPlaceholder: 'sk-ant-...',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    saved: 'Saved!',

    // Providers
    providerAnthropic: 'Anthropic (Default)',
    providerBedrock: 'AWS Bedrock',
    providerBedrockDesc: 'Configured via environment variables',
    providerOpenRouter: 'OpenRouter',
    providerVercel: 'Vercel AI Gateway',
    providerOllama: 'Ollama',
    providerGLM: 'GLM (智谱)',
    providerMiniMax: 'MiniMax',
    providerDeepSeek: 'DeepSeek',
    providerCustom: 'Custom Endpoint',

    // Provider-specific help text
    helpOpenRouter: 'Model format: provider/model-name (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
    helpOllama: 'Make sure Ollama is running locally. Model names match what you have pulled (e.g., llama3.2, mistral)',
    helpVercel: 'Vercel AI Gateway proxies requests to Anthropic. Use standard Claude model names.',

    // Bedrock info
    bedrockConfiguration: 'Configuration',
    bedrockConfigDescription: 'AWS Bedrock is configured via environment variables. Edit your ~/.zshrc or ~/.bashrc to modify settings.',

    // Custom Models
    customModels: {
      title: 'Custom Models',
      sectionDescription: 'Define custom model names for your API endpoint',
      addModel: 'Add Model',
      editTitle: 'Edit Model',
      addTitle: 'Add Model',
      dialogDescription: 'Configure a custom model for your API endpoint',
      modelId: 'Model ID',
      modelIdHint: 'The model identifier used in API calls (e.g., gpt-4-turbo)',
      displayName: 'Display Name',
      shortName: 'Short Name',
      shortNameHint: 'Displayed in compact views',
      description: 'Description',
      descriptionPlaceholder: 'Optional description',
      emptyState: 'No custom models defined',
      emptyStateHint: 'Add models that your API endpoint supports',
      errorIdRequired: 'Model ID is required',
      errorNameRequired: 'Display name is required',
      errorIdDuplicate: 'A model with this ID already exists',
    },
  },

  // Workspace Settings
  workspaceSettings: {
    title: 'Workspace Settings',
    noWorkspaceSelected: 'No workspace selected',

    // Workspace Info
    workspaceInfo: 'Workspace Info',
    name: 'Name',
    untitled: 'Untitled',
    icon: 'Icon',

    // Model
    model: 'Model',
    defaultModel: 'Default model',
    defaultModelDescription: 'AI model for new chats',
    thinkingLevel: 'Thinking level',
    thinkingLevelDescription: 'Reasoning depth for new chats',

    // Permissions
    permissions: 'Permissions',
    defaultMode: 'Default mode',
    defaultModeDescription: 'Control what AI can do',
    modeExplore: 'Explore',
    modeExploreDescription: 'Read-only, no changes allowed',
    modeAsk: 'Ask',
    modeAskDescription: 'Prompts before making edits',
    modeAuto: 'Auto',
    modeAutoDescription: 'Full autonomous execution',

    // Mode Cycling
    modeCycling: 'Mode Cycling',
    modeCyclingDescription: 'Select which modes to cycle through with Shift+Tab',
    atLeast2ModesRequired: 'At least 2 modes required',

    // Advanced
    advanced: 'Advanced',
    workingDirectory: 'Default Working Directory',
    workingDirectoryNotSet: 'Not set (uses session folder)',
    localMcpServers: 'Local MCP Servers',
    localMcpServersDescription: 'Enable stdio subprocess servers',
  },

  // Preferences
  preferences: {
    title: 'Preferences',
    revert: 'Revert',

    // Basic Info
    basicInfo: 'Basic Info',
    basicInfoDescription: 'Help Cowork personalize responses to you.',
    yourName: 'Name',
    yourNameDescription: 'How Cowork should address you.',
    yourNamePlaceholder: 'Your name',
    timezone: 'Timezone',
    timezoneDescription: 'Used for relative dates like \'tomorrow\' or \'next week\'.',
    timezonePlaceholder: 'e.g., America/New_York',
    timezoneAuto: 'Auto (System Default)',
    preferredLanguage: 'Language',
    preferredLanguageDescription: 'Preferred language for Cowork\'s responses.',
    preferredLanguagePlaceholder: 'e.g., English',

    // Location
    location: 'Location',
    locationDescription: 'Enables location-aware responses like weather, local time, and regional context.',
    city: 'City',
    cityDescription: 'Your city for local information and context.',
    cityPlaceholder: 'e.g., New York',
    country: 'Country',
    countryDescription: 'Your country for regional formatting and context.',
    countryPlaceholder: 'e.g., USA',

    // Notes
    notes: 'Notes',
    notesDescription: 'Free-form context that helps Cowork understand your preferences.',
    notesPlaceholder: 'Any additional context you\'d like Cowork to know...',
  },

  // Permissions Settings
  permissionsSettings: {
    title: 'Permissions',
    defaultPermissions: 'Default Permissions',
    defaultPermissionsDescription: 'App-level patterns allowed in Explore mode. Commands not on this list are blocked.',
    workspaceCustomizations: 'Workspace Customizations',
    workspaceCustomizationsDescription: 'Workspace-level patterns that extend the app defaults above.',
    noDefaultPermissions: 'No default permissions found.',
    defaultPermissionsPath: 'Default permissions should be at',
    noCustomPermissions: 'No custom permissions configured.',
    customPermissionsHint: 'Create a permissions.json file in your workspace to add custom rules.',

    // Permission types
    bash: 'Bash',
    mcp: 'MCP',
    api: 'API',
    tool: 'Tool',
  },

  // Chat
  chat: {
    title: 'Chat',
    newChat: 'New Chat',
    sendMessage: 'Send message',
    thinking: 'Thinking...',
    stopGenerating: 'Stop generating',
    sessionNoLongerExists: 'This session no longer exists',
    renameChat: 'Rename Chat',
    enterChatName: 'Enter chat name...',
  },

  // Session List
  sessionList: {
    title: 'Chats',
    allChats: 'All Chats',
    flagged: 'Flagged',
    noSessions: 'No chats yet',
    startNewChat: 'Start a new chat',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    lastWeek: 'Last Week',
    thisMonth: 'This Month',
    older: 'Older',
    filterChats: 'Filter Chats',
    searchConversations: 'Search conversations...',
    clearSearch: 'Clear search',
    closeSearch: 'Close search',
  },

  // Chat Info (Right Sidebar)
  chatInfo: {
    title: 'Chat Info',
    noSessionSelected: 'No session selected',
    loadingSession: 'Loading session...',
    name: 'Name',
    untitled: 'Untitled',
    notes: 'Notes',
    addNotes: 'Add notes...',
    loading: 'Loading...',
    files: 'Files',
    sessionFiles: 'Session Files',
    workspaceFiles: 'Workspace Files',
    filesEmptyState: 'Files attached or created by this chat will appear here.',
    filesPanelComingSoon: 'Files panel - Coming soon',
    historyPanelComingSoon: 'History panel - Coming soon',
  },

  // Session Menu
  sessionMenu: {
    rename: 'Rename',
    regenerateTitle: 'Regenerate Title',
    flag: 'Flag',
    unflag: 'Unflag',
    markAsUnread: 'Mark as Unread',
    status: 'Status',
    share: 'Share',
    shared: 'Shared',
    openInBrowser: 'Open in Browser',
    copyLink: 'Copy Link',
    copyShareLink: 'Copy share link',
    updateShare: 'Update Share',
    stopSharing: 'Stop Sharing',
    openInNewWindow: 'Open in New Window',
    viewInFinder: 'View in Finder',
    copyPath: 'Copy Path',
    delete: 'Delete',
    deleteConfirm: 'Are you sure you want to delete this chat?',
    linkCopied: 'Link copied to clipboard',
    shareUpdated: 'Share updated',
    sharingStopped: 'Sharing stopped',
    pathCopied: 'Path copied to clipboard',
    titleRefreshed: 'Title refreshed',
    failedToShare: 'Failed to share',
    failedToUpdateShare: 'Failed to update share',
    failedToStopSharing: 'Failed to stop sharing',
    failedToRefreshTitle: 'Failed to refresh title',
  },

  // Sidebar Menu
  sidebarMenu: {
    configureStatuses: 'Configure Statuses',
  },

  // Sources
  sources: {
    title: 'Sources',
    noSources: 'No sources configured.',
    addFirstSource: 'Add your first source',
    connectSource: 'Connect a source',
    addSource: 'Add Source',
    searchSources: 'Search sources...',
    noSourcesConfigured: 'No sources configured.',
    addSourcesInSettings: 'Add sources in Settings.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    configure: 'Configure',
    disconnect: 'Disconnect',
    // Source types
    typeMcp: 'MCP',
    typeApi: 'API',
    typeLocal: 'Local',
    // Source status
    statusNeedsAuth: 'Needs Auth',
    statusFailed: 'Failed',
    statusNotTested: 'Not Tested',
    statusDisabled: 'Disabled',
    // Source menu
    showInFinder: 'Show in Finder',
    deleteSource: 'Delete Source',
    authenticateToViewData: 'Authenticate with this source to view available data',
    authenticateToViewTools: 'Authenticate with this source to view available tools',
  },

  // Skills
  skills: {
    title: 'Skills',
    noSkills: 'No skills configured.',
    addFirstSkill: 'Add your first skill',
    createSkill: 'Create a skill',
    addSkill: 'Add Skill',
    enabled: 'Enabled',
    disabled: 'Disabled',
    // Skill menu
    showInFinder: 'Show in Finder',
    deleteSkill: 'Delete Skill',
  },

  // Sidebar
  sidebar: {
    chats: 'Chats',
    sources: 'Sources',
    skills: 'Skills',
    settings: 'Settings',
    newWorkspace: 'New Workspace',
    addWorkspace: 'Add Workspace...',
    workspaces: 'Workspaces',
    selectWorkspace: 'Select workspace',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
  },

  // Right Sidebar
  rightSidebar: {
    info: 'Info',
    activity: 'Activity',
    files: 'Files',
  },

  // App Menu
  appMenu: {
    newChat: 'New Chat',
    settings: 'Settings...',
    keyboardShortcuts: 'Keyboard Shortcuts',
    storedUserPreferences: 'Stored User Preferences',
    resetApp: 'Reset App...',
    goBack: 'Go back',
    goForward: 'Go forward',
    hideSidebar: 'Hide sidebar',
    showSidebar: 'Show sidebar',
  },

  // Onboarding
  onboarding: {
    welcome: 'Welcome to Cowork',
    welcomeDescription: 'Your AI-powered workspace. Connect anything. Organize your sessions. Everything you need to collaborate effectively!',
    getStarted: 'Get Started',
    updateSettings: 'Update Settings',
    updateSettingsDesc: 'Update billing or change your setup.',
    continue: 'Continue',
    setupAuth: 'Set up authentication',
    setupAuthDescription: 'Connect your Claude account or configure an API key to start chatting.',
    settingUp: 'Setting up...',
    youreAllSet: 'You\'re all set!',
    savingConfig: 'Saving your configuration...',
    startChatting: 'Just start a chat and get to work.',
  },

  // Auth / Credentials
  auth: {
    connectClaudeAccount: 'Connect Claude Account',
    connectClaudeDesc: 'Use your Claude subscription to power multi-agent workflows.',
    waitingForAuth: 'Waiting for authentication to complete...',
    accountConnected: 'Your Claude account is connected.',
    connectionFailed: 'Connection failed',
    enterAuthCode: 'Enter Authorization Code',
    enterAuthCodeDesc: 'Copy the code from the browser page and paste it below.',
    authCodePlaceholder: 'Paste your authorization code here',
    authorizationCode: 'Authorization Code',
    useExistingToken: 'Use Existing Token',
    signInWithClaude: 'Sign in with Claude',
    signInDifferentAccount: 'Or sign in with a different account',
    enterApiKey: 'Enter API Key',
    getApiKeyFrom: 'Get your API key from',
    anthropicConsole: 'console.anthropic.com',
    anthropicApiKey: 'Anthropic API Key',
    connect: 'Connect',
    connecting: 'Connecting...',
    validating: 'Validating...',
    tryAgain: 'Try Again',
    somethingWentWrong: 'Something went wrong. Please try again.',
    foundExistingToken: 'Found existing token: {token}',
    clickToSignIn: 'Click below to sign in with your Claude Pro or Max subscription.',
    apiKey: 'API Key',
    apiBaseUrl: 'API Base URL',
    apiFormat: 'API Format',
    anthropicCompatible: 'Anthropic Compatible',
    openaiCompatible: 'OpenAI Compatible',
    enterApiEndpoint: 'Enter your API endpoint and key',
  },

  // Errors
  errors: {
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try again',
    connectionFailed: 'Connection failed',
    authenticationFailed: 'Authentication failed',
    permissionDenied: 'Permission denied',
    notFound: 'Not found',
    timeout: 'Request timed out',
  },

  // Error Boundary
  errorBoundary: {
    appError: 'Something went wrong',
    appErrorDescription: 'The application encountered an unexpected error. Please reload to continue.',
    sectionError: 'This section encountered an error',
    componentError: 'Failed to load',
    reload: 'Reload Application',
    retry: 'Try Again',
    dismiss: 'Dismiss',
    technicalDetails: 'Technical Details',
  },

  // Empty States
  emptyStates: {
    noConversationsYet: 'No conversations yet',
    noConversationsFound: 'No conversations found',
    noFlaggedConversations: 'No flagged conversations',
    selectConversation: 'Select a conversation to get started',
    noSourcesConfigured: 'No sources configured',
    noSkillsConfigured: 'No skills configured',
    noToolsAvailable: 'No tools available',
    noPermissionsConfigured: 'No permissions configured',
    noResultsFound: 'No results found',
    noResults: 'No results.',
    noStatusFound: 'No status found',
    sourceNotFound: 'Source not found',
    skillNotFound: 'Skill not found',
    startFreshWithEmptyWorkspace: 'Start fresh with an empty workspace.',
    noLabelsConfigured: 'No labels configured.',
    addNewLabel: 'Add New Label',
  },

  // Actions
  actions: {
    retry: 'Retry',
    refresh: 'Refresh',
    reload: 'Reload',
    copy: 'Copy',
    copied: 'Copied!',
    paste: 'Paste',
    share: 'Share',
    download: 'Download',
    upload: 'Upload',
    import: 'Import',
    export: 'Export',
  },

  // Permission Modes
  permissionModes: {
    safe: 'Explore',
    safeDescription: 'Read-only, no changes allowed',
    ask: 'Ask',
    askDescription: 'Prompts before making edits',
    allowAll: 'Auto',
    allowAllDescription: 'Full autonomous execution',
  },

  // Thinking Levels
  thinkingLevels: {
    off: 'Off',
    offDescription: 'No extended thinking',
    low: 'Low',
    lowDescription: 'Light reasoning',
    medium: 'Medium',
    mediumDescription: 'Balanced thinking',
    high: 'High',
    highDescription: 'Deep analysis',
  },

  // Input
  input: {
    placeholder: 'Ask Cowork anything...',
    attachFile: 'Attach file',
    attachFiles: 'Attach Files',
    attachImage: 'Attach image',
    mentionSource: 'Mention a source',
    useSkill: 'Use a skill',
    oneFile: '1 file',
    nFiles: '{n} files',
    chooseSources: 'Choose Sources',
    nSources: '{n} sources',
    model: 'Model',
    extendedReasoning: 'Extended reasoning depth',
    context: 'Context',
    contextUsed: '{percent}% context used',
    contextUsedWait: '{percent}% context used — wait for current operation',
    contextUsedClick: '{percent}% context used — click to compact',
    workInFolder: 'Work in Folder',
    chooseWorkingDir: 'Choose working directory',
    filterFolders: 'Filter folders...',
    noFoldersFound: 'No folders found',
    chooseFolder: 'Choose Folder...',
    reset: 'Reset',
  },

  // Turn Card
  turnCard: {
    copy: 'Copy',
    copied: 'Copied!',
    viewAsMarkdown: 'View as Markdown',
    typeFeedbackOr: 'Type your feedback in chat or',
  },

  // Todo State Menu
  todoStateMenu: {
    filterStatuses: 'Filter statuses...',
    noStatusFound: 'No status found',
  },

  // Default status labels (for built-in statuses)
  statusLabels: {
    backlog: 'Backlog',
    todo: 'Todo',
    'needs-review': 'Needs Review',
    done: 'Done',
    cancelled: 'Cancelled',
  },

  // Rename Dialog
  renameDialog: {
    renameConversation: 'Rename conversation',
    enterName: 'Enter a name...',
  },

  // Session badges
  sessionBadges: {
    new: 'New',
    plan: 'Plan',
  },

  // Toast messages
  toasts: {
    conversationDeleted: 'Conversation deleted',
    conversationFlagged: 'Conversation flagged',
    addedToFlagged: 'Added to your flagged items',
    flagRemoved: 'Flag removed',
    removedFromFlagged: 'Removed from flagged items',
    undo: 'Undo',
    deletedSource: 'Deleted source',
    deletedSkill: 'Deleted skill',
    failedToDeleteSource: 'Failed to delete source',
    failedToDeleteSkill: 'Failed to delete skill',
    patternCopied: 'Pattern copied to clipboard',
    failedToCopyPattern: 'Failed to copy pattern',
    createdWorkspace: 'Created workspace',
    terminalOverlayNotAvailable: 'Terminal overlay not available',
    failedToLoadTaskOutput: 'Failed to load task output',
    noDetailsProvided: 'No details provided',
    invalidLink: 'Invalid link',
    contentMovedOrDeleted: 'The content may have been moved or deleted.',
    installingUpdate: 'Installing update...',
    failedToInstallUpdate: 'Failed to install update',
    youreUpToDate: "You're up to date",
    runningLatestVersion: 'Running the latest version',
    failedToCheckForUpdates: 'Failed to check for updates',
  },

  // Keyboard shortcuts dialog
  keyboardShortcuts: {
    title: 'Keyboard Shortcuts',
    global: 'Global',
    navigation: 'Navigation',
    sessionList: 'Session List',
    agentTree: 'Agent Tree',
    chat: 'Chat',
    focusSidebar: 'Focus sidebar',
    focusSessionList: 'Focus session list',
    focusChatInput: 'Focus chat input',
    newChat: 'New chat',
    newWindow: 'New window',
    toggleSidebar: 'Toggle sidebar',
    openSettings: 'Open settings',
    showThisDialog: 'Show this dialog',
    moveToNextZone: 'Move to next zone',
    moveToPreviousZone: 'Move to previous zone',
    moveBetweenZones: 'Move between zones (in lists)',
    navigateItems: 'Navigate items in list',
    goToFirstItem: 'Go to first item',
    goToLastItem: 'Go to last item',
    closeDialogBlur: 'Close dialog / blur input',
    deleteSession: 'Delete session',
    renameSession: 'Rename session',
    openContextMenu: 'Open context menu',
    collapseFolder: 'Collapse folder',
    expandFolder: 'Expand folder',
    sendMessage: 'Send message',
    newLine: 'New line',
  },

  // Workspace creation
  workspace: {
    addWorkspace: 'Add Workspace',
    whereIdeasMeet: 'Where your ideas meet the tools to make them happen.',
    createNew: 'Create new',
    startFresh: 'Start fresh with an empty workspace.',
    openFolder: 'Open folder',
    chooseExistingAsWorkspace: 'Choose an existing folder as workspace.',
    createWorkspace: 'Create workspace',
    enterNameAndLocation: 'Enter a name and choose where to store your workspace.',
    workspaceName: 'Workspace name',
    workspaceNamePlaceholder: 'My Workspace',
    defaultLocation: 'Default location',
    underAgentOperatorFolder: 'under .agent-operator folder',
    chooseLocation: 'Choose a location',
    pickAPlace: 'Pick a place to put your new workspace.',
    browse: 'Browse',
    creating: 'Creating...',
    create: 'Create',
    chooseExistingFolder: 'Choose existing folder',
    chooseAnyFolder: 'Choose any folder to use as workspace.',
    noFolderSelected: 'No folder selected',
    opening: 'Opening...',
    open: 'Open',
    workspaceAlreadyExists: 'A workspace with this name already exists',
  },

  // Edit popover menu items
  editPopoverMenu: {
    permissionSettings: 'Permission Settings',
    defaultPermissions: 'Default Permissions',
    skillInstructions: 'Skill Instructions',
    skillMetadata: 'Skill Metadata',
    sourceDocumentation: 'Source Documentation',
    sourceConfiguration: 'Source Configuration',
    sourcePermissions: 'Source Permissions',
    toolPermissions: 'Tool Permissions',
    preferencesNotes: 'Preferences Notes',
    addSource: 'Add Source',
    addSkill: 'Add Skill',
    statusConfiguration: 'Status Configuration',
    addBlockedStatusExample: 'Add a "Blocked" status',
    confirmClearlyWhenDone: 'Confirm clearly when done.',
  },

  // Slash command menu
  slashCommandMenu: {
    ultrathink: 'Ultrathink',
    ultrathinkDescription: 'Extended reasoning for complex problems',
    modes: 'Modes',
    features: 'Features',
    recentFolders: 'Recent Folders',
  },

  // Mention menu
  mentionMenu: {
    results: 'Results',
    skills: 'Skills',
    sources: 'Sources',
  },

  // Source status indicators
  sourceStatus: {
    connected: 'Connected',
    connectedDescription: 'Source is connected and working',
    needsAuth: 'Needs Authentication',
    needsAuthDescription: 'Source requires authentication to connect',
    connectionFailed: 'Connection Failed',
    connectionFailedDescription: 'Failed to connect to source',
    notTested: 'Not Tested',
    notTestedDescription: 'Connection has not been tested',
    disabled: 'Disabled',
    disabledDescription: 'Local MCP servers are disabled in Settings',
  },

  // Reset dialog
  resetDialog: {
    title: 'Reset App',
    thisWillDelete: 'This will permanently delete:',
    allWorkspaces: 'All workspaces and their settings',
    allCredentials: 'All credentials and API keys',
    allPreferences: 'All preferences and session data',
    backUpFirst: 'Back up any important data first!',
    cannotBeUndone: 'This action cannot be undone.',
    toConfirmSolve: 'To confirm, solve:',
    enterAnswer: 'Enter answer',
  },

  // Reauth dialog
  reauthDialog: {
    sessionExpired: 'Session Expired',
    sessionExpiredDescription: 'Your session has expired or is no longer valid.',
    pleaseLogInAgain: 'Please log in again to continue using Cowork.',
    conversationsPreserved: 'Your conversations and settings are preserved.',
    loginFailed: 'Login failed',
    loggingIn: 'Logging in...',
    logInAgain: 'Log In Again',
    resetAndStartFresh: 'Reset app and start fresh...',
  },

  // Chat display
  chatDisplay: {
    messagePreview: 'Message Preview',
    responsePreview: 'Response Preview',
    turnDetails: 'Turn Details',
    openInNewWindow: 'Open in new window',
    error: 'Error',
    hideTechnicalDetails: 'Hide technical details',
    showTechnicalDetails: 'Show technical details',
  },

  // Task action menu
  taskActionMenu: {
    viewOutput: 'View Output',
    stopTask: 'Stop Task',
    clickForTaskActions: 'Click for task actions',
  },

  // Billing method options
  billingMethods: {
    chooseBillingMethod: 'Choose Billing Method',
    selectHowToPower: "Select how you'd like to power your AI agents.",
    moreOptions: 'More options',
    claudeProMax: 'Claude Pro / Max',
    anthropicApiKey: 'Anthropic API Key',
    awsBedrock: 'AWS Bedrock',
    openrouter: 'OpenRouter',
    vercel: 'Vercel AI Gateway',
    ollama: 'Ollama (Local)',
    minimax: 'MiniMax',
    glm: '智谱 GLM',
    deepseek: 'DeepSeek',
    customEndpoint: 'Custom Endpoint',
    recommended: 'Recommended',
  },

  // Status badge
  statusBadge: {
    allowed: 'Allowed',
    blocked: 'Blocked',
    ask: 'Ask',
  },

  // Updates
  updates: {
    updateReady: 'Update v{version} ready',
    restartToApply: 'Restart to apply the update.',
    restart: 'Restart',
    appWillRestart: 'The app will restart automatically.',
    downloadingUpdate: 'Downloading update...',
    updateAvailable: 'Update available',
    newVersionAvailable: 'A new version is available.',
  },

  // Permissions table
  permissionsTable: {
    access: 'Access',
    type: 'Type',
    pattern: 'Pattern',
    comment: 'Comment',
    viewFullscreen: 'View Fullscreen',
    searchPatterns: 'Search patterns...',
    noPermissionsConfigured: 'No permissions configured',
    rule: 'rule',
    rules: 'rules',
  },

  // Tools table
  toolsTable: {
    access: 'Access',
    tool: 'Tool',
    description: 'Description',
    noToolsAvailable: 'No tools available',
  },

  // Skill info page
  skillInfo: {
    metadata: 'Metadata',
    slug: 'Slug',
    name: 'Name',
    description: 'Description',
    location: 'Location',
    permissionModes: 'Permission Modes',
    permissionModesDescription: 'How "Always Allowed Tools" interacts with permission modes:',
    explore: 'Explore',
    askToEdit: 'Ask to Edit',
    auto: 'Auto',
    blockedDescription: 'Blocked — write tools blocked regardless',
    autoApprovedDescription: 'Auto-approved — no prompts for allowed tools',
    noEffectDescription: 'No effect — all tools already auto-approved',
    instructions: 'Instructions',
    noInstructions: '*No instructions provided.*',
    failedToLoad: 'Failed to load skill',
  },

  // Source info page
  sourceInfo: {
    metadata: 'Metadata',
    slug: 'Slug',
    name: 'Name',
    description: 'Description',
    location: 'Location',
    type: 'Type',
    url: 'URL',
    lastTested: 'Last Tested',
    toolsAvailable: 'Tools Available',
    documentation: 'Documentation',
    noDocumentation: '*No documentation provided.*',
    failedToLoad: 'Failed to load source',
    connection: 'Connection',
    permissions: 'Permissions',
    tools: 'Tools',
    sourceDisabled: 'Source Disabled',
    sourceDisabledDescription: 'Local MCP servers are disabled in Settings > Advanced. Enable them to use this source.',
    connectionDescStdio: 'Local command that spawns this MCP server.',
    connectionDescMcp: 'Server URL and connection status.',
    connectionDescApi: 'Base URL for API requests.',
    connectionDescLocal: 'Filesystem path for this source.',
    connectionDescDefault: 'Connection details.',
    permissionsDescMcp: 'Tool patterns allowed in Explore mode.',
    permissionsDescApi: 'API endpoints allowed in Explore mode.',
    permissionsDescDefault: 'Access rules for Explore mode.',
    toolsDescription: 'Operations exposed by this server.',
    documentationDescription: 'Context and guidelines for the agent.',
  },

  // Time formatting
  time: {
    never: 'Never',
    justNow: 'Just now',
    minuteAgo: '{n} minute ago',
    minutesAgo: '{n} minutes ago',
    hourAgo: '{n} hour ago',
    hoursAgo: '{n} hours ago',
    dayAgo: '{n} day ago',
    daysAgo: '{n} days ago',
  },

  // Auth Request Card
  authCard: {
    connected: 'Connected',
    cancelled: 'Cancelled',
    failed: 'Failed',
    authenticating: 'Authenticating...',
    completeInBrowser: 'Complete authentication in your browser',
    authentication: 'Authentication',
    signInWith: 'Sign in with {provider}',
    saving: 'Saving...',
    save: 'Save',
    cancel: 'Cancel',
    credentialsEncrypted: 'Credentials are encrypted at rest',
    signedInAs: 'Signed in as {email}',
    workspace: 'Workspace: {workspace}',
    bearerToken: 'Bearer Token',
    apiKey: 'API Key',
    username: 'Username',
    password: 'Password',
    enterField: 'Enter {field}',
    oauth: 'OAuth',
    googleSignIn: 'Google Sign-In',
    slackSignIn: 'Slack Sign-In',
    microsoftSignIn: 'Microsoft Sign-In',
  },

  // Processing indicators
  processing: {
    thinking: 'Thinking…',
    pondering: 'Pondering…',
    contemplating: 'Contemplating…',
    reasoning: 'Reasoning…',
    processing: 'Processing…',
    computing: 'Computing…',
    considering: 'Considering…',
    reflecting: 'Reflecting…',
    deliberating: 'Deliberating…',
    cogitating: 'Cogitating…',
    ruminating: 'Ruminating…',
    musing: 'Musing…',
    workingOnIt: 'Working on it…',
    onIt: 'On it…',
    crunching: 'Crunching…',
    brewing: 'Brewing…',
    connectingDots: 'Connecting dots…',
    mullingOver: 'Mulling it over…',
    deepInThought: 'Deep in thought…',
    hmm: 'Hmm…',
    letMeSee: 'Let me see…',
    oneMoment: 'One moment…',
    holdOn: 'Hold on…',
    bearWithMe: 'Bear with me…',
    justASec: 'Just a sec…',
    hangTight: 'Hang tight…',
    gettingThere: 'Getting there…',
    almost: 'Almost…',
    working: 'Working…',
    busyBusy: 'Busy busy…',
  },

  // Playground (development)
  playground: {
    hideVariants: 'Hide variants',
    showVariants: 'Show variants',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    default: 'Default',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    loading: 'Loading',
    withAction: 'With Action',
    withLongUrlAndAction: 'With Long URL and Action',
    successMessage: 'Your action completed successfully.',
    errorMessage: 'Something went wrong. Please try again.',
    warningMessage: 'This action may have consequences.',
    infoMessage: 'Here is some useful information.',
    loadingMessage: 'Please wait while we process.',
    sessionDeleted: 'Session deleted',
    sessionDeletedMessage: 'Your session has been removed.',
    undo: 'Undo',
    resourceAvailable: 'Resource available',
    open: 'Open',
    defaultToast: 'Default toast',
    defaultToastMessage: 'This is a basic notification.',
    dismissAll: 'Dismiss All',
    loadingToSuccess: 'Loading → Success',
    stack3Toasts: 'Stack 3 Toasts',
    typeSlashToTrigger: 'Type / to trigger',
    typeSlashToSeeCommands: 'Type / to see commands...',
    messageCowork: 'Message Cowork...',
    authorizationComplete: 'Authorization Complete',
    authorizationFailed: 'Authorization Failed',
    oauthCallbackPreview: 'OAuth Callback Preview',
    oauthCallbackDescription: 'Page shown in browser after OAuth authorization redirect',
    errorAccessDenied: 'Error - Access Denied',
    errorInvalidScope: 'Error - Invalid Scope',
    errorServerError: 'Error - Server Error',
    errorExpiredToken: 'Error - Expired Token',
    errorGeneric: 'Error - Generic',
    accessDeniedMessage: 'The user denied the authorization request.',
    invalidScopeMessage: 'The requested scope is invalid or unknown.',
    serverErrorMessage: 'The authorization server encountered an unexpected condition.',
    expiredTokenMessage: 'The authorization code has expired.',
  },

  // Accessibility
  aria: {
    close: 'Close',
    sessions: 'Sessions',
    changeTodoState: 'Change todo state',
  },

  // Misc
  misc: {
    untitled: 'Untitled',
    compact: 'Compact',
    conversationCompacted: 'Conversation Compacted',
    validatingKey: 'Validating...',
    updateKey: 'Update Key',
    search: 'Search...',
    enterName: 'Enter a name...',
    pasteAuthCode: 'Paste your authorization code here',
    directory: 'Directory',
    clickToExpand: 'Click to expand',
    clickToReveal: 'Click to reveal',
    doubleClickToOpen: 'double-click to open',
    customEndpoint: 'Custom Endpoint',
  },

  // Empty state hints (workflow suggestions)
  hints: [
    'Summarize your {source:Gmail} inbox, draft replies, and save notes to {source:Notion}',
    'Turn a {file:screenshot} into a working website in your {folder}',
    'Pull issues from {source:Linear}, research in {source:Slack}, ship the fix',
    'Transcribe a {file:voice memo} and turn it into {source:Notion} tasks',
    'Analyze a {file:spreadsheet} and post insights to {source:Slack}',
    'Review {source:GitHub} PRs, then summarize changes in {source:Notion}',
    'Parse an {file:invoice PDF} and log it to {source:Google Sheets}',
    'Research with {source:Exa}, write it up, save to your {source:Obsidian} vault',
    'Refactor code in your {folder}, then push to {source:GitHub}',
    'Sync {source:Calendar} events with {source:Linear} project deadlines',
    'Turn meeting {file:notes} into {source:Jira} tickets automatically',
    'Query your {source:database} and visualize results in a new {file:document}',
    'Fetch {source:Figma} designs and generate React components in your {folder}',
    'Combine {source:Slack} threads into a weekly digest for {source:Notion}',
    'Run a {skill} to analyze your codebase and fix issues in your {folder}',
  ],

  // Edit popover labels and examples
  editPopover: {
    describePlaceholder: "Describe what you'd like to change...",
    examplePrefix: ', e.g., ',
    permissionSettings: 'Permission Settings',
    defaultPermissions: 'Default Permissions',
    skillInstructions: 'Skill Instructions',
    skillMetadata: 'Skill Metadata',
    sourceDocumentation: 'Source Documentation',
    sourceConfiguration: 'Source Configuration',
    sourcePermissions: 'Source Permissions',
    toolPermissions: 'Tool Permissions',
    preferencesNotes: 'Preferences Notes',
    addSource: 'Add Source',
    addSkill: 'Add Skill',
    statusConfiguration: 'Status Configuration',
    examplePermissionAllow: "Allow running 'make build' in Explore mode",
    exampleDefaultPermission: 'Allow git fetch command',
    exampleSkillInstruction: 'Add error handling guidelines',
    exampleSkillMetadata: 'Update the skill description',
    exampleSourceDoc: 'Add rate limit documentation',
    exampleSourceConfig: 'Update the display name',
    exampleSourcePermission: 'Allow list operations in Explore mode',
    exampleToolPermission: 'Only allow read operations (list, get, search)',
    examplePreference: 'Add coding style preferences',
    exampleAddSource: 'Connect to my Craft space',
    placeholderAddSource: 'What would you like to connect?',
    exampleAddSkill: 'Review PRs following our code standards',
    placeholderAddSkill: 'What should I learn to do?',
    exampleStatus: 'Add a "Blocked" status',
  },

  // Labels settings page
  labelsSettings: {
    title: 'Labels',
    aboutLabels: 'About Labels',
    aboutDescription1: 'Labels help you organize sessions with colored tags. Use them to categorize conversations by project, topic, or priority — making it easy to filter and find related sessions later.',
    aboutDescription2: 'Each label can optionally carry a value with a specific type (text, number, or enum). This turns labels into structured metadata — for example, a "priority" label with values "high", "medium", "low", or a "project" label carrying the project name.',
    aboutDescription3: 'Label values are not yet fully implemented on the UI, coming soon.',
    aboutDescription4: 'Auto-apply rules assign labels automatically when a message matches a regex pattern. For example, pasting a Linear issue URL can auto-tag the session with the project name and issue ID — no manual tagging needed.',
    learnMore: 'Learn more',
    labelHierarchy: 'Label Hierarchy',
    labelHierarchyDescription: 'All labels configured for this workspace. Labels can be nested to form groups.',
    noLabelsConfigured: 'No labels configured.',
    noLabelsHint: 'Labels can be created by the agent or by editing labels/config.json in your workspace.',
    autoApplyRules: 'Auto-Apply Rules',
    autoApplyRulesDescription: 'Regex patterns that automatically apply labels when matched in user messages. For example, paste a Linear issue URL and automatically tag the session with the project name and issue ID.',
    value: 'value',
  },

  // Shortcuts page
  shortcuts: {
    title: 'Shortcuts',
    global: 'Global',
    navigation: 'Navigation',
    sessionList: 'Session List',
    agentTree: 'Agent Tree',
    chat: 'Chat',
    focusSidebar: 'Focus sidebar',
    focusSessionList: 'Focus session list',
    focusChatInput: 'Focus chat input',
    newChat: 'New chat',
    toggleSidebar: 'Toggle sidebar',
    openSettings: 'Open settings',
    showShortcuts: 'Show keyboard shortcuts',
    moveToNextZone: 'Move to next zone',
    moveToPrevZone: 'Move to previous zone',
    moveBetweenZones: 'Move between zones (in lists)',
    navigateItems: 'Navigate items in list',
    goToFirst: 'Go to first item',
    goToLast: 'Go to last item',
    closeDialog: 'Close dialog / blur input',
    focusChatInputEnter: 'Focus chat input',
    deleteSession: 'Delete session',
    renameSession: 'Rename session',
    openContextMenu: 'Open context menu',
    collapseFolder: 'Collapse folder',
    expandFolder: 'Expand folder',
    sendMessage: 'Send message',
    newLine: 'New line',
    stopAgent: 'Stop agent (when processing)',
  },

  // Session history panel
  history: {
    title: 'Activity',
    noSessionSelected: 'No session selected',
    tokenUsage: 'Token Usage',
    input: 'Input',
    output: 'Output',
    total: 'Total',
    estimatedCost: 'Est. Cost',
    contextUsed: 'Context Used',
    toolCalls: 'tool calls',
    noToolCalls: 'No tool calls yet',
    noToolCallsHint: 'Tool calls will appear here as the agent works',
  },

  // File viewer
  fileViewer: {
    failedToLoad: 'Failed to load file',
    noFileSelected: 'No file selected',
    clickToView: 'Click a file path in the chat to view it here',
    loadingContent: 'Loading content...',
    errorLoading: 'Error loading file',
    binaryFile: 'Cannot preview binary file',
    openWithDefault: 'Open with default app',
    openOptions: 'Open options',
    openWithDefaultApp: 'Open with Default App',
    showInFinder: 'Show in Finder',
    preview: 'Preview',
    code: 'Code',
  },

  // Info page
  infoPage: {
    errorLoading: 'Error loading content',
  },

  // Table of contents
  tableOfContents: {
    noHeadings: 'No headings',
  },

  // Interrupt overlay
  interrupt: {
    pressEscAgain: 'Press {key} again to interrupt',
  },

  // Permission request
  permissionRequest: {
    title: 'Permission Required',
    allow: 'Allow',
    alwaysAllow: 'Always Allow',
    deny: 'Deny',
    alwaysAllowHint: '"Always Allow" remembers this command for the session',
  },

  // Credential request
  credentialRequest: {
    title: 'Authentication Required',
    bearerToken: 'Bearer Token',
    apiKey: 'API Key',
    username: 'Username',
    password: 'Password',
    save: 'Save',
    cancel: 'Cancel',
    enterPlaceholder: 'Enter {field}',
    encryptedHint: 'Credentials are encrypted at rest',
  },
} as const;

// Helper type to convert literal string types to string
type DeepStringify<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: DeepStringify<T[K]> }
    : T;

export type TranslationKeys = DeepStringify<typeof en>;
