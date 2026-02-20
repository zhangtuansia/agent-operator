/**
 * Task Scheduler
 *
 * Manages the execution of scheduled tasks. Runs in the main process.
 * Polls for due tasks and creates agent sessions to execute them.
 *
 * Adapted from LobsterAI's Scheduler, with the following changes:
 * - Uses JSON file storage (via crud.ts) instead of sql.js
 * - Creates sessions via Cowork's SessionManager
 * - Broadcasts events via WindowManager
 * - No IM notification support
 */

import type { SessionManager } from './sessions'
import type { WindowManager } from './window-manager'
import type {
  ScheduledTask,
  ScheduledTaskRun,
} from '@agent-operator/shared/scheduled-tasks'
import {
  listTasks,
  listRuns,
  getTask,
  createRun,
  completeRun,
  markTaskRunning,
  markTaskCompleted,
  toggleTask,
  pruneRuns,
  getDueTasks,
  getNextDueTimeMs,
} from '@agent-operator/shared/scheduled-tasks/crud'
import { resetStuckRunningTasks } from '@agent-operator/shared/scheduled-tasks/storage'
import { IPC_CHANNELS } from '../shared/types'
import { showNotification } from './notifications'

interface TaskSchedulerDeps {
  sessionManager: SessionManager
  windowManager: WindowManager
  getWorkspaceRootPaths: () => string[]
}

export class TaskScheduler {
  private sessionManager: SessionManager
  private windowManager: WindowManager
  private getWorkspaceRootPaths: () => string[]

  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private activeTasks: Map<string, AbortController> = new Map()
  private taskSessionIds: Map<string, string> = new Map()

  private static readonly MAX_TIMER_INTERVAL_MS = 60_000
  private static readonly MAX_CONSECUTIVE_ERRORS = 5

  constructor(deps: TaskSchedulerDeps) {
    this.sessionManager = deps.sessionManager
    this.windowManager = deps.windowManager
    this.getWorkspaceRootPaths = deps.getWorkspaceRootPaths
  }

  // --- Lifecycle ---

  start(): void {
    if (this.running) return
    this.running = true

    const rootPaths = this.getWorkspaceRootPaths()
    for (const rootPath of rootPaths) {
      resetStuckRunningTasks(rootPath)
      this.reconcileScheduledLabels(rootPath)
    }

    console.log('[Scheduler] Started')
    this.scheduleNext()
  }

  /**
   * Reconstruct scheduled labels on existing sessions from task config and run history.
   * Ensures sessions created by scheduled tasks have the `scheduled:taskId` label
   * even if it wasn't properly persisted (e.g. after a race condition or crash).
   */
  private reconcileScheduledLabels(rootPath: string): void {
    try {
      const tasks = listTasks(rootPath)
      for (const task of tasks) {
        // Collect all session IDs associated with this task
        const sessionIds = new Set<string>()
        if (task.sessionId) sessionIds.add(task.sessionId)
        // Also check recent runs for sessions used by this task
        const runs = listRuns(rootPath, task.id, 20)
        for (const run of runs) {
          if (run.sessionId) sessionIds.add(run.sessionId)
        }
        // Tag each existing session with the scheduled label
        for (const sid of sessionIds) {
          if (this.sessionManager.hasSession(sid)) {
            this.ensureScheduledLabel(sid, task.id)
          }
        }
      }
    } catch (err) {
      console.warn('[Scheduler] Failed to reconcile scheduled labels:', err)
    }
  }

  /**
   * Ensure a session has the `scheduled:taskId` label.
   * If the label is missing, add it via the session manager.
   */
  private ensureScheduledLabel(sessionId: string, taskId: string): void {
    const existingLabels = this.sessionManager.getSessionLabels(sessionId)
    const label = `scheduled:${taskId}`
    if (!existingLabels.includes(label)) {
      this.sessionManager.setSessionLabels(sessionId, [...existingLabels, label])
    }
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    for (const [, controller] of this.activeTasks) {
      controller.abort()
    }
    this.activeTasks.clear()
    console.log('[Scheduler] Stopped')
  }

  reschedule(): void {
    if (!this.running) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.scheduleNext()
  }

  // --- Core Scheduling ---

