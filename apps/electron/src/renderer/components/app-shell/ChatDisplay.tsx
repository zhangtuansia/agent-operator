import * as React from "react"
import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Info,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { cn } from "@/lib/utils"
import { Markdown, CollapsibleMarkdownProvider, StreamingMarkdown, type RenderMode } from "@/components/markdown"
import { AnimatedCollapsibleContent } from "@/components/ui/collapsible"
import {
  Spinner,
  parseReadResult,
  parseBashResult,
  parseGrepResult,
  parseGlobResult,
  extractOverlayData,
  CodePreviewOverlay,
  DiffPreviewOverlay,
  MultiDiffPreviewOverlay,
  TerminalPreviewOverlay,
  GenericOverlay,
  JSONPreviewOverlay,
  type ActivityItem,
  type OverlayData,
  type FileChange,
} from "@agent-operator/ui"
import { useFocusZone } from "@/hooks/keyboard"
import { useTheme } from "@/hooks/useTheme"
import { useLanguage } from "@/context/LanguageContext"
import { useTranslation } from "@/i18n"
import type { Session, Message, FileAttachment, StoredAttachment, PermissionRequest, CredentialRequest, CredentialResponse, LoadedSource, LoadedSkill } from "../../../shared/types"
import type { LabelConfig } from '@agent-operator/shared/labels'
import { extractLabelId } from '@agent-operator/shared/labels'
import type { PermissionMode } from "@agent-operator/shared/agent/modes"
import type { ThinkingLevel } from "@agent-operator/shared/agent/thinking-levels"
import { TurnCard, UserMessageBubble, groupMessagesByTurn, formatTurnAsMarkdown, formatActivityAsMarkdown, type Turn, type AssistantTurn, type UserTurn, type SystemTurn, type AuthRequestTurn } from "@agent-operator/ui"
import { MemoizedAuthRequestCard } from "@/components/chat/AuthRequestCard"
import { ActiveOptionBadges } from "./ActiveOptionBadges"
import { LabelBadgeRow } from "@/components/ui/label-badge-row"
import { InputContainer, type StructuredInputState, type StructuredResponse, type PermissionResponse } from "./input"
import type { RichTextInputHandle } from "@/components/ui/rich-text-input"
import { useBackgroundTasks } from "@/hooks/useBackgroundTasks"
import { CHAT_LAYOUT } from "@/config/layout"
import { ProcessingIndicator, ScrollOnMount } from "./ProcessingIndicator"

// ============================================================================
// Overlay State Types
// ============================================================================

/** State for multi-diff overlay (Edit/Write activities) */
interface MultiDiffOverlayState {
  type: 'multi-diff'
  changes: FileChange[]
  consolidated: boolean
  focusedChangeId?: string
}

/** State for markdown overlay (pop-out, turn details, generic activities) */
interface MarkdownOverlayState {
  type: 'markdown'
  content: string
  title: string
}

/** Union of all overlay states, or null for no overlay */
type OverlayState =
  | { type: 'activity'; activity: ActivityItem }
  | MultiDiffOverlayState
  | MarkdownOverlayState
  | null

interface ChatDisplayProps {
  session: Session | null
  onSendMessage: (message: string, attachments?: FileAttachment[], skillSlugs?: string[]) => void
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
  // Model selection
  currentModel: string
  onModelChange: (model: string) => void
  /** Ref for the input, used for external focus control */
  textareaRef?: React.RefObject<RichTextInputHandle>
  /** When true, disables input (e.g., when agent needs activation) */
  disabled?: boolean
  /** Pending permission request for this session */
  pendingPermission?: PermissionRequest
  /** Callback to respond to permission request */
  onRespondToPermission?: (sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) => void
  /** Pending credential request for this session */
  pendingCredential?: CredentialRequest
  /** Callback to respond to credential request */
  onRespondToCredential?: (sessionId: string, requestId: string, response: CredentialResponse) => void
  // Thinking level (session-level setting)
  /** Current thinking level ('off', 'think', 'max') */
  thinkingLevel?: ThinkingLevel
  /** Callback when thinking level changes */
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  // Advanced options
  /** Enable ultrathink mode for extended reasoning */
  ultrathinkEnabled?: boolean
  onUltrathinkChange?: (enabled: boolean) => void
  /** Current permission mode */
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  /** Enabled permission modes for Shift+Tab cycling */
  enabledModes?: PermissionMode[]
  // Input value preservation (controlled from parent)
  /** Current input value - preserved across mode switches and conversation changes */
  inputValue?: string
  /** Callback when input value changes */
  onInputChange?: (value: string) => void
  // Source selection
  /** Available sources (enabled only) */
  sources?: LoadedSource[]
  /** Callback when source selection changes */
  onSourcesChange?: (slugs: string[]) => void
  // Skill selection (for @mentions)
  /** Available skills for @mention autocomplete */
  skills?: LoadedSkill[]
  // Label selection (for #labels)
  /** Available label configs (tree) for label menu and badge display */
  labels?: LabelConfig[]
  /** Callback when labels change */
  onLabelsChange?: (labels: string[]) => void
  /** Workspace ID for loading skill icons */
  workspaceId?: string
  // Working directory (per session)
  /** Current working directory for this session */
  workingDirectory?: string
  /** Callback when working directory changes */
  onWorkingDirectoryChange?: (path: string) => void
  /** Session folder path (for "Reset to Session Root" option) */
  sessionFolderPath?: string
  // Lazy loading
  /** When true, messages are still loading - show spinner in messages area */
  messagesLoading?: boolean
  // Tutorial
  /** Disable send action (for tutorial guidance) */
  disableSend?: boolean
  // Search highlighting (from session list search)
  /** Search query for highlighting matches */
  searchQuery?: string
  /** Whether search mode is active (prevents focus stealing to chat input) */
  isSearchModeActive?: boolean
  /** Callback when match count changes */
  onMatchCountChange?: (count: number) => void
  /** Callback when match info (count and index) changes */
  onMatchInfoChange?: (info: { count: number; index: number }) => void
  /** Optional placeholder override for input */
  placeholder?: string | string[]
  /** Optional compact rendering hint for embedded use cases */
  compactMode?: boolean
  /** Optional label for embedded empty state contexts */
  emptyStateLabel?: string
}

/**
 * ChatDisplay - Main chat interface for a selected session
 *
 * Structure:
 * - Session Header: Avatar + workspace name
 * - Messages Area: Scrollable list of MessageBubble components
 * - Input Area: Textarea + Send button
 *
 * Shows empty state when no session is selected
 */
