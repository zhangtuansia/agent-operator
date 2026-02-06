import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTheme } from '@/hooks/useTheme'
import type { ThemeOverrides } from '@config/theme'
import { useSetAtom, useStore, useAtomValue } from 'jotai'
import type { Session, Workspace, SessionEvent, Message, FileAttachment, StoredAttachment, PermissionRequest, CredentialRequest, CredentialResponse, SetupNeeds, TodoState, NewChatActionParams, ContentBadge } from '../shared/types'
import type { SessionOptions, SessionOptionUpdates } from './hooks/useSessionOptions'
import { defaultSessionOptions, mergeSessionOptions } from './hooks/useSessionOptions'
import { generateMessageId } from '../shared/types'
import { AppShell } from '@/components/app-shell/AppShell'
import type { AppShellContextType } from '@/context/AppShellContext'
import { OnboardingWizard, ReauthScreen } from '@/components/onboarding'
import { ResetConfirmationDialog } from '@/components/ResetConfirmationDialog'
import { SplashScreen } from '@/components/SplashScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { FocusProvider } from '@/context/FocusContext'
import { ModalProvider } from '@/context/ModalContext'
import { useGlobalShortcuts } from '@/hooks/keyboard'
import { useWindowCloseHandler } from '@/hooks/useWindowCloseHandler'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useNotifications } from '@/hooks/useNotifications'
import { useSession } from '@/hooks/useSession'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { NavigationProvider } from '@/contexts/NavigationContext'
import { LanguageProvider } from '@/context/LanguageContext'
import type { Language } from '@/i18n'
import { useTranslation } from '@/i18n'
import { navigate, routes } from './lib/navigate'
import { initRendererPerf } from './lib/perf'
import { DEFAULT_MODEL, getDefaultModelForProvider, isModelValidForProvider, getModelsForProvider } from '@config/models'
import {
  initializeSessionsAtom,
  addSessionAtom,
  removeSessionAtom,
  updateSessionAtom,
  sessionMetaMapAtom,
} from '@/atoms/sessions'
import { sourcesAtom } from '@/atoms/sources'
import { skillsAtom } from '@/atoms/skills'
import { extractBadges } from '@/lib/mentions'
import { toast } from 'sonner'
import { ShikiThemeProvider, PlatformProvider } from '@agent-operator/ui'
import { useSessionDrafts } from '@/hooks/useSessionDrafts'
import { useSessionEvents } from '@/hooks/useSessionEvents'
import { useMenuEvents } from '@/hooks/useMenuEvents'
import { useSplashScreen } from '@/hooks/useSplashScreen'
import { networkStatusAtom } from '@/hooks/useNetworkStatus'

type AppState = 'loading' | 'onboarding' | 'reauth' | 'ready'