  private scheduleNext(): void {
    if (!this.running) return

    const rootPaths = this.getWorkspaceRootPaths()
    if (rootPaths.length === 0) {
      // No workspace yet, retry later
      this.timer = setTimeout(() => {
        this.timer = null
        this.scheduleNext()
      }, TaskScheduler.MAX_TIMER_INTERVAL_MS)
      return
    }

    let nextDueMs: number | null = null
    for (const rootPath of rootPaths) {
      const next = getNextDueTimeMs(rootPath)
      if (next !== null && (nextDueMs === null || next < nextDueMs)) {
        nextDueMs = next
      }
    }
    const now = Date.now()

    let delayMs: number
    if (nextDueMs === null) {
      delayMs = TaskScheduler.MAX_TIMER_INTERVAL_MS
    } else {
      delayMs = Math.min(
        Math.max(nextDueMs - now, 0),
        TaskScheduler.MAX_TIMER_INTERVAL_MS
      )
    }

    this.timer = setTimeout(() => {
      this.timer = null
      this.tick()
    }, delayMs)
  }

  private async tick(): Promise<void> {
    if (!this.running) return

    const rootPaths = this.getWorkspaceRootPaths()
    if (rootPaths.length === 0) {
      this.scheduleNext()
      return
    }

    const now = Date.now()
    const executions: Promise<void>[] = []
    for (const rootPath of rootPaths) {
      const dueTasks = getDueTasks(rootPath, now)
      for (const task of dueTasks) {
        executions.push(this.executeTask(rootPath, task, 'scheduled'))
      }
    }
    await Promise.allSettled(executions)

    this.scheduleNext()
  }

  // --- Task Execution ---