export function ChatDisplay({
  session,
  onSendMessage,
  onOpenFile,
  onOpenUrl,
  currentModel,
  onModelChange,
  textareaRef: externalTextareaRef,
  disabled = false,
  pendingPermission,
  onRespondToPermission,
  pendingCredential,
  onRespondToCredential,
  // Thinking level
  thinkingLevel = 'think',
  onThinkingLevelChange,
  // Advanced options
  ultrathinkEnabled = false,
  onUltrathinkChange,
  permissionMode = 'ask',
  onPermissionModeChange,
  enabledModes,
  // Input value preservation
  inputValue,
  onInputChange,
  // Sources
  sources,
  onSourcesChange,
  // Skills (for @mentions)
  skills,
  // Labels (for #labels and badge row)
  labels = [],
  onLabelsChange,
  workspaceId,
  // Working directory
  workingDirectory,
  onWorkingDirectoryChange,
  sessionFolderPath,
  // Lazy loading
  messagesLoading = false,
  // Tutorial
  disableSend = false,
  // Search highlighting
  searchQuery: externalSearchQuery = '',
  isSearchModeActive = false,
  onMatchCountChange,
  onMatchInfoChange,
  // Optional input placeholder override (supports rotating placeholder arrays)
  placeholder: inputPlaceholder,
  // Compact mode (for EditPopover embedding)
  compactMode = false,
  emptyStateLabel,
}: ChatDisplayProps) {
  // Input is only disabled when explicitly disabled (e.g., agent needs activation)
  // User can type during streaming - submitting will stop the stream and send
  const isInputDisabled = disabled
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const scrollViewportRef = React.useRef<HTMLDivElement>(null)
  const prevSessionIdRef = React.useRef<string | null>(null)
  // Reverse pagination: show last N turns initially, load more on scroll up
  const TURNS_PER_PAGE = 20
  const [visibleTurnCount, setVisibleTurnCount] = React.useState(TURNS_PER_PAGE)
  // Sticky-bottom: When true, auto-scroll on content changes. Toggled by user scroll behavior.
  const isStickToBottomRef = React.useRef(true)
  // Skip smooth scroll briefly after session switch (instant scroll already happened)
  const skipSmoothScrollUntilRef = React.useRef(0)
  const internalTextareaRef = React.useRef<RichTextInputHandle>(null)
  const textareaRef = externalTextareaRef || internalTextareaRef

  // Get isDark from useTheme hook for overlay theme
  // This accounts for scenic themes (like Haze) that force dark mode
  const { isDark } = useTheme()

  // i18n for translations
  const { t } = useLanguage()
  const overlayHeaderTranslations = useMemo(() => ({
    open: t('fileViewer.openWithDefaultApp'),
    revealInFinder: t('fileViewer.showInFinder'),
    copyAll: t('actions.copy'),
    copied: t('actions.copied'),
    closeTitle: `${t('common.close')} (Esc)`,
  }), [t])
  const terminalOutputTranslations = useMemo(() => ({
    command: t('terminalOutput.command'),
    output: t('terminalOutput.output'),
    copyCommand: t('terminalOutput.copyCommand'),
    copyOutput: t('terminalOutput.copyOutput'),
    copied: t('actions.copied'),
    noOutput: t('terminalOutput.noOutput'),
  }), [t])

  // Register as focus zone - when zone gains focus, focus the textarea
  const { zoneRef, isFocused } = useFocusZone({
    zoneId: 'chat',
    focusFirst: () => {
      textareaRef.current?.focus()
    },
  })

  // Background tasks management
  const { tasks: backgroundTasks, killTask } = useBackgroundTasks({
    sessionId: session?.id ?? ''
  })

  // ============================================================================
  // Search Highlighting (from session list search)
  // ============================================================================

  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0)
  const turnRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const [actualMatchIds, setActualMatchIds] = React.useState<Set<string>>(new Set())
  const highlightedTurnIdsRef = React.useRef<Set<string>>(new Set())
  const prevHighlightContextRef = React.useRef<{ searchQuery: string; sessionId: string | null }>({
    searchQuery: '',
    sessionId: null,
  })
  // Only scroll when explicitly requested (single match or match navigation).
  const shouldScrollToMatchRef = React.useRef(false)
  const prevSessionIdForScrollRef = React.useRef<string | null>(null)

  const searchQuery = externalSearchQuery || ''
  const isSearchActive = Boolean(searchQuery.trim())

  // Focus textarea when zone gains focus via keyboard.
  // Avoid stealing focus while session list search mode is active.
  useEffect(() => {
    if (session?.id && !isSearchModeActive && isFocused) {
      textareaRef.current?.focus()
    }
  }, [session?.id, isFocused, isSearchModeActive, textareaRef])

  // ============================================================================
  // Overlay State Management
  // ============================================================================

  // Overlay state - controls which overlay is shown (if any)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)

  // Close overlay handler
  const handleCloseOverlay = useCallback(() => {
    setOverlayState(null)
  }, [])

  // Extract overlay data for activity-based overlays
  // Uses the shared extractOverlayData parser from @agent-operator/ui
  const overlayData: OverlayData | null = useMemo(() => {
    if (!overlayState || overlayState.type !== 'activity') return null
    return extractOverlayData(overlayState.activity)
  }, [overlayState])

  // Pop-out handler - opens message in overlay (read-only markdown)
  const handlePopOut = useCallback((message: Message) => {
    if (!session) return
    setOverlayState({
      type: 'markdown',
      content: message.content,
      title: 'Message Preview',
    })
  }, [session])

  // Ref to track total turn count for scroll handler
  const totalTurnCountRef = React.useRef(0)

  // Track scroll position to toggle sticky-bottom behavior
  // - User scrolls up → unstick (stop auto-scrolling)
  // - User scrolls back to bottom → re-stick (resume auto-scrolling)
  // Also handles loading more turns when scrolling near top
  const handleScroll = React.useCallback(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    // 20px threshold for "at bottom" detection
    isStickToBottomRef.current = distanceFromBottom < 20

    // Load more turns when scrolling near top (within 100px)
    if (scrollTop < 100) {
      setVisibleTurnCount(prev => {
        // Check if there are more turns to load
        const currentStartIndex = Math.max(0, totalTurnCountRef.current - prev)
        if (currentStartIndex <= 0) return prev // Already showing all

        // Remember scroll height before adding more items
        const prevScrollHeight = viewport.scrollHeight

        // Schedule scroll position adjustment after render
        requestAnimationFrame(() => {
          const newScrollHeight = viewport.scrollHeight
          viewport.scrollTop = newScrollHeight - prevScrollHeight + scrollTop
        })

        return prev + TURNS_PER_PAGE
      })
    }
  }, [])

  // Set up scroll event listener
  React.useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Auto-scroll using ResizeObserver for streaming content
  // Initial scroll is handled by ScrollOnMount (useLayoutEffect, before paint)
  React.useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return

    const isSessionSwitch = prevSessionIdRef.current !== session?.id
    prevSessionIdRef.current = session?.id ?? null

    // On session switch: reset UI state (scroll handled by ScrollOnMount)
    if (isSessionSwitch) {
      isStickToBottomRef.current = true
      setVisibleTurnCount(TURNS_PER_PAGE)
    }

    // Debounced scroll for streaming - waits for layout to settle
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const resizeObserver = new ResizeObserver(() => {
      if (!isStickToBottomRef.current) return

      // Clear pending scroll and wait for layout to settle
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        // Skip smooth scroll if we just did an instant scroll (session switch/lazy load)
        if (Date.now() < skipSmoothScrollUntilRef.current) return
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    })

    // Observe the scroll content container (first child of viewport)
    const content = viewport.firstElementChild
    if (content) {
      resizeObserver.observe(content)
    }

    return () => {
      resizeObserver.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [session?.id])

  // Handle message submission from InputContainer
  // Backend handles interruption and queueing if currently processing
  const handleSubmit = (message: string, attachments?: FileAttachment[], skillSlugs?: string[]) => {
    // Force stick-to-bottom when user sends a message
    isStickToBottomRef.current = true
    onSendMessage(message, attachments, skillSlugs)

    // Immediately scroll to bottom after sending - use requestAnimationFrame
    // to ensure the DOM has updated with the new message
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  // Handle stop request from InputContainer
  // silent=true when redirecting (sending new message), silent=false when user clicks Stop button
  const handleStop = (silent = false) => {
    if (!session?.isProcessing) return
    window.electronAPI.cancelProcessing(session.id, silent).catch(error => {
      console.error('[ChatDisplay] Failed to cancel processing:', error)
    })
  }

  // Handle structured input responses (permissions and credentials)
  const handleStructuredResponse = (response: StructuredResponse) => {
    if (response.type === 'permission' && pendingPermission && onRespondToPermission) {
      const permResponse = response as PermissionResponse
      onRespondToPermission(
        pendingPermission.sessionId,
        pendingPermission.requestId,
        permResponse.allowed,
        permResponse.alwaysAllow
      )
    } else if (response.type === 'credential' && pendingCredential && onRespondToCredential) {
      const credResponse = response as CredentialResponse
      onRespondToCredential(
        pendingCredential.sessionId,
        pendingCredential.requestId,
        credResponse
      )
    }
  }

  // Build structured input state from pending requests (permissions take priority)
  const structuredInput: StructuredInputState | undefined = React.useMemo(() => {
    if (pendingPermission) {
      return { type: 'permission', data: pendingPermission }
    }
    if (pendingCredential) {
      return { type: 'credential', data: pendingCredential }
    }
    return undefined
  }, [pendingPermission, pendingCredential])

  // Memoize turn grouping - avoids O(n) iteration on every render/keystroke
  const sessionMessages = session?.messages
  const deferredSessionMessages = useDeferredValue(sessionMessages)
  const allTurns = React.useMemo(() => {
    if (!deferredSessionMessages) return []
    return groupMessagesByTurn(deferredSessionMessages)
  }, [deferredSessionMessages])

  // Helper to count occurrences of a substring.
  const countOccurrences = useCallback((text: string, query: string): number => {
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    let count = 0
    let pos = 0
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      count++
      pos += lowerQuery.length
    }
    return count
  }, [])

  // Reset match state when session or search query changes.
  useEffect(() => {
    const isSessionSwitch = prevSessionIdForScrollRef.current !== null && prevSessionIdForScrollRef.current !== session?.id
    prevSessionIdForScrollRef.current = session?.id ?? null

    if (isSessionSwitch && isSearchActive) {
      shouldScrollToMatchRef.current = true
    }

    setCurrentMatchIndex(0)
    setActualMatchIds(new Set())
    turnRefs.current.clear()
  }, [session?.id, searchQuery, isSearchActive])

  // Find all individual match occurrences (not just matching turns).
  const matchingOccurrences = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    const matches: { matchId: string; turnId: string; turnIndex: number }[] = []

    for (let turnIndex = 0; turnIndex < allTurns.length; turnIndex++) {
      const turn = allTurns[turnIndex]
      let textContent = ''
      let turnId = ''

      if (turn.type === 'user') {
        turnId = `user-${turn.message.id}`
        const content = turn.message.content as unknown
        if (typeof content === 'string') {
          textContent = content
        } else if (Array.isArray(content)) {
          textContent = content
            .filter((block: { type?: string }) => block.type === 'text')
            .map((block: { text?: string }) => block.text || '')
            .join('\n')
        }
      } else if (turn.type === 'assistant') {
        turnId = `turn-${turn.turnId}`
        if (turn.response?.text) {
          textContent = turn.response.text
        }
      } else if (turn.type === 'system') {
        turnId = `system-${turn.message.id}`
        textContent = turn.message.content
      } else {
        continue
      }

      const occurrenceCount = countOccurrences(textContent, query)
      for (let i = 0; i < occurrenceCount; i++) {
        matches.push({
          matchId: `${turnId}-match-${i}`,
          turnId,
          turnIndex,
        })
      }
    }

    return matches
  }, [allTurns, searchQuery, countOccurrences])

  // Auto-expand pagination when search is active so match counts are stable.
  useEffect(() => {
    if (!isSearchActive || matchingOccurrences.length === 0) return
    const earliestMatchTurnIndex = Math.min(...matchingOccurrences.map(m => m.turnIndex))
    const requiredVisibleCount = allTurns.length - earliestMatchTurnIndex + 5
    if (requiredVisibleCount > visibleTurnCount) {
      setVisibleTurnCount(requiredVisibleCount)
    }
  }, [allTurns.length, isSearchActive, matchingOccurrences, visibleTurnCount])

  const matchingTurnIds = useMemo(() => {
    return Array.from(new Set(matchingOccurrences.map(m => m.turnId)))
  }, [matchingOccurrences])

  // Before highlighting runs, use potential matches; after highlighting, use actual DOM matches.
  const validMatches = useMemo(() => {
    if (actualMatchIds.size === 0) return matchingOccurrences
    return matchingOccurrences.filter(m => actualMatchIds.has(m.matchId))
  }, [matchingOccurrences, actualMatchIds])

  // Auto-scroll to a single match.
  useEffect(() => {
    if (validMatches.length === 1 && isSearchActive) {
      shouldScrollToMatchRef.current = true
    }
  }, [validMatches.length, isSearchActive])

  // Scroll to active match when requested.
  useEffect(() => {
    if (!shouldScrollToMatchRef.current) return
    if (validMatches.length === 0 || currentMatchIndex >= validMatches.length) return

    const matchData = validMatches[currentMatchIndex]
    const { matchId, turnIndex } = matchData
    const totalTurns = totalTurnCountRef.current
    const currentStartIndex = Math.max(0, totalTurns - visibleTurnCount)

    if (turnIndex < currentStartIndex) {
      const newVisibleCount = totalTurns - turnIndex + 5
      setVisibleTurnCount(newVisibleCount)
      return
    }

    let attempts = 0
    const maxAttempts = 5

    const tryScroll = () => {
      const matchEl = document.getElementById(matchId) as HTMLElement | null
      if (matchEl) {
        const rect = matchEl.getBoundingClientRect()
        const buffer = 128
        const isVisible = rect.top >= buffer && rect.bottom <= window.innerHeight - buffer
        if (!isVisible) {
          matchEl.scrollIntoView({ behavior: 'instant', block: 'center' })
        }
        matchEl.classList.remove('bg-yellow-300/30')
        matchEl.classList.add('bg-yellow-300', 'shadow-tinted', 'text-black/90', 'ring-1', 'ring-yellow-500')
        ;(matchEl as HTMLElement).style.setProperty('--shadow-color', '90, 50, 5')
        document.querySelectorAll('mark.search-highlight.bg-yellow-300').forEach(el => {
          if (el.id !== matchId) {
            el.classList.remove('bg-yellow-300', 'shadow-tinted', 'text-black/90', 'ring-1', 'ring-yellow-500')
            el.classList.add('bg-yellow-300/30')
            ;(el as HTMLElement).style.removeProperty('--shadow-color')
          }
        })
        shouldScrollToMatchRef.current = false
      } else if (attempts < maxAttempts) {
        attempts++
        setTimeout(tryScroll, 50)
      } else {
        shouldScrollToMatchRef.current = false
      }
    }

    const rafId = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(rafId)
  }, [validMatches, currentMatchIndex, visibleTurnCount])

  // Text highlighting within message content using DOM marks.
  useEffect(() => {
    const clearHighlights = () => {
      const existingMarks = document.querySelectorAll('mark.search-highlight')
      existingMarks.forEach(mark => {
        const parent = mark.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
          parent.normalize()
        }
      })
    }

    const prevContext = prevHighlightContextRef.current
    const contextChanged = prevContext.searchQuery !== searchQuery || prevContext.sessionId !== session?.id
    prevHighlightContextRef.current = { searchQuery, sessionId: session?.id ?? null }

    if (contextChanged) {
      clearHighlights()
      setActualMatchIds(new Set())
      highlightedTurnIdsRef.current = new Set()
    }

    if (!searchQuery.trim() || !isSearchActive) return

    const query = searchQuery.toLowerCase()
    const createdMatchIds: string[] = []

    const applyHighlights = () => {
      const matchingTurnIdSet = new Set(matchingTurnIds)

      turnRefs.current.forEach((container, turnId) => {
        if (!matchingTurnIdSet.has(turnId)) return
        if (highlightedTurnIdsRef.current.has(turnId)) return
        highlightedTurnIdsRef.current.add(turnId)

        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement
              if (!parent) return NodeFilter.FILTER_REJECT
              const tagName = parent.tagName.toLowerCase()
              if (tagName === 'script' || tagName === 'style' || tagName === 'mark') {
                return NodeFilter.FILTER_REJECT
              }
              if (parent.closest('[data-search-exclude="true"]')) {
                return NodeFilter.FILTER_REJECT
              }
              if (node.textContent?.toLowerCase().includes(query)) {
                return NodeFilter.FILTER_ACCEPT
              }
              return NodeFilter.FILTER_REJECT
            }
          }
        )

        const textNodes: Text[] = []
        let currentNode: Node | null
        while ((currentNode = walker.nextNode())) {
          textNodes.push(currentNode as Text)
        }

        const allMatches: { textNode: Text; start: number; end: number }[] = []
        for (const textNode of textNodes) {
          const text = textNode.textContent || ''
          const lowerText = text.toLowerCase()
          let pos = 0
          let matchPos = lowerText.indexOf(query, pos)
          while (matchPos !== -1) {
            allMatches.push({ textNode, start: matchPos, end: matchPos + query.length })
            pos = matchPos + query.length
            matchPos = lowerText.indexOf(query, pos)
          }
        }

        let reverseCounter = allMatches.length - 1
        for (let i = textNodes.length - 1; i >= 0; i--) {
          const textNode = textNodes[i]
          const text = textNode.textContent || ''
          const lowerText = text.toLowerCase()
          const nodeMatches: number[] = []

          let pos = 0
          let matchPos = lowerText.indexOf(query, pos)
          while (matchPos !== -1) {
            nodeMatches.push(matchPos)
            pos = matchPos + query.length
            matchPos = lowerText.indexOf(query, pos)
          }

          if (nodeMatches.length === 0) continue

          let lastIndex = text.length
          const fragments: (string | HTMLElement)[] = []

          for (let j = nodeMatches.length - 1; j >= 0; j--) {
            const matchStart = nodeMatches[j]
            const matchEnd = matchStart + query.length

            if (matchEnd < lastIndex) {
              fragments.unshift(text.slice(matchEnd, lastIndex))
            }

            const mark = document.createElement('mark')
            const matchIdIndex = reverseCounter - (nodeMatches.length - 1 - j)
            const markId = `${turnId}-match-${matchIdIndex}`
            mark.id = markId
            mark.className = 'search-highlight bg-yellow-300/30 rounded-[2px]'
            mark.textContent = text.slice(matchStart, matchEnd)
            fragments.unshift(mark)
            createdMatchIds.push(markId)

            lastIndex = matchStart
          }

          reverseCounter -= nodeMatches.length

          if (lastIndex > 0) {
            fragments.unshift(text.slice(0, lastIndex))
          }

          if (fragments.length > 0 && textNode.parentNode) {
            const parent = textNode.parentNode
            fragments.forEach(frag => {
              if (typeof frag === 'string') {
                parent.insertBefore(document.createTextNode(frag), textNode)
              } else {
                parent.insertBefore(frag, textNode)
              }
            })
            parent.removeChild(textNode)
          }
        }
      })
    }

    let attempts = 0
    const maxAttempts = 5
    let highlightTimeoutId: ReturnType<typeof setTimeout> | null = null

    const tryHighlight = () => {
      if (matchingTurnIds.length === 0) return
      const unhighlightedMatchingInRefs = matchingTurnIds.filter(id =>
        turnRefs.current.has(id) && !highlightedTurnIdsRef.current.has(id)
      ).length
      if (unhighlightedMatchingInRefs > 0) {
        applyHighlights()
        setActualMatchIds(prev => {
          const merged = new Set(prev)
          createdMatchIds.forEach(id => merged.add(id))
          return merged
        })
      } else if (attempts < maxAttempts) {
        attempts++
        highlightTimeoutId = setTimeout(tryHighlight, 100)
      }
    }

    const timeoutId = setTimeout(tryHighlight, 50)
    return () => {
      clearTimeout(timeoutId)
      if (highlightTimeoutId) clearTimeout(highlightTimeoutId)
    }
  }, [searchQuery, isSearchActive, matchingTurnIds, session?.id, visibleTurnCount])

  useEffect(() => {
    onMatchCountChange?.(validMatches.length)
  }, [validMatches.length, onMatchCountChange])

  useEffect(() => {
    onMatchInfoChange?.({ count: validMatches.length, index: currentMatchIndex })
  }, [validMatches.length, currentMatchIndex, onMatchInfoChange])

  // Keep ref in sync for scroll handler
  totalTurnCountRef.current = allTurns.length

  // Reverse pagination: only render last N turns for fast initial render
  const startIndex = Math.max(0, allTurns.length - visibleTurnCount)
  const turns = allTurns.slice(startIndex)
  const hasMoreAbove = startIndex > 0

  return (
    <div ref={zoneRef} className="flex h-full flex-col min-w-0" data-focus-zone="chat">
      {session ? (
        <div className="flex flex-1 flex-col min-h-0 min-w-0 relative">
          {/* Content layer */}
          <div className="flex flex-1 flex-col min-h-0 min-w-0 relative z-10">
          {/* === MESSAGES AREA: Scrollable list of message bubbles === */}
          <div className="relative flex-1 min-h-0">
            {/* Mask wrapper - fades content at top and bottom over transparent/image backgrounds */}
            <div
              className="h-full"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 32px, black calc(100% - 32px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 32px, black calc(100% - 32px), transparent 100%)'
              }}
            >
              <ScrollArea className="h-full min-w-0" viewportRef={scrollViewportRef}>
              <div className={cn(CHAT_LAYOUT.maxWidth, "mx-auto", CHAT_LAYOUT.containerPadding, CHAT_LAYOUT.messageSpacing, "min-w-0")}>
                {/* Session-level AnimatePresence: Prevents layout jump when switching sessions */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={session?.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1, ease: 'easeOut' }}
                  >
                    {/* Loading/Content AnimatePresence: Handles spinner ↔ content transition */}
                    <AnimatePresence mode="wait" initial={false}>
                    {messagesLoading ? (
                      /* Loading State: Show spinner while messages are being lazy loaded */
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="flex items-center justify-center h-64"
                      >
                        <Spinner className="text-foreground/30" />
                      </motion.div>
                    ) : (
                    /* Turn-based Message Display - memoized to avoid re-grouping on every render */
                    /* AnimatePresence handles the fade-in animation when transitioning from loading */
                    <motion.div
                      key={`loaded-${session?.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1, ease: 'easeOut' }}
                    >
                  {/* Scroll to bottom before paint - fires via useLayoutEffect */}
                  <ScrollOnMount
                    targetRef={messagesEndRef}
                    onScroll={() => {
                      skipSmoothScrollUntilRef.current = Date.now() + 500
                    }}
                  />
                  {/* Load more indicator - shown when there are older messages */}
                  {hasMoreAbove && (
                    <div className="text-center text-muted-foreground/60 text-xs py-3 select-none">
                      ↑ Scroll up for earlier messages ({startIndex} more)
                    </div>
                  )}
                  {compactMode && turns.length === 0 && emptyStateLabel && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      {emptyStateLabel}
                    </div>
                  )}
                  {turns.map((turn, index) => {
                    // User turns - render with MemoizedMessageBubble
                    // Extra padding creates visual separation from AI responses
                    if (turn.type === 'user') {
                      const turnRefId = `user-${turn.message.id}`
                      return (
                        <div
                          key={turnRefId}
                          ref={(el) => {
                            if (el) turnRefs.current.set(turnRefId, el)
                            else turnRefs.current.delete(turnRefId)
                          }}
                          className={CHAT_LAYOUT.userMessagePadding}
                        >
                          <MemoizedMessageBubble
                            message={turn.message}
                            onOpenFile={onOpenFile}
                            onOpenUrl={onOpenUrl}
                          />
                        </div>
                      )
                    }

                    // System turns (error, status, info, warning) - render with MemoizedMessageBubble
                    if (turn.type === 'system') {
                      const turnRefId = `system-${turn.message.id}`
                      return (
                        <div
                          key={turnRefId}
                          ref={(el) => {
                            if (el) turnRefs.current.set(turnRefId, el)
                            else turnRefs.current.delete(turnRefId)
                          }}
                        >
                          <MemoizedMessageBubble
                            message={turn.message}
                            onOpenFile={onOpenFile}
                            onOpenUrl={onOpenUrl}
                          />
                        </div>
                      )
                    }

                    // Auth-request turns - render inline auth UI
                    // mt-2 matches ResponseCard spacing for visual consistency
                    if (turn.type === 'auth-request') {
                      // Interactive only if no user message follows
                      const isAuthInteractive = !turns.slice(index + 1).some(t => t.type === 'user')
                      return (
                        <div key={`auth-${turn.message.id}`} className="mt-2">
                          <MemoizedAuthRequestCard
                            message={turn.message}
                            sessionId={session.id}
                            onRespondToCredential={onRespondToCredential}
                            isInteractive={isAuthInteractive}
                          />
                        </div>
                      )
                    }

                    // Check if this is the last response (for Accept Plan button visibility)
                    const isLastResponse = index === turns.length - 1 || !turns.slice(index + 1).some(t => t.type === 'user')

                    // Assistant turns - render with TurnCard (buffered streaming)
                    const turnRefId = `turn-${turn.turnId}`
                    return (
                      <div
                        key={turnRefId}
                        ref={(el) => {
                          if (el) turnRefs.current.set(turnRefId, el)
                          else turnRefs.current.delete(turnRefId)
                        }}
                      >
                        <ErrorBoundary level="component" resetKey={turn.turnId}>
                        <TurnCard
                          sessionId={session.id}
                          turnId={turn.turnId}
                          activities={turn.activities}
                          response={turn.response}
                          intent={turn.intent}
                          isStreaming={turn.isStreaming}
                          isComplete={turn.isComplete}
                          todos={turn.todos}
                          onOpenFile={onOpenFile}
                          onOpenUrl={onOpenUrl}
                          isLastResponse={isLastResponse}
                          translations={{
                            copy: t('turnCard.copy'),
                            copied: t('turnCard.copied'),
                            viewAsMarkdown: t('turnCard.viewAsMarkdown'),
                            typeFeedbackOr: t('turnCard.typeFeedbackOr'),
                            plan: t('turnCard.plan'),
                            viewFullscreen: t('turnCard.viewFullscreen'),
                            closeTitle: `${t('common.close')} (Esc)`,
                            acceptPlan: t('turnCard.acceptPlan'),
                            accept: t('turnCard.accept'),
                            acceptDescription: t('turnCard.acceptDescription'),
                            acceptCompact: t('turnCard.acceptCompact'),
                            acceptCompactDescription: t('turnCard.acceptCompactDescription'),
                          }}
                          onAcceptPlan={() => {
                            window.dispatchEvent(new CustomEvent('cowork:approve-plan', {
                              detail: { text: 'Plan approved, please execute.', sessionId: session?.id }
                            }))
                          }}
                          onAcceptPlanWithCompact={() => {
                            // Find the most recent plan message to get its path
                            // After compaction, Claude needs to know which plan file to read
                            const planMessage = session?.messages.findLast(m => m.role === 'plan')
                            const planPath = planMessage?.planPath

                            // Dispatch event to compact conversation first, then execute plan
                            // FreeFormInput handles this by sending /compact, waiting for completion,
                            // then sending a message with the plan path for Claude to read and execute
                            window.dispatchEvent(new CustomEvent('cowork:approve-plan-with-compact', {
                              detail: { sessionId: session?.id, planPath }
                            }))
                          }}
                          onPopOut={(text) => {
                            // Open response text in markdown overlay
                            setOverlayState({
                              type: 'markdown',
                              content: text,
                              title: t('chatDisplay.responsePreview'),
                            })
                          }}
                          onOpenDetails={() => {
                            // Open turn details in markdown overlay
                            const markdown = formatTurnAsMarkdown(turn)
                            setOverlayState({
                              type: 'markdown',
                              content: markdown,
                              title: t('chatDisplay.turnDetails'),
                            })
                          }}
                          onOpenActivityDetails={(activity) => {
                          // Edit/Write tool → Multi-file diff overlay (ungrouped, focused on this change)
                          if (activity.toolName === 'Edit' || activity.toolName === 'Write') {
                            // Collect all Edit/Write activities from this turn for context
                            const changes: FileChange[] = []
                            for (const a of turn.activities) {
                              const actInput = a.toolInput as Record<string, unknown> | undefined
                              if (a.toolName === 'Edit' && actInput) {
                                changes.push({
                                  id: a.id,
                                  filePath: (actInput.file_path as string) || 'unknown',
                                  toolType: 'Edit',
                                  original: (actInput.old_string as string) || '',
                                  modified: (actInput.new_string as string) || '',
                                  error: a.error || undefined,
                                })
                              } else if (a.toolName === 'Write' && actInput) {
                                changes.push({
                                  id: a.id,
                                  filePath: (actInput.file_path as string) || 'unknown',
                                  toolType: 'Write',
                                  original: '',
                                  modified: (actInput.content as string) || '',
                                  error: a.error || undefined,
                                })
                              }
                            }

                            if (changes.length > 0) {
                              setOverlayState({
                                type: 'multi-diff',
                                changes,
                                consolidated: false, // Ungrouped mode - show individual changes
                                focusedChangeId: activity.id, // Focus on clicked activity
                              })
                            }
                          } else {
                            // All other tools → Use extractOverlayData for appropriate overlay
                            setOverlayState({ type: 'activity', activity })
                          }
                          }}
                          hasEditOrWriteActivities={turn.activities.some(a =>
                            a.toolName === 'Edit' || a.toolName === 'Write'
                          )}
                          onOpenMultiFileDiff={() => {
                          // Collect all Edit/Write activities from this turn
                          const changes: FileChange[] = []
                          for (const a of turn.activities) {
                            const input = a.toolInput as Record<string, unknown> | undefined
                            if (a.toolName === 'Edit' && input) {
                              changes.push({
                                id: a.id,
                                filePath: (input.file_path as string) || 'unknown',
                                toolType: 'Edit',
                                original: (input.old_string as string) || '',
                                modified: (input.new_string as string) || '',
                                error: a.error || undefined,
                              })
                            } else if (a.toolName === 'Write' && input) {
                              changes.push({
                                id: a.id,
                                filePath: (input.file_path as string) || 'unknown',
                                toolType: 'Write',
                                original: '',
                                modified: (input.content as string) || '',
                                error: a.error || undefined,
                              })
                            }
                          }

                          if (changes.length > 0) {
                            setOverlayState({
                              type: 'multi-diff',
                              changes,
                              consolidated: true, // Consolidated mode - group by file
                            })
                          }
                          }}
                        />
                        </ErrorBoundary>
                      </div>
                    )
                  })}
                    </motion.div>
                    )}
                    </AnimatePresence>
                  </motion.div>
                </AnimatePresence>
                {/* Processing Indicator - always visible while processing */}
                {session.isProcessing && (() => {
                  // Find the last user message timestamp for accurate elapsed time
                  const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user')
                  return (
                    <ProcessingIndicator
                      startTime={lastUserMsg?.timestamp}
                      statusMessage={session.currentStatus?.message}
                    />
                  )
                })()}
                {/* Scroll Anchor: For auto-scroll to bottom */}
                <div ref={messagesEndRef} />
              </div>
              </ScrollArea>
            </div>
          </div>

          {/* === INPUT CONTAINER: FreeForm or Structured Input === */}
          <div className={cn(
            CHAT_LAYOUT.maxWidth,
            compactMode ? "mx-auto w-full px-4 pb-2 mt-1" : "mx-auto w-full px-4 pb-4 mt-1"
          )}>
            {/* Active option badges and tasks - positioned above input */}
            {!compactMode && (
              <ActiveOptionBadges
                ultrathinkEnabled={ultrathinkEnabled}
                onUltrathinkChange={onUltrathinkChange}
                permissionMode={permissionMode}
                onPermissionModeChange={onPermissionModeChange}
                tasks={backgroundTasks}
                sessionId={session.id}
                onKillTask={(taskId) => killTask(taskId, backgroundTasks.find(t => t.id === taskId)?.type ?? 'shell')}
                onInsertMessage={onInputChange}
              />
            )}
            {!compactMode && session.labels && session.labels.length > 0 && (
              <LabelBadgeRow
                sessionLabels={session.labels}
                labels={labels}
                onLabelsChange={onLabelsChange}
                className="px-0 pt-0 pb-2"
              />
            )}
            <InputContainer
              placeholder={inputPlaceholder}
              compactMode={compactMode}
              disabled={isInputDisabled}
              isProcessing={session.isProcessing}
              onSubmit={handleSubmit}
              onStop={handleStop}
              textareaRef={textareaRef}
              currentModel={currentModel}
              onModelChange={onModelChange}
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={onThinkingLevelChange}
              ultrathinkEnabled={ultrathinkEnabled}
              onUltrathinkChange={onUltrathinkChange}
              permissionMode={permissionMode}
              onPermissionModeChange={onPermissionModeChange}
              enabledModes={enabledModes}
              structuredInput={structuredInput}
              onStructuredResponse={handleStructuredResponse}
              inputValue={inputValue}
              onInputChange={onInputChange}
              sources={sources}
              enabledSourceSlugs={session.enabledSourceSlugs}
              onSourcesChange={onSourcesChange}
              skills={skills}
              labels={labels}
              sessionLabels={session.labels}
              onLabelAdd={(labelId) => {
                const current = session.labels || []
                if (!current.some(entry => extractLabelId(entry) === labelId)) {
                  onLabelsChange?.([...current, labelId])
                }
              }}
              workspaceId={workspaceId}
              workingDirectory={workingDirectory}
              onWorkingDirectoryChange={onWorkingDirectoryChange}
              sessionFolderPath={sessionFolderPath}
              sessionId={session.id}
              disableSend={disableSend}
              isEmptySession={session.messages.length === 0}
              contextStatus={{
                isCompacting: session.currentStatus?.statusType === 'compacting',
                inputTokens: session.tokenUsage?.inputTokens,
                contextWindow: session.tokenUsage?.contextWindow,
              }}
            />
          </div>
          </div>
        </div>
      ) : null}

      {/* ================================================================== */}
      {/* Preview Overlays - Rendered outside the main chat flow            */}
      {/* ================================================================== */}

      {/* Code preview overlay (Read tool) */}
      {overlayData?.type === 'code' && (
        <CodePreviewOverlay
          isOpen={!!overlayState}
          onClose={handleCloseOverlay}
          content={overlayData.content}
          filePath={overlayData.filePath}
          mode={overlayData.mode}
          startLine={overlayData.startLine}
          totalLines={overlayData.totalLines}
          numLines={overlayData.numLines}
          theme={isDark ? 'dark' : 'light'}
          error={overlayData.error}
          onOpenFile={onOpenFile}
          headerTranslations={overlayHeaderTranslations}
        />
      )}

      {/* Diff preview overlay (single Edit tool) */}
      {overlayData?.type === 'diff' && (
        <DiffPreviewOverlay
          isOpen={!!overlayState}
          onClose={handleCloseOverlay}
          original={overlayData.original}
          modified={overlayData.modified}
          filePath={overlayData.filePath}
          theme={isDark ? 'dark' : 'light'}
          error={overlayData.error}
          onOpenFile={onOpenFile}
          headerTranslations={overlayHeaderTranslations}
        />
      )}

      {/* Multi-diff preview overlay (multiple Edit/Write tools) */}
      {overlayState?.type === 'multi-diff' && (
        <MultiDiffPreviewOverlay
          isOpen={true}
          onClose={handleCloseOverlay}
          changes={overlayState.changes}
          consolidated={overlayState.consolidated}
          focusedChangeId={overlayState.focusedChangeId}
          theme={isDark ? 'dark' : 'light'}
          onOpenFile={onOpenFile}
          translations={{
            changes: t('multiDiff.changes'),
            snippet: t('multiDiff.snippet'),
            fullFile: t('multiDiff.fullFile'),
            selectFile: t('multiDiff.selectFile'),
            file: t('multiDiff.file'),
            files: t('multiDiff.files'),
            write: t('multiDiff.write'),
            edit: t('multiDiff.edit'),
            closeTitle: `${t('common.close')} (Esc)`,
          }}
        />
      )}

      {/* Terminal preview overlay (Bash/Grep/Glob tools) */}
      {overlayData?.type === 'terminal' && (
        <TerminalPreviewOverlay
          isOpen={!!overlayState}
          onClose={handleCloseOverlay}
          command={overlayData.command}
          output={overlayData.output}
          exitCode={overlayData.exitCode}
          toolType={overlayData.toolType}
          description={overlayData.description}
          theme={isDark ? 'dark' : 'light'}
          translations={terminalOutputTranslations}
          headerTranslations={overlayHeaderTranslations}
        />
      )}

      {/* JSON preview overlay (MCP tools, WebSearch, etc.) */}
      {overlayData?.type === 'json' && (
        <JSONPreviewOverlay
          isOpen={!!overlayState}
          onClose={handleCloseOverlay}
          data={overlayData.data}
          title={overlayData.title}
          theme={isDark ? 'dark' : 'light'}
          error={overlayData.error}
          headerTranslations={overlayHeaderTranslations}
        />
      )}

      {/* Markdown preview overlay (pop-out, turn details, generic activities) */}
      {overlayState?.type === 'markdown' && (
        <GenericOverlay
          isOpen={true}
          onClose={handleCloseOverlay}
          content={overlayState.content}
          title={overlayState.title}
          translations={{
            preview: t('overlay.preview'),
            original: t('overlay.original'),
            modified: t('overlay.modified'),
            toolFailed: t('overlay.toolFailed'),
          }}
          headerTranslations={overlayHeaderTranslations}
        />
      )}

      {/* Generic overlay for unknown tool types */}
      {overlayData?.type === 'generic' && (
        <GenericOverlay
          isOpen={!!overlayState}
          onClose={handleCloseOverlay}
          content={overlayData.content}
          title={overlayData.title}
          translations={{
            preview: t('overlay.preview'),
            original: t('overlay.original'),
            modified: t('overlay.modified'),
            toolFailed: t('overlay.toolFailed'),
          }}
          headerTranslations={overlayHeaderTranslations}
        />
      )}
    </div>
  )
}

/**
 * MessageBubble - Renders a single message based on its role
 *
 * Message Roles & Styles:
 * - user:      Right-aligned, blue (bg-foreground), white text
 * - assistant: Left-aligned, gray (bg-muted), markdown rendered with clickable links
 * - error:     Left-aligned, red border/bg, warning icon + error message
 * - status:    Centered pill badge with pulsing dot (e.g., "Thinking...")
 *
 * Note: Tool messages are rendered by TurnCard, not MessageBubble
 */
interface MessageBubbleProps {
  message: Message
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
  /**
   * Markdown render mode for assistant messages
   * @default 'minimal'
   */
  renderMode?: RenderMode
  /**
   * Callback to pop out message into a separate window
   */
  onPopOut?: (message: Message) => void
}

/**
 * ErrorMessage - Separate component for error messages to allow useState hook
 */
function ErrorMessage({ message }: { message: Message }) {
  const { t } = useLanguage()
  const hasDetails = (message.errorDetails && message.errorDetails.length > 0) || message.errorOriginal
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  return (
    // ml-3 aligns with TurnCard header left padding for visual consistency
    <div className="flex justify-start ml-3">
      {/* Subtle bg (3% opacity) + tinted shadow for softer error appearance */}
      <div
        className="max-w-[80%] shadow-tinted rounded-[8px] pl-5 pr-4 pt-2 pb-2.5 break-words"
        style={{
          backgroundColor: 'oklch(from var(--destructive) l c h / 0.03)',
          '--shadow-color': 'var(--destructive-rgb)',
        } as React.CSSProperties}
      >
        <div className="text-xs text-destructive/50 mb-0.5 font-semibold">
          {message.errorTitle || t('chatDisplay.error')}
        </div>
        <p className="text-sm text-destructive">{message.content}</p>

        {/* Collapsible Details Toggle */}
        {hasDetails && (
          <div className="mt-2">
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive transition-colors"
            >
              {detailsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>{detailsOpen ? t('chatDisplay.hideTechnicalDetails') : t('chatDisplay.showTechnicalDetails')}</span>
            </button>

            <AnimatedCollapsibleContent isOpen={detailsOpen} className="overflow-hidden">
              <div className="mt-2 pt-2 border-t border-destructive/20 text-xs text-destructive/60 font-mono space-y-0.5">
                {message.errorDetails?.map((detail, i) => (
                  <div key={i}>{detail}</div>
                ))}
                {message.errorOriginal && !message.errorDetails?.some(d => d.includes('Raw error:')) && (
                  <div className="mt-1">Raw: {message.errorOriginal.slice(0, 200)}{message.errorOriginal.length > 200 ? '...' : ''}</div>
                )}
              </div>
            </AnimatedCollapsibleContent>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onOpenFile,
  onOpenUrl,
  renderMode = 'minimal',
  onPopOut,
}: MessageBubbleProps) {
  const { t } = useLanguage()

  // === USER MESSAGE: Right-aligned bubble with attachments above ===
  if (message.role === 'user') {
    return (
      <UserMessageBubble
        content={message.content}
        attachments={message.attachments}
        badges={message.badges}
        isPending={message.isPending}
        isQueued={message.isQueued}
        ultrathink={message.ultrathink}
        onUrlClick={onOpenUrl}
        onFileClick={onOpenFile}
      />
    )
  }

  // === ASSISTANT MESSAGE: Left-aligned gray bubble with markdown rendering ===
  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start group">
        <div className="relative max-w-[90%] bg-background shadow-minimal rounded-[8px] pl-6 pr-4 py-3 break-words min-w-0 select-text">
          {/* Pop-out button - visible on hover */}
          {onPopOut && !message.isStreaming && (
            <button
              onClick={() => onPopOut(message)}
              className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground/5"
              title={t('chatDisplay.openInNewWindow')}
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          {/* Use StreamingMarkdown for block-level memoization during streaming */}
          {message.isStreaming ? (
            <StreamingMarkdown
              content={message.content}
              isStreaming={true}
              mode={renderMode}
              onUrlClick={onOpenUrl}
              onFileClick={onOpenFile}
            />
          ) : (
            <CollapsibleMarkdownProvider>
              <Markdown
                mode={renderMode}
                onUrlClick={onOpenUrl}
                onFileClick={onOpenFile}
                id={message.id}
                className="text-sm"
                collapsible
              >
                {message.content}
              </Markdown>
            </CollapsibleMarkdownProvider>
          )}
        </div>
      </div>
    )
  }

  // === ERROR MESSAGE: Red bordered bubble with warning icon and collapsible details ===
  if (message.role === 'error') {
    return <ErrorMessage message={message} />
  }

  // === STATUS MESSAGE: Matches ProcessingIndicator layout for visual consistency ===
  if (message.role === 'status') {
    return (
      <div className="flex items-center gap-2 px-3 py-1 -mb-1 text-[13px] text-muted-foreground">
        {/* Spinner in same location as TurnCard chevron */}
        <div className="w-3 h-3 flex items-center justify-center shrink-0">
          <Spinner className="text-[10px]" />
        </div>
        <span>{message.content}</span>
      </div>
    )
  }

  // === INFO MESSAGE: Icon and color based on level ===
  if (message.role === 'info') {
    // Compaction complete message - render as horizontal rule with centered label
    // This persists after reload to show where context was compacted
    if (message.statusType === 'compaction_complete') {
      return (
        <div className="flex items-center gap-3 my-12 px-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground/70 select-none">
            {t('misc.conversationCompacted')}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )
    }

    const level = message.infoLevel || 'info'
    const config = {
      info: { icon: Info, className: 'text-muted-foreground' },
      warning: { icon: AlertTriangle, className: 'text-info' },
      error: { icon: CircleAlert, className: 'text-destructive' },
      success: { icon: CheckCircle2, className: 'text-success' },
    }[level]
    const Icon = config.icon

    return (
      <div className={cn('flex items-center gap-2 px-3 py-1 text-[13px]', config.className)}>
        <div className="w-3 h-3 flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3" />
        </div>
        <span>{message.content}</span>
      </div>
    )
  }

  // === WARNING MESSAGE: Info themed bubble ===
  if (message.role === 'warning') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-info/10 rounded-[8px] pl-5 pr-4 pt-2 pb-2.5 break-words">
          <div className="text-xs text-info/50 mb-0.5 font-semibold">
            Warning
          </div>
          <p className="text-sm text-info">{message.content}</p>
        </div>
      </div>
    )
  }

  return null
}

/**
 * MemoizedMessageBubble - Prevents re-renders of non-streaming messages
 *
 * During streaming, the entire message list gets updated on each delta.
 * This wrapper skips re-renders for messages that haven't changed,
 * significantly improving performance for long conversations.
 */
const MemoizedMessageBubble = React.memo(MessageBubble, (prev, next) => {
  // Always re-render streaming messages (content is changing)
  if (prev.message.isStreaming || next.message.isStreaming) {
    return false
  }
  // Skip re-render if key props unchanged
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.role === next.message.role
  )
})
