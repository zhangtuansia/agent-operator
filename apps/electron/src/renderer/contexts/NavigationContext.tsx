/**
 * NavigationContext
 *
 * Provides a global `navigate()` function that decouples components from
 * direct session/action imports. All navigation goes through typed routes.
 *
 * UNIFIED NAVIGATION STATE:
 * This context now maintains a single NavigationState that determines all 3 panels:
 * - LeftSidebar: highlighted item (derived from navigator + filter/subpage)
 * - NavigatorPanel: which list to show (derived from navigator)
 * - MainContentPanel: what details to display (derived from details or subpage)
 *
 * Usage:
 *   import { useNavigation, useNavigationState } from '@/contexts/NavigationContext'
 *   import { routes } from '@/shared/routes'
 *
 *   const { navigate } = useNavigation()
 *   const navState = useNavigationState()
 *
 *   navigate(routes.view.allChats())
 *   navigate(routes.action.newChat())
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from 'react'
import { useNavigationHistory } from '@/hooks/useNavigationHistory'
import { toast } from 'sonner'
import { useAtomValue } from 'jotai'
import { useSession } from '@/hooks/useSession'
import {
  parseRoute,
  parseRouteToNavigationState,
  buildRouteFromNavigationState,
  buildUrlWithState,
  type ParsedRoute,
} from '../../shared/route-parser'
import { routes, type Route } from '../../shared/routes'
import { NAVIGATE_EVENT } from '../lib/navigate'
import type {
  DeepLinkNavigation,
  Session,
  NavigationState,
  ChatFilter,
  RightSidebarPanel,
  ContentBadge,
} from '../../shared/types'
import {
  isChatsNavigation,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
  DEFAULT_NAVIGATION_STATE,
} from '../../shared/types'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { sourcesAtom } from '@/atoms/sources'
import { skillsAtom } from '@/atoms/skills'
import { useLanguage } from '@/context/LanguageContext'

// Re-export routes for convenience
export { routes }
export type { Route }

// Re-export navigation state types for consumers
export type { NavigationState, ChatFilter }
export { isChatsNavigation, isSourcesNavigation, isSettingsNavigation, isSkillsNavigation }

interface NavigationContextValue {
  /** Navigate to a route */
  navigate: (route: Route) => void | Promise<void>
  /** Check if navigation is ready */
  isReady: boolean
  /** Unified navigation state - single source of truth for all 3 panels */
  navigationState: NavigationState
  /** Whether we can go back in history */
  canGoBack: boolean
  /** Whether we can go forward in history */
  canGoForward: boolean
  /** Go back in history */
  goBack: () => void
  /** Go forward in history */
  goForward: () => void
  /** Update right sidebar panel */
  updateRightSidebar: (panel: RightSidebarPanel | undefined) => void
  /** Toggle right sidebar (with optional panel) */
  toggleRightSidebar: (panel?: RightSidebarPanel) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

interface NavigationProviderProps {
  children: ReactNode
  /** Current workspace ID */
  workspaceId: string | null
  /** Session creation handler */
  onCreateSession: (workspaceId: string, options?: import('../../shared/types').CreateSessionOptions) => Promise<Session>
  /** Input change handler for pre-filling chat input */
  onInputChange?: (sessionId: string, value: string) => void
  /** Whether the app is ready to navigate */
  isReady?: boolean
}