  async executeTask(
    rootPath: string,
    task: ScheduledTask,
    trigger: 'scheduled' | 'manual'
  ): Promise<void> {
    const taskKey = this.getTaskKey(rootPath, task.id)
    if (this.activeTasks.has(taskKey)) {
      console.log(`[Scheduler] Task ${task.id} already running in workspace ${rootPath}, skipping`)
      return
    }

    // Check if task has expired (skip for manual triggers)
    if (trigger === 'scheduled' && task.expiresAt) {
      const todayStr = new Date().toISOString().slice(0, 10)
      if (task.expiresAt <= todayStr) {
        console.log(`[Scheduler] Task ${task.id} expired (${task.expiresAt}), skipping`)
        return
      }
    }

    const startTime = Date.now()
    const run = createRun(rootPath, task.id, trigger)

    markTaskRunning(rootPath, task.id, startTime)
    this.emitTaskStatusUpdate(rootPath, task.id)
    this.emitRunUpdate(run)

    const abortController = new AbortController()
    this.activeTasks.set(taskKey, abortController)

    let sessionId: string | null = null
    let success = false
    let error: string | null = null

    try {
      sessionId = await this.startSession(rootPath, task)
      success = true
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err)
      console.error(`[Scheduler] Task ${task.id} failed:`, error)
    } finally {
      const durationMs = Date.now() - startTime
      this.activeTasks.delete(taskKey)
      this.taskSessionIds.delete(taskKey)

      // Check if task still exists (may have been deleted while running)
      const taskStillExists = getTask(rootPath, task.id) !== null

      if (taskStillExists) {
        // Update run record
        const updatedRun = completeRun(rootPath, run.id, success ? 'success' : 'error', sessionId, durationMs, error)

        // Update task state
        markTaskCompleted(rootPath, task.id, success, durationMs, error, task.schedule)

        // Auto-disable on too many consecutive errors
        const updatedTask = getTask(rootPath, task.id)
        if (updatedTask && updatedTask.state.consecutiveErrors >= TaskScheduler.MAX_CONSECUTIVE_ERRORS) {
          toggleTask(rootPath, task.id, false)
          console.warn(
            `[Scheduler] Task ${task.id} auto-disabled after ${TaskScheduler.MAX_CONSECUTIVE_ERRORS} consecutive errors`
          )
        }

        // Disable one-shot 'at' tasks after execution
        if (task.schedule.type === 'at') {
          toggleTask(rootPath, task.id, false)
        }

        // Prune old run history
        pruneRuns(rootPath, task.id, 100)

        // Emit final updates
        this.emitTaskStatusUpdate(rootPath, task.id)
        if (updatedRun) {
          this.emitRunUpdate(updatedRun)
        }
        const workspaceId = await this.getWorkspaceId(rootPath)
        this.emitChanged(workspaceId)

        // Send system notification
        if (sessionId) {
          if (workspaceId) {
            if (!success) {
              // Error notifications always fire
              showNotification(`❌ ${task.name}`, error ?? '任务执行失败', workspaceId, sessionId)
            } else if (task.notify !== false) {
              // Success notifications respect the notify setting (default true for old tasks without field)
              showNotification(`✅ ${task.name}`, '任务执行成功', workspaceId, sessionId)
            }
          }
        }
      } else {
        console.log(`[Scheduler] Task ${task.id} was deleted during execution, skipping post-run updates`)
      }

      this.reschedule()
    }
  }

  private async startSession(rootPath: string, task: ScheduledTask): Promise<string> {
    // Determine workspace ID from rootPath
    const { getWorkspaces } = await import('@agent-operator/shared/config')
    const workspaces = getWorkspaces()
    const workspace = workspaces.find(w => w.rootPath === rootPath)
    if (!workspace) throw new Error('Workspace not found for scheduled task')

    // If task is bound to an existing session, reuse it
    if (task.sessionId && this.sessionManager.hasSession(task.sessionId)) {
      try {
        this.taskSessionIds.set(this.getTaskKey(rootPath, task.id), task.sessionId)
        // Ensure the bound session has the scheduled label
        this.ensureScheduledLabel(task.sessionId, task.id)
        await this.sessionManager.sendMessage(task.sessionId, task.prompt)
        return task.sessionId
      } catch (err) {
        console.warn(`[Scheduler] Failed to send to bound session ${task.sessionId}, creating new one:`, err)
        // Fall through to create a new session
      }
    }

    // Create a new session for this task (fallback or no bound session)
    const session = await this.sessionManager.createSession(workspace.id, {
      permissionMode: 'allow-all',  // Scheduled tasks run in auto mode
      workingDirectory: task.workingDirectory || undefined,
    })

    this.taskSessionIds.set(this.getTaskKey(rootPath, task.id), session.id)

    // Set title and label via session manager (updates both in-memory and disk)
    await this.sessionManager.renameSession(session.id, `[定时] ${task.name}`)
    this.sessionManager.setSessionLabels(session.id, [`scheduled:${task.id}`])

    // Send the prompt as a message
    await this.sessionManager.sendMessage(session.id, task.prompt)

    return session.id
  }

  // --- Manual Execution ---

  async runManually(workspaceId: string, taskId: string): Promise<void> {
    const rootPath = await this.getWorkspaceRootPathById(workspaceId)
    if (!rootPath) throw new Error(`Workspace not found: ${workspaceId}`)

    const task = getTask(rootPath, taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    await this.executeTask(rootPath, task, 'manual')
  }

  async stopTask(workspaceId: string, taskId: string): Promise<boolean> {
    const rootPath = await this.getWorkspaceRootPathById(workspaceId)
    if (!rootPath) return false

    const taskKey = this.getTaskKey(rootPath, taskId)
    const controller = this.activeTasks.get(taskKey)
    if (controller) {
      // Stop the session if one is running
      const sessionId = this.taskSessionIds.get(taskKey)
      if (sessionId) {
        try {
          this.sessionManager.cancelProcessing(sessionId)
        } catch (err) {
          console.warn(`[Scheduler] Failed to stop session for task ${taskId}:`, err)
        }
      }
      controller.abort()
      return true
    }
    return false
  }

  async isTaskRunning(workspaceId: string, taskId: string): Promise<boolean> {
    const rootPath = await this.getWorkspaceRootPathById(workspaceId)
    if (!rootPath) return false
    return this.activeTasks.has(this.getTaskKey(rootPath, taskId))
  }

  // --- Helpers ---

  private getTaskKey(rootPath: string, taskId: string): string {
    return `${rootPath}::${taskId}`
  }

  private async getWorkspaceRootPathById(workspaceId: string): Promise<string | null> {
    const { getWorkspaceByNameOrId } = await import('@agent-operator/shared/config')
    const workspace = getWorkspaceByNameOrId(workspaceId)
    return workspace?.rootPath ?? null
  }

  private async getWorkspaceId(rootPath: string): Promise<string | null> {
    const { getWorkspaces } = await import('@agent-operator/shared/config')
    const workspace = getWorkspaces().find(w => w.rootPath === rootPath)
    return workspace?.id ?? null
  }

  // --- Event Emission ---

  private emitTaskStatusUpdate(rootPath: string, taskId: string): void {
    const task = getTask(rootPath, taskId)
    if (!task) return

    this.windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_STATUS_UPDATE, {
      taskId: task.id,
      state: task.state,
    })
  }

  private emitRunUpdate(run: ScheduledTaskRun): void {
    this.windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_RUN_UPDATE, { run })
  }

  private emitChanged(workspaceId?: string): void {
    this.windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_CHANGED, workspaceId)
  }
}
