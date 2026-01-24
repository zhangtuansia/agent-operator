/**
 * useNavigationHistory Hook
 *
 * Manages custom navigation history stack for back/forward navigation.
 * Browser history doesn't work reliably in Electron, so we maintain our own stack.
 */

import { useRef, useCallback, useState } from 'react'
import type { Route } from '../../shared/routes'

export interface UseNavigationHistoryResult {
  /** Whether we can go back in history */
  canGoBack: boolean
  /** Whether we can go forward in history */
  canGoForward: boolean
  /** Push a new route to history (if different from current) */
  pushToHistory: (route: Route) => void
  /** Go back in history, returns the route to navigate to (or null if at beginning) */
  goBack: (isRouteValid: (route: Route) => boolean) => Route | null
  /** Go forward in history, returns the route to navigate to (or null if at end) */
  goForward: (isRouteValid: (route: Route) => boolean) => Route | null
  /** Initialize history with a route (for startup) */
  initializeHistory: (route: Route) => void
  /** Skip pushing the next route (for back/forward navigation) */
  skipNextPush: () => void
}

/**
 * Hook for managing custom navigation history stack.
 */
export function useNavigationHistory(): UseNavigationHistoryResult {
  // Track history state for back/forward buttons
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  // Custom history stack (browser history doesn't work reliably in Electron)
  const historyStackRef = useRef<Route[]>([])
  const historyIndexRef = useRef(-1)

  // Flag to prevent pushing to history when navigating via back/forward
  const isNavigatingHistoryRef = useRef(false)

  // Initialize history stack with a route
  const initializeHistory = useCallback((route: Route) => {
    if (historyStackRef.current.length === 0) {
      historyStackRef.current = [route]
      historyIndexRef.current = 0
      console.log('[Navigation] Initialized history stack with:', route)
    }
  }, [])

  // Skip pushing the next route (called before back/forward navigation)
  const skipNextPush = useCallback(() => {
    isNavigatingHistoryRef.current = true
  }, [])

  // Push a route to history (if different from current)
  const pushToHistory = useCallback((route: Route) => {
    // Skip if navigating via back/forward
    if (isNavigatingHistoryRef.current) {
      isNavigatingHistoryRef.current = false
      console.log('[Navigation] Skipping history push (navigating via back/forward)')
    } else {
      // Only push if route is different from current route (avoid duplicates)
      const currentRoute = historyStackRef.current[historyIndexRef.current]
      if (route !== currentRoute) {
        // When navigating to a new route, truncate forward history and push
        const newIndex = historyIndexRef.current + 1
        historyStackRef.current = historyStackRef.current.slice(0, newIndex)
        historyStackRef.current.push(route)
        historyIndexRef.current = newIndex
        console.log('[Navigation] Pushed to history:', route, 'index:', newIndex, 'stack length:', historyStackRef.current.length)
      } else {
        console.log('[Navigation] Skipping duplicate route:', route)
      }
    }

    // Update back/forward availability
    const newCanGoBack = historyIndexRef.current > 0
    const newCanGoForward = historyIndexRef.current < historyStackRef.current.length - 1
    setCanGoBack(newCanGoBack)
    setCanGoForward(newCanGoForward)
  }, [])

  // Go back in history (returns route to navigate to, or null if at beginning)
  // When encountering invalid entries (deleted sessions/sources), remove them from the stack
  const goBack = useCallback((isRouteValid: (route: Route) => boolean): Route | null => {
    const currentIndex = historyIndexRef.current
    console.log('[Navigation] goBack called, current index:', currentIndex, 'stack length:', historyStackRef.current.length)

    if (currentIndex <= 0) {
      console.log('[Navigation] Already at beginning of history')
      return null
    }

    // Find first valid entry going backwards, collecting indices of invalid entries
    const invalidIndices: number[] = []
    let targetIndex = -1

    for (let i = currentIndex - 1; i >= 0; i--) {
      const route = historyStackRef.current[i]
      if (isRouteValid(route)) {
        targetIndex = i
        break
      }
      invalidIndices.push(i)
      console.log('[Navigation] Marking invalid history entry for removal:', route)
    }

    // Remove invalid entries from stack (in reverse order to preserve indices)
    if (invalidIndices.length > 0) {
      for (const idx of invalidIndices.sort((a, b) => b - a)) {
        historyStackRef.current.splice(idx, 1)
      }
      console.log('[Navigation] Removed', invalidIndices.length, 'invalid entries from history')
    }

    // Recalculate target index after removal
    if (targetIndex >= 0) {
      // Adjust for removed entries that were before the target
      const removedBefore = invalidIndices.filter(i => i < targetIndex).length
      targetIndex -= removedBefore
    }

    // Also adjust current index for removed entries
    const removedBeforeCurrent = invalidIndices.filter(i => i < currentIndex).length
    historyIndexRef.current = currentIndex - removedBeforeCurrent

    if (targetIndex >= 0) {
      historyIndexRef.current = targetIndex
      isNavigatingHistoryRef.current = true
      const route = historyStackRef.current[targetIndex]
      console.log('[Navigation] Going back to:', route, 'new index:', targetIndex)
      return route
    } else {
      console.log('[Navigation] No valid history entry to go back to')
      // Update canGoBack/canGoForward since we may have removed entries
      setCanGoBack(historyIndexRef.current > 0)
      setCanGoForward(historyIndexRef.current < historyStackRef.current.length - 1)
      return null
    }
  }, [])

  // Go forward in history (returns route to navigate to, or null if at end)
  // When encountering invalid entries (deleted sessions/sources), remove them from the stack
  const goForward = useCallback((isRouteValid: (route: Route) => boolean): Route | null => {
    const currentIndex = historyIndexRef.current
    const stackLength = historyStackRef.current.length
    console.log('[Navigation] goForward called, current index:', currentIndex, 'stack length:', stackLength)

    if (currentIndex >= stackLength - 1) {
      console.log('[Navigation] Already at end of history')
      return null
    }

    // Find first valid entry going forwards, collecting indices of invalid entries
    const invalidIndices: number[] = []
    let targetIndex = -1

    for (let i = currentIndex + 1; i < stackLength; i++) {
      const route = historyStackRef.current[i]
      if (isRouteValid(route)) {
        targetIndex = i
        break
      }
      invalidIndices.push(i)
      console.log('[Navigation] Marking invalid history entry for removal:', route)
    }

    // Remove invalid entries from stack (in reverse order to preserve indices)
    if (invalidIndices.length > 0) {
      for (const idx of invalidIndices.sort((a, b) => b - a)) {
        historyStackRef.current.splice(idx, 1)
      }
      console.log('[Navigation] Removed', invalidIndices.length, 'invalid entries from history')
    }

    // Recalculate target index after removal (invalid entries were between current and target)
    if (targetIndex >= 0) {
      targetIndex -= invalidIndices.length
    }

    if (targetIndex >= 0 && targetIndex < historyStackRef.current.length) {
      historyIndexRef.current = targetIndex
      isNavigatingHistoryRef.current = true
      const route = historyStackRef.current[targetIndex]
      console.log('[Navigation] Going forward to:', route, 'new index:', targetIndex)
      return route
    } else {
      console.log('[Navigation] No valid history entry to go forward to')
      // Update canGoBack/canGoForward since we may have removed entries
      setCanGoBack(historyIndexRef.current > 0)
      setCanGoForward(historyIndexRef.current < historyStackRef.current.length - 1)
      return null
    }
  }, [])

  return {
    canGoBack,
    canGoForward,
    pushToHistory,
    goBack,
    goForward,
    initializeHistory,
    skipNextPush,
  }
}
