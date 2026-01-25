/**
 * useSessionEvents Hook
 *
 * Handles session events from the agent via IPC.
 * Manages the source of truth logic during streaming vs non-streaming states.
 * Processes events through pure functions and handles side effects.
 */

import { useEffect, useCallback, useRef } from 'react'
import { getDefaultStore } from 'jotai'
import type { SessionEvent, PermissionRequest, CredentialRequest, Session } from '../../shared/types'
import type { SessionOptions } from './useSessionOptions'

/** Type for the Jotai store */
type JotaiStore = ReturnType<typeof getDefaultStore>
import type { AgentEvent, Effect } from '../event-processor'
import { useEventProcessor } from '../event-processor'
import {
  sessionAtomFamily,
  sessionMetaMapAtom,
  extractSessionMeta,
} from '@/atoms/sessions'
import { handleBackgroundTaskEvent } from '@/utils/backgroundTaskHandler'

export interface UseSessionEventsOptions {
  /** Jotai store instance */
  store: JotaiStore
  /** Current workspace ID */
  workspaceId: string | null
  /** Update a session directly in the atom */
  updateSessionDirect: (sessionId: string, update: (prev: Session | null) => Session | null) => void
  /** Show notification for a completed session */
  showSessionNotification: (session: Session, preview?: string) => void
  /** Set pending permissions map */
  setPendingPermissions: React.Dispatch<React.SetStateAction<Map<string, PermissionRequest[]>>>
  /** Set pending credentials map */
  setPendingCredentials: React.Dispatch<React.SetStateAction<Map<string, CredentialRequest[]>>>
  /** Default session options getter */
  defaultSessionOptions: SessionOptions
  /** Session options updater */
  setSessionOptions: React.Dispatch<React.SetStateAction<Map<string, SessionOptions>>>
}

/**
 * Hook for handling session events from the agent.
 * Manages streaming vs non-streaming state transitions and processes all event types.
 */
