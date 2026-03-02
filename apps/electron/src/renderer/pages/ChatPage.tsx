/**
 * ChatPage
 *
 * Displays a single session's chat with a consistent PanelHeader.
 * Extracted from MainContentPanel for consistency with other pages.
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Globe, Copy, RefreshCw, Link2Off, Info } from 'lucide-react'
import { toast } from 'sonner'
import { ChatDisplay } from '@/components/app-shell/ChatDisplay'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { SessionMenu } from '@/components/app-shell/SessionMenu'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { RenameDialog } from '@/components/ui/rename-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
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
    sessionStatuses,
    sessionListSearchQuery,
    isSearchModeActive,
    onChatMatchInfoChange,
    onSessionSourcesChange,
    onRenameSession,
    onFlagSession,
    onUnflagSession,
    onArchiveSession,
    onUnarchiveSession,
    onSessionStatusChange,
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
        try {
          await window.electronAPI.sessionCommand(sessionId, { type: 'setConnection', connectionSlug: connection })
        } catch (error) {
          console.warn('Failed to switch connection:', error)
          return
        }
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
    return (
      <span className="max-w-[220px] truncate text-[11px] font-medium text-muted-foreground">
        {modelLabel}
      </span>
    )
  }, [connectionUnavailable, effectiveModel, currentModel])

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
    onSessionStatusChange(sessionId, state)
  }, [sessionId, onSessionStatusChange])

  const handleArchive = React.useCallback(() => {
    onArchiveSession(sessionId)
  }, [sessionId, onArchiveSession])

  const handleUnarchive = React.useCallback(() => {
    onUnarchiveSession(sessionId)
  }, [sessionId, onUnarchiveSession])

  const handleLabelsChange = React.useCallback((newLabels: string[]) => {
    onSessionLabelsChange?.(sessionId, newLabels)
  }, [sessionId, onSessionLabelsChange])

  const handleDelete = React.useCallback(async () => {
    await onDeleteSession(sessionId)
  }, [sessionId, onDeleteSession])

  // Share handlers
  const sharedUrl = session?.sharedUrl || sessionMeta?.sharedUrl || null

  const handleShare = React.useCallback(async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'shareToViewer' }) as { success: boolean; url?: string; error?: string } | undefined
    if (result?.success && result.url) {
      await navigator.clipboard.writeText(result.url)
      toast.success(t('sessionMenu.linkCopied'), {
        description: result.url,
        action: { label: t('sessionMenu.openInBrowser'), onClick: () => window.electronAPI.openUrl(result.url!) },
      })
    } else {
      toast.error(t('sessionMenu.failedToShare'), { description: result?.error })
    }
  }, [sessionId, t])

  const handleCopyLink = React.useCallback(async () => {
    if (sharedUrl) {
      await navigator.clipboard.writeText(sharedUrl)
      toast.success(t('sessionMenu.linkCopied'))
    }
  }, [sharedUrl, t])

  const handleOpenInBrowser = React.useCallback(() => {
    if (sharedUrl) window.electronAPI.openUrl(sharedUrl)
  }, [sharedUrl])

  const handleUpdateShare = React.useCallback(async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'updateShare' }) as { success: boolean; error?: string } | undefined
    if (result?.success) {
      toast.success(t('sessionMenu.shareUpdated'))
    } else {
      toast.error(t('sessionMenu.failedToUpdateShare'), { description: result?.error })
    }
  }, [sessionId, t])

  const handleRevokeShare = React.useCallback(async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'revokeShare' }) as { success: boolean; error?: string } | undefined
    if (result?.success) {
      toast.success(t('sessionMenu.sharingStopped'))
    } else {
      toast.error(t('sessionMenu.failedToStopSharing'), { description: result?.error })
    }
  }, [sessionId, t])

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

  // Build a SessionMeta item for the menu (prefer atom metadata, fallback to session)
  const menuItem = React.useMemo(() => {
    if (sessionMeta) return sessionMeta
    if (!session) return null
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      name: session.name,
      isFlagged: session.isFlagged,
      todoState: session.todoState,
      labels: session.labels,
      sharedUrl: (session as Record<string, unknown>).sharedUrl as string | undefined,
      isArchived: (session as Record<string, unknown>).isArchived as boolean | undefined,
      lastFinalMessageId: (session as Record<string, unknown>).lastFinalMessageId as string | undefined,
    } satisfies Partial<import('@/atoms/sessions').SessionMeta> as import('@/atoms/sessions').SessionMeta
  }, [sessionMeta, session])

  // Share button for header
  const shareButton = React.useMemo(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HeaderIconButton
          icon={sharedUrl
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.2383 10.2871C11.6481 10.0391 12.1486 10.0082 12.5811 10.1943L12.7617 10.2871L13.0088 10.4414C14.2231 11.227 15.1393 12.2124 15.8701 13.502C16.1424 13.9824 15.9736 14.5929 15.4932 14.8652C15.0127 15.1375 14.4022 14.9688 14.1299 14.4883C13.8006 13.9073 13.4303 13.417 13 12.9883V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V12.9883C10.5697 13.417 10.1994 13.9073 9.87012 14.4883C9.59781 14.9688 8.98732 15.1375 8.50684 14.8652C8.02643 14.5929 7.8576 13.9824 8.12988 13.502C8.90947 12.1264 9.90002 11.0972 11.2383 10.2871ZM11.5 3C14.2848 3 16.6594 4.75164 17.585 7.21289C20.1294 7.90815 22 10.235 22 13C22 16.3137 19.3137 19 16 19H15V16.9961C15.5021 16.9966 16.0115 16.8707 16.4795 16.6055C17.9209 15.7885 18.4272 13.9571 17.6104 12.5156C16.6661 10.8495 15.4355 9.56805 13.7969 8.57617C12.692 7.90745 11.308 7.90743 10.2031 8.57617C8.56453 9.56806 7.3339 10.8495 6.38965 12.5156C5.57277 13.957 6.07915 15.7885 7.52051 16.6055C7.98851 16.8707 8.49794 16.9966 9 16.9961V19H7C4.23858 19 2 16.7614 2 14C2 11.9489 3.23498 10.1861 5.00195 9.41504C5.04745 5.86435 7.93852 3 11.5 3Z" />
              </svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 8.53809C6.74209 8.60866 5.94798 8.80911 5.37868 9.37841C4.5 10.2571 4.5 11.6713 4.5 14.4997V15.4997C4.5 18.3282 4.5 19.7424 5.37868 20.6211C6.25736 21.4997 7.67157 21.4997 10.5 21.4997H13.5C16.3284 21.4997 17.7426 21.4997 18.6213 20.6211C19.5 19.7424 19.5 18.3282 19.5 15.4997V14.4997C19.5 11.6713 19.5 10.2571 18.6213 9.37841C18.052 8.80911 17.2579 8.60866 16 8.53809M12 14V3.5M9.5 5.5C9.99903 4.50411 10.6483 3.78875 11.5606 3.24093C11.7612 3.12053 11.8614 3.06033 12 3.06033C12.1386 3.06033 12.2388 3.12053 12.4394 3.24093C13.3517 3.78875 14.001 4.50411 14.5 5.5" />
              </svg>
          }
          className={sharedUrl ? 'text-accent' : 'text-foreground'}
        />
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="end" sideOffset={8}>
        {sharedUrl ? (
          <>
            <StyledDropdownMenuItem onClick={handleOpenInBrowser}>
              <Globe className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.openInBrowser')}</span>
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={handleCopyLink}>
              <Copy className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.copyLink')}</span>
            </StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={handleUpdateShare}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.updateShare')}</span>
            </StyledDropdownMenuItem>
            <StyledDropdownMenuSeparator />
            <StyledDropdownMenuItem onClick={handleRevokeShare} variant="destructive">
              <Link2Off className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.stopSharing')}</span>
            </StyledDropdownMenuItem>
            <StyledDropdownMenuSeparator />
            <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl('https://www.aicowork.chat')}>
              <Info className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.learnMore')}</span>
            </StyledDropdownMenuItem>
          </>
        ) : (
          <>
            <StyledDropdownMenuItem onClick={handleShare}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 8.53809C6.74209 8.60866 5.94798 8.80911 5.37868 9.37841C4.5 10.2571 4.5 11.6713 4.5 14.4997V15.4997C4.5 18.3282 4.5 19.7424 5.37868 20.6211C6.25736 21.4997 7.67157 21.4997 10.5 21.4997H13.5C16.3284 21.4997 17.7426 21.4997 18.6213 20.6211C19.5 19.7424 19.5 18.3282 19.5 15.4997V14.4997C19.5 11.6713 19.5 10.2571 18.6213 9.37841C18.052 8.80911 17.2579 8.60866 16 8.53809M12 14V3.5M9.5 5.5C9.99903 4.50411 10.6483 3.78875 11.5606 3.24093C11.7612 3.12053 11.8614 3.06033 12 3.06033C12.1386 3.06033 12.2388 3.12053 12.4394 3.24093C13.3517 3.78875 14.001 4.50411 14.5 5.5" />
              </svg>
              <span className="flex-1">{t('sessionMenu.shareOnline')}</span>
            </StyledDropdownMenuItem>
            <StyledDropdownMenuSeparator />
            <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl('https://www.aicowork.chat')}>
              <Info className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.learnMore')}</span>
            </StyledDropdownMenuItem>
          </>
        )}
      </StyledDropdownMenuContent>
    </DropdownMenu>
  ), [sharedUrl, t, handleShare, handleOpenInBrowser, handleCopyLink, handleUpdateShare, handleRevokeShare])

  // Build title menu content for chat sessions using shared SessionMenu
  const titleMenu = React.useMemo(() => {
    if (!menuItem) return undefined
    return (
      <SessionMenu
        item={menuItem}
        sessionStatuses={sessionStatuses ?? []}
        labels={labels}
        onLabelsChange={handleLabelsChange}
        onRename={handleRename}
        onFlag={handleFlag}
        onUnflag={handleUnflag}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onMarkUnread={handleMarkUnread}
        onSessionStatusChange={handleTodoStateChange}
        onOpenInNewWindow={handleOpenInNewWindow}
        onDelete={handleDelete}
      />
    )
  }, [
    menuItem,
    sessionStatuses,
    labels,
    handleLabelsChange,
    handleRename,
    handleFlag,
    handleUnflag,
    handleArchive,
    handleUnarchive,
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
            <PanelHeader  title={displayTitle} badge={headerModelBadge} titleMenu={titleMenu} actions={shareButton} rightSidebarButton={rightSidebarButton} isRegeneratingTitle={isAsyncOperationOngoing} />
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
                sessionStatuses={sessionStatuses}
                onSessionStatusChange={handleTodoStateChange}
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
        <PanelHeader  title={displayTitle} badge={headerModelBadge} titleMenu={titleMenu} actions={shareButton} rightSidebarButton={rightSidebarButton} isRegeneratingTitle={isAsyncOperationOngoing} />
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
            sessionStatuses={sessionStatuses}
            onSessionStatusChange={handleTodoStateChange}
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
