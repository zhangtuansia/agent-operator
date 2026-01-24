/**
 * useLayoutState - Manages sidebar and panel layout state
 *
 * Handles:
 * - Left sidebar visibility and width
 * - Session list panel width
 * - Right sidebar visibility and width
 * - Resize operations with persistence
 * - Window width tracking for responsive behavior
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import * as storage from '@/lib/local-storage'

// Panel width constraints (in pixels)
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 320
const SESSION_LIST_MIN_WIDTH = 240
const SESSION_LIST_MAX_WIDTH = 480
const RIGHT_SIDEBAR_MIN_WIDTH = 280
const RIGHT_SIDEBAR_MAX_WIDTH = 480

// Minimum space needed for inline right sidebar (right sidebar + center content)
const MIN_INLINE_SPACE = 600

export type ResizeTarget = 'sidebar' | 'session-list' | 'right-sidebar' | null

export interface LayoutState {
  // Left sidebar
  isSidebarVisible: boolean
  sidebarWidth: number
  // Session list
  sessionListWidth: number
  // Right sidebar
  isRightSidebarVisible: boolean
  rightSidebarWidth: number
  skipRightSidebarAnimation: boolean
  // Window
  windowWidth: number
  // Resize state
  isResizing: ResizeTarget
  sidebarHandleY: number | null
  sessionListHandleY: number | null
  rightSidebarHandleY: number | null
  // Computed
  shouldUseOverlay: boolean
}

export interface LayoutActions {
  // Visibility toggles
  setIsSidebarVisible: (visible: boolean | ((prev: boolean) => boolean)) => void
  setIsRightSidebarVisible: (visible: boolean) => void
  setSkipRightSidebarAnimation: (skip: boolean) => void
  // Resize start handlers
  startResizeSidebar: () => void
  startResizeSessionList: () => void
  startResizeRightSidebar: () => void
  // Refs for resize handles
  resizeHandleRef: React.RefObject<HTMLDivElement>
  sessionListHandleRef: React.RefObject<HTMLDivElement>
  rightSidebarHandleRef: React.RefObject<HTMLDivElement>
}

export interface UseLayoutStateOptions {
  defaultCollapsed?: boolean
}

export function useLayoutState(options: UseLayoutStateOptions = {}): [LayoutState, LayoutActions] {
  const { defaultCollapsed = false } = options

  // Left sidebar state
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => {
    return storage.get(storage.KEYS.sidebarVisible, !defaultCollapsed)
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return storage.get(storage.KEYS.sidebarWidth, 220)
  })

  // Session list width
  const [sessionListWidth, setSessionListWidth] = useState(() => {
    return storage.get(storage.KEYS.sessionListWidth, 300)
  })

  // Right sidebar state
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(() => {
    return storage.get(storage.KEYS.rightSidebarVisible, false)
  })
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    return storage.get(storage.KEYS.rightSidebarWidth, 300)
  })
  const [skipRightSidebarAnimation, setSkipRightSidebarAnimation] = useState(false)

  // Window width tracking
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  // Resize state
  const [isResizing, setIsResizing] = useState<ResizeTarget>(null)
  const [sidebarHandleY, setSidebarHandleY] = useState<number | null>(null)
  const [sessionListHandleY, setSessionListHandleY] = useState<number | null>(null)
  const [rightSidebarHandleY, setRightSidebarHandleY] = useState<number | null>(null)

  // Refs for resize handles
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const sessionListHandleRef = useRef<HTMLDivElement>(null)
  const rightSidebarHandleRef = useRef<HTMLDivElement>(null)

  // Calculate overlay threshold dynamically
  const leftSidebarEffectiveWidth = isSidebarVisible ? sidebarWidth : 0
  const overlayThreshold = MIN_INLINE_SPACE + leftSidebarEffectiveWidth + sessionListWidth
  const shouldUseOverlay = windowWidth < overlayThreshold

  // Track window width for responsive behavior
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Persist sidebar visibility changes
  useEffect(() => {
    storage.set(storage.KEYS.sidebarVisible, isSidebarVisible)
  }, [isSidebarVisible])

  // Persist right sidebar visibility changes
  useEffect(() => {
    storage.set(storage.KEYS.rightSidebarVisible, isRightSidebarVisible)
  }, [isRightSidebarVisible])

  // Resize effect for sidebar, session list, and right sidebar
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing === 'sidebar') {
        const newWidth = Math.min(Math.max(e.clientX, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
        setSidebarWidth(newWidth)
        if (resizeHandleRef.current) {
          const rect = resizeHandleRef.current.getBoundingClientRect()
          setSidebarHandleY(e.clientY - rect.top)
        }
      } else if (isResizing === 'session-list') {
        const offset = isSidebarVisible ? sidebarWidth : 0
        const newWidth = Math.min(Math.max(e.clientX - offset, SESSION_LIST_MIN_WIDTH), SESSION_LIST_MAX_WIDTH)
        setSessionListWidth(newWidth)
        if (sessionListHandleRef.current) {
          const rect = sessionListHandleRef.current.getBoundingClientRect()
          setSessionListHandleY(e.clientY - rect.top)
        }
      } else if (isResizing === 'right-sidebar') {
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, RIGHT_SIDEBAR_MIN_WIDTH), RIGHT_SIDEBAR_MAX_WIDTH)
        setRightSidebarWidth(newWidth)
        if (rightSidebarHandleRef.current) {
          const rect = rightSidebarHandleRef.current.getBoundingClientRect()
          setRightSidebarHandleY(e.clientY - rect.top)
        }
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

  // Resize start handlers
  const startResizeSidebar = useCallback(() => setIsResizing('sidebar'), [])
  const startResizeSessionList = useCallback(() => setIsResizing('session-list'), [])
  const startResizeRightSidebar = useCallback(() => setIsResizing('right-sidebar'), [])

  const state: LayoutState = {
    isSidebarVisible,
    sidebarWidth,
    sessionListWidth,
    isRightSidebarVisible,
    rightSidebarWidth,
    skipRightSidebarAnimation,
    windowWidth,
    isResizing,
    sidebarHandleY,
    sessionListHandleY,
    rightSidebarHandleY,
    shouldUseOverlay,
  }

  const actions: LayoutActions = {
    setIsSidebarVisible,
    setIsRightSidebarVisible,
    setSkipRightSidebarAnimation,
    startResizeSidebar,
    startResizeSessionList,
    startResizeRightSidebar,
    resizeHandleRef,
    sessionListHandleRef,
    rightSidebarHandleRef,
  }

  return [state, actions]
}
