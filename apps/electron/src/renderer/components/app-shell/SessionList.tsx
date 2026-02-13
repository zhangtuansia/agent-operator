import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react"
import { formatDistanceToNow, isToday, isYesterday, format, startOfDay } from "date-fns"
import { MoreHorizontal, Flag, Search, X } from "lucide-react"
import { toast } from "sonner"

import { cn, isHexColor } from "@/lib/utils"
import { rendererPerf } from "@/lib/perf"
import { Spinner } from "@agent-operator/ui"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TodoStateMenu } from "@/components/ui/todo-filter-menu"
import { getStateColor, getStateIcon, getStateLabel, type TodoStateId } from "@/config/todo-states"
import type { TodoState } from "@/config/todo-states"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
} from "@/components/ui/styled-dropdown"
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from "@/components/ui/styled-context-menu"
import { DropdownMenuProvider, ContextMenuProvider } from "@/components/ui/menu-context"
import { SessionMenu } from "./SessionMenu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RenameDialog } from "@/components/ui/rename-dialog"
import { useSession } from "@/hooks/useSession"
import { useFocusZone, useRovingTabIndex } from "@/hooks/keyboard"
import { useNavigation, useNavigationState, routes, isChatsNavigation } from "@/contexts/NavigationContext"
import { useFocusContext } from "@/context/FocusContext"
import { getSessionTitle } from "@/utils/session"
import type { SessionMeta } from "@/atoms/sessions"
import { PERMISSION_MODE_CONFIG, type PermissionMode } from "@agent-operator/shared/agent/modes"
import type { SessionSearchResult } from "../../../shared/types"
import { useLanguage } from "@/context/LanguageContext"
import { getDateFnsLocale } from "@/i18n"
import type { LabelConfig } from "@agent-operator/shared/labels"


/**
 * Format a date for the date header
 * Returns translation key or formatted date like "Dec 19"
 */
function formatDateHeader(date: Date, t: (key: string) => string): string {
  if (isToday(date)) return t('sessionList.today')
  if (isYesterday(date)) return t('sessionList.yesterday')
  return format(date, "MMM d")
}

/**
 * Group sessions by date (day boundary)
 * Returns array of { date, sessions } sorted by date descending
 */
function groupSessionsByDate(sessions: SessionMeta[], t: (key: string) => string): Array<{ date: Date; label: string; sessions: SessionMeta[] }> {
  const groups = new Map<string, { date: Date; sessions: SessionMeta[] }>()

  for (const session of sessions) {
    const timestamp = session.lastMessageAt ?? session.createdAt ?? 0
    const date = startOfDay(new Date(timestamp))
    const key = date.toISOString()

    if (!groups.has(key)) {
      groups.set(key, { date, sessions: [] })
    }
    groups.get(key)!.sessions.push(session)
  }

  // Sort groups by date descending and add labels
  return Array.from(groups.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(group => ({
      ...group,
      label: formatDateHeader(group.date, t),
    }))
}

/**
 * Get the current todo state of a session
 * States are user-controlled, never automatic
 */
function getSessionTodoState(session: SessionMeta): TodoStateId {
  // Read from session.todoState (user-controlled)
  // Falls back to 'todo' if not set
  return (session.todoState as TodoStateId) || 'todo'
}

/**
 * Check if a session has unread messages
 * Compares lastFinalMessageId with lastReadMessageId
 */
function hasUnreadMessages(session: SessionMeta): boolean {
  if (!session.lastFinalMessageId) return false  // No final assistant message yet
  return session.lastFinalMessageId !== session.lastReadMessageId
}

/**
 * Check if session has any messages (uses lastFinalMessageId as proxy)
 */
function hasMessages(session: SessionMeta): boolean {
  return session.lastFinalMessageId !== undefined
}

/**
 * Highlight matching text in a string
 * Returns React nodes with matched portions wrapped in a highlight span
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

  return (
    <>
      {before}
      <span className="bg-info/30 rounded-sm">{match}</span>
      {highlightMatch(after, query)}
    </>
  )
}

interface SessionItemProps {
  item: SessionMeta
  index: number
  itemProps: {
    id: string
    tabIndex: number
    'aria-selected': boolean
    onKeyDown: (e: React.KeyboardEvent) => void
    onFocus: () => void
    ref: (el: HTMLElement | null) => void
    role: string
  }
  isSelected: boolean
  isLast: boolean
  isFirstInGroup: boolean
  onKeyDown: (e: React.KeyboardEvent, item: SessionMeta) => void
  onRenameClick: (sessionId: string, currentName: string) => void
  onTodoStateChange: (sessionId: string, state: TodoStateId) => void
  onFlag?: (sessionId: string) => void
  onUnflag?: (sessionId: string) => void
  onMarkUnread: (sessionId: string) => void
  onDelete: (sessionId: string, skipConfirmation?: boolean) => Promise<boolean>
  onSelect: () => void
  onOpenInNewWindow: () => void
  /** Current permission mode for this session (from real-time state) */
  permissionMode?: PermissionMode
  /** Current search query for highlighting matches */
  searchQuery?: string
  /** Content search match result for this session */
  contentMatch?: SessionSearchResult
  /** Dynamic todo states from workspace config */
  todoStates: TodoState[]
  /** Full label tree for labels submenu */
  labels: LabelConfig[]
  /** Callback when labels are toggled */
  onLabelsChange?: (sessionId: string, labels: string[]) => void
  /** Translation function */
  t: (key: string) => string
  /** Current language for date formatting */
  language: 'en' | 'zh'
}

