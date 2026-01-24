/**
 * useSessionDrafts Hook
 *
 * Manages draft input text per session with debounced persistence.
 * Uses refs instead of state to avoid re-renders during typing.
 */

import { useRef, useCallback, useEffect } from 'react'

const DRAFT_SAVE_DEBOUNCE_MS = 500

export interface UseSessionDraftsResult {
  /** Get draft value for a session (reads from ref, no re-render) */
  getDraft: (sessionId: string) => string
  /** Update draft value for a session (debounced persistence) */
  setDraft: (sessionId: string, value: string) => void
  /** Initialize drafts from a record (for loading persisted drafts) */
  initDrafts: (drafts: Record<string, string>) => void
  /** Clear all drafts (for cleanup) */
  clearAllDrafts: () => void
}

/**
 * Hook for managing session drafts with debounced persistence.
 * Drafts are preserved across mode switches and conversation changes.
 */
export function useSessionDrafts(): UseSessionDraftsResult {
  // Draft input text per session (preserved across mode switches and conversation changes)
  // Using ref instead of state to avoid re-renders during typing - drafts are only
  // needed for initial value restoration and disk persistence, not reactive updates
  const sessionDraftsRef = useRef<Map<string, string>>(new Map())

  // Debounce timers for draft persistence
  const draftSaveTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup draft save timers on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      draftSaveTimeoutRef.current.forEach(clearTimeout)
      draftSaveTimeoutRef.current.clear()
    }
  }, [])

  // Getter for draft values - reads from ref without triggering re-renders
  const getDraft = useCallback((sessionId: string): string => {
    return sessionDraftsRef.current.get(sessionId) ?? ''
  }, [])

  // Setter for draft values with debounced persistence
  const setDraft = useCallback((sessionId: string, value: string) => {
    // Update ref immediately (no re-render triggered)
    if (value) {
      sessionDraftsRef.current.set(sessionId, value)
    } else {
      sessionDraftsRef.current.delete(sessionId) // Clean up empty drafts
    }

    // Debounced persistence to disk (500ms delay)
    const existingTimeout = draftSaveTimeoutRef.current.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeout = setTimeout(() => {
      window.electronAPI.setDraft(sessionId, value)
      draftSaveTimeoutRef.current.delete(sessionId)
    }, DRAFT_SAVE_DEBOUNCE_MS)
    draftSaveTimeoutRef.current.set(sessionId, timeout)
  }, [])

  // Initialize drafts from a record (for loading persisted drafts)
  const initDrafts = useCallback((drafts: Record<string, string>) => {
    sessionDraftsRef.current = new Map(Object.entries(drafts))
  }, [])

  // Clear all drafts
  const clearAllDrafts = useCallback(() => {
    sessionDraftsRef.current.clear()
    draftSaveTimeoutRef.current.forEach(clearTimeout)
    draftSaveTimeoutRef.current.clear()
  }, [])

  return {
    getDraft,
    setDraft,
    initDrafts,
    clearAllDrafts,
  }
}
