/**
 * Chinese translations (简体中文)
 */
import type { TranslationKeys } from './en';

export const zh: TranslationKeys = {
  // Common
  common: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    delete: '删除',
    edit: '编辑',
    loading: '加载中...',
    error: '错误',
    success: '成功',
    close: '关闭',
    back: '返回',
    next: '下一步',
    done: '完成',
    search: '搜索',
    clear: '清除',
    change: '更改',
    uploading: '上传中...',
    notSet: '未设置',
    none: '无',
    enabled: '已启用',
    disabled: '已禁用',
    allowed: '允许',
    blocked: '阻止',
    default: '默认',
    custom: '自定义',
    openInNewWindow: '在新窗口中打开',
    editFile: '编辑文件',
    tryAgain: '重试',
    validating: '验证中...',
    connecting: '连接中...',
    connected: '已连接！',
    failed: '失败',
    add: '添加',
    remove: '移除',
    update: '更新',
    configure: '配置',
  },

  // Settings
  settings: {
    title: '设置',
    app: '应用',
    workspace: '工作区',
    api: 'API',
    permissions: '权限',
    shortcuts: '快捷键',
    preferences: '偏好设置',
    appDescription: '外观、通知、计费',
    workspaceDescription: '模型、模式切换、高级设置',
    apiDescription: '服务商、端点、API 密钥',
    permissionsDescription: '探索模式中允许的命令',
    shortcutsDescription: '键盘快捷键参考',
    preferencesDescription: '您的个人偏好设置',
  },

  // App Settings
  appSettings: {
    title: '应用设置',

    // Appearance
    appearance: '外观',
    mode: '模式',
    modeSystem: '跟随系统',
    modeLight: '浅色',
    modeDark: '深色',
    colorTheme: '颜色主题',
    colorThemeDefault: '默认',
    font: '字体',

    // Language
    language: '语言',
    languageDescription: '选择应用的显示语言',
    languageEnglish: 'English',
    languageChinese: '中文',

    // Notifications
    notifications: '通知',
    desktopNotifications: '桌面通知',
    desktopNotificationsDesc: '当 AI 完成聊天任务时收到通知。',

    // Billing
    billing: '计费',
    billingDescription: '选择 AI 使用的付费方式',
    paymentMethod: '付费方式',
    apiKeyConfigured: 'API 密钥已配置',
    claudeConnected: '已连接 Claude',
    selectMethod: '选择方式',
    claudeProMax: 'Claude Pro/Max',
    claudeProMaxDesc: '使用您的 Pro 或 Max 订阅',
    apiKey: 'API 密钥',
    apiKeyDesc: '使用 Anthropic API 密钥按量付费',
    configureApiKey: '配置您的 Anthropic API 密钥',
    configureClaudeMax: '连接您的 Claude 订阅',
    payAsYouGo: '使用您自己的 API 密钥按量付费。',
    getApiKeyFrom: '从 Anthropic 获取',
    unlimitedAccess: '使用您的 Claude Pro 或 Max 订阅获得无限访问。',
    updateKey: '更新密钥',

    // About
    about: '关于',
    version: '版本',
    checkForUpdates: '检查更新',
    checkNow: '立即检查',
    checking: '检查中...',
    updateTo: '更新到',
    restartToUpdate: '重启以更新',
    installUpdate: '安装更新',
  },

  // API Settings
  apiSettings: {
    title: 'API 配置',
    provider: '服务商',
    providerDescription: '选择 AI 服务提供商',
    baseUrl: '接口地址',
    baseUrlDescription: 'API 端点 URL',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    apiFormat: 'API 格式',
    apiFormatDescription: 'API 协议格式',
    apiFormatAnthropic: 'Anthropic 兼容',
    apiFormatAnthropicDesc: 'Anthropic Messages API 格式',
    apiFormatOpenAI: 'OpenAI 兼容',
    apiFormatOpenAIDesc: 'OpenAI Chat Completions 格式',
    apiKeyLabel: 'API 密钥',
    apiKeyDescription: '用于身份验证的 API 密钥',
    apiKeyPlaceholder: 'sk-ant-...',
    saveChanges: '保存更改',
    saving: '保存中...',
    saved: '已保存！',

    // Providers
    providerAnthropic: 'Anthropic（默认）',
    providerBedrock: 'AWS Bedrock',
    providerBedrockDesc: '通过环境变量配置',
    providerGLM: '智谱 GLM',
    providerMiniMax: 'MiniMax',
    providerDeepSeek: 'DeepSeek',
    providerCustom: '自定义端点',

    // Bedrock info
    bedrockConfiguration: '配置',
    bedrockConfigDescription: 'AWS Bedrock 通过环境变量配置。编辑 ~/.zshrc 或 ~/.bashrc 以修改设置。',
  },

  // Workspace Settings
  workspaceSettings: {
    title: '工作区设置',
    noWorkspaceSelected: '未选择工作区',

    // Workspace Info
    workspaceInfo: '工作区信息',
    name: '名称',
    untitled: '未命名',
    icon: '图标',

    // Model
    model: '模型',
    defaultModel: '默认模型',
    defaultModelDescription: '新聊天使用的 AI 模型',
    thinkingLevel: '思考深度',
    thinkingLevelDescription: '新聊天的推理深度',

    // Permissions
    permissions: '权限',
    defaultMode: '默认模式',
    defaultModeDescription: '控制 AI 可以执行的操作',
    modeExplore: '探索',
    modeExploreDescription: '只读模式，不允许修改',
    modeAsk: '询问',
    modeAskDescription: '编辑前会先询问',
    modeAuto: '自动',
    modeAutoDescription: '完全自主执行',

    // Mode Cycling
    modeCycling: '模式切换',
    modeCyclingDescription: '选择使用 Shift+Tab 循环切换的模式',
    atLeast2ModesRequired: '至少需要 2 种模式',

    // Advanced
    advanced: '高级',
    workingDirectory: '默认工作目录',
    workingDirectoryNotSet: '未设置（使用会话文件夹）',
    localMcpServers: '本地 MCP 服务器',
    localMcpServersDescription: '启用 stdio 子进程服务器',
  },

  // Shortcuts
  shortcuts: {
    title: '快捷键',
    global: '全局',
    navigation: '导航',
    sessionList: '会话列表',
    chat: '聊天',

    // Global shortcuts
    focusSidebar: '聚焦侧边栏',
    focusSessionList: '聚焦会话列表',
    focusChatInput: '聚焦聊天输入框',
    newChat: '新建聊天',
    toggleSidebar: '切换侧边栏',
    openSettings: '打开设置',

    // Navigation shortcuts
    moveToNextZone: '移动到下一个区域',
    cyclePermissionMode: '循环切换权限模式',
    moveBetweenZones: '在区域之间移动（在列表中）',
    navigateItems: '在列表中导航项目',
    goToFirstItem: '跳转到第一项',
    goToLastItem: '跳转到最后一项',
    closeDialog: '关闭对话框 / 取消输入焦点',

    // Session List shortcuts
    focusInput: '聚焦聊天输入框',
    deleteSession: '删除会话',

    // Chat shortcuts
    sendMessage: '发送消息',
    newLine: '换行',
  },

  // Preferences
  preferences: {
    title: '偏好设置',
    revert: '还原',

    // Basic Info
    basicInfo: '基本信息',
    basicInfoDescription: '帮助 Cowork 为您提供个性化回复。',
    yourName: '姓名',
    yourNameDescription: 'Cowork 应该如何称呼您。',
    yourNamePlaceholder: '您的姓名',
    timezone: '时区',
    timezoneDescription: '用于解析"明天"或"下周"等相对日期。',
    timezonePlaceholder: '例如：Asia/Shanghai',
    timezoneAuto: '自动（跟随系统）',
    preferredLanguage: '语言',
    preferredLanguageDescription: 'Cowork 回复时使用的首选语言。',
    preferredLanguagePlaceholder: '例如：中文',

    // Location
    location: '位置',
    locationDescription: '启用基于位置的回复，如天气、本地时间和地区信息。',
    city: '城市',
    cityDescription: '您所在的城市，用于本地信息和上下文。',
    cityPlaceholder: '例如：北京',
    country: '国家',
    countryDescription: '您所在的国家，用于地区格式和上下文。',
    countryPlaceholder: '例如：中国',

    // Notes
    notes: '备注',
    notesDescription: '帮助 Cowork 了解您偏好的自由文本内容。',
    notesPlaceholder: '您希望 Cowork 了解的任何其他信息...',
  },

  // Permissions Settings
  permissionsSettings: {
    title: '权限',
    defaultPermissions: '默认权限',
    defaultPermissionsDescription: '探索模式中允许的应用级模式。不在此列表中的命令将被阻止。',
    workspaceCustomizations: '工作区自定义',
    workspaceCustomizationsDescription: '扩展上述应用默认设置的工作区级模式。',
    noDefaultPermissions: '未找到默认权限。',
    defaultPermissionsPath: '默认权限应位于',
    noCustomPermissions: '未配置自定义权限。',
    customPermissionsHint: '在您的工作区中创建 permissions.json 文件以添加自定义规则。',

    // Permission types
    bash: 'Bash',
    mcp: 'MCP',
    api: 'API',
    tool: '工具',
  },

  // Chat
  chat: {
    title: '聊天',
    newChat: '新建聊天',
    sendMessage: '发送消息',
    thinking: '思考中...',
    stopGenerating: '停止生成',
    sessionNoLongerExists: '此会话已不存在',
    renameChat: '重命名聊天',
    enterChatName: '输入聊天名称...',
  },

  // Session List
  sessionList: {
    title: '聊天',
    allChats: '所有聊天',
    flagged: '已标记',
    noSessions: '暂无聊天',
    startNewChat: '开始新的聊天',
    today: '今天',
    yesterday: '昨天',
    thisWeek: '本周',
    lastWeek: '上周',
    thisMonth: '本月',
    older: '更早',
    filterChats: '筛选聊天',
    searchConversations: '搜索对话...',
    clearSearch: '清除搜索',
    closeSearch: '关闭搜索',
  },

  // Chat Info (Right Sidebar)
  chatInfo: {
    title: '聊天信息',
    noSessionSelected: '未选择会话',
    loadingSession: '加载会话中...',
    name: '名称',
    untitled: '未命名',
    notes: '备注',
    addNotes: '添加备注...',
    loading: '加载中...',
    files: '文件',
    filesEmptyState: '此聊天中附加或创建的文件将显示在这里。',
  },

  // Session Menu
  sessionMenu: {
    rename: '重命名',
    regenerateTitle: '重新生成标题',
    flag: '标记',
    unflag: '取消标记',
    markAsUnread: '标记为未读',
    status: '状态',
    share: '分享',
    shared: '已分享',
    openInBrowser: '在浏览器中打开',
    copyLink: '复制链接',
    copyShareLink: '复制分享链接',
    updateShare: '更新分享',
    stopSharing: '停止分享',
    openInNewWindow: '在新窗口中打开',
    viewInFinder: '在访达中查看',
    copyPath: '复制路径',
    delete: '删除',
    deleteConfirm: '确定要删除此聊天吗？',
    linkCopied: '链接已复制到剪贴板',
    shareUpdated: '分享已更新',
    sharingStopped: '已停止分享',
    pathCopied: '路径已复制到剪贴板',
    titleRefreshed: '标题已刷新',
    failedToShare: '分享失败',
    failedToUpdateShare: '更新分享失败',
    failedToStopSharing: '停止分享失败',
    failedToRefreshTitle: '刷新标题失败',
  },

  // Sidebar Menu
  sidebarMenu: {
    configureStatuses: '配置状态',
  },

  // Edit Popover
  editPopover: {
    connectExample: '连接到我的 Craft 空间',
    connectPlaceholder: '您想连接什么？',
    skillExample: '按照我们的代码规范审查 PR',
    skillPlaceholder: '您希望我学会做什么？',
  },

  // Sources
  sources: {
    title: '数据源',
    noSources: '未配置数据源。',
    addFirstSource: '添加您的第一个数据源',
    connectSource: '连接数据源',
    addSource: '添加数据源',
    searchSources: '搜索数据源...',
    noSourcesConfigured: '未配置数据源。',
    addSourcesInSettings: '在设置中添加数据源。',
    enabled: '已启用',
    disabled: '已禁用',
    configure: '配置',
    disconnect: '断开连接',
    // Source types
    typeMcp: 'MCP',
    typeApi: 'API',
    typeLocal: '本地',
    // Source status
    statusNeedsAuth: '需要授权',
    statusFailed: '失败',
    statusNotTested: '未测试',
    statusDisabled: '已禁用',
  },

  // Skills
  skills: {
    title: '技能',
    noSkills: '未配置技能。',
    addFirstSkill: '添加您的第一个技能',
    createSkill: '创建技能',
    addSkill: '添加技能',
    enabled: '已启用',
    disabled: '已禁用',
  },

  // Sidebar
  sidebar: {
    chats: '聊天',
    sources: '数据源',
    skills: '技能',
    settings: '设置',
    newWorkspace: '新建工作区',
    addWorkspace: '添加工作区...',
    workspaces: '工作区',
    selectWorkspace: '选择工作区',
    openSidebar: '打开侧边栏',
    closeSidebar: '关闭侧边栏',
  },

  // App Menu
  appMenu: {
    newChat: '新建聊天',
    settings: '设置...',
    keyboardShortcuts: '键盘快捷键',
    storedUserPreferences: '已存储的用户偏好',
    resetApp: '重置应用...',
    goBack: '返回',
    goForward: '前进',
    hideSidebar: '隐藏侧边栏',
    showSidebar: '显示侧边栏',
  },

  // Onboarding
  onboarding: {
    welcome: '欢迎使用 Cowork',
    welcomeDescription: '您的 AI 协作工作区。连接一切，组织会话，高效协作所需的一切！',
    getStarted: '开始使用',
    updateSettings: '更新设置',
    updateSettingsDesc: '更新计费或更改您的设置。',
    continue: '继续',
    setupAuth: '设置身份验证',
    setupAuthDescription: '连接您的 Claude 账户或配置 API 密钥以开始聊天。',
    settingUp: '设置中...',
    youreAllSet: '一切就绪！',
    savingConfig: '正在保存您的配置...',
    startChatting: '开始聊天，开始工作。',
  },

  // Auth / Credentials
  auth: {
    connectClaudeAccount: '连接 Claude 账户',
    connectClaudeDesc: '使用您的 Claude 订阅来支持多智能体工作流。',
    waitingForAuth: '等待身份验证完成...',
    accountConnected: '您的 Claude 账户已连接。',
    connectionFailed: '连接失败',
    enterAuthCode: '输入授权码',
    enterAuthCodeDesc: '从浏览器页面复制授权码并粘贴到下方。',
    authCodePlaceholder: '在此粘贴您的授权码',
    authorizationCode: '授权码',
    useExistingToken: '使用现有令牌',
    signInWithClaude: '使用 Claude 登录',
    signInDifferentAccount: '或使用其他账户登录',
    enterApiKey: '输入 API 密钥',
    getApiKeyFrom: '从以下地址获取您的 API 密钥',
    anthropicConsole: 'console.anthropic.com',
    anthropicApiKey: 'Anthropic API 密钥',
    connect: '连接',
    connecting: '连接中...',
    validating: '验证中...',
    tryAgain: '重试',
    somethingWentWrong: '出了点问题，请重试。',
    foundExistingToken: '发现现有令牌：{token}',
    clickToSignIn: '点击下方使用您的 Claude Pro 或 Max 订阅登录。',
    apiKey: 'API 密钥',
    apiBaseUrl: 'API 基础 URL',
    apiFormat: 'API 格式',
    anthropicCompatible: 'Anthropic 兼容',
    openaiCompatible: 'OpenAI 兼容',
    enterApiEndpoint: '输入您的 API 端点和密钥',
  },

  // Errors
  errors: {
    somethingWentWrong: '出了点问题',
    tryAgain: '重试',
    connectionFailed: '连接失败',
    authenticationFailed: '身份验证失败',
    permissionDenied: '权限被拒绝',
    notFound: '未找到',
    timeout: '请求超时',
  },

  // Empty States
  emptyStates: {
    noConversationsYet: '暂无对话',
    noConversationsFound: '未找到对话',
    noFlaggedConversations: '暂无标记的对话',
    selectConversation: '选择一个对话开始',
    noSourcesConfigured: '未配置数据源',
    noSkillsConfigured: '未配置技能',
    noToolsAvailable: '没有可用的工具',
    noPermissionsConfigured: '未配置权限',
    noResultsFound: '未找到结果',
    noResults: '无结果',
    noStatusFound: '未找到状态',
    sourceNotFound: '未找到数据源',
    skillNotFound: '未找到技能',
    startFreshWithEmptyWorkspace: '从空白工作区开始。',
  },

  // Actions
  actions: {
    retry: '重试',
    refresh: '刷新',
    reload: '重新加载',
    copy: '复制',
    copied: '已复制！',
    paste: '粘贴',
    share: '分享',
    download: '下载',
    upload: '上传',
    import: '导入',
    export: '导出',
  },

  // Permission Modes
  permissionModes: {
    safe: '探索',
    safeDescription: '只读模式，不允许修改',
    ask: '询问',
    askDescription: '编辑前会先询问',
    allowAll: '自动',
    allowAllDescription: '完全自主执行',
  },

  // Thinking Levels
  thinkingLevels: {
    off: '关闭',
    offDescription: '不进行扩展思考',
    low: '低',
    lowDescription: '轻度推理',
    medium: '中',
    mediumDescription: '平衡思考',
    high: '高',
    highDescription: '深度分析',
  },

  // Input
  input: {
    placeholder: '向 Cowork 提问...',
    attachFile: '附加文件',
    attachFiles: '附加文件',
    attachImage: '附加图片',
    mentionSource: '提及数据源',
    useSkill: '使用技能',
    oneFile: '1 个文件',
    nFiles: '{n} 个文件',
    chooseSources: '选择数据源',
    nSources: '{n} 个数据源',
    model: '模型',
    extendedReasoning: '扩展推理深度',
    context: '上下文',
    contextUsed: '已使用 {percent}% 上下文',
    contextUsedWait: '已使用 {percent}% 上下文 — 等待当前操作',
    contextUsedClick: '已使用 {percent}% 上下文 — 点击压缩',
    workInFolder: '工作目录',
    chooseWorkingDir: '选择工作目录',
    filterFolders: '筛选文件夹...',
    noFoldersFound: '未找到文件夹',
    chooseFolder: '选择文件夹...',
    reset: '重置',
  },

  // Turn Card
  turnCard: {
    copy: '复制',
    copied: '已复制！',
    viewAsMarkdown: '查看 Markdown',
    typeFeedbackOr: '在聊天中输入反馈或',
  },

  // Todo State Menu
  todoStateMenu: {
    filterStatuses: '筛选状态...',
    noStatusFound: '未找到状态',
  },

  // Default status labels (for built-in statuses)
  statusLabels: {
    backlog: '待办',
    todo: '进行中',
    'needs-review': '待审核',
    done: '已完成',
    cancelled: '已取消',
  },

  // Rename Dialog
  renameDialog: {
    renameConversation: '重命名对话',
    enterName: '输入名称...',
  },

  // Session badges
  sessionBadges: {
    new: '新',
    plan: '计划',
  },

  // Toast messages
  toasts: {
    conversationDeleted: '对话已删除',
    conversationFlagged: '对话已标记',
    addedToFlagged: '已添加到标记项目',
    flagRemoved: '已取消标记',
    removedFromFlagged: '已从标记项目中移除',
    undo: '撤销',
    deletedSource: '已删除数据源',
    deletedSkill: '已删除技能',
    failedToDeleteSource: '删除数据源失败',
    failedToDeleteSkill: '删除技能失败',
    patternCopied: '模式已复制到剪贴板',
    failedToCopyPattern: '复制模式失败',
    createdWorkspace: '已创建工作区',
    terminalOverlayNotAvailable: '终端覆盖层不可用',
    failedToLoadTaskOutput: '加载任务输出失败',
    noDetailsProvided: '未提供详细信息',
    invalidLink: '无效链接',
    contentMovedOrDeleted: '内容可能已被移动或删除。',
    installingUpdate: '正在安装更新...',
    failedToInstallUpdate: '安装更新失败',
    youreUpToDate: '已是最新版本',
    runningLatestVersion: '正在运行最新版本',
    failedToCheckForUpdates: '检查更新失败',
  },

  // Keyboard shortcuts dialog
  keyboardShortcuts: {
    title: '键盘快捷键',
    global: '全局',
    navigation: '导航',
    sessionList: '会话列表',
    agentTree: '智能体树',
    chat: '聊天',
    focusSidebar: '聚焦侧边栏',
    focusSessionList: '聚焦会话列表',
    focusChatInput: '聚焦聊天输入框',
    newChat: '新建聊天',
    newWindow: '新窗口',
    toggleSidebar: '切换侧边栏',
    openSettings: '打开设置',
    showThisDialog: '显示此对话框',
    moveToNextZone: '移动到下一个区域',
    moveToPreviousZone: '移动到上一个区域',
    moveBetweenZones: '在区域之间移动（在列表中）',
    navigateItems: '在列表中导航项目',
    goToFirstItem: '跳转到第一项',
    goToLastItem: '跳转到最后一项',
    closeDialogBlur: '关闭对话框 / 取消输入焦点',
    deleteSession: '删除会话',
    renameSession: '重命名会话',
    openContextMenu: '打开上下文菜单',
    collapseFolder: '折叠文件夹',
    expandFolder: '展开文件夹',
    sendMessage: '发送消息',
    newLine: '换行',
  },

  // Workspace creation
  workspace: {
    addWorkspace: '添加工作区',
    whereIdeasMeet: '让您的创意遇见实现它们的工具。',
    createNew: '新建',
    startFresh: '从空白工作区开始。',
    openFolder: '打开文件夹',
    chooseExistingAsWorkspace: '选择现有文件夹作为工作区。',
    createWorkspace: '创建工作区',
    enterNameAndLocation: '输入名称并选择工作区存储位置。',
    workspaceName: '工作区名称',
    workspaceNamePlaceholder: '我的工作区',
    defaultLocation: '默认位置',
    underAgentOperatorFolder: '在 .agent-operator 文件夹下',
    chooseLocation: '选择位置',
    pickAPlace: '选择一个位置来存放您的新工作区。',
    browse: '浏览',
    creating: '创建中...',
    create: '创建',
    chooseExistingFolder: '选择现有文件夹',
    chooseAnyFolder: '选择任意文件夹作为工作区。',
    noFolderSelected: '未选择文件夹',
    opening: '打开中...',
    open: '打开',
    workspaceAlreadyExists: '同名工作区已存在',
  },

  // Edit popover menu items
  editPopoverMenu: {
    permissionSettings: '权限设置',
    defaultPermissions: '默认权限',
    skillInstructions: '技能说明',
    skillMetadata: '技能元数据',
    sourceDocumentation: '数据源文档',
    sourceConfiguration: '数据源配置',
    sourcePermissions: '数据源权限',
    toolPermissions: '工具权限',
    preferencesNotes: '偏好备注',
    addSource: '添加数据源',
    addSkill: '添加技能',
    statusConfiguration: '状态配置',
    addBlockedStatusExample: '添加"已阻止"状态',
    confirmClearlyWhenDone: '完成后请明确确认。',
  },

  // Slash command menu
  slashCommandMenu: {
    ultrathink: '深度思考',
    ultrathinkDescription: '针对复杂问题的扩展推理',
    modes: '模式',
    features: '功能',
    recentFolders: '最近文件夹',
  },

  // Mention menu
  mentionMenu: {
    results: '结果',
    skills: '技能',
    sources: '数据源',
  },

  // Source status indicators
  sourceStatus: {
    connected: '已连接',
    connectedDescription: '数据源已连接并正常工作',
    needsAuth: '需要身份验证',
    needsAuthDescription: '数据源需要身份验证才能连接',
    connectionFailed: '连接失败',
    connectionFailedDescription: '无法连接到数据源',
    notTested: '未测试',
    notTestedDescription: '连接尚未测试',
    disabled: '已禁用',
    disabledDescription: '本地 MCP 服务器在设置中已禁用',
  },

  // Reset dialog
  resetDialog: {
    title: '重置应用',
    thisWillDelete: '这将永久删除：',
    allWorkspaces: '所有工作区及其设置',
    allCredentials: '所有凭据和 API 密钥',
    allPreferences: '所有偏好设置和会话数据',
    backUpFirst: '请先备份重要数据！',
    cannotBeUndone: '此操作无法撤销。',
    toConfirmSolve: '请计算以确认：',
    enterAnswer: '输入答案',
  },

  // Reauth dialog
  reauthDialog: {
    sessionExpired: '会话已过期',
    sessionExpiredDescription: '您的会话已过期或不再有效。',
    pleaseLogInAgain: '请重新登录以继续使用 Cowork。',
    conversationsPreserved: '您的对话和设置已保留。',
    loginFailed: '登录失败',
    loggingIn: '登录中...',
    logInAgain: '重新登录',
    resetAndStartFresh: '重置应用并重新开始...',
  },

  // Chat display
  chatDisplay: {
    messagePreview: '消息预览',
    responsePreview: '回复预览',
    turnDetails: '轮次详情',
    openInNewWindow: '在新窗口中打开',
  },

  // Task action menu
  taskActionMenu: {
    viewOutput: '查看输出',
    stopTask: '停止任务',
    clickForTaskActions: '点击查看任务操作',
  },

  // Billing method options
  billingMethods: {
    chooseBillingMethod: '选择计费方式',
    selectHowToPower: '选择如何为您的 AI 智能体提供动力。',
    moreOptions: '更多选项',
    claudeProMax: 'Claude Pro / Max',
    anthropicApiKey: 'Anthropic API 密钥',
    awsBedrock: 'AWS Bedrock',
    minimax: 'MiniMax',
    glm: '智谱 GLM',
    deepseek: 'DeepSeek',
    customEndpoint: '自定义端点',
    recommended: '推荐',
  },

  // Status badge
  statusBadge: {
    allowed: '允许',
    blocked: '阻止',
    ask: '询问',
  },

  // Updates
  updates: {
    updateReady: '更新 v{version} 已就绪',
    restartToApply: '重启以应用更新。',
    restart: '重启',
    appWillRestart: '应用将自动重启。',
    downloadingUpdate: '正在下载更新...',
    updateAvailable: '有可用更新',
    newVersionAvailable: '有新版本可用。',
  },

  // Permissions table
  permissionsTable: {
    access: '访问',
    type: '类型',
    pattern: '模式',
    comment: '备注',
    viewFullscreen: '全屏查看',
    searchPatterns: '搜索模式...',
    noPermissionsConfigured: '未配置权限',
    rule: '条规则',
    rules: '条规则',
  },

  // Tools table
  toolsTable: {
    access: '访问',
    tool: '工具',
    description: '描述',
    noToolsAvailable: '没有可用的工具',
  },

  // Skill info page
  skillInfo: {
    metadata: '元数据',
    slug: '标识符',
    name: '名称',
    description: '描述',
    location: '位置',
    permissionModes: '权限模式',
    permissionModesDescription: '"始终允许的工具"与权限模式的交互方式：',
    explore: '探索',
    askToEdit: '询问编辑',
    auto: '自动',
    blockedDescription: '已阻止 — 写入工具始终被阻止',
    autoApprovedDescription: '自动批准 — 允许的工具无需询问',
    noEffectDescription: '无影响 — 所有工具已自动批准',
    instructions: '说明',
    noInstructions: '*未提供说明。*',
    failedToLoad: '加载技能失败',
  },

  // Source info page
  sourceInfo: {
    metadata: '元数据',
    slug: '标识符',
    name: '名称',
    description: '描述',
    location: '位置',
    type: '类型',
    url: 'URL',
    lastTested: '上次测试',
    toolsAvailable: '可用工具',
    documentation: '文档',
    noDocumentation: '*未提供文档。*',
    failedToLoad: '加载数据源失败',
    connection: '连接',
    permissions: '权限',
    tools: '工具',
    sourceDisabled: '数据源已禁用',
    sourceDisabledDescription: '本地 MCP 服务器已在设置 > 高级中禁用。启用后才能使用此数据源。',
    connectionDescStdio: '启动此 MCP 服务器的本地命令。',
    connectionDescMcp: '服务器 URL 和连接状态。',
    connectionDescApi: 'API 请求的基础 URL。',
    connectionDescLocal: '此数据源的文件系统路径。',
    connectionDescDefault: '连接详情。',
    permissionsDescMcp: '探索模式中允许的工具模式。',
    permissionsDescApi: '探索模式中允许的 API 端点。',
    permissionsDescDefault: '探索模式的访问规则。',
    toolsDescription: '此服务器提供的操作。',
    documentationDescription: '智能体的上下文和指南。',
  },

  // Time formatting
  time: {
    never: '从未',
    justNow: '刚刚',
    minuteAgo: '{n} 分钟前',
    minutesAgo: '{n} 分钟前',
    hourAgo: '{n} 小时前',
    hoursAgo: '{n} 小时前',
    dayAgo: '{n} 天前',
    daysAgo: '{n} 天前',
  },

  // Auth Request Card
  authCard: {
    connected: '已连接',
    cancelled: '已取消',
    failed: '失败',
    authenticating: '正在验证...',
    completeInBrowser: '请在浏览器中完成身份验证',
    authentication: '身份验证',
    signInWith: '使用 {provider} 登录',
    saving: '保存中...',
    save: '保存',
    cancel: '取消',
    credentialsEncrypted: '凭据已加密存储',
    signedInAs: '已登录为 {email}',
    workspace: '工作区：{workspace}',
    bearerToken: 'Bearer 令牌',
    apiKey: 'API 密钥',
    username: '用户名',
    password: '密码',
    enterField: '输入{field}',
    oauth: 'OAuth',
    googleSignIn: 'Google 登录',
    slackSignIn: 'Slack 登录',
    microsoftSignIn: 'Microsoft 登录',
  },

  // Chat Display
  chatDisplay: {
    messagePreview: '消息预览',
    responsePreview: '回复预览',
    turnDetails: '轮次详情',
    openInNewWindow: '在新窗口中打开',
    error: '错误',
    hideTechnicalDetails: '隐藏技术详情',
    showTechnicalDetails: '显示技术详情',
  },

  // Processing indicators
  processing: {
    thinking: '思考中…',
    pondering: '沉思中…',
    contemplating: '深思中…',
    reasoning: '推理中…',
    processing: '处理中…',
    computing: '计算中…',
    considering: '考虑中…',
    reflecting: '反思中…',
    deliberating: '斟酌中…',
    cogitating: '思索中…',
    ruminating: '琢磨中…',
    musing: '冥想中…',
    workingOnIt: '正在处理…',
    onIt: '马上好…',
    crunching: '运算中…',
    brewing: '酝酿中…',
    connectingDots: '串联思路…',
    mullingOver: '仔细考虑…',
    deepInThought: '深度思考…',
    hmm: '嗯…',
    letMeSee: '让我看看…',
    oneмомент: '稍等片刻…',
    holdOn: '请稍候…',
    bearWithMe: '请耐心等待…',
    justASec: '马上就好…',
    hangTight: '稍等一下…',
    gettingThere: '快好了…',
    almost: '就差一点…',
    working: '工作中…',
    busyBusy: '忙碌中…',
  },

  // Playground (development)
  playground: {
    hideVariants: '隐藏变体',
    showVariants: '显示变体',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    default: '默认',
    success: '成功',
    error: '错误',
    warning: '警告',
    info: '信息',
    loading: '加载中',
    withAction: '带操作',
    withLongUrlAndAction: '带长链接和操作',
    successMessage: '操作已成功完成。',
    errorMessage: '出了点问题，请重试。',
    warningMessage: '此操作可能会产生影响。',
    infoMessage: '这是一些有用的信息。',
    loadingMessage: '请稍候，正在处理。',
    sessionDeleted: '会话已删除',
    sessionDeletedMessage: '您的会话已被移除。',
    undo: '撤销',
    resourceAvailable: '资源可用',
    open: '打开',
    defaultToast: '默认提示',
    defaultToastMessage: '这是一条基本通知。',
    dismissAll: '全部关闭',
    loadingToSuccess: '加载 → 成功',
    stack3Toasts: '堆叠 3 条提示',
    typeSlashToTrigger: '输入 / 触发',
    typeSlashToSeeCommands: '输入 / 查看命令...',
    messageCowork: '向 Cowork 发送消息...',
    authorizationComplete: '授权完成',
    authorizationFailed: '授权失败',
    oauthCallbackPreview: 'OAuth 回调预览',
    oauthCallbackDescription: 'OAuth 授权重定向后在浏览器中显示的页面',
    errorAccessDenied: '错误 - 访问被拒绝',
    errorInvalidScope: '错误 - 无效范围',
    errorServerError: '错误 - 服务器错误',
    errorExpiredToken: '错误 - 令牌已过期',
    errorGeneric: '错误 - 通用',
    accessDeniedMessage: '用户拒绝了授权请求。',
    invalidScopeMessage: '请求的范围无效或未知。',
    serverErrorMessage: '授权服务器遇到意外情况。',
    expiredTokenMessage: '授权码已过期。',
  },

  // Accessibility
  aria: {
    close: '关闭',
    sessions: '会话',
    changeTodoState: '更改待办状态',
  },

  // Misc
  misc: {
    untitled: '未命名',
    compact: '压缩',
    conversationCompacted: '对话已压缩',
    validatingKey: '验证中...',
    updateKey: '更新密钥',
    search: '搜索...',
    enterName: '输入名称...',
    pasteAuthCode: '在此粘贴授权码',
    directory: '文件夹',
    clickToExpand: '点击展开',
    clickToReveal: '点击显示',
    doubleClickToOpen: '双击打开',
    customEndpoint: '自定义端点',
  },

  // Empty state hints (workflow suggestions)
  hints: [
    '汇总你的 {source:Gmail} 收件箱，起草回复，并将笔记保存到 {source:Notion}',
    '将 {file:截图} 转换为你 {folder} 中的网站',
    '从 {source:Linear} 拉取问题，在 {source:Slack} 中研究，提交修复',
    '转录 {file:语音备忘录} 并转换为 {source:Notion} 任务',
    '分析 {file:电子表格} 并将见解发布到 {source:Slack}',
    '审查 {source:GitHub} PR，然后在 {source:Notion} 中总结变更',
    '解析 {file:发票 PDF} 并记录到 {source:Google Sheets}',
    '使用 {source:Exa} 研究，撰写报告，保存到你的 {source:Obsidian} 知识库',
    '重构你 {folder} 中的代码，然后推送到 {source:GitHub}',
    '同步 {source:Calendar} 事件与 {source:Linear} 项目截止日期',
    '将会议 {file:笔记} 自动转换为 {source:Jira} 工单',
    '查询你的 {source:数据库} 并在新 {file:文档} 中可视化结果',
    '获取 {source:Figma} 设计并在你的 {folder} 中生成 React 组件',
    '将 {source:Slack} 讨论串合并为 {source:Notion} 的每周摘要',
    '运行 {skill} 分析你的代码库并修复 {folder} 中的问题',
  ],

  // Edit popover labels and examples
  editPopover: {
    describePlaceholder: '描述你想要的更改...',
    examplePrefix: '，例如：',
    permissionSettings: '权限设置',
    defaultPermissions: '默认权限',
    skillInstructions: '技能指令',
    skillMetadata: '技能元数据',
    sourceDocumentation: '数据源文档',
    sourceConfiguration: '数据源配置',
    sourcePermissions: '数据源权限',
    toolPermissions: '工具权限',
    preferencesNotes: '偏好设置备注',
    addSource: '添加数据源',
    addSkill: '添加技能',
    statusConfiguration: '状态配置',
    examplePermissionAllow: "允许在探索模式下运行 'make build'",
    exampleDefaultPermission: '允许 git fetch 命令',
    exampleSkillInstruction: '添加错误处理指南',
    exampleSkillMetadata: '更新技能描述',
    exampleSourceDoc: '添加速率限制文档',
    exampleSourceConfig: '更新显示名称',
    exampleSourcePermission: '允许在探索模式下进行列表操作',
    exampleToolPermission: '仅允许只读操作（列表、获取、搜索）',
    examplePreference: '添加编码风格偏好',
    exampleAddSource: '连接到我的 Craft 空间',
    placeholderAddSource: '你想连接什么？',
    exampleAddSkill: '按照我们的代码标准审查 PR',
    placeholderAddSkill: '我应该学会做什么？',
    exampleStatus: '添加"已阻塞"状态',
  },

  // Shortcuts page
  shortcuts: {
    title: '快捷键',
    global: '全局',
    navigation: '导航',
    sessionList: '会话列表',
    agentTree: 'Agent 树',
    chat: '聊天',
    focusSidebar: '聚焦侧边栏',
    focusSessionList: '聚焦会话列表',
    focusChatInput: '聚焦聊天输入框',
    newChat: '新建聊天',
    toggleSidebar: '切换侧边栏',
    openSettings: '打开设置',
    showShortcuts: '显示快捷键',
    moveToNextZone: '移动到下一个区域',
    moveToPrevZone: '移动到上一个区域',
    moveBetweenZones: '在区域间移动（列表中）',
    navigateItems: '在列表中导航',
    goToFirst: '跳到第一项',
    goToLast: '跳到最后一项',
    closeDialog: '关闭对话框 / 取消输入焦点',
    focusChatInputEnter: '聚焦聊天输入框',
    deleteSession: '删除会话',
    renameSession: '重命名会话',
    openContextMenu: '打开右键菜单',
    collapseFolder: '折叠文件夹',
    expandFolder: '展开文件夹',
    sendMessage: '发送消息',
    newLine: '换行',
    stopAgent: '停止 Agent（处理中时）',
  },
} as const;