export function NavigationProvider({
  children,
  workspaceId,
  onCreateSession,
  onInputChange,
  isReady = true,
}: NavigationProviderProps) {
  const { t } = useLanguage()
  const [, setSession] = useSession()

  // Read session metadata directly from atom (reactive to session changes)
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const sessionMetas = useMemo(() => Array.from(sessionMetaMap.values()), [sessionMetaMap])

  // Read sources from atom (populated by AppShell)
  const sources = useAtomValue(sourcesAtom)

  // Read skills from atom (populated by AppShell)
  const skills = useAtomValue(skillsAtom)

  // UNIFIED NAVIGATION STATE - single source of truth for all 3 panels
  const [navigationState, setNavigationState] = useState<NavigationState>(DEFAULT_NAVIGATION_STATE)

  // Navigation history hook - manages back/forward with custom stack
  const navHistory = useNavigationHistory()

  // Ref to hold the latest navigate function (avoids stale closure in goBack/goForward)
  const navigateRef = useRef<((route: Route) => void | Promise<void>) | null>(null)

  // Queue navigation if not ready yet
  const pendingNavigationRef = useRef<ParsedRoute | null>(null)

  // Helper: Check if a session is "done" (completed or cancelled)
  const isSessionDone = useCallback((session: SessionMeta): boolean => {
    return session.todoState === 'done' || session.todoState === 'cancelled'
  }, [])

  // Helper: Filter sessions by ChatFilter
  const filterSessionsByFilter = useCallback(
    (filter: ChatFilter): SessionMeta[] => {
      return sessionMetas.filter((session) => {
        if (session.hidden) return false
        switch (filter.kind) {
          case 'allChats':
            return true
          case 'flagged':
            return session.isFlagged === true
          case 'state':
            return session.todoState === filter.stateId
          default:
            return false
        }
      })
    },
    [sessionMetas]
  )

  // Helper: Get first session ID for a filter
  const getFirstSessionId = useCallback(
    (filter: ChatFilter): string | null => {
      const filtered = filterSessionsByFilter(filter)
      return filtered[0]?.id ?? null
    },
    [filterSessionsByFilter]
  )

  // Helper: Get first source slug
  const getFirstSourceSlug = useCallback(
    (): string | null => {
      return sources[0]?.config.slug ?? null
    },
    [sources]
  )

  // Helper: Get first skill slug
  const getFirstSkillSlug = useCallback(
    (): string | null => {
      return skills[0]?.slug ?? null
    },
    [skills]
  )

  // Handle action navigation (side effects that don't change navigation state)
  const handleActionNavigation = useCallback(
    async (parsed: ParsedRoute) => {
      console.log('[Navigation] handleActionNavigation called:', { action: parsed.name, workspaceId, params: parsed.params })
      if (!workspaceId) {
        console.warn('[Navigation] handleActionNavigation: workspaceId is null, returning early')
        return
      }

      switch (parsed.name) {
        case 'new-chat': {
          console.log('[Navigation] Creating new chat session...')
          // Create session with optional permission mode and working directory from params
          const createOptions: import('../../shared/types').CreateSessionOptions = {}
          if (parsed.params.mode && ['safe', 'ask', 'allow-all'].includes(parsed.params.mode)) {
            createOptions.permissionMode = parsed.params.mode as 'safe' | 'ask' | 'allow-all'
          }
          // Handle workdir param: 'user_default', 'none', or absolute path
          if (parsed.params.workdir) {
            createOptions.workingDirectory = parsed.params.workdir as 'user_default' | 'none' | string
          }
          // Model override for mini agents (e.g., 'haiku', 'sonnet')
          if (parsed.params.model) {
            createOptions.model = parsed.params.model
          }
          // System prompt preset for mini agents (e.g., 'mini')
          if (parsed.params.systemPrompt) {
            createOptions.systemPromptPreset = parsed.params.systemPrompt as 'default' | 'mini' | string
          }
          const session = await onCreateSession(workspaceId, createOptions)
          console.log('[Navigation] Session created:', session.id)

          // Rename session if name provided
          if (parsed.params.name) {
            await window.electronAPI.sessionCommand(session.id, { type: 'rename', name: parsed.params.name })
          }

          // Update navigation state to show new chat in allChats
          setSession({ selected: session.id })
          setNavigationState({
            navigator: 'chats',
            filter: { kind: 'allChats' },
            details: { type: 'chat', sessionId: session.id },
          })

          // Parse badges from params (JSON-encoded, used for EditPopover context hiding)
          let badges: ContentBadge[] | undefined
          if (parsed.params.badges) {
            try {
              badges = JSON.parse(parsed.params.badges) as ContentBadge[]
            } catch (e) {
              console.warn('[Navigation] Failed to parse badges param:', e)
            }
          }

          // Handle input: either auto-send (if send=true) or pre-fill
          if (parsed.params.input) {
            const shouldSend = parsed.params.send === 'true'
            if (shouldSend) {
              // Auto-send the message immediately after session is ready
              // Pass badges in options so they're stored with the message
              setTimeout(() => {
                window.electronAPI.sendMessage(
                  session.id,
                  parsed.params.input!,
                  undefined, // attachments
                  undefined, // storedAttachments
                  badges ? { badges } : undefined
                )
              }, 100)
            } else if (onInputChange) {
              // Pre-fill input box without sending
              setTimeout(() => {
                onInputChange(session.id, parsed.params.input!)
              }, 100)
            }
          }
          break
        }

        case 'rename-session':
          if (parsed.id && parsed.params.name) {
            await window.electronAPI.sessionCommand(parsed.id, { type: 'rename', name: parsed.params.name })
          }
          break

        case 'delete-session':
          if (parsed.id) {
            await window.electronAPI.deleteSession(parsed.id)
          }
          break

        case 'flag-session':
          if (parsed.id) {
            await window.electronAPI.sessionCommand(parsed.id, { type: 'flag' })
          }
          break

        case 'unflag-session':
          if (parsed.id) {
            await window.electronAPI.sessionCommand(parsed.id, { type: 'unflag' })
          }
          break

        case 'oauth':
          if (parsed.id) {
            await window.electronAPI.startSourceOAuth(workspaceId, parsed.id)
          }
          break

        case 'delete-source':
          if (parsed.id) {
            await window.electronAPI.deleteSource(workspaceId, parsed.id)
          }
          break

        case 'set-mode':
          if (parsed.id && parsed.params.mode) {
            await window.electronAPI.sessionCommand(
              parsed.id,
              { type: 'setPermissionMode', mode: parsed.params.mode as 'safe' | 'ask' | 'allow-all' }
            )
          }
          break

        case 'copy':
          if (parsed.params.text) {
            await navigator.clipboard.writeText(parsed.params.text)
          }
          break

        default:
          console.warn('[Navigation] Unknown action:', parsed.name)
      }
    },
    [workspaceId, onCreateSession, onInputChange, setSession]
  )


  /**
   * Apply navigation state with auto-selection logic
   *
   * When navigating to a filter without explicit details,
   * auto-select the first available item. This ensures the main content
   * panel always shows meaningful content when possible.
   *
   * Returns the final NavigationState (with auto-selection applied if any)
   * so the caller can update the URL with the correct route.
   */
  const applyNavigationState = useCallback(
    (newState: NavigationState): NavigationState => {
      // For chats: auto-select first session if no details provided
      if (isChatsNavigation(newState) && !newState.details) {
        const firstSessionId = getFirstSessionId(newState.filter)
        if (firstSessionId) {
          const stateWithSelection: NavigationState = {
            ...newState,
            details: { type: 'chat', sessionId: firstSessionId },
          }
          setSession({ selected: firstSessionId })
          setNavigationState(stateWithSelection)
          return stateWithSelection
        } else {
          setSession({ selected: null })
          setNavigationState(newState)
          return newState
        }
      }

      // For sources: auto-select first source if no details provided
      if (isSourcesNavigation(newState) && !newState.details) {
        const firstSourceSlug = getFirstSourceSlug()
        if (firstSourceSlug) {
          const stateWithSelection: NavigationState = {
            ...newState,
            details: { type: 'source', sourceSlug: firstSourceSlug },
          }
          setNavigationState(stateWithSelection)
          return stateWithSelection
        } else {
          setNavigationState(newState)
          return newState
        }
      }

      // For skills: auto-select first skill if no details provided
      if (isSkillsNavigation(newState) && !newState.details) {
        const firstSkillSlug = getFirstSkillSlug()
        if (firstSkillSlug) {
          const stateWithSelection: NavigationState = {
            ...newState,
            details: { type: 'skill', skillSlug: firstSkillSlug },
          }
          setNavigationState(stateWithSelection)
          return stateWithSelection
        } else {
          setNavigationState(newState)
          return newState
        }
      }

      // For chats with explicit session: update session selection
      if (isChatsNavigation(newState) && newState.details) {
        setSession({ selected: newState.details.sessionId })
      }

      // Apply state directly
      setNavigationState(newState)
      return newState
    },
    [getFirstSessionId, getFirstSourceSlug, getFirstSkillSlug, setSession]
  )

  // Main navigate function - unified approach using NavigationState
  const navigate = useCallback(
    async (route: Route) => {
      const parsed = parseRoute(route)
      if (!parsed) {
        console.warn('[Navigation] Invalid route:', route)
        return
      }

      if (!isReady) {
        console.log('[Navigation] Queuing navigation (not ready yet):', { route, parsed })
        pendingNavigationRef.current = parsed
        return
      }

      console.log('[Navigation] Navigating (isReady=true):', parsed)

      // Handle actions (side effects)
      if (parsed.type === 'action') {
        await handleActionNavigation(parsed)
        return // Actions handle their own state updates
      }

      // Parse route to unified NavigationState (with sidebar param from current URL)
      const urlParams = new URLSearchParams(window.location.search)
      const sidebarParam = urlParams.get('sidebar') || undefined
      const newNavState = parseRouteToNavigationState(route, sidebarParam)
      let finalRoute = route

      if (newNavState) {
        // Apply navigation state (may auto-select first item)
        const finalState = applyNavigationState(newNavState)

        // Build route from final state (includes auto-selection)
        // This ensures the URL reflects the actual displayed content
        finalRoute = buildRouteFromNavigationState(finalState) as Route
      }

      // Persist route and sidebar in URL for reload restoration
      const url = new URL(window.location.href)
      if (navigationState.rightSidebar) {
        const fullUrl = buildUrlWithState(navigationState)
        url.search = fullUrl
      } else {
        url.searchParams.set('route', finalRoute)
        url.searchParams.delete('sidebar')
      }
      window.history.replaceState({ route: finalRoute }, '', url.toString())

      // Update our custom history stack
      navHistory.pushToHistory(finalRoute)
    },
    [isReady, handleActionNavigation, applyNavigationState, navHistory]
  )

  // Keep navigateRef in sync with latest navigate function
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  // Helper: Check if a route points to a valid session/source/skill
  const isRouteValid = useCallback((route: Route): boolean => {
    const navState = parseRouteToNavigationState(route)
    if (!navState) return true // Non-navigation routes are always valid

    if (isChatsNavigation(navState) && navState.details) {
      const meta = sessionMetaMap.get(navState.details.sessionId)
      return meta != null && !meta.hidden
    }

    if (isSourcesNavigation(navState) && navState.details) {
      return sources.some(s => s.config.slug === navState.details!.sourceSlug)
    }

    if (isSkillsNavigation(navState) && navState.details) {
      return skills.some(s => s.slug === navState.details!.skillSlug)
    }

    return true // Routes without details are always valid
  }, [sessionMetaMap, sources, skills])

  // Go back in history (using our custom stack)
  const goBack = useCallback(() => {
    const route = navHistory.goBack(isRouteValid)
    if (route) {
      navigateRef.current?.(route)
    }
  }, [isRouteValid, navHistory])

  // Go forward in history (using our custom stack)
  const goForward = useCallback(() => {
    const route = navHistory.goForward(isRouteValid)
    if (route) {
      navigateRef.current?.(route)
    }
  }, [isRouteValid, navHistory])

  // Track whether initial route restoration has been attempted
  const initialRouteRestoredRef = useRef(false)

  // Initialize history stack on first load
  useEffect(() => {
    if (!isReady || !workspaceId) return

    const params = new URLSearchParams(window.location.search)
    const initialRoute = (params.get('route') || 'allChats') as Route
    navHistory.initializeHistory(initialRoute)
  }, [isReady, workspaceId, navHistory])

  // Process pending navigation when ready
  useEffect(() => {
    console.log('[Navigation] Pending navigation check:', { isReady, hasPending: !!pendingNavigationRef.current })
    if (isReady && pendingNavigationRef.current) {
      const pending = pendingNavigationRef.current
      pendingNavigationRef.current = null
      console.log('[Navigation] Processing pending navigation:', pending)

      // Handle actions
      if (pending.type === 'action') {
        console.log('[Navigation] Calling handleActionNavigation for pending action:', pending.name)
        handleActionNavigation(pending)
        return
      }

      // For view routes, reconstruct route string and parse to NavigationState
      const navState = parseRouteToNavigationState(`${pending.name}${pending.id ? `/${pending.id}` : ''}`)
      if (navState) {
        applyNavigationState(navState)
      }
    }
  }, [isReady, handleActionNavigation, applyNavigationState])

  // Restore route from URL on startup (for CMD+R reload)
  useEffect(() => {
    if (!isReady || !workspaceId || initialRouteRestoredRef.current) return
    initialRouteRestoredRef.current = true

    const params = new URLSearchParams(window.location.search)
    const initialRoute = params.get('route')
    const sidebarParam = params.get('sidebar') || undefined

    if (initialRoute) {
      console.log('[Navigation] Restoring route from URL:', initialRoute, 'sidebar:', sidebarParam)

      // Parse with sidebar param
      const navState = parseRouteToNavigationState(initialRoute, sidebarParam)
      if (navState) {
        applyNavigationState(navState)
      } else {
        navigate(initialRoute as Route)
      }
    }
  }, [isReady, workspaceId, navigate, applyNavigationState])

  // Listen for deep link navigation events from main process
  useEffect(() => {
    if (!workspaceId) return

    // Helper to process a deep link navigation
    const processDeepLink = (nav: DeepLinkNavigation) => {
      // Convert DeepLinkNavigation to route string and navigate
      let route: string | null = null

      // Compound route format (e.g., 'allChats/chat/abc123', 'settings/shortcuts')
      if (nav.view) {
        route = nav.view
      } else if (nav.action) {
        // Action routes (e.g., 'action/new-chat', 'action/delete-session/abc123')
        route = `action/${nav.action}`
        if (nav.actionParams?.id) {
          route += `/${nav.actionParams.id}`
        }
        const otherParams = { ...nav.actionParams }
        delete otherParams.id
        if (Object.keys(otherParams).length > 0) {
          const params = new URLSearchParams(otherParams)
          route += `?${params.toString()}`
        }
      }

      if (route) {
        // Validate the route before navigating
        const navState = parseRouteToNavigationState(route)
        if (!navState && !route.startsWith('action/')) {
          // Invalid route that isn't an action - show error toast
          toast.error(t('toasts.invalidLink'), {
            description: t('toasts.contentMovedOrDeleted'),
          })
          return
        }
        navigate(route as Route)
      }
    }

    // Pull any pending deep link that was stored before this listener was ready
    // This handles the race condition where the deep link is sent before React mounts
    window.electronAPI.getPendingDeepLink().then((nav) => {
      if (nav) {
        console.log('[Navigation] Got pending deep link:', nav.action || nav.view)
        processDeepLink(nav)
      }
    })

    // Listen for any future deep links
    const cleanup = window.electronAPI.onDeepLinkNavigate((nav: DeepLinkNavigation) => {
      console.log('[Navigation] Deep link received:', nav.action || nav.view)
      processDeepLink(nav)
    })

    return cleanup
  }, [workspaceId, navigate, t])

  // Listen for internal navigation events (from navigate() calls)
  useEffect(() => {
    const handleNavigateEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ route: Route }>
      if (customEvent.detail?.route) {
        navigate(customEvent.detail.route)
      }
    }

    window.addEventListener(NAVIGATE_EVENT, handleNavigateEvent)
    return () => {
      window.removeEventListener(NAVIGATE_EVENT, handleNavigateEvent)
    }
  }, [navigate])

  // Right sidebar navigation helpers
  const updateRightSidebar = useCallback((panel: RightSidebarPanel | undefined) => {
    setNavigationState((prevState) => {
      if (!prevState) return prevState

      const newState = {
        ...prevState,
        rightSidebar: panel,
      }

      // Update URL with sidebar param (side effect, but safe here)
      const url = buildUrlWithState(newState)
      const fullUrl = new URL(window.location.href)
      fullUrl.search = url
      history.replaceState({ route: buildRouteFromNavigationState(newState) }, '', fullUrl.toString())

      return newState
    })
  }, [])

  const toggleRightSidebar = useCallback((panel?: RightSidebarPanel) => {
    setNavigationState((prevState) => {
      if (!prevState) return prevState

      // If panel specified, open to that panel
      // If no panel, toggle between closed and default panel (sessionMetadata)
      const newPanel = panel || (prevState.rightSidebar && prevState.rightSidebar.type !== 'none'
        ? { type: 'none' as const }
        : { type: 'sessionMetadata' as const })

      const newState = {
        ...prevState,
        rightSidebar: newPanel,
      }

      // Update URL with sidebar param
      const url = buildUrlWithState(newState)
      const fullUrl = new URL(window.location.href)
      fullUrl.search = url
      history.replaceState({ route: buildRouteFromNavigationState(newState) }, '', fullUrl.toString())

      return newState
    })
  }, [])

  return (
    <NavigationContext.Provider
      value={{
        navigate,
        isReady,
        navigationState,
        canGoBack: navHistory.canGoBack,
        canGoForward: navHistory.canGoForward,
        goBack,
        goForward,
        updateRightSidebar,
        toggleRightSidebar,
      }}
    >
      {children}
    </NavigationContext.Provider>
  )
}

/**
 * Hook to access navigation functions
 */
export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

/**
 * Hook to access just the navigation state
 */
export function useNavigationState(): NavigationState {
  const { navigationState } = useNavigation()
  return navigationState
}