/**
 * SessionItem - Individual session card with todo checkbox and dropdown menu
 * Tracks menu open state to keep "..." button visible
 *
 * Memoized to prevent unnecessary re-renders when other sessions change.
 */
const SessionItem = memo(function SessionItem({
  item,
  index,
  itemProps,
  isSelected,
  isLast,
  isFirstInGroup,
  onKeyDown,
  onRenameClick,
  onTodoStateChange,
  onFlag,
  onUnflag,
  onMarkUnread,
  onDelete,
  onSelect,
  onOpenInNewWindow,
  permissionMode,
  searchQuery,
  contentMatch,
  todoStates,
  labels,
  onLabelsChange,
  t,
  language,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [todoMenuOpen, setTodoMenuOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Get current todo state from session properties
  const currentTodoState = getSessionTodoState(item)

  // Drag handlers for drag-and-drop to sidebar status categories
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-session-id', item.id)
    e.dataTransfer.setData('text/plain', item.id) // Fallback
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const handleClick = () => {
    // Start perf tracking for session switch
    rendererPerf.startSessionSwitch(item.id)
    onSelect()
  }

  const handleTodoStateSelect = (state: TodoStateId) => {
    setTodoMenuOpen(false)
    onTodoStateChange(item.id, state)
  }

  return (
    <div
      className="session-item"
      data-selected={isSelected || undefined}
    >
      {/* Separator - only show if not first in group */}
      {!isFirstInGroup && (
        <div className="session-separator pl-12 pr-4">
          <Separator />
        </div>
      )}
      {/* Wrapper for button + dropdown + context menu, group for hover state */}
      <ContextMenu modal={true} onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "session-content relative group select-none pl-2 mr-2",
              isDragging && "opacity-50"
            )}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
        {/* Todo State Icon - positioned absolutely, outside the button */}
        <Popover modal={true} open={todoMenuOpen} onOpenChange={setTodoMenuOpen}>
          <PopoverTrigger asChild>
            <div className="absolute left-4 top-3.5 z-10">
              <div
                className={cn(
                  "w-4 h-4 flex items-center justify-center rounded-full transition-colors cursor-pointer",
                  "hover:bg-foreground/5",
                  !isHexColor(getStateColor(currentTodoState, todoStates)) && (getStateColor(currentTodoState, todoStates) || 'text-muted-foreground')
                )}
                style={isHexColor(getStateColor(currentTodoState, todoStates)) ? { color: getStateColor(currentTodoState, todoStates) } : undefined}
                role="button"
                aria-haspopup="menu"
                aria-expanded={todoMenuOpen}
                aria-label={t('aria.changeTodoState')}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <div className="w-4 h-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>img]:w-full [&>img]:h-full [&>span]:text-base">
                  {getStateIcon(currentTodoState, todoStates)}
                </div>
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 border-0 shadow-none bg-transparent"
            align="start"
            side="bottom"
            sideOffset={4}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <TodoStateMenu
              activeState={currentTodoState}
              onSelect={handleTodoStateSelect}
              states={todoStates}
            />
          </PopoverContent>
        </Popover>
        {/* Main content button */}
        <button
          {...itemProps}
          className={cn(
            "flex w-full items-start gap-2 pl-2 pr-4 py-3 text-left text-sm outline-none rounded-[8px]",
            // Fast hover transition (75ms vs default 150ms), selection is instant
            "transition-[background-color] duration-75",
            isSelected
              ? "bg-foreground/5 hover:bg-foreground/7"
              : "hover:bg-foreground/2"
          )}
          onMouseDown={handleClick}
          onKeyDown={(e) => {
            itemProps.onKeyDown(e)
            onKeyDown(e, item)
          }}
        >
          {/* Spacer for todo icon */}
          <div className="w-4 h-5 shrink-0" />
          {/* Content column */}
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            {/* Title - up to 2 lines, with shimmer during async operations (sharing, title regen, etc.) */}
            <div className="flex items-start gap-2 w-full pr-6 min-w-0">
              <div className={cn(
                "font-medium font-sans line-clamp-2 min-w-0 -mb-[2px]",
                item.isAsyncOperationOngoing && "animate-shimmer-text"
              )}>
                {searchQuery ? highlightMatch(getSessionTitle(item, t('chat.newChat')), searchQuery) : getSessionTitle(item, t('chat.newChat'))}
              </div>
            </div>
            {/* Content match snippet - shown when search matches message content */}
            {contentMatch && contentMatch.matches[0]?.snippet && (
              <div className="text-xs text-muted-foreground/60 line-clamp-1 min-w-0 pr-6">
                {searchQuery ? highlightMatch(contentMatch.matches[0].snippet, searchQuery) : contentMatch.matches[0].snippet}
              </div>
            )}
            {/* Subtitle - with optional flag at start, single line with truncation */}
            <div className="flex items-center gap-1.5 text-xs text-foreground/70 w-full -mb-[2px] pr-6 min-w-0">
              {item.isProcessing && (
                <Spinner className="text-[8px] text-foreground shrink-0" />
              )}
              {!item.isProcessing && hasUnreadMessages(item) && (
                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent text-white">
                  {t('sessionBadges.new')}
                </span>
              )}
              {item.isFlagged && (
                <Flag className="h-[10px] w-[10px] text-info fill-info shrink-0" />
              )}
              {item.lastMessageRole === 'plan' && (
                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-success/10 text-success">
                  {t('sessionBadges.plan')}
                </span>
              )}
              {permissionMode && (
                <span
                  className={cn(
                    "shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded",
                    // Mode-specific styling using CSS variables (theme-aware)
                    permissionMode === 'safe' && "bg-foreground/5 text-foreground/60",
                    permissionMode === 'ask' && "bg-info/10 text-info",
                    permissionMode === 'allow-all' && "bg-accent/10 text-accent"
                  )}
                >
                  {permissionMode === 'safe' ? t('permissionModes.safe') :
                   permissionMode === 'ask' ? t('permissionModes.ask') :
                   t('permissionModes.allowAll')}
                </span>
              )}
              <span className="truncate">
                {item.lastMessageAt && (
                  <>{formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true, locale: getDateFnsLocale(language) })}</>
                )}
              </span>
            </div>
          </div>
        </button>
        {/* Action buttons - visible on hover or when menu is open */}
        <div
          className={cn(
            "absolute right-2 top-2 transition-opacity z-10",
            menuOpen || contextMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {/* More menu */}
          <div className="flex items-center rounded-[8px] overflow-hidden border border-transparent hover:border-border/50">
            <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <div className="p-1.5 hover:bg-foreground/10 data-[state=open]:bg-foreground/10 cursor-pointer">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </div>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end">
                <DropdownMenuProvider>
                  <SessionMenu
                    sessionId={item.id}
                    sessionName={getSessionTitle(item, t('chat.newChat'))}
                    isFlagged={item.isFlagged ?? false}
                    hasMessages={hasMessages(item)}
                    hasUnreadMessages={hasUnreadMessages(item)}
                    currentTodoState={currentTodoState}
                    todoStates={todoStates}
                    sessionLabels={item.labels ?? []}
                    labels={labels}
                    onLabelsChange={onLabelsChange ? (nextLabels) => onLabelsChange(item.id, nextLabels) : undefined}
                    onRename={() => onRenameClick(item.id, getSessionTitle(item, t('chat.newChat')))}
                    onFlag={() => onFlag?.(item.id)}
                    onUnflag={() => onUnflag?.(item.id)}
                    onMarkUnread={() => onMarkUnread(item.id)}
                    onTodoStateChange={(state) => onTodoStateChange(item.id, state)}
                    onOpenInNewWindow={onOpenInNewWindow}
                    onDelete={() => onDelete(item.id)}
                  />
                </DropdownMenuProvider>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
          </div>
        </ContextMenuTrigger>
        {/* Context menu - same content as dropdown */}
        <StyledContextMenuContent>
          <ContextMenuProvider>
            <SessionMenu
              sessionId={item.id}
              sessionName={getSessionTitle(item, t('chat.newChat'))}
              isFlagged={item.isFlagged ?? false}
              hasMessages={hasMessages(item)}
              hasUnreadMessages={hasUnreadMessages(item)}
              currentTodoState={currentTodoState}
              todoStates={todoStates}
              sessionLabels={item.labels ?? []}
              labels={labels}
              onLabelsChange={onLabelsChange ? (nextLabels) => onLabelsChange(item.id, nextLabels) : undefined}
              onRename={() => onRenameClick(item.id, getSessionTitle(item, t('chat.newChat')))}
              onFlag={() => onFlag?.(item.id)}
              onUnflag={() => onUnflag?.(item.id)}
              onMarkUnread={() => onMarkUnread(item.id)}
              onTodoStateChange={(state) => onTodoStateChange(item.id, state)}
              onOpenInNewWindow={onOpenInNewWindow}
              onDelete={() => onDelete(item.id)}
            />
          </ContextMenuProvider>
        </StyledContextMenuContent>
      </ContextMenu>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for performance - only compare essential props
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.preview === nextProps.item.preview &&
    prevProps.item.lastMessageAt === nextProps.item.lastMessageAt &&
    prevProps.item.isProcessing === nextProps.item.isProcessing &&
    prevProps.item.isFlagged === nextProps.item.isFlagged &&
    prevProps.item.todoState === nextProps.item.todoState &&
    prevProps.item.labels === nextProps.item.labels &&
    prevProps.item.isAsyncOperationOngoing === nextProps.item.isAsyncOperationOngoing &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFirstInGroup === nextProps.isFirstInGroup &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.contentMatch === nextProps.contentMatch &&
    prevProps.permissionMode === nextProps.permissionMode
  )
})

