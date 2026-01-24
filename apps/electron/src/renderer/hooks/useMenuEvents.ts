/**
 * useMenuEvents Hook
 *
 * Handles menu bar events from the Electron main process.
 * Listens for new chat, settings, and keyboard shortcuts menu items.
 */

import { useEffect } from 'react'
import { navigate, routes } from '../lib/navigate'

export interface UseMenuEventsOptions {
  /** Callback to trigger new chat creation */
  onNewChat: () => void
  /** Callback to open settings */
  onOpenSettings: () => void
}

/**
 * Hook for handling menu bar events from the Electron main process.
 */
export function useMenuEvents({
  onNewChat,
  onOpenSettings,
}: UseMenuEventsOptions): void {
  useEffect(() => {
    const unsubNewChat = window.electronAPI.onMenuNewChat(() => {
      onNewChat()
    })
    const unsubSettings = window.electronAPI.onMenuOpenSettings(() => {
      onOpenSettings()
    })
    const unsubShortcuts = window.electronAPI.onMenuKeyboardShortcuts(() => {
      navigate(routes.view.settings('shortcuts'))
    })
    return () => {
      unsubNewChat()
      unsubSettings()
      unsubShortcuts()
    }
  }, [onNewChat, onOpenSettings])
}
