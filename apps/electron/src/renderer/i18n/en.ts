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
    providerGLM: 'GLM (智谱)',
    providerMiniMax: 'MiniMax',
    providerDeepSeek: 'DeepSeek',
    providerCustom: 'Custom Endpoint',
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

  // Shortcuts
  shortcuts: {
    title: 'Shortcuts',
    global: 'Global',
    navigation: 'Navigation',
    sessionList: 'Session List',
    chat: 'Chat',

    // Global shortcuts
    focusSidebar: 'Focus sidebar',
    focusSessionList: 'Focus session list',
    focusChatInput: 'Focus chat input',
    newChat: 'New chat',
    toggleSidebar: 'Toggle sidebar',
    openSettings: 'Open settings',

    // Navigation shortcuts
    moveToNextZone: 'Move to next zone',
    cyclePermissionMode: 'Cycle permission mode',
    moveBetweenZones: 'Move between zones (in lists)',
    navigateItems: 'Navigate items in list',
    goToFirstItem: 'Go to first item',
    goToLastItem: 'Go to last item',
    closeDialog: 'Close dialog / blur input',

    // Session List shortcuts
    focusInput: 'Focus chat input',
    deleteSession: 'Delete session',

    // Chat shortcuts
    sendMessage: 'Send message',
    newLine: 'New line',
  },

  // Preferences
  preferences: {
    title: 'Preferences',

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
    filesEmptyState: 'Files attached or created by this chat will appear here.',
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

  // Edit Popover
  editPopover: {
    connectExample: 'Connect to my Craft space',
    connectPlaceholder: 'What would you like to connect?',
    skillExample: 'Review PRs following our code standards',
    skillPlaceholder: 'What should I learn to do?',
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
  },

  // Task action menu
  taskActionMenu: {
    viewOutput: 'View Output',
    stopTask: 'Stop Task',
    clickForTaskActions: 'Click for task actions',
  },

  // Billing method options
  billingMethods: {
    claudeProMax: 'Claude Pro / Max',
    anthropicApiKey: 'Anthropic API Key',
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
} as const;

export type TranslationKeys = typeof en;