/**
 * DateHeader - Simple date group header rendered inline with content.
 * No sticky behavior - just scrolls with the list.
 */
function DateHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  )
}

interface SessionListProps {
  items: SessionMeta[]
  onDelete: (sessionId: string, skipConfirmation?: boolean) => Promise<boolean>
  onFlag?: (sessionId: string) => void
  onUnflag?: (sessionId: string) => void
  onMarkUnread: (sessionId: string) => void
  onTodoStateChange: (sessionId: string, state: TodoStateId) => void
  onRename: (sessionId: string, name: string) => void
  /** Called when Enter is pressed to focus chat input */
  onFocusChatInput?: () => void
  /** Called when a session is selected */
  onSessionSelect?: (session: SessionMeta) => void
  /** Called when user wants to open a session in a new window */
  onOpenInNewWindow?: (session: SessionMeta) => void
  /** Called to navigate to a specific view (e.g., 'allChats', 'flagged') */
  onNavigateToView?: (view: 'allChats' | 'flagged') => void
  /** Unified session options per session (real-time state) */
  sessionOptions?: Map<string, import('../../hooks/useSessionOptions').SessionOptions>
  /** Whether search mode is active */
  searchActive?: boolean
  /** Current search query */
  searchQuery?: string
  /** Called when search query changes */
  onSearchChange?: (query: string) => void
  /** Called when search is closed */
  onSearchClose?: () => void
  /** Dynamic todo states from workspace config */
  todoStates?: TodoState[]
  /** Label configs for labels submenu in session menu */
  labels?: LabelConfig[]
  /** Callback when session labels are toggled */
  onLabelsChange?: (sessionId: string, labels: string[]) => void
}

