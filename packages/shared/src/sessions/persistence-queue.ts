import { writeFile } from 'fs/promises'
import type { StoredSession, SessionHeader } from './types.js'
import { getSessionFilePath, ensureSessionsDir, ensureSessionDir } from './storage.js'
import { toPortablePath } from '../utils/paths.js'
import { createSessionHeader } from './jsonl.js'

// Configuration constants
const DEFAULT_DEBOUNCE_MS = 500
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 100

interface PendingWrite {
  data: StoredSession
  timer: ReturnType<typeof setTimeout>
  retryCount?: number
}

/**
 * Debounced async session persistence queue.
 * Prevents main thread blocking by using async writes and coalescing
 * rapid successive persist calls into a single write.
 */
class SessionPersistenceQueue {
  private pending = new Map<string, PendingWrite>()
  private debounceMs: number

  constructor(debounceMs = DEFAULT_DEBOUNCE_MS) {
    this.debounceMs = debounceMs
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Queue a session for persistence. If a write is already pending for this
   * session, it will be replaced with the new data and the timer reset.
   */
  enqueue(session: StoredSession): void {
    const existing = this.pending.get(session.id)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      void this.write(session.id)
    }, this.debounceMs)

    this.pending.set(session.id, { data: session, timer })
  }

  /**
   * Write a session to disk immediately in JSONL format.
   * Includes retry logic for transient failures.
   */
  private async write(sessionId: string, retryCount = 0): Promise<void> {
    const entry = this.pending.get(sessionId)
    if (!entry) return

    this.pending.delete(sessionId)

    try {
      const { data } = entry
      ensureSessionsDir(data.workspaceRootPath)
      ensureSessionDir(data.workspaceRootPath, sessionId)

      const filePath = getSessionFilePath(data.workspaceRootPath, sessionId)

      // Prepare session with portable paths for cross-machine compatibility
      const storageSession: StoredSession = {
        ...data,
        workspaceRootPath: toPortablePath(data.workspaceRootPath),
        workingDirectory: data.workingDirectory ? toPortablePath(data.workingDirectory) : undefined,
        sdkCwd: data.sdkCwd ? toPortablePath(data.sdkCwd) : undefined,
        lastUsedAt: Date.now(),
      }

      // Create JSONL content: header + messages (one per line)
      const header = createSessionHeader(storageSession)
      const lines = [
        JSON.stringify(header),
        ...storageSession.messages.map(m => JSON.stringify(m)),
      ]

      await writeFile(filePath, lines.join('\n') + '\n', 'utf-8')
      console.log(`[PersistenceQueue] Wrote session ${sessionId}`)
    } catch (error) {
      // Retry transient failures
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        console.warn(`[PersistenceQueue] Write failed for ${sessionId}, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`)
        // Re-add to pending for retry
        this.pending.set(sessionId, entry)
        await this.sleep(RETRY_DELAY_MS * (retryCount + 1)) // Exponential backoff
        return this.write(sessionId, retryCount + 1)
      }
      console.error(`[PersistenceQueue] Failed to write session ${sessionId} after ${MAX_RETRY_ATTEMPTS} attempts:`, error)
    }
  }

  /**
   * Immediately flush a specific session if pending.
   */
  async flush(sessionId: string): Promise<void> {
    const entry = this.pending.get(sessionId)
    if (entry) {
      clearTimeout(entry.timer)
      await this.write(sessionId)
    }
  }

  /**
   * Cancel a pending write for a session (e.g., when deleting the session).
   */
  cancel(sessionId: string): void {
    const entry = this.pending.get(sessionId)
    if (entry) {
      clearTimeout(entry.timer)
      this.pending.delete(sessionId)
      console.log(`[PersistenceQueue] Cancelled pending write for session ${sessionId}`)
    }
  }

  /**
   * Flush all pending sessions. Call this on app quit.
   * Uses Promise.allSettled to ensure all sessions are attempted
   * even if some fail.
   */
  async flushAll(): Promise<{ succeeded: number; failed: number }> {
    const sessionIds = [...this.pending.keys()]
    if (sessionIds.length === 0) {
      return { succeeded: 0, failed: 0 }
    }

    const results = await Promise.allSettled(sessionIds.map(id => this.flush(id)))

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    if (failed > 0) {
      console.warn(`[PersistenceQueue] flushAll completed: ${succeeded} succeeded, ${failed} failed`)
    } else {
      console.log(`[PersistenceQueue] flushAll completed: ${succeeded} sessions flushed`)
    }

    return { succeeded, failed }
  }

  /**
   * Clean up all pending timers and clear the queue.
   * Call this when disposing of the queue or shutting down.
   */
  dispose(): void {
    for (const [sessionId, entry] of this.pending) {
      clearTimeout(entry.timer)
      console.log(`[PersistenceQueue] Disposed timer for session ${sessionId}`)
    }
    this.pending.clear()
  }

  /**
   * Check if a session has a pending write.
   */
  hasPending(sessionId: string): boolean {
    return this.pending.has(sessionId)
  }

  /**
   * Get count of pending writes.
   */
  get pendingCount(): number {
    return this.pending.size
  }
}

// Singleton instance
export const sessionPersistenceQueue = new SessionPersistenceQueue()

// Named exports for testing/customization
export { SessionPersistenceQueue }
