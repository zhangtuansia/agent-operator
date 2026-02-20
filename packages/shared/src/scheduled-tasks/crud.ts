/**
 * Scheduled Task CRUD Operations
 *
 * All operations load → mutate → save the JSON file.
 * Follows the same pattern as labels/crud.ts.
 */

import { randomUUID } from 'crypto';
import {
  loadScheduledTasksData,
  saveScheduledTasksData,
  calculateNextRunTime,
  validateTaskActivation,
} from './storage.ts';
import type {
  ScheduledTask,
  ScheduledTaskRun,
  ScheduledTaskRunWithName,
  ScheduledTaskInput,
  Schedule,
} from './types.ts';

// --- Task CRUD ---

export function listTasks(workspaceRootPath: string): ScheduledTask[] {
  const data = loadScheduledTasksData(workspaceRootPath);
  // Most recent first
  return data.tasks.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getTask(workspaceRootPath: string, id: string): ScheduledTask | null {
  const data = loadScheduledTasksData(workspaceRootPath);
  return data.tasks.find((t) => t.id === id) ?? null;
}

export function createTask(
  workspaceRootPath: string,
  input: ScheduledTaskInput
): ScheduledTask {
  const data = loadScheduledTasksData(workspaceRootPath);
  const now = new Date().toISOString();
  const nextRunAtMs = input.enabled ? calculateNextRunTime(input.schedule, null) : null;

  const task: ScheduledTask = {
    id: randomUUID(),
    name: input.name,
    description: input.description,
    enabled: input.enabled,
    schedule: input.schedule,
    prompt: input.prompt,
    workingDirectory: input.workingDirectory,
    systemPrompt: input.systemPrompt,
    notify: input.notify ?? true,
    expiresAt: input.expiresAt,
    ...(input.sessionId && { sessionId: input.sessionId }),
    state: {
      nextRunAtMs,
      lastRunAtMs: null,
      lastStatus: null,
      lastError: null,
      lastDurationMs: null,
      runningAtMs: null,
      consecutiveErrors: 0,
      totalRuns: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  data.tasks.push(task);
  saveScheduledTasksData(workspaceRootPath, data);
  return task;
}

export function updateTask(
  workspaceRootPath: string,
  id: string,
  input: Partial<ScheduledTaskInput>
): ScheduledTask | null {
  const data = loadScheduledTasksData(workspaceRootPath);
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;

  const now = new Date().toISOString();

  if (input.name !== undefined) task.name = input.name;
  if (input.description !== undefined) task.description = input.description;
  if (input.prompt !== undefined) task.prompt = input.prompt;
  if (input.workingDirectory !== undefined) task.workingDirectory = input.workingDirectory;
  if (input.systemPrompt !== undefined) task.systemPrompt = input.systemPrompt;
  if (input.expiresAt !== undefined) task.expiresAt = input.expiresAt;
  if (input.enabled !== undefined) task.enabled = input.enabled;
  if (input.notify !== undefined) task.notify = input.notify;
  if (input.schedule !== undefined) task.schedule = input.schedule;

  // Recalculate next run if schedule or enabled changed
  if (input.schedule !== undefined || input.enabled !== undefined) {
    task.state.nextRunAtMs = task.enabled
      ? calculateNextRunTime(task.schedule, task.state.lastRunAtMs)
      : null;
  }

  task.updatedAt = now;
  saveScheduledTasksData(workspaceRootPath, data);
  return task;
}

export function deleteTask(workspaceRootPath: string, id: string): boolean {
  const data = loadScheduledTasksData(workspaceRootPath);
  const idx = data.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;

  data.tasks.splice(idx, 1);
  // Also delete associated runs
  data.runs = data.runs.filter((r) => r.taskId !== id);

  saveScheduledTasksData(workspaceRootPath, data);
  return true;
}

export function toggleTask(
  workspaceRootPath: string,
  id: string,
  enabled: boolean
): { task: ScheduledTask | null; warning: string | null } {
  const task = updateTask(workspaceRootPath, id, { enabled });
  if (!task || !enabled) return { task, warning: null };

  const warning = validateTaskActivation(task);
  return { task, warning };
}

// --- Task State Updates (called by scheduler) ---

export function markTaskRunning(
  workspaceRootPath: string,
  id: string,
  runningAtMs: number
): void {
  const data = loadScheduledTasksData(workspaceRootPath);
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return;

  task.state.runningAtMs = runningAtMs;
  task.state.lastStatus = 'running';
  task.updatedAt = new Date().toISOString();

  saveScheduledTasksData(workspaceRootPath, data);
}

export function markTaskCompleted(
  workspaceRootPath: string,
  id: string,
  success: boolean,
  durationMs: number,
  error: string | null,
  schedule: Schedule
): void {
  const data = loadScheduledTasksData(workspaceRootPath);
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return;

  const now = Date.now();
  task.state.runningAtMs = null;
  task.state.lastRunAtMs = now;
  task.state.lastStatus = success ? 'success' : 'error';
  task.state.lastError = error;
  task.state.lastDurationMs = durationMs;
  task.state.consecutiveErrors = success ? 0 : task.state.consecutiveErrors + 1;
  task.state.totalRuns = (task.state.totalRuns ?? 0) + 1;
  task.state.nextRunAtMs = task.enabled ? calculateNextRunTime(schedule, now) : null;
  task.updatedAt = new Date().toISOString();

  saveScheduledTasksData(workspaceRootPath, data);
}

// --- Scheduler Queries ---

/**
 * Get tasks that are due for execution.
 * Returns enabled, non-running, non-expired tasks whose nextRunAtMs <= nowMs.
 */
export function getDueTasks(workspaceRootPath: string, nowMs: number): ScheduledTask[] {
  const data = loadScheduledTasksData(workspaceRootPath);
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);

  return data.tasks.filter(
    (t) =>
      t.enabled &&
      t.state.nextRunAtMs !== null &&
      t.state.nextRunAtMs <= nowMs &&
      t.state.runningAtMs === null &&
      (t.expiresAt === null || t.expiresAt > todayStr)
  );
}

/**
 * Get the earliest next-due time across all active tasks.
 * Used by the scheduler to set the next timer.
 */
export function getNextDueTimeMs(workspaceRootPath: string): number | null {
  const data = loadScheduledTasksData(workspaceRootPath);
  const todayStr = new Date().toISOString().slice(0, 10);

  let earliest: number | null = null;
  for (const t of data.tasks) {
    if (
      t.enabled &&
      t.state.nextRunAtMs !== null &&
      t.state.runningAtMs === null &&
      (t.expiresAt === null || t.expiresAt > todayStr)
    ) {
      if (earliest === null || t.state.nextRunAtMs < earliest) {
        earliest = t.state.nextRunAtMs;
      }
    }
  }
  return earliest;
}

// --- Run History ---

export function createRun(
  workspaceRootPath: string,
  taskId: string,
  trigger: 'scheduled' | 'manual'
): ScheduledTaskRun {
  const data = loadScheduledTasksData(workspaceRootPath);
  const now = new Date().toISOString();

  const run: ScheduledTaskRun = {
    id: randomUUID(),
    taskId,
    sessionId: null,
    status: 'running',
    startedAt: now,
    finishedAt: null,
    durationMs: null,
    error: null,
    trigger,
  };

  data.runs.push(run);
  saveScheduledTasksData(workspaceRootPath, data);
  return run;
}

export function completeRun(
  workspaceRootPath: string,
  runId: string,
  status: 'success' | 'error',
  sessionId: string | null,
  durationMs: number,
  error: string | null
): ScheduledTaskRun | null {
  const data = loadScheduledTasksData(workspaceRootPath);
  const run = data.runs.find((r) => r.id === runId);
  if (!run) return null;

  run.status = status;
  run.sessionId = sessionId;
  run.finishedAt = new Date().toISOString();
  run.durationMs = durationMs;
  run.error = error;

  saveScheduledTasksData(workspaceRootPath, data);
  return run;
}

export function listRuns(
  workspaceRootPath: string,
  taskId: string,
  limit = 50,
  offset = 0
): ScheduledTaskRun[] {
  const data = loadScheduledTasksData(workspaceRootPath);
  return data.runs
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(offset, offset + limit);
}

export function listAllRuns(
  workspaceRootPath: string,
  limit = 50,
  offset = 0
): ScheduledTaskRunWithName[] {
  const data = loadScheduledTasksData(workspaceRootPath);
  const taskMap = new Map(data.tasks.map((t) => [t.id, t.name]));

  return data.runs
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(offset, offset + limit)
    .map((run) => ({
      ...run,
      taskName: taskMap.get(run.taskId) ?? '',
    }));
}

/**
 * Prune old runs for a task, keeping the most recent `keepCount`.
 */
export function pruneRuns(
  workspaceRootPath: string,
  taskId: string,
  keepCount = 100
): void {
  const data = loadScheduledTasksData(workspaceRootPath);

  const taskRuns = data.runs
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  if (taskRuns.length <= keepCount) return;

  const idsToRemove = new Set(taskRuns.slice(keepCount).map((r) => r.id));
  data.runs = data.runs.filter((r) => !idsToRemove.has(r.id));

  saveScheduledTasksData(workspaceRootPath, data);
}
