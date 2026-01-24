/**
 * Custom Event Type Definitions
 *
 * Type-safe custom event definitions for the renderer process.
 * Use these types and helpers for consistent event handling.
 */

/**
 * Custom event type mapping
 * Maps event names to their payload types
 */
export interface CustomEventMap {
  /** Insert text at cursor in the input */
  'cowork:insert-text': CustomEvent<{ text: string }>
  /** Approve the current plan */
  'cowork:approve-plan': CustomEvent<{ sessionId: string }>
  /** Approve plan with compaction */
  'cowork:approve-plan-with-compact': CustomEvent<{ sessionId: string }>
  /** Paste files into the input */
  'cowork:paste-files': CustomEvent<{ files: File[] }>
  /** Focus the chat input */
  'cowork:focus-input': CustomEvent<void>
  /** Compaction completed for a session */
  'cowork:compaction-complete': CustomEvent<{ sessionId: string }>
  /** Provider configuration changed */
  'cowork:provider-changed': CustomEvent<{ provider: string }>
  /** Open a specific view/route */
  'cowork:navigate': CustomEvent<{ view: string; params?: Record<string, string> }>
  /** Request to show a toast notification */
  'cowork:toast': CustomEvent<{ message: string; type?: 'success' | 'error' | 'info' | 'warning' }>
  /** Session title regeneration requested */
  'cowork:regenerate-title': CustomEvent<{ sessionId: string }>
  /** Model changed for a session */
  'cowork:model-changed': CustomEvent<{ sessionId: string; model: string }>
  /** Permission mode changed for a session */
  'cowork:permission-mode-changed': CustomEvent<{ sessionId: string; mode: string }>
}

/**
 * Type-safe event listener registration
 *
 * @param type - Event type from CustomEventMap
 * @param listener - Listener function
 * @returns Cleanup function to remove the listener
 *
 * @example
 * ```typescript
 * const cleanup = addCustomEventListener('cowork:insert-text', (event) => {
 *   console.log(event.detail.text)
 * })
 * // Later: cleanup()
 * ```
 */
export function addCustomEventListener<K extends keyof CustomEventMap>(
  type: K,
  listener: (event: CustomEventMap[K]) => void
): () => void {
  window.addEventListener(type, listener as EventListener)
  return () => window.removeEventListener(type, listener as EventListener)
}

/**
 * Type-safe event dispatcher
 *
 * @param type - Event type from CustomEventMap
 * @param detail - Event detail payload
 *
 * @example
 * ```typescript
 * dispatchCustomEvent('cowork:insert-text', { text: 'Hello' })
 * ```
 */
export function dispatchCustomEvent<K extends keyof CustomEventMap>(
  type: K,
  detail: CustomEventMap[K] extends CustomEvent<infer D> ? D : never
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }))
}

/**
 * Hook for subscribing to custom events with cleanup
 *
 * @example
 * ```typescript
 * useCustomEvent('cowork:insert-text', (event) => {
 *   console.log(event.detail.text)
 * }, [dependency])
 * ```
 */
export function useCustomEventEffect<K extends keyof CustomEventMap>(
  type: K,
  listener: (event: CustomEventMap[K]) => void,
  deps: React.DependencyList
): void {
  React.useEffect(() => {
    return addCustomEventListener(type, listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Import React for the hook
import * as React from 'react'