export function useSessionEvents({
  store,
  workspaceId,
  updateSessionDirect,
  showSessionNotification,
  setPendingPermissions,
  setPendingCredentials,
  defaultSessionOptions,
  setSessionOptions,
}: UseSessionEventsOptions): void {
  // Event processor hook - handles all agent events through pure functions
  const { processAgentEvent } = useEventProcessor()

  // Handoff events signal end of streaming - need to sync back to React state
  // Also includes todo_state_changed so status updates immediately reflect in sidebar
  // async_operation included so shimmer effect on session titles updates in real-time
  const handoffEventTypesRef = useRef(new Set([
    'complete', 'error', 'interrupted', 'typed_error', 'todo_state_changed', 'title_generated', 'async_operation'
  ]))

  // Helper to handle side effects (same logic for both paths)
  const handleEffects = useCallback((effects: Effect[], sessionId: string, eventType: string) => {
    for (const effect of effects) {
      switch (effect.type) {
        case 'permission_request': {
          setPendingPermissions(prevPerms => {
            const next = new Map(prevPerms)
            const existingQueue = next.get(sessionId) || []
            next.set(sessionId, [...existingQueue, effect.request])
            return next
          })
          break
        }
        case 'permission_mode_changed': {
          console.log('[useSessionEvents] permission_mode_changed:', effect.sessionId, effect.permissionMode)
          setSessionOptions(prevOpts => {
            const next = new Map(prevOpts)
            const current = next.get(effect.sessionId) ?? defaultSessionOptions
            next.set(effect.sessionId, { ...current, permissionMode: effect.permissionMode })
            return next
          })
          break
        }
        case 'credential_request': {
          console.log('[useSessionEvents] credential_request:', sessionId, effect.request.mode)
          setPendingCredentials(prevCreds => {
            const next = new Map(prevCreds)
            const existingQueue = next.get(sessionId) || []
            next.set(sessionId, [...existingQueue, effect.request])
            return next
          })
          break
        }
        case 'auto_retry': {
          // A source was auto-activated, automatically re-send the original message
          console.log('[useSessionEvents] auto_retry: Source', effect.sourceSlug, 'activated, re-sending message')
          // Add suffix to indicate the source was activated
          const messageWithSuffix = `${effect.originalMessage}\n\n[${effect.sourceSlug} activated]`
          // Use setTimeout to ensure the previous turn has fully completed
          setTimeout(() => {
            window.electronAPI.sendMessage(effect.sessionId, messageWithSuffix)
          }, 100)
          break
        }
      }
    }

    // Clear pending permissions and credentials on complete
    if (eventType === 'complete') {
      setPendingPermissions(prevPerms => {
        if (prevPerms.has(sessionId)) {
          const next = new Map(prevPerms)
          next.delete(sessionId)
          return next
        }
        return prevPerms
      })
      setPendingCredentials(prevCreds => {
        if (prevCreds.has(sessionId)) {
          const next = new Map(prevCreds)
          next.delete(sessionId)
          return next
        }
        return prevCreds
      })
    }
  }, [setPendingPermissions, setPendingCredentials, setSessionOptions, defaultSessionOptions])

  // Listen for session events
  useEffect(() => {
    const cleanup = window.electronAPI.onSessionEvent((event: SessionEvent) => {
      const sessionId = event.sessionId
      const currentWorkspaceId = workspaceId ?? ''
      const agentEvent = event as unknown as AgentEvent

      // Dispatch window event when compaction completes
      // This allows FreeFormInput to sequence the plan execution message after compaction
      // Note: markCompactionComplete is called on the backend (sessions.ts) to ensure
      // it happens even if CMD+R occurs during compaction
      if (event.type === 'info' && event.statusType === 'compaction_complete') {
        window.dispatchEvent(new CustomEvent('cowork:compaction-complete', {
          detail: { sessionId }
        }))
      }

      // Check if session is currently streaming (atom is source of truth)
      const atomSession = store.get(sessionAtomFamily(sessionId))
      const isStreaming = atomSession?.isProcessing === true
      const isHandoff = handoffEventTypesRef.current.has(event.type)

      // During streaming OR for handoff events: use atom as source of truth
      // This ensures all events during streaming see the complete state
      if (isStreaming || isHandoff) {
        const currentSession = atomSession ?? null

        // Process the event
        const { session: updatedSession, effects } = processAgentEvent(
          agentEvent,
          currentSession,
          currentWorkspaceId
        )

        // Update atom directly (UI sees update immediately)
        updateSessionDirect(sessionId, () => updatedSession)

        // Handle side effects
        handleEffects(effects, sessionId, event.type)

        // Handle background task events
        handleBackgroundTaskEvent(store, sessionId, event, agentEvent)

        // For handoff events, update metadata map for list display
        // NOTE: No sessionsAtom to sync - atom and metadata are the source of truth
        if (isHandoff) {
          // Update metadata map
          const metaMap = store.get(sessionMetaMapAtom)
          const newMetaMap = new Map(metaMap)
          newMetaMap.set(sessionId, extractSessionMeta(updatedSession))
          store.set(sessionMetaMapAtom, newMetaMap)

          // Show notification on complete (when window is not focused)
          if (event.type === 'complete') {
            // Get the last assistant message as preview
            const lastMessage = updatedSession.messages.findLast(
              m => m.role === 'assistant' && !m.isIntermediate
            )
            const preview = lastMessage?.content?.substring(0, 100) || undefined
            showSessionNotification(updatedSession, preview)
          }
        }

        return
      }

      // Not streaming: use per-session atoms directly (no sessionsAtom)
      const currentSession = store.get(sessionAtomFamily(sessionId))

      const { session: updatedSession, effects } = processAgentEvent(
        agentEvent,
        currentSession,
        currentWorkspaceId
      )

      // Handle side effects
      handleEffects(effects, sessionId, event.type)

      // Handle background task events
      handleBackgroundTaskEvent(store, sessionId, event, agentEvent)

      // Update per-session atom
      updateSessionDirect(sessionId, () => updatedSession)

      // Update metadata map
      const metaMap = store.get(sessionMetaMapAtom)
      const newMetaMap = new Map(metaMap)
      newMetaMap.set(sessionId, extractSessionMeta(updatedSession))
      store.set(sessionMetaMapAtom, newMetaMap)
    })

    return cleanup
  }, [processAgentEvent, workspaceId, store, updateSessionDirect, showSessionNotification, handleEffects])
}
