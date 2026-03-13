import type { SessionEvent } from '@agent-operator/shared/protocol'

type SessionEventListener = (event: SessionEvent) => void

export class SessionEventHub {
  private listeners = new Map<string, Set<SessionEventListener>>()

  emit(event: SessionEvent): void {
    if (!('sessionId' in event) || !event.sessionId) return

    const listeners = this.listeners.get(event.sessionId)
    if (!listeners) return

    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Listener failures must not break session event fan-out.
      }
    }
  }

  onSessionEvent(sessionId: string, callback: SessionEventListener): () => void {
    let listeners = this.listeners.get(sessionId)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(sessionId, listeners)
    }

    listeners.add(callback)

    return () => {
      listeners!.delete(callback)
      if (listeners!.size === 0) {
        this.listeners.delete(sessionId)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
