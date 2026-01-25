import * as React from 'react'
import * as storage from '@/lib/local-storage'

export interface LayoutState {
  // Sidebar visibility and width
  isSidebarVisible: boolean
  setIsSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
  sidebarWidth: number
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>

  // Session list width
  sessionListWidth: number
  setSessionListWidth: React.Dispatch<React.SetStateAction<number>>

  // Right sidebar state
  isRightSidebarVisible: boolean
  setIsRightSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
  rightSidebarWidth: number
  setRightSidebarWidth: React.Dispatch<React.SetStateAction<number>>
  skipRightSidebarAnimation: boolean
  setSkipRightSidebarAnimation: React.Dispatch<React.SetStateAction<boolean>>

  // Window tracking
  windowWidth: number

  // Overlay mode (when window too narrow for inline right sidebar)
  shouldUseOverlay: boolean

  // Resize state
  isResizing: 'sidebar' | 'session-list' | 'right-sidebar' | null
  setIsResizing: React.Dispatch<React.SetStateAction<'sidebar' | 'session-list' | 'right-sidebar' | null>>

  // Handle Y positions for gradient effect
  sidebarHandleY: number | null
  setSidebarHandleY: React.Dispatch<React.SetStateAction<number | null>>
  sessionListHandleY: number | null
  setSessionListHandleY: React.Dispatch<React.SetStateAction<number | null>>
  rightSidebarHandleY: number | null
  setRightSidebarHandleY: React.Dispatch<React.SetStateAction<number | null>>
}

export interface UseLayoutStateOptions {
  defaultCollapsed?: boolean
}

/**
 * useLayoutState - Manages all layout-related state for AppShell
 *
 * Handles:
 * - Sidebar visibility and width (with persistence)
 * - Session list width (with persistence)
 * - Right sidebar state (with persistence)
 * - Window width tracking for responsive behavior
 * - Resize handle Y positions for gradient effect
 * - Resize mouse events
 */
export function useLayoutState(options: UseLayoutStateOptions = {}): LayoutState {
  const { defaultCollapsed = false } = options

  // Sidebar state (persisted)
  const [isSidebarVisible, setIsSidebarVisible] = React.useState(() => {
    return storage.get(storage.KEYS.sidebarVisible, !defaultCollapsed)
  })
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sidebarWidth, 220)
  })

  // Session list width (persisted, min 240, max 480)
  const [sessionListWidth, setSessionListWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sessionListWidth, 300)
  })

  // Right sidebar state (persisted, min 280, max 480)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = React.useState(() => {
    return storage.get(storage.KEYS.rightSidebarVisible, false)
  })
  const [rightSidebarWidth, setRightSidebarWidth] = React.useState(() => {
    return storage.get(storage.KEYS.rightSidebarWidth, 300)
  })
  const [skipRightSidebarAnimation, setSkipRightSidebarAnimation] = React.useState(false)

  // Window width tracking for responsive behavior
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth)

  // Calculate overlay threshold dynamically based on actual sidebar widths
  // Formula: 600px (300px right sidebar + 300px center) + leftSidebar + sessionList
  const MIN_INLINE_SPACE = 600
  const leftSidebarEffectiveWidth = isSidebarVisible ? sidebarWidth : 0
  const OVERLAY_THRESHOLD = MIN_INLINE_SPACE + leftSidebarEffectiveWidth + sessionListWidth
  const shouldUseOverlay = windowWidth < OVERLAY_THRESHOLD

  // Resize state
  const [isResizing, setIsResizing] = React.useState<'sidebar' | 'session-list' | 'right-sidebar' | null>(null)
  const [sidebarHandleY, setSidebarHandleY] = React.useState<number | null>(null)
  const [sessionListHandleY, setSessionListHandleY] = React.useState<number | null>(null)
  const [rightSidebarHandleY, setRightSidebarHandleY] = React.useState<number | null>(null)

  // Track window width for responsive right sidebar behavior
  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Resize mouse event handling
  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing === 'sidebar') {
        const newWidth = Math.min(Math.max(e.clientX, 180), 320)
        setSidebarWidth(newWidth)
      } else if (isResizing === 'session-list') {
        const offset = isSidebarVisible ? sidebarWidth : 0
        const newWidth = Math.min(Math.max(e.clientX - offset, 240), 480)
        setSessionListWidth(newWidth)
      } else if (isResizing === 'right-sidebar') {
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 280), 480)
        setRightSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizing === 'sidebar') {
        storage.set(storage.KEYS.sidebarWidth, sidebarWidth)
        setSidebarHandleY(null)
      } else if (isResizing === 'session-list') {
        storage.set(storage.KEYS.sessionListWidth, sessionListWidth)
        setSessionListHandleY(null)
      } else if (isResizing === 'right-sidebar') {
        storage.set(storage.KEYS.rightSidebarWidth, rightSidebarWidth)
        setRightSidebarHandleY(null)
      }
      setIsResizing(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, sidebarWidth, sessionListWidth, rightSidebarWidth, isSidebarVisible])

  // Persist sidebar visibility when it changes
  React.useEffect(() => {
    storage.set(storage.KEYS.sidebarVisible, isSidebarVisible)
  }, [isSidebarVisible])

  // Persist right sidebar visibility when it changes
  React.useEffect(() => {
    storage.set(storage.KEYS.rightSidebarVisible, isRightSidebarVisible)
  }, [isRightSidebarVisible])

  return {
    isSidebarVisible,
    setIsSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    sessionListWidth,
    setSessionListWidth,
    isRightSidebarVisible,
    setIsRightSidebarVisible,
    rightSidebarWidth,
    setRightSidebarWidth,
    skipRightSidebarAnimation,
    setSkipRightSidebarAnimation,
    windowWidth,
    shouldUseOverlay,
    isResizing,
    setIsResizing,
    sidebarHandleY,
    setSidebarHandleY,
    sessionListHandleY,
    setSessionListHandleY,
    rightSidebarHandleY,
    setRightSidebarHandleY,
  }
}
