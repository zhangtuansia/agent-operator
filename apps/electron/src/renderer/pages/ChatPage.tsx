/**
 * ChatPage
 *
 * Displays a single session's chat with a consistent PanelHeader.
 * Extracted from MainContentPanel for consistency with other pages.
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle } from 'lucide-react'
import { ChatDisplay } from '@/components/app-shell/ChatDisplay'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { SessionMenu } from '@/components/app-shell/SessionMenu'
import { RenameDialog } from '@/components/ui/rename-dialog'
import { useAppShellContext, usePendingPermission, usePendingCredential, useSessionOptionsFor, useSession as useSessionData } from '@/context/AppShellContext'
import { rendererPerf } from '@/lib/perf'
import { routes } from '@/lib/navigate'
import { ensureSessionMessagesLoadedAtom, loadedSessionsAtom, sessionMetaMapAtom } from '@/atoms/sessions'
import { getSessionTitle } from '@/utils/session'
import { useLanguage } from '@/context/LanguageContext'
import { resolveEffectiveConnectionSlug, isSessionConnectionUnavailable, getDefaultModelsForConnection } from '@config/llm-connections'
import { getModelDisplayName } from '@config/models'

export interface ChatPageProps {
  sessionId: string
}

const ChatPage = React.memo(function ChatPage({ sessionId }: ChatPageProps) {
  const { t } = useLanguage()

  // Diagnostic: mark when component runs
  React.useLayoutEffect(() => {
    rendererPerf.markSessionSwitch(sessionId, 'panel.mounted')
  }, [sessionId])

  const {
    activeWorkspaceId,
    llmConnections,
    workspaceDefaultLlmConnection,
    currentModel,
    onSendMessage,
    onOpenFile,
    onOpenUrl,
    onRespondToPermission,
    onRespondToCredential,
    onMarkSessionRead,
    onMarkSessionUnread,
    textareaRef,
    getDraft,
    onInputChange,
    enabledSources,
    skills,
    labels,
    onSessionLabelsChange,
    enabledModes,
    todoStates,
    sessionListSearchQuery,
    isSearchModeActive,
    onChatMatchInfoChange,
    onSessionSourcesChange,
    onRenameSession,
    onFlagSession,
    onUnflagSession,
    onTodoStateChange,
    onDeleteSession,
    rightSidebarButton,
  } = useAppShellContext()

  // Use the unified session options hook for clean access
  const {
    options: sessionOpts,
    setOption,
    setPermissionMode,
  } = useSessionOptionsFor(sessionId)

  // Use per-session atom for isolated updates
  const session = useSessionData(sessionId)

  // Track if messages are loaded for this session (for lazy loading)
  const loadedSessions = useAtomValue(loadedSessionsAtom)
  const messagesLoaded = loadedSessions.has(sessionId)

  // Check if session exists in metadata (for loading state detection)
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const sessionMeta = sessionMetaMap.get(sessionId)

  // Fallback: ensure messages are loaded when session is viewed
  const ensureMessagesLoaded = useSetAtom(ensureSessionMessagesLoadedAtom)
  React.useEffect(() => {
    ensureMessagesLoaded(sessionId)
  }, [sessionId, ensureMessagesLoaded])

  // Perf: Mark when session data is available
  const sessionLoadedMarkedRef = React.useRef<string | null>(null)
  React.useLayoutEffect(() => {
    if (session && sessionLoadedMarkedRef.current !== sessionId) {
      sessionLoadedMarkedRef.current = sessionId
      rendererPerf.markSessionSwitch(sessionId, 'session.loaded')
    }
  }, [sessionId, session])

  // Mark session as read when displayed (not processing)
  const currentSessionId = session?.id
  const currentSessionProcessing = session?.isProcessing ?? false
  React.useEffect(() => {
    if (currentSessionId && !currentSessionProcessing) {
      onMarkSessionRead(currentSessionId)
    }
  }, [currentSessionId, currentSessionProcessing, onMarkSessionRead])

  // Get pending permission and credential for this session
  const pendingPermission = usePendingPermission(sessionId)
  const pendingCredential = usePendingCredential(sessionId)

  // Track draft value for this session
  const [inputValue, setInputValue] = React.useState(() => getDraft(sessionId))
  const inputValueRef = React.useRef(inputValue)
  inputValueRef.current = inputValue

  // Re-sync from parent when session changes
  React.useEffect(() => {
    setInputValue(getDraft(sessionId))
  }, [getDraft, sessionId])

  // Sync when draft is set externally (e.g., from notifications or shortcuts)
  // PERFORMANCE NOTE: This bounded polling (max 10 attempts × 50ms = 500ms)
  // handles external draft injection. Drafts use a ref for typing performance,
  // so they're not directly reactive. This polling only runs on session switch,
  // not continuously. Alternative: Add a Jotai atom for draft changes.
  React.useEffect(() => {
    let attempts = 0
    const maxAttempts = 10
    const interval = setInterval(() => {
      const currentDraft = getDraft(sessionId)
      if (currentDraft !== inputValueRef.current && currentDraft !== '') {
        setInputValue(currentDraft)
        clearInterval(interval)
      }
      attempts++
      if (attempts >= maxAttempts) {
        clearInterval(interval)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [sessionId, getDraft])

  const handleInputChange = React.useCallback((value: string) => {
    setInputValue(value)
    inputValueRef.current = value
    onInputChange(sessionId, value)
  }, [sessionId, onInputChange])

  // Session model/connection change handler - persists per-session settings
  const handleModelChange = React.useCallback((model: string, connection?: string) => {
    if (!activeWorkspaceId) return

    void (async () => {
      const currentConnection = session?.llmConnection ?? sessionMeta?.llmConnection
      if (connection && connection !== currentConnection) {
        await window.electronAPI.sessionCommand(sessionId, { type: 'setConnection', connectionSlug: connection })
      }

      await window.electronAPI.setSessionModel(sessionId, activeWorkspaceId, model)
    })()
  }, [sessionId, activeWorkspaceId, session?.llmConnection, sessionMeta?.llmConnection])

  const sessionConnectionSlug = session?.llmConnection ?? sessionMeta?.llmConnection
  const connectionUnavailable = React.useMemo(
    () => isSessionConnectionUnavailable(sessionConnectionSlug, llmConnections),
    [sessionConnectionSlug, llmConnections]
  )

  const effectiveConnectionSlug = React.useMemo(() => {
    if (connectionUnavailable) return undefined
    return resolveEffectiveConnectionSlug(
      sessionConnectionSlug,
      workspaceDefaultLlmConnection,
      llmConnections
    )
  }, [sessionConnectionSlug, workspaceDefaultLlmConnection, llmConnections, connectionUnavailable])

  const effectiveConnection = React.useMemo(
    () => (effectiveConnectionSlug ? llmConnections.find(c => c.slug === effectiveConnectionSlug) : null),
    [effectiveConnectionSlug, llmConnections]
  )

  // Effective model for this session (session-specific > connection default > global fallback)
  const effectiveModel = React.useMemo(() => {
    const allowedModelIds = effectiveConnection
      ? (effectiveConnection.models && effectiveConnection.models.length > 0
          ? effectiveConnection.models
          : getDefaultModelsForConnection(effectiveConnection.providerType)
        )
        .map((model) => typeof model === 'string' ? model : model.id)
      : []
    const sessionModel = session?.model

    if (sessionModel) {
      if (connectionUnavailable || !effectiveConnection) return sessionModel
      if (allowedModelIds.length === 0 || allowedModelIds.includes(sessionModel)) return sessionModel
    }

    if (connectionUnavailable) return session?.model ?? ''
    return effectiveConnection?.defaultModel ?? currentModel
  }, [
    session?.model,
    effectiveConnection,
    connectionUnavailable,
    currentModel,
  ])

  const headerModelBadge = React.useMemo(() => {
    if (connectionUnavailable) return null
    const modelLabel = getModelDisplayName(effectiveModel || currentModel)
    const label = effectiveConnection ? `${effectiveConnection.name} · ${modelLabel}` : modelLabel
    return (
      <span className="max-w-[220px] truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    )
  }, [connectionUnavailable, effectiveConnection, effectiveModel, currentModel])

  // Working directory for this session
  const workingDirectory = session?.workingDirectory
  const handleWorkingDirectoryChange = React.useCallback(async (path: string) => {
    if (!session) return
    await window.electronAPI.sessionCommand(session.id, { type: 'updateWorkingDirectory', dir: path })
  }, [session])

  const handleOpenFile = React.useCallback(
    (path: string) => {
      onOpenFile(path)
    },
    [onOpenFile]
  )

  const handleOpenUrl = React.useCallback(
    (url: string) => {
      onOpenUrl(url)
    },
    [onOpenUrl]
  )

  // Perf: Mark when data is ready
  const dataReadyMarkedRef = React.useRef<string | null>(null)
  React.useLayoutEffect(() => {
    if (messagesLoaded && session && dataReadyMarkedRef.current !== sessionId) {
      dataReadyMarkedRef.current = sessionId
      rendererPerf.markSessionSwitch(sessionId, 'data.ready')
    }
  }, [sessionId, messagesLoaded, session])

  // Perf: Mark render complete after paint
  React.useEffect(() => {
    if (session) {
      const rafId = requestAnimationFrame(() => {
        rendererPerf.endSessionSwitch(sessionId)
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [sessionId, session])

  // Get display title for header - use getSessionTitle for consistent fallback logic with SessionList
  // Priority: name > first user message > preview > "New chat"
  const displayTitle = session ? getSessionTitle(session) : (sessionMeta ? getSessionTitle(sessionMeta) : t('chat.title'))
  const isFlagged = session?.isFlagged || sessionMeta?.isFlagged || false
  const sharedUrl = session?.sharedUrl || sessionMeta?.sharedUrl || null
  const currentTodoState = session?.todoState || sessionMeta?.todoState || 'todo'
  const hasMessages = !!(session?.messages?.length || sessionMeta?.lastFinalMessageId)
  const hasUnreadMessages = sessionMeta
    ? !!(sessionMeta.lastFinalMessageId && sessionMeta.lastFinalMessageId !== sessionMeta.lastReadMessageId)
    : false
  // Use isAsyncOperationOngoing for shimmer effect (sharing, updating share, revoking, title regeneration)
  const isAsyncOperationOngoing = session?.isAsyncOperationOngoing || sessionMeta?.isAsyncOperationOngoing || false

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false)
  const [renameName, setRenameName] = React.useState('')

  // Session action handlers
  const handleRename = React.useCallback(() => {
    setRenameName(displayTitle)
    setRenameDialogOpen(true)
  }, [displayTitle])

  const handleRenameSubmit = React.useCallback(() => {
    if (renameName.trim() && renameName.trim() !== displayTitle) {
      onRenameSession(sessionId, renameName.trim())
    }
    setRenameDialogOpen(false)
  }, [sessionId, renameName, displayTitle, onRenameSession])

  const handleFlag = React.useCallback(() => {
    onFlagSession(sessionId)
  }, [sessionId, onFlagSession])

  const handleUnflag = React.useCallback(() => {
    onUnflagSession(sessionId)
  }, [sessionId, onUnflagSession])

  const handleMarkUnread = React.useCallback(() => {
    onMarkSessionUnread(sessionId)
  }, [sessionId, onMarkSessionUnread])

  const handleTodoStateChange = React.useCallback((state: string) => {
    onTodoStateChange(sessionId, state)
  }, [sessionId, onTodoStateChange])

  const handleLabelsChange = React.useCallback((newLabels: string[]) => {
    onSessionLabelsChange?.(sessionId, newLabels)
  }, [sessionId, onSessionLabelsChange])

  const handleDelete = React.useCallback(async () => {
    await onDeleteSession(sessionId)
  }, [sessionId, onDeleteSession])

  const handleOpenInNewWindow = React.useCallback(async () => {
    const route = routes.view.allChats(sessionId)
    const separator = route.includes('?') ? '&' : '?'
    const url = `agentoperator://${route}${separator}window=focused`
    try {
      await window.electronAPI?.openUrl(url)
    } catch (error) {
      console.error('[ChatPage] openUrl failed:', error)
    }
  }, [sessionId])

  // Build title menu content for chat sessions using shared SessionMenu
  const titleMenu = React.useMemo(() => (
    <SessionMenu
      sessionId={sessionId}
      sessionName={displayTitle}
      isFlagged={isFlagged}
      sharedUrl={sharedUrl}
      hasMessages={hasMessages}
      hasUnreadMessages={hasUnreadMessages}
      currentTodoState={currentTodoState}
      todoStates={todoStates ?? []}
      onRename={handleRename}
      onFlag={handleFlag}
      onUnflag={handleUnflag}
      onMarkUnread={handleMarkUnread}
      onTodoStateChange={handleTodoStateChange}
      onOpenInNewWindow={handleOpenInNewWindow}
      onDelete={handleDelete}
    />
  ), [
    sessionId,
    displayTitle,
    isFlagged,
    sharedUrl,
    hasMessages,
    hasUnreadMessages,
    currentTodoState,
    todoStates,
    handleRename,
    handleFlag,
    handleUnflag,
    handleMarkUnread,
    handleTodoStateChange,
    handleOpenInNewWindow,
    handleDelete,
  ])

  // Handle missing session - loading or deleted
  if (!session) {
    if (sessionMeta) {
      // Session exists in metadata but not loaded yet - show loading state
      const skeletonSession = {
        id: sessionMeta.id,
        workspaceId: sessionMeta.workspaceId,
        workspaceName: '',
        name: sessionMeta.name,
        preview: sessionMeta.preview,
        lastMessageAt: sessionMeta.lastMessageAt || 0,
        messages: [],
        isProcessing: sessionMeta.isProcessing || false,
        isFlagged: sessionMeta.isFlagged,
        workingDirectory: sessionMeta.workingDirectory,
        enabledSourceSlugs: sessionMeta.enabledSourceSlugs,
        llmConnection: sessionMeta.llmConnection,
      }

      return (
        <>
          <div className="h-full flex flex-col">
            <PanelHeader  title={displayTitle} badge={headerModelBadge} titleMenu={titleMenu} rightSidebarButton={rightSidebarButton} isRegeneratingTitle={isAsyncOperationOngoing} />
            <div className="flex-1 flex flex-col min-h-0">
              <ChatDisplay
                session={skeletonSession}
                onSendMessage={() => {}}
                onOpenFile={handleOpenFile}
                onOpenUrl={handleOpenUrl}
                currentModel={effectiveModel}
                onModelChange={handleModelChange}
                textareaRef={textareaRef}
                pendingPermission={undefined}
                onRespondToPermission={onRespondToPermission}
                pendingCredential={undefined}
                onRespondToCredential={onRespondToCredential}
                thinkingLevel={sessionOpts.thinkingLevel}
                onThinkingLevelChange={(level) => setOption('thinkingLevel', level)}
                ultrathinkEnabled={sessionOpts.ultrathinkEnabled}
                onUltrathinkChange={(enabled) => setOption('ultrathinkEnabled', enabled)}
                permissionMode={sessionOpts.permissionMode}
                onPermissionModeChange={setPermissionMode}
                enabledModes={enabledModes}
                inputValue={inputValue}
                onInputChange={handleInputChange}
                sources={enabledSources}
                skills={skills}
                labels={labels}
                onLabelsChange={handleLabelsChange}
                workspaceId={activeWorkspaceId || undefined}
                onSourcesChange={(slugs) => onSessionSourcesChange?.(sessionId, slugs)}
                workingDirectory={sessionMeta.workingDirectory}
                onWorkingDirectoryChange={handleWorkingDirectoryChange}
                messagesLoading={true}
                searchQuery={sessionListSearchQuery}
                isSearchModeActive={isSearchModeActive}
                onMatchInfoChange={onChatMatchInfoChange}
                connectionUnavailable={connectionUnavailable}
              />
            </div>
          </div>
          <RenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            title={t('chat.renameChat')}
            value={renameName}
            onValueChange={setRenameName}
            onSubmit={handleRenameSubmit}
            placeholder={t('chat.enterChatName')}
          />
        </>
      )
    }

    // Session truly doesn't exist
    return (
      <div className="h-full flex flex-col">
        <PanelHeader  title={t('chat.title')} rightSidebarButton={rightSidebarButton} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="h-10 w-10" />
          <p className="text-sm">{t('chat.sessionNoLongerExists')}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <PanelHeader  title={displayTitle} badge={headerModelBadge} titleMenu={titleMenu} rightSidebarButton={rightSidebarButton} isRegeneratingTitle={isAsyncOperationOngoing} />
        <div className="flex-1 flex flex-col min-h-0">
          <ChatDisplay
            session={session}
            onSendMessage={(message, attachments, skillSlugs) => {
              if (session) {
                onSendMessage(session.id, message, attachments, skillSlugs)
              }
            }}
            onOpenFile={handleOpenFile}
            onOpenUrl={handleOpenUrl}
            currentModel={effectiveModel}
            onModelChange={handleModelChange}
            textareaRef={textareaRef}
            pendingPermission={pendingPermission}
            onRespondToPermission={onRespondToPermission}
            pendingCredential={pendingCredential}
            onRespondToCredential={onRespondToCredential}
            thinkingLevel={sessionOpts.thinkingLevel}
            onThinkingLevelChange={(level) => setOption('thinkingLevel', level)}
            ultrathinkEnabled={sessionOpts.ultrathinkEnabled}
            onUltrathinkChange={(enabled) => setOption('ultrathinkEnabled', enabled)}
            permissionMode={sessionOpts.permissionMode}
            onPermissionModeChange={setPermissionMode}
            enabledModes={enabledModes}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            sources={enabledSources}
            skills={skills}
            labels={labels}
            onLabelsChange={handleLabelsChange}
            workspaceId={activeWorkspaceId || undefined}
            onSourcesChange={(slugs) => onSessionSourcesChange?.(sessionId, slugs)}
            workingDirectory={workingDirectory}
            onWorkingDirectoryChange={handleWorkingDirectoryChange}
            sessionFolderPath={session?.sessionFolderPath}
            messagesLoading={!messagesLoaded}
            searchQuery={sessionListSearchQuery}
            isSearchModeActive={isSearchModeActive}
            onMatchInfoChange={onChatMatchInfoChange}
            connectionUnavailable={connectionUnavailable}
          />
        </div>
      </div>
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title={t('chat.renameChat')}
        value={renameName}
        onValueChange={setRenameName}
        onSubmit={handleRenameSubmit}
        placeholder={t('chat.enterChatName')}
      />
    </>
  )
})

export default ChatPage
