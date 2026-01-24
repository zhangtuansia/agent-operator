/**
 * useSplashScreen Hook
 *
 * Manages splash screen state and exit animations.
 * Tracks when the app is fully ready (all data loaded) and triggers exit animation.
 */

import { useState, useEffect, useCallback } from 'react'

export interface UseSplashScreenResult {
  /** Whether to show the splash screen (not yet hidden) */
  showSplash: boolean
  /** Whether the splash is in exit animation */
  splashExiting: boolean
  /** Callback for when splash exit animation completes */
  handleSplashExitComplete: () => void
}

/**
 * Hook for managing splash screen state.
 *
 * @param isFullyReady - Whether the app is fully ready (all data loaded)
 */
export function useSplashScreen(isFullyReady: boolean): UseSplashScreenResult {
  // Splash screen state - tracks when app is fully ready (all data loaded)
  const [splashExiting, setSplashExiting] = useState(false)
  const [splashHidden, setSplashHidden] = useState(false)

  // Trigger splash exit animation when fully ready
  useEffect(() => {
    if (isFullyReady && !splashExiting) {
      setSplashExiting(true)
    }
  }, [isFullyReady, splashExiting])

  // Handler for when splash exit animation completes
  const handleSplashExitComplete = useCallback(() => {
    setSplashHidden(true)
  }, [])

  return {
    showSplash: !splashHidden,
    splashExiting,
    handleSplashExitComplete,
  }
}
