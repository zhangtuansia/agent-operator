import { useState, useEffect, useCallback } from 'react'
import { atom, useAtomValue, useSetAtom } from 'jotai'

/**
 * Global network status atom for sharing across components
 */
export const networkStatusAtom = atom<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

/**
 * Hook to monitor network connectivity status
 *
 * Uses browser's navigator.onLine and online/offline events for detection.
 * Provides both local state and updates the global jotai atom.
 *
 * @returns Object with isOnline status and manual check function
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const setNetworkStatus = useSetAtom(networkStatusAtom)

  const updateStatus = useCallback((online: boolean) => {
    setIsOnline(online)
    setNetworkStatus(online)
  }, [setNetworkStatus])

  useEffect(() => {
    const handleOnline = () => updateStatus(true)
    const handleOffline = () => updateStatus(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check
    updateStatus(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateStatus])

  // Manual check function (useful for testing or force-refresh)
  const checkStatus = useCallback(() => {
    updateStatus(navigator.onLine)
    return navigator.onLine
  }, [updateStatus])

  return { isOnline, checkStatus }
}

/**
 * Hook to read network status from global atom (for components that only need to read)
 */
export function useIsOnline(): boolean {
  return useAtomValue(networkStatusAtom)
}