export default function App() {
  // Initialize renderer perf tracking early (debug mode = running from source)
  // Uses useEffect with empty deps to run once on mount before any session switches
  useEffect(() => {
    window.electronAPI.isDebugMode().then((isDebug) => {
      initRendererPerf(isDebug)
    })
  }, [])

  // App state: loading -> check auth -> onboarding or ready
  const [appState, setAppState] = useState<AppState>('loading')
  const [setupNeeds, setSetupNeeds] = useState<SetupNeeds | null>(null)

  // Per-session Jotai atom setters for isolated updates
  // NOTE: No sessionsAtom - we don't store a Session[] array anywhere to prevent memory leaks
  // Instead we use:
  // - sessionMetaMapAtom for lightweight listing
  // - sessionAtomFamily(id) for individual session data
  const initializeSessions = useSetAtom(initializeSessionsAtom)
  const addSession = useSetAtom(addSessionAtom)
  const removeSession = useSetAtom(removeSessionAtom)
  const updateSessionDirect = useSetAtom(updateSessionAtom)
  const store = useStore()
  const isOnline = useAtomValue(networkStatusAtom)
  const { t } = useTranslation()

  // Helper to update a session by ID with partial fields
  // Uses per-session atom directly instead of updating an array
  const updateSessionById = useCallback((
    sessionId: string,
    updates: Partial<Session> | ((session: Session) => Partial<Session>)
  ) => {
    updateSessionDirect(sessionId, (prev) => {
      if (!prev) return prev
      const partialUpdates = typeof updates === 'function' ? updates(prev) : updates
      return { ...prev, ...partialUpdates }
    })
  }, [updateSessionDirect])

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  // Window's workspace ID - fixed for this window (multi-window architecture)
  const [windowWorkspaceId, setWindowWorkspaceId] = useState<string | null>(null)
  const [currentModel, setCurrentModel] = useState(DEFAULT_MODEL)
  const [menuNewChatTrigger, setMenuNewChatTrigger] = useState(0)
  // Permission requests per session (queue to handle multiple concurrent requests)
  const [pendingPermissions, setPendingPermissions] = useState<Map<string, PermissionRequest[]>>(new Map())
  // Credential requests per session (queue to handle multiple concurrent requests)
  const [pendingCredentials, setPendingCredentials] = useState<Map<string, CredentialRequest[]>>(new Map())
  // Session drafts hook - manages draft input text per session with debounced persistence
  const { getDraft, setDraft: handleInputChange, initDrafts } = useSessionDrafts()
  // Unified session options - replaces ultrathinkSessions and sessionModes
  // All session-scoped options in one place (ultrathink, permissionMode)
  const [sessionOptions, setSessionOptions] = useState<Map<string, SessionOptions>>(new Map())

  // Theme state (app-level only)
  const [appTheme, setAppTheme] = useState<ThemeOverrides | null>(null)
  // Language state (loaded from config on mount)
  const [initialLanguage, setInitialLanguage] = useState<Language | undefined>(undefined)
  // Reset confirmation dialog
  const [showResetDialog, setShowResetDialog] = useState(false)

  // Auto-update state
  const updateChecker = useUpdateChecker()

  // Splash screen state - tracks when app is fully ready (all data loaded)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  // Notifications enabled state (from app settings)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Sources and skills for badge extraction
  const sources = useAtomValue(sourcesAtom)
  const skills = useAtomValue(skillsAtom)

  // Compute if app is fully ready (all data loaded)
  const isFullyReady = appState === 'ready' && sessionsLoaded

  // Splash screen hook - manages splash exit animation
  const { showSplash, splashExiting, handleSplashExitComplete } = useSplashScreen(isFullyReady)

  // Apply theme via hook (injects CSS variables)
  // shikiTheme is passed to ShikiThemeProvider to ensure correct syntax highlighting
  // theme for dark-only themes in light system mode
  const { shikiTheme } = useTheme({ appTheme })

  // Ref for sessionOptions to access current value in event handlers without re-registering
  const sessionOptionsRef = useRef(sessionOptions)
  // Keep ref in sync with state
  useEffect(() => {
    sessionOptionsRef.current = sessionOptions
  }, [sessionOptions])

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback(async () => {
    // Reload workspaces after onboarding
    const ws = await window.electronAPI.getWorkspaces()
    if (ws.length > 0) {
      // Switch to workspace in-place (no window close/reopen)
      await window.electronAPI.switchWorkspace(ws[0].id)
      setWindowWorkspaceId(ws[0].id)
      setWorkspaces(ws)
      setAppState('ready')
      return
    }
    // Fallback: no workspaces (shouldn't happen after onboarding)
    setWorkspaces(ws)
    setAppState('ready')
  }, [])

  // Onboarding hook
  const onboarding = useOnboarding({
    onComplete: handleOnboardingComplete,
    initialSetupNeeds: setupNeeds || undefined,
  })

  // Reauth login handler - placeholder (reauth is not currently used)
  const handleReauthLogin = useCallback(async () => {
    // Re-check setup needs
    const needs = await window.electronAPI.getSetupNeeds()
    if (needs.isFullyConfigured) {
      setAppState('ready')
    } else {
      setSetupNeeds(needs)
      setAppState('onboarding')
    }
  }, [])

  // Reauth reset handler - open reset confirmation dialog
  const handleReauthReset = useCallback(() => {
    setShowResetDialog(true)
  }, [])

  // Get initial sessionId and focused mode from URL params (for "Open in New Window" feature)
  const { initialSessionId, isFocusedMode } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      initialSessionId: params.get('sessionId'),
      isFocusedMode: params.get('focused') === 'true',
    }
  }, [])

  // Check auth state and get window's workspace ID on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Get this window's workspace ID (passed via URL query param from main process)
        const wsId = await window.electronAPI.getWindowWorkspace()
        setWindowWorkspaceId(wsId)

        const needs = await window.electronAPI.getSetupNeeds()
        setSetupNeeds(needs)

        if (needs.isFullyConfigured) {
          setAppState('ready')
        } else if (needs.needsReauth) {
          // Session expired - show simple re-login screen (preserves conversations)
          setAppState('reauth')
        } else {
          // New user or needs full setup - show full onboarding
          setAppState('onboarding')
        }
      } catch (error) {
        console.error('Failed to check auth state:', error)
        // If check fails, show onboarding to be safe
        setAppState('onboarding')
      }
    }

    initialize()
  }, [])

  // Session selection state
  const [, setSession] = useSession()

  // Notification system - shows native OS notifications and badge count
  const handleNavigateToSession = useCallback((sessionId: string) => {
    // Navigate to the session via central routing (uses allChats filter)
    navigate(routes.view.allChats(sessionId))
  }, [])

  const { isWindowFocused, showSessionNotification } = useNotifications({
    workspaceId: windowWorkspaceId,
    // NOTE: sessions removed - hook now uses sessionMetaMapAtom internally
    // to prevent closures from retaining full message arrays
    onNavigateToSession: handleNavigateToSession,
    enabled: notificationsEnabled,
  })

  // Session events hook - handles all agent events from IPC
  // Must be after useNotifications since it uses showSessionNotification
  useSessionEvents({
    store,
    workspaceId: windowWorkspaceId,
    updateSessionDirect,
    showSessionNotification,
    setPendingPermissions,
    setPendingCredentials,
    defaultSessionOptions,
    setSessionOptions,
  })

  // Load workspaces, sessions, model, notifications setting, and drafts when app is ready
  useEffect(() => {
    if (appState !== 'ready') return

    window.electronAPI.getWorkspaces().then(setWorkspaces)
    window.electronAPI.getNotificationsEnabled().then(setNotificationsEnabled)
    window.electronAPI.getSessions().then((loadedSessions) => {
      // Initialize per-session atoms and metadata map
      // NOTE: No sessionsAtom used - sessions are only in per-session atoms
      initializeSessions(loadedSessions)
      // Initialize unified sessionOptions from session data
      const optionsMap = new Map<string, SessionOptions>()
      for (const s of loadedSessions) {
        // Only store non-default options to keep the map lean
        const hasNonDefaultMode = s.permissionMode && s.permissionMode !== 'ask'
        const hasNonDefaultThinking = s.thinkingLevel && s.thinkingLevel !== 'think'
        if (hasNonDefaultMode || hasNonDefaultThinking) {
          optionsMap.set(s.id, {
            ultrathinkEnabled: false, // ultrathink is single-shot, never persisted
            permissionMode: s.permissionMode ?? 'ask',
            thinkingLevel: s.thinkingLevel ?? 'think',
          })
        }
      }
      setSessionOptions(optionsMap)
      // Mark sessions as loaded for splash screen
      setSessionsLoaded(true)

      // If window was opened with a specific session (via "Open in New Window"), select it
      if (initialSessionId && windowWorkspaceId) {
        const session = loadedSessions.find(s => s.id === initialSessionId)
        if (session) {
          navigate(routes.view.allChats(session.id))
        }
      }
    })
    // Load stored model preference and provider info
    Promise.all([
      window.electronAPI.getModel(),
      window.electronAPI.getBillingMethod(),
      window.electronAPI.getCustomModels?.() || Promise.resolve([])
    ]).then(([storedModel, billingInfo, customModels]) => {
      // For OAuth, default to 'anthropic' provider
      const effectiveProvider = billingInfo.authType === 'oauth_token' ? 'anthropic' : billingInfo.provider

      // Validate stored model against current provider
      if (storedModel && isModelValidForProvider(storedModel, effectiveProvider, customModels)) {
        setCurrentModel(storedModel)
      } else {
        // If no stored model or model is invalid for current provider, use provider-specific default
        const defaultModel = getDefaultModelForProvider(effectiveProvider)
        setCurrentModel(defaultModel)
        // Persist the new default model
        window.electronAPI.setModel(defaultModel)
      }
    })
    // Load UI language preference
    window.electronAPI.getLanguage?.().then((lang) => {
      if (lang) {
        setInitialLanguage(lang)
      }
    })
    // Load persisted input drafts (no re-render needed)
    window.electronAPI.getAllDrafts().then((drafts) => {
      if (Object.keys(drafts).length > 0) {
        initDrafts(drafts)
      }
    })
    // Load app-level theme
    window.electronAPI.getAppTheme().then(setAppTheme)
  }, [appState, initialSessionId, windowWorkspaceId, setSession, initializeSessions, initDrafts])

  // Subscribe to theme change events (live updates when theme.json changes)
  useEffect(() => {
    const cleanupApp = window.electronAPI.onAppThemeChange((theme) => {
      setAppTheme(theme)
    })
    return () => {
      cleanupApp()
    }
  }, [])

  // Listen for provider changes and update model if necessary
  useEffect(() => {
    const handleProviderChange = async (event: Event) => {
      const customEvent = event as CustomEvent<{ provider: string }>
      const newProvider = customEvent.detail?.provider

      if (!newProvider) return

      // Load custom models if needed (for 'custom' provider)
      let customModels: Array<{ id: string }> | undefined
      if (newProvider === 'custom') {
        try {
          customModels = await window.electronAPI.getCustomModels?.()
        } catch {
          // Ignore errors
        }
      }

      // Check if current model is valid for the new provider
      if (!isModelValidForProvider(currentModel, newProvider, customModels)) {
        // Current model not valid for new provider, switch to default
        const newDefaultModel = getDefaultModelForProvider(newProvider)
        setCurrentModel(newDefaultModel)
        window.electronAPI.setModel(newDefaultModel)
      }
    }

    window.addEventListener('cowork:provider-changed', handleProviderChange)
    return () => window.removeEventListener('cowork:provider-changed', handleProviderChange)
  }, [currentModel])

  const handleCreateSession = useCallback(async (workspaceId: string, options?: import('../shared/types').CreateSessionOptions): Promise<Session> => {
    const session = await window.electronAPI.createSession(workspaceId, options)
    // Add to per-session atom and metadata map (no sessionsAtom)
    addSession(session)

    // Apply session defaults to the unified sessionOptions
    const hasNonDefaultMode = session.permissionMode && session.permissionMode !== 'ask'
    const hasNonDefaultThinking = session.thinkingLevel && session.thinkingLevel !== 'think'
    if (hasNonDefaultMode || hasNonDefaultThinking) {
      setSessionOptions(prev => {
        const next = new Map(prev)
        next.set(session.id, {
          ultrathinkEnabled: false,
          permissionMode: session.permissionMode ?? 'ask',
          thinkingLevel: session.thinkingLevel ?? 'think',
        })
        return next
      })
    }

    return session
  }, [addSession])

  // Deep link navigation is initialized later after handleInputChange is defined

  const handleDeleteSession = useCallback(async (sessionId: string, skipConfirmation = false): Promise<boolean> => {
    // Show confirmation dialog before deleting (unless skipped or session is empty)
    if (!skipConfirmation) {
      // Check if session has any messages using session metadata from Jotai store
      // We use store.get() instead of closing over sessions to prevent memory leaks
      // (closures would retain the full sessions array with all messages)
      const metaMap = store.get(sessionMetaMapAtom)
      const meta = metaMap.get(sessionId)
      // Session is empty if it has no lastFinalMessageId (no assistant responses) and no name (set on first user message)
      const isEmpty = !meta || (!meta.lastFinalMessageId && !meta.name)

      if (!isEmpty) {
        const confirmed = await window.electronAPI.showDeleteSessionConfirmation(meta?.name || t('misc.untitled'))
        if (!confirmed) return false
      }
    }

    await window.electronAPI.deleteSession(sessionId)
    // Remove from per-session atom and metadata map (no sessionsAtom)
    removeSession(sessionId)
    return true
  }, [store, removeSession, t])

  const handleFlagSession = useCallback((sessionId: string) => {
    updateSessionById(sessionId, { isFlagged: true })
    window.electronAPI.sessionCommand(sessionId, { type: 'flag' })
  }, [updateSessionById])

  const handleUnflagSession = useCallback((sessionId: string) => {
    updateSessionById(sessionId, { isFlagged: false })
    window.electronAPI.sessionCommand(sessionId, { type: 'unflag' })
  }, [updateSessionById])

  const handleMarkSessionRead = useCallback((sessionId: string) => {
    // Find the session and compute the last final assistant message ID
    updateSessionById(sessionId, (s) => {
      const lastFinalId = s.messages.findLast(
        m => m.role === 'assistant' && !m.isIntermediate
      )?.id
      return lastFinalId ? { lastReadMessageId: lastFinalId } : {}
    })
    window.electronAPI.sessionCommand(sessionId, { type: 'markRead' })
  }, [updateSessionById])

  const handleMarkSessionUnread = useCallback((sessionId: string) => {
    updateSessionById(sessionId, { lastReadMessageId: undefined })
    window.electronAPI.sessionCommand(sessionId, { type: 'markUnread' })
  }, [updateSessionById])

  const handleTodoStateChange = useCallback((sessionId: string, state: TodoState) => {
    updateSessionById(sessionId, { todoState: state })
    window.electronAPI.sessionCommand(sessionId, { type: 'setTodoState', state })
  }, [updateSessionById])

  const handleRenameSession = useCallback((sessionId: string, name: string) => {
    updateSessionById(sessionId, { name })
    window.electronAPI.sessionCommand(sessionId, { type: 'rename', name })
  }, [updateSessionById])

  const handleSendMessage = useCallback(async (sessionId: string, message: string, attachments?: FileAttachment[], skillSlugs?: string[]) => {
    // Check network status before sending
    if (!isOnline) {
      toast.error(t('network.cannotSendOffline'))
      return
    }

    try {
      // Step 1: Store attachments and get persistent metadata
      let storedAttachments: StoredAttachment[] | undefined
      let processedAttachments: FileAttachment[] | undefined

      if (attachments?.length) {
        // Store each attachment to disk (generates thumbnails, converts Office→markdown)
        // Use allSettled so one failure doesn't kill all attachments
        const storeResults = await Promise.allSettled(
          attachments.map(a => window.electronAPI.storeAttachment(sessionId, a))
        )

        // Filter successful stores, warn about failures
        storedAttachments = []
        const successfulAttachments: FileAttachment[] = []
        storeResults.forEach((result, i) => {
          if (result.status === 'fulfilled') {
            storedAttachments!.push(result.value)
            successfulAttachments.push(attachments[i])
          } else {
            console.warn(`Failed to store attachment "${attachments[i].name}":`, result.reason)
          }
        })

        // Notify user about failed attachments
        const failedCount = storeResults.filter(r => r.status === 'rejected').length
        if (failedCount > 0) {
          console.warn(`${failedCount} attachment(s) failed to store`)
          // Add warning message to session so user knows some attachments weren't included
          const failedNames = attachments
            .filter((_, i) => storeResults[i].status === 'rejected')
            .map(a => a.name)
            .join(', ')
          updateSessionById(sessionId, (s) => ({
            messages: [...s.messages, {
              id: generateMessageId(),
              role: 'warning' as const,
              content: `⚠️ ${failedCount} attachment(s) could not be stored and will not be sent: ${failedNames}`,
              timestamp: Date.now()
            }]
          }))
        }

        // Step 2: Create processed attachments for Claude
        // - Office files: Convert to text with markdown content
        // - Others: Use original FileAttachment
        // - All: Include storedPath so agent knows where files are stored
        // - Resized images: Use resizedBase64 instead of original large base64
        processedAttachments = await Promise.all(
          successfulAttachments.map(async (att, i) => {
            const stored = storedAttachments?.[i]
            if (!stored) {
              console.error(`Missing stored attachment at index ${i}`)
              return att // Fall back to original
            }
            // Include storedPath and markdownPath for all attachment types
            // Agent will use Read tool to access text/office files via these paths
            // If image was resized, use the resized base64 for Claude API
            return {
              ...att,
              storedPath: stored.storedPath,
              markdownPath: stored.markdownPath,
              // Use resized base64 if available (for images that exceeded size limits)
              base64: stored.resizedBase64 ?? att.base64,
            }
          })
        )
      }

      // Step 3: Check if ultrathink is enabled for this session
      const isUltrathink = sessionOptions.get(sessionId)?.ultrathinkEnabled ?? false

      // Step 4: Extract badges from mentions (sources/skills) with embedded icons
      // Badges are self-contained for display in UserMessageBubble and viewer
      const badges: ContentBadge[] = windowWorkspaceId
        ? extractBadges(message, skills, sources, windowWorkspaceId)
        : []

      // Step 4.1: Detect SDK slash commands (e.g., /compact) and create command badges
      // This makes /compact render as an inline badge rather than raw text
      const commandMatch = message.match(/^\/([a-z]+)(\s|$)/i)
      if (commandMatch && commandMatch[1].toLowerCase() === 'compact') {
        const commandText = commandMatch[0].trimEnd() // "/compact" without trailing space
        badges.unshift({
          type: 'command',
          label: t('misc.compact'),
          rawText: commandText,
          start: 0,
          end: commandText.length,
        })
      }

      // Step 4.2: Detect plan execution messages and create file badges
      // Pattern: "Read the plan at <path> and execute it."
      // This is sent after compaction when accepting a plan, displays as clickable file badge
      // Only the file path is replaced with a badge - surrounding text remains visible
      const planExecuteMatch = message.match(/^(Read the plan at )(.+?)( and execute it\.?)$/i)
      if (planExecuteMatch) {
        const prefix = planExecuteMatch[1]      // "Read the plan at "
        const filePath = planExecuteMatch[2]    // the actual path
        const fileName = filePath.split('/').pop() || 'plan.md'
        badges.push({
          type: 'file',
          label: fileName,
          rawText: filePath,
          filePath: filePath,
          start: prefix.length,
          end: prefix.length + filePath.length,
        })
      }

      // Step 5: Create user message with StoredAttachments (for UI display)
      // Mark as isPending for optimistic UI - will be confirmed by user_message event
      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
        attachments: storedAttachments,
        badges: badges.length > 0 ? badges : undefined,
        ultrathink: isUltrathink || undefined,  // Only set if true
        isPending: true,  // Optimistic - will be confirmed by backend
      }

      // Optimistic UI update - add user message and set processing state
      updateSessionById(sessionId, (s) => ({
        messages: [...s.messages, userMessage],
        isProcessing: true,
        lastMessageAt: Date.now()
      }))

      // Step 6: Send to Claude with processed attachments + stored attachments for persistence
      await window.electronAPI.sendMessage(sessionId, message, processedAttachments, storedAttachments, {
        ultrathinkEnabled: isUltrathink,
        skillSlugs,
        badges: badges.length > 0 ? badges : undefined,
      })

      // Auto-disable ultrathink after sending (single-shot activation, UI-only state)
      if (isUltrathink) {
        setSessionOptions(prev => {
          const next = new Map(prev)
          const current = next.get(sessionId) ?? defaultSessionOptions
          next.set(sessionId, mergeSessionOptions(current, { ultrathinkEnabled: false }))
          return next
        })
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      updateSessionById(sessionId, (s) => ({
        isProcessing: false,
        messages: [
          ...s.messages,
          {
            id: generateMessageId(),
            role: 'error' as const,
            content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now()
          }
        ]
      }))
    }
  }, [isOnline, t, sessionOptions, updateSessionById, skills, sources, windowWorkspaceId])

  const handleModelChange = useCallback((model: string) => {
    setCurrentModel(model)
    // Persist to config so it's remembered across launches
    window.electronAPI.setModel(model)
  }, [])

  /**
   * Unified handler for all session option changes.
   * Handles persistence and backend sync for each option type.
   */
  const handleSessionOptionsChange = useCallback((sessionId: string, updates: SessionOptionUpdates) => {
    setSessionOptions(prev => {
      const next = new Map(prev)
      const current = next.get(sessionId) ?? defaultSessionOptions
      next.set(sessionId, mergeSessionOptions(current, updates))
      return next
    })

    // Handle persistence/backend for specific options
    if (updates.permissionMode !== undefined) {
      // Sync permission mode change with backend
      window.electronAPI.sessionCommand(sessionId, { type: 'setPermissionMode', mode: updates.permissionMode })
    }
    if (updates.thinkingLevel !== undefined) {
      // Sync thinking level change with backend (session-level, persisted)
      window.electronAPI.sessionCommand(sessionId, { type: 'setThinkingLevel', level: updates.thinkingLevel })
    }
    // ultrathinkEnabled is UI-only (single-shot), no backend persistence needed
  }, [])

  // Open new chat - creates session and selects it
  // Used by components via AppShellContext and for programmatic navigation
  const openNewChat = useCallback(async (params: NewChatActionParams = {}) => {
    if (!windowWorkspaceId) {
      console.warn('[App] Cannot open new chat: no workspace ID')
      return
    }

    const session = await handleCreateSession(windowWorkspaceId)

    if (params.name) {
      await window.electronAPI.sessionCommand(session.id, { type: 'rename', name: params.name })
    }

    // Navigate to the chat view - this sets both selectedSession and activeView
    navigate(routes.view.allChats(session.id))

    // Pre-fill input if provided (after a small delay to ensure component is mounted)
    if (params.input) {
      setTimeout(() => handleInputChange(session.id, params.input!), 100)
    }
  }, [windowWorkspaceId, handleCreateSession, handleInputChange])

  const handleRespondToPermission = useCallback(async (sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) => {
    console.log('[App] handleRespondToPermission called:', { sessionId, requestId, allowed, alwaysAllow })

    const success = await window.electronAPI.respondToPermission(sessionId, requestId, allowed, alwaysAllow)
    console.log('[App] handleRespondToPermission IPC result:', { success })

    if (success) {
      // Remove only the first permission from the queue (the one we just responded to)
      setPendingPermissions(prev => {
        const next = new Map(prev)
        const queue = next.get(sessionId) || []
        const remainingQueue = queue.slice(1) // Remove first item
        console.log('[App] handleRespondToPermission: clearing permission from queue, remaining:', remainingQueue.length)
        if (remainingQueue.length === 0) {
          next.delete(sessionId)
        } else {
          next.set(sessionId, remainingQueue)
        }
        return next
      })
      // Note: No need to force session refresh - per-session atoms update automatically
    } else {
      // Response failed (agent/session gone) - clear the permission anyway
      // to avoid UI being stuck with stale permission
      setPendingPermissions(prev => {
        const next = new Map(prev)
        const queue = next.get(sessionId) || []
        const remainingQueue = queue.slice(1)
        if (remainingQueue.length === 0) {
          next.delete(sessionId)
        } else {
          next.set(sessionId, remainingQueue)
        }
        return next
      })
    }
  }, [])

  const handleRespondToCredential = useCallback(async (sessionId: string, requestId: string, response: CredentialResponse) => {
    console.log('[App] handleRespondToCredential called:', { sessionId, requestId, cancelled: response.cancelled })

    const success = await window.electronAPI.respondToCredential(sessionId, requestId, response)
    console.log('[App] handleRespondToCredential IPC result:', { success })

    if (success) {
      // Remove only the first credential from the queue (the one we just responded to)
      setPendingCredentials(prev => {
        const next = new Map(prev)
        const queue = next.get(sessionId) || []
        const remainingQueue = queue.slice(1) // Remove first item
        console.log('[App] handleRespondToCredential: clearing credential from queue, remaining:', remainingQueue.length)
        if (remainingQueue.length === 0) {
          next.delete(sessionId)
        } else {
          next.set(sessionId, remainingQueue)
        }
        return next
      })
      // Note: No need to force session refresh - per-session atoms update automatically
    } else {
      // Response failed (agent/session gone) - clear the credential anyway
      // to avoid UI being stuck with stale credential request
      setPendingCredentials(prev => {
        const next = new Map(prev)
        const queue = next.get(sessionId) || []
        const remainingQueue = queue.slice(1)
        if (remainingQueue.length === 0) {
          next.delete(sessionId)
        } else {
          next.set(sessionId, remainingQueue)
        }
        return next
      })
    }
  }, [])

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      await window.electronAPI.openFile(path)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }, [])

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await window.electronAPI.openUrl(url)
    } catch (error) {
      console.error('Failed to open URL:', error)
    }
  }, [])

  const handleRevealInFinder = useCallback(async (path: string) => {
    try {
      await window.electronAPI.showInFolder(path)
    } catch (error) {
      console.error('Failed to reveal file in Finder:', error)
    }
  }, [])

  const handleOpenSettings = useCallback(() => {
    navigate(routes.view.settings())
  }, [])

  // Menu events hook - handles menu bar actions
  // Must be after handleOpenSettings is defined
  const onMenuNewChat = useCallback(() => setMenuNewChatTrigger(n => n + 1), [])
  useMenuEvents({
    onNewChat: onMenuNewChat,
    onOpenSettings: handleOpenSettings,
  })

  const handleOpenKeyboardShortcuts = useCallback(() => {
    navigate(routes.view.settings('shortcuts'))
  }, [])

  const handleOpenStoredUserPreferences = useCallback(() => {
    navigate(routes.view.settings('preferences'))
  }, [])

  // Show reset confirmation dialog
  const handleReset = useCallback(() => {
    setShowResetDialog(true)
  }, [])

  // Execute reset after user confirms in dialog
  const executeReset = useCallback(async () => {
    try {
      await window.electronAPI.logout()
      // Reset all state
      // Clear session atoms - initialize with empty array clears all per-session atoms
      initializeSessions([])
      setWorkspaces([])
      setWindowWorkspaceId(null)
      // Reset setupNeeds to force fresh onboarding start
      setSetupNeeds({
        needsAuth: true,
        needsReauth: false,
        needsBillingConfig: true,
        needsCredentials: true,
        isFullyConfigured: false,
      })
      // Reset onboarding hook state
      onboarding.reset()
      setAppState('onboarding')
    } catch (error) {
      console.error('Reset failed:', error)
    } finally {
      setShowResetDialog(false)
    }
  }, [onboarding, initializeSessions])

  // Refresh sessions from disk (after import, etc.)
  const refreshSessions = useCallback(async () => {
    const loadedSessions = await window.electronAPI.getSessions()
    initializeSessions(loadedSessions)
    // Update sessionOptions
    const optionsMap = new Map<string, SessionOptions>()
    for (const s of loadedSessions) {
      const hasNonDefaultMode = s.permissionMode && s.permissionMode !== 'ask'
      const hasNonDefaultThinking = s.thinkingLevel && s.thinkingLevel !== 'think'
      if (hasNonDefaultMode || hasNonDefaultThinking) {
        optionsMap.set(s.id, {
          ultrathinkEnabled: false,
          permissionMode: s.permissionMode ?? 'ask',
          thinkingLevel: s.thinkingLevel ?? 'think',
        })
      }
    }
    setSessionOptions(optionsMap)
  }, [initializeSessions])

  // Handle workspace selection
  // - Default: switch workspace in same window (in-window switching)
  // - With openInNewWindow=true: open in new window (or focus existing)
  const handleSelectWorkspace = useCallback(async (workspaceId: string, openInNewWindow = false) => {
    // If selecting current workspace, do nothing
    if (workspaceId === windowWorkspaceId) return

    if (openInNewWindow) {
      // Open (or focus) the window for the selected workspace
      window.electronAPI.openWorkspace(workspaceId)
    } else {
      // Switch workspace in current window
      // 1. Update the main process's window-workspace mapping
      await window.electronAPI.switchWorkspace(workspaceId)

      // 2. Update React state to trigger re-renders
      setWindowWorkspaceId(workspaceId)

      // 3. Clear selected session - the old session belongs to the previous workspace
      // and should not remain selected when switching to a new workspace.
      // This prevents showing stale session data from the wrong workspace.
      setSession({ selected: null })

      // 4. Navigate to allChats view without a specific session selected
      // This ensures the UI is in a clean state for the new workspace
      navigate(routes.view.allChats())

      // 5. Clear pending permissions/credentials (not relevant to new workspace)
      setPendingPermissions(new Map())
      setPendingCredentials(new Map())

      // Note: Sessions and theme will reload automatically due to windowWorkspaceId dependency
      // in useEffect hooks
    }
  }, [windowWorkspaceId, setSession])

  // Handle workspace refresh (e.g., after icon upload)
  const handleRefreshWorkspaces = useCallback(() => {
    window.electronAPI.getWorkspaces().then(setWorkspaces)
  }, [])

  // Handle cancel during onboarding
  const handleOnboardingCancel = useCallback(() => {
    onboarding.handleCancel()
  }, [onboarding])

  // Build context value for AppShell component
  // This is memoized to prevent unnecessary re-renders
  // IMPORTANT: Must be before early returns to maintain consistent hook order
  const appShellContextValue = useMemo<AppShellContextType>(() => ({
    // Data
    // NOTE: sessions is NOT included - use sessionMetaMapAtom for listing
    // and useSession(id) hook for individual sessions. This prevents memory leaks.
    workspaces,
    activeWorkspaceId: windowWorkspaceId,
    currentModel,
    pendingPermissions,
    pendingCredentials,
    getDraft,
    sessionOptions,
    // Session callbacks
    onCreateSession: handleCreateSession,
    onSendMessage: handleSendMessage,
    onRenameSession: handleRenameSession,
    onFlagSession: handleFlagSession,
    onUnflagSession: handleUnflagSession,
    onMarkSessionRead: handleMarkSessionRead,
    onMarkSessionUnread: handleMarkSessionUnread,
    onTodoStateChange: handleTodoStateChange,
    onDeleteSession: handleDeleteSession,
    onRespondToPermission: handleRespondToPermission,
    onRespondToCredential: handleRespondToCredential,
    // File/URL handlers
    onOpenFile: handleOpenFile,
    onOpenUrl: handleOpenUrl,
    // Model
    onModelChange: handleModelChange,
    // Workspace
    onSelectWorkspace: handleSelectWorkspace,
    onRefreshWorkspaces: handleRefreshWorkspaces,
    // Sessions
    refreshSessions,
    // App actions
    onOpenSettings: handleOpenSettings,
    onOpenKeyboardShortcuts: handleOpenKeyboardShortcuts,
    onOpenStoredUserPreferences: handleOpenStoredUserPreferences,
    onReset: handleReset,
    // Session options
    onSessionOptionsChange: handleSessionOptionsChange,
    onInputChange: handleInputChange,
    // New chat (via deep link navigation)
    openNewChat,
  }), [
    // NOTE: sessions removed to prevent memory leaks - components use atoms instead
    workspaces,
    windowWorkspaceId,
    currentModel,
    pendingPermissions,
    pendingCredentials,
    getDraft,
    sessionOptions,
    handleCreateSession,
    handleSendMessage,
    handleRenameSession,
    handleFlagSession,
    handleUnflagSession,
    handleMarkSessionRead,
    handleMarkSessionUnread,
    handleTodoStateChange,
    handleDeleteSession,
    handleRespondToPermission,
    handleRespondToCredential,
    handleOpenFile,
    handleOpenUrl,
    handleModelChange,
    handleSelectWorkspace,
    handleRefreshWorkspaces,
    refreshSessions,
    handleOpenSettings,
    handleOpenKeyboardShortcuts,
    handleOpenStoredUserPreferences,
    handleReset,
    handleSessionOptionsChange,
    handleInputChange,
    openNewChat,
  ])

  // Platform actions for @agent-operator/ui components (overlays, etc.)
  // Memoized to prevent re-renders when these callbacks don't change
  // NOTE: Must be defined before early returns to maintain consistent hook order
  const platformActions = useMemo(() => ({
    onOpenFile: handleOpenFile,
    onOpenUrl: handleOpenUrl,
    onRevealInFinder: handleRevealInFinder,
    // Hide/show macOS traffic lights when fullscreen overlays are open
    onSetTrafficLightsVisible: (visible: boolean) => {
      window.electronAPI.setTrafficLightsVisible(visible)
    },
  }), [handleOpenFile, handleOpenUrl, handleRevealInFinder])

  // Loading state - show splash screen
  if (appState === 'loading') {
    return <SplashScreen isExiting={false} />
  }

  // Reauth state - session expired, need to re-login
  // ModalProvider + WindowCloseHandler ensures X button works on Windows
  // LanguageProvider needed for translated reauth screens
  if (appState === 'reauth') {
    return (
      <LanguageProvider initialLanguage={initialLanguage}>
      <ModalProvider>
        <WindowCloseHandler />
        <ReauthScreen
          onLogin={handleReauthLogin}
          onReset={handleReauthReset}
        />
        <ResetConfirmationDialog
          open={showResetDialog}
          onConfirm={executeReset}
          onCancel={() => setShowResetDialog(false)}
        />
      </ModalProvider>
      </LanguageProvider>
    )
  }

  // Onboarding state
  // ModalProvider + WindowCloseHandler ensures X button works on Windows
  // (without this, the close IPC message has no listener and window stays open)
  // LanguageProvider needed for translated onboarding screens
  if (appState === 'onboarding') {
    return (
      <LanguageProvider initialLanguage={initialLanguage}>
      <ModalProvider>
        <WindowCloseHandler />
        <OnboardingWizard
          state={onboarding.state}
          onContinue={onboarding.handleContinue}
          onBack={onboarding.handleBack}
          onSelectBillingMethod={onboarding.handleSelectBillingMethod}
          onSubmitCredential={onboarding.handleSubmitCredential}
          onSubmitProvider={onboarding.handleSubmitProvider}
          onStartOAuth={onboarding.handleStartOAuth}
          onFinish={onboarding.handleFinish}
          existingClaudeToken={onboarding.existingClaudeToken}
          isClaudeCliInstalled={onboarding.isClaudeCliInstalled}
          onUseExistingClaudeToken={onboarding.handleUseExistingClaudeToken}
          isWaitingForCode={onboarding.isWaitingForCode}
          onSubmitAuthCode={onboarding.handleSubmitAuthCode}
          onCancelOAuth={onboarding.handleCancelOAuth}
        />
      </ModalProvider>
      </LanguageProvider>
    )
  }

  // Ready state - main app with splash overlay during data loading
  return (
    <ErrorBoundary level="app">
    <LanguageProvider initialLanguage={initialLanguage}>
    <PlatformProvider actions={platformActions}>
    <ShikiThemeProvider shikiTheme={shikiTheme}>
      <FocusProvider>
        <ModalProvider>
        <TooltipProvider>
        <NavigationProvider
          workspaceId={windowWorkspaceId}
          onCreateSession={handleCreateSession}
          onInputChange={handleInputChange}
          isReady={appState === 'ready'}
        >
          {/* Handle window close requests (X button, Cmd+W) - close modal first if open */}
          <WindowCloseHandler />

          {/* Splash screen overlay - fades out when fully ready */}
          {showSplash && (
            <SplashScreen
              isExiting={splashExiting}
              onExitComplete={handleSplashExitComplete}
            />
          )}

          {/* Main UI - always rendered, splash fades away to reveal it */}
          <div className="h-full flex flex-col text-foreground">
            <div className="flex-1 min-h-0">
              <AppShell
                contextValue={appShellContextValue}
                defaultLayout={[20, 32, 48]}
                menuNewChatTrigger={menuNewChatTrigger}
                isFocusedMode={isFocusedMode}
              />
            </div>
            <ResetConfirmationDialog
              open={showResetDialog}
              onConfirm={executeReset}
              onCancel={() => setShowResetDialog(false)}
            />
          </div>
        </NavigationProvider>
        </TooltipProvider>
        </ModalProvider>
      </FocusProvider>
    </ShikiThemeProvider>
    </PlatformProvider>
    </LanguageProvider>
    </ErrorBoundary>
  )
}

/**
 * Component that handles window close requests.
 * Must be inside ModalProvider to access the modal registry.
 */
function WindowCloseHandler() {
  useWindowCloseHandler()
  return null
}