// Re-export TodoStateId for use by parent components
export type { TodoStateId }

/**
 * SessionList - Scrollable list of session cards with keyboard navigation
 *
 * Keyboard shortcuts:
 * - Arrow Up/Down: Navigate and select sessions (immediate selection)
 * - Enter: Focus chat input
 * - Delete/Backspace: Delete session
 * - C: Mark complete/incomplete
 * - R: Rename session
 */
export function SessionList({
  items,
  onDelete,
  onFlag,
  onUnflag,
  onMarkUnread,
  onTodoStateChange,
  onRename,
  onFocusChatInput,
  onSessionSelect,
  onOpenInNewWindow,
  onNavigateToView,
  sessionOptions,
  searchActive,
  searchQuery = '',
  onSearchChange,
  onSearchClose,
  todoStates = [],
  labels = [],
  onLabelsChange,
}: SessionListProps) {
  const [session] = useSession()
  const { navigate } = useNavigation()
  const navState = useNavigationState()
  const { t, language } = useLanguage()

  // Get current filter from navigation state (for preserving context in tab routes)
  const currentFilter = isChatsNavigation(navState) ? navState.filter : undefined

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Content search state
  const [contentResults, setContentResults] = useState<Map<string, SessionSearchResult>>(new Map())
  const [isContentSearching, setIsContentSearching] = useState(false)

  // Pagination: limit initial render for performance with large session lists
  const INITIAL_VISIBLE_COUNT = 50
  const LOAD_MORE_COUNT = 50
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)

  // Focus search input when search becomes active (with delay to let dropdown close)
  useEffect(() => {
    if (searchActive) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [searchActive])

  // Debounced content search via backend ripgrep
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setContentResults(new Map())
      setIsContentSearching(false)
      return
    }

    let cancelled = false
    setIsContentSearching(true)
    const timer = setTimeout(() => {
      window.electronAPI.searchSessionContent(searchQuery).then((results) => {
        if (cancelled) return
        const map = new Map<string, SessionSearchResult>()
        for (const r of results) {
          map.set(r.sessionId, r)
        }
        setContentResults(map)
        setIsContentSearching(false)
      }).catch(() => {
        if (!cancelled) setIsContentSearching(false)
      })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  // Sort by most recent activity first
  const sortedItems = items
    .filter((item) => !item.hidden)
    .sort((a, b) =>
    (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  )

  // Filter items by search query (title match + content match merged)
  const newChatFallback = t('chat.newChat')
  const searchFilteredItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems
    const query = searchQuery.toLowerCase()

    // Title matches (instant, client-side)
    const titleMatched = new Set<string>()
    const titleResults = sortedItems.filter(item => {
      const title = getSessionTitle(item, newChatFallback).toLowerCase()
      if (title.includes(query)) {
        titleMatched.add(item.id)
        return true
      }
      return false
    })

    // Content-only matches (from backend ripgrep, deduped)
    const contentOnlyResults = sortedItems.filter(item =>
      !titleMatched.has(item.id) && contentResults.has(item.id)
    )

    return [...titleResults, ...contentOnlyResults]
  }, [sortedItems, searchQuery, newChatFallback, contentResults])

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT)
  }, [searchQuery])

  // Apply pagination to limit rendered items
  const visibleSessions = useMemo(() =>
    searchFilteredItems.slice(0, visibleCount),
    [searchFilteredItems, visibleCount]
  )

  // Track remaining sessions count for "Load More" button
  const remainingCount = searchFilteredItems.length - visibleCount
  const hasMoreSessions = remainingCount > 0

  // Group sessions by date (using visible sessions for performance)
  const dateGroups = useMemo(() => groupSessionsByDate(visibleSessions, t), [visibleSessions, t])

  // Create flat list for keyboard navigation (maintains order across groups)
  const flatItems = useMemo(() => {
    return dateGroups.flatMap(group => group.sessions)
  }, [dateGroups])

  // Create a lookup map for session ID -> flat index
  const sessionIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    flatItems.forEach((item, index) => map.set(item.id, index))
    return map
  }, [flatItems])

  // Find initial index based on selected session
  const selectedIndex = flatItems.findIndex(item => item.id === session.selected)

  // Focus zone management
  const { focusZone } = useFocusContext()

  // Register as focus zone
  const { zoneRef, isFocused } = useFocusZone({ zoneId: 'session-list' })

  // Handle session selection (immediate on arrow navigation)
  const handleActiveChange = useCallback((item: SessionMeta) => {
    // Navigate using view routes to preserve filter context
    if (!currentFilter || currentFilter.kind === 'allChats') {
      navigate(routes.view.allChats(item.id))
    } else if (currentFilter.kind === 'flagged') {
      navigate(routes.view.flagged(item.id))
    } else if (currentFilter.kind === 'state') {
      navigate(routes.view.state(currentFilter.stateId, item.id))
    } else if (currentFilter.kind === 'label') {
      navigate(routes.view.label(currentFilter.labelId, item.id))
    } else if (currentFilter.kind === 'imported') {
      navigate(routes.view.imported(currentFilter.source, item.id))
    }
  }, [navigate, currentFilter])

  // Handle Enter to focus chat input
  const handleEnter = useCallback(() => {
    onFocusChatInput?.()
  }, [onFocusChatInput])

  const handleFlagWithToast = useCallback((sessionId: string) => {
    if (!onFlag) return
    onFlag(sessionId)
    toast(t('toasts.conversationFlagged'), {
      description: t('toasts.addedToFlagged'),
      action: onUnflag ? {
        label: t('toasts.undo'),
        onClick: () => onUnflag(sessionId),
      } : undefined,
    })
  }, [onFlag, onUnflag, t])

  const handleUnflagWithToast = useCallback((sessionId: string) => {
    if (!onUnflag) return
    onUnflag(sessionId)
    toast(t('toasts.flagRemoved'), {
      description: t('toasts.removedFromFlagged'),
      action: onFlag ? {
        label: t('toasts.undo'),
        onClick: () => onFlag(sessionId),
      } : undefined,
    })
  }, [onFlag, onUnflag, t])

  const handleDeleteWithToast = useCallback(async (sessionId: string): Promise<boolean> => {
    // Confirmation dialog is shown by handleDeleteSession in App.tsx
    // We await so toast only shows after successful deletion (if user confirmed)
    const deleted = await onDelete(sessionId)
    if (deleted) {
      toast(t('toasts.conversationDeleted'))
    }
    return deleted
  }, [onDelete, t])

  // Roving tabindex for keyboard navigation
  const {
    activeIndex,
    setActiveIndex,
    getItemProps,
    focusActiveItem,
  } = useRovingTabIndex({
    items: flatItems,
    getId: (item, _index) => item.id,
    orientation: 'vertical',
    wrap: true,
    onActiveChange: handleActiveChange,
    onEnter: handleEnter,
    initialIndex: selectedIndex >= 0 ? selectedIndex : 0,
    enabled: isFocused,
  })

  // Sync activeIndex when selection changes externally
  useEffect(() => {
    const newIndex = flatItems.findIndex(item => item.id === session.selected)
    if (newIndex >= 0 && newIndex !== activeIndex) {
      setActiveIndex(newIndex)
    }
  }, [session.selected, flatItems, activeIndex, setActiveIndex])

  // Focus active item when zone gains focus (but not while search input is active)
  useEffect(() => {
    if (isFocused && flatItems.length > 0 && !searchActive) {
      focusActiveItem()
    }
  }, [isFocused, focusActiveItem, flatItems.length, searchActive])

  // Arrow key shortcuts for zone navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, _item: SessionMeta) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusZone('sidebar')
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusZone('chat')
      return
    }
  }, [focusZone])

  const handleRenameClick = (sessionId: string, currentName: string) => {
    setRenameSessionId(sessionId)
    setRenameName(currentName)
    // Defer dialog open to next frame to let dropdown fully unmount first
    // This prevents race condition between dropdown's modal cleanup and dialog's modal setup
    requestAnimationFrame(() => {
      setRenameDialogOpen(true)
    })
  }

  const handleRenameSubmit = () => {
    if (renameSessionId && renameName.trim()) {
      onRename(renameSessionId, renameName.trim())
    }
    setRenameDialogOpen(false)
    setRenameSessionId(null)
    setRenameName("")
  }

  // Handle search input key events
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation to prevent roving tabindex from intercepting keys (e.g. Backspace as Delete)
    e.stopPropagation()

    if (e.key === 'Escape') {
      e.preventDefault()
      onSearchClose?.()
    }
  }

  // Empty state - render outside ScrollArea to avoid scroll
  if (flatItems.length === 0 && !searchActive) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          {t('emptyStates.noConversationsYet')}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Virtualized scroll container */}
      <div className="h-full flex flex-col select-none">
        {/* Search input - fixed at top */}
        {searchActive && (
          <div className="shrink-0 px-2 py-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('sessionList.searchConversations')}
                className="w-full h-8 pl-8 pr-8 text-sm bg-foreground/5 border-0 rounded-[8px] outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
              />
              <button
                onClick={onSearchClose}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-foreground/10 rounded"
                title={t('sessionList.closeSearch')}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            {isContentSearching && searchQuery.trim().length >= 2 && (
              <div className="flex items-center gap-1.5 px-1 pt-1">
                <Spinner className="text-[8px] text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{t('sessionList.searchingMessages')}</span>
              </div>
            )}
          </div>
        )}

        {/* No results message when searching */}
        {searchActive && searchQuery && flatItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
            <p className="text-sm text-muted-foreground">{t('emptyStates.noConversationsFound')}</p>
            <button
              onClick={() => onSearchChange?.('')}
              className="text-xs text-foreground hover:underline mt-1"
            >
              {t('sessionList.clearSearch')}
            </button>
          </div>
        ) : (
          /* Scroll container */
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto mask-fade-top-short"
          >
            <div
              ref={zoneRef}
              className="min-w-0"
              data-focus-zone="session-list"
              role="listbox"
              aria-label={t('aria.sessions')}
            >
              {dateGroups.map((group) => (
                <div key={group.date.toISOString()}>
                  <DateHeader label={group.label} />
                  {group.sessions.map((item, indexInGroup) => {
                    const flatIndex = sessionIndexMap.get(item.id) ?? 0
                    const itemProps = getItemProps(item, flatIndex)

                    return (
                      <ErrorBoundary key={item.id} level="component" resetKey={item.id}>
                        <SessionItem
                          item={item}
                          index={flatIndex}
                          itemProps={itemProps}
                          isSelected={session.selected === item.id}
                          isLast={flatIndex === flatItems.length - 1}
                          isFirstInGroup={indexInGroup === 0}
                          onKeyDown={handleKeyDown}
                          onRenameClick={handleRenameClick}
                          onTodoStateChange={onTodoStateChange}
                          onFlag={onFlag ? handleFlagWithToast : undefined}
                          onUnflag={onUnflag ? handleUnflagWithToast : undefined}
                          onMarkUnread={onMarkUnread}
                          onDelete={handleDeleteWithToast}
                          onSelect={() => {
                            // Navigate to session with filter context (updates URL and selection)
                            if (!currentFilter || currentFilter.kind === 'allChats') {
                              navigate(routes.view.allChats(item.id))
                            } else if (currentFilter.kind === 'flagged') {
                              navigate(routes.view.flagged(item.id))
                            } else if (currentFilter.kind === 'state') {
                              navigate(routes.view.state(currentFilter.stateId, item.id))
                            } else if (currentFilter.kind === 'label') {
                              navigate(routes.view.label(currentFilter.labelId, item.id))
                            } else if (currentFilter.kind === 'imported') {
                              navigate(routes.view.imported(currentFilter.source, item.id))
                            }
                            // Notify parent
                            onSessionSelect?.(item)
                          }}
                          onOpenInNewWindow={() => onOpenInNewWindow?.(item)}
                          permissionMode={sessionOptions?.get(item.id)?.permissionMode}
                          searchQuery={searchQuery}
                          contentMatch={contentResults.get(item.id)}
                          todoStates={todoStates}
                          labels={labels}
                          onLabelsChange={onLabelsChange}
                          t={t}
                          language={language}
                        />
                      </ErrorBoundary>
                    )
                  })}
                </div>
              ))}
            </div>
            {/* Load More button - shown when there are more sessions to display */}
            {hasMoreSessions && (
              <div className="px-4 py-3">
                <button
                  onClick={() => setVisibleCount(c => c + LOAD_MORE_COUNT)}
                  className="w-full py-2 px-4 text-sm text-foreground/70 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 rounded-lg transition-colors"
                >
                  {t('sessionList.loadMore', { count: remainingCount })}
                </button>
              </div>
            )}
            {/* Bottom padding for scroll */}
            <div className="h-14" />
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title={t('renameDialog.renameConversation')}
        value={renameName}
        onValueChange={setRenameName}
        onSubmit={handleRenameSubmit}
        placeholder={t('renameDialog.enterName')}
      />
    </>
  )
}
