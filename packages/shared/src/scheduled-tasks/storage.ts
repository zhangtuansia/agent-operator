/**
 * Scheduled Task Storage
 *
 * Filesystem-based storage for scheduled tasks and run history.
 * Tasks are stored at {workspaceRootPath}/scheduled-tasks/config.json
 *
 * Follows the same pattern as labels/storage.ts — simple JSON file with
 * versioned schema, read/write via Node.js fs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Cron } from 'croner';
import type {
  ScheduledTask,
  ScheduledTaskRun,
  TaskState,
  TaskLastStatus,
  Schedule,
} from './types.ts';
import { debug } from '../utils/debug.ts';

const SCHEDULED_TASKS_DIR = 'scheduled-tasks';
const SCHEDULED_TASKS_FILE = 'scheduled-tasks/config.json';

// --- File Schema ---

interface ScheduledTasksFileData {
  version: 1;
  tasks: ScheduledTask[];
  runs: ScheduledTaskRun[];
}

function getEmptyData(): ScheduledTasksFileData {
  return { version: 1, tasks: [], runs: [] };
}

// --- Load / Save ---

export function loadScheduledTasksData(workspaceRootPath: string): ScheduledTasksFileData {
  const configPath = join(workspaceRootPath, SCHEDULED_TASKS_FILE);

  if (!existsSync(configPath)) {
    return getEmptyData();
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw) as ScheduledTasksFileData;
    if (!data.version || !Array.isArray(data.tasks) || !Array.isArray(data.runs)) {
      debug('[scheduledTasks] Invalid data file, returning empty');
      return getEmptyData();
    }
    return data;
  } catch (error) {
    debug('[scheduledTasks] Failed to parse config:', error);
    return getEmptyData();
  }
}

export function saveScheduledTasksData(
  workspaceRootPath: string,
  data: ScheduledTasksFileData
): void {
  const dir = join(workspaceRootPath, SCHEDULED_TASKS_DIR);
  const configPath = join(workspaceRootPath, SCHEDULED_TASKS_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    debug('[scheduledTasks] Failed to save config:', error);
    throw error;
  }
}

// --- Scheduling Helpers ---

/**
 * Calculate the next run time (in ms epoch) for a given schedule.
 * Returns null if the schedule will never fire again.
 */
export function calculateNextRunTime(
  schedule: Schedule,
  lastRunAtMs: number | null
): number | null {
  const now = Date.now();

  switch (schedule.type) {
    case 'at': {
      const targetMs = new Date(schedule.datetime).getTime();
      return targetMs > now ? targetMs : null;
    }
    case 'interval': {
      const intervalMs = schedule.intervalMs;
      if (lastRunAtMs) {
        return Math.max(lastRunAtMs + intervalMs, now);
      }
      return now + intervalMs;
    }
    case 'cron': {
      return getNextCronTime(schedule.expression, now);
    }
    default:
      return null;
  }
}

/**
 * Get the next cron trigger time after the given timestamp.
 * Uses `croner` library (already a dependency).
 */
export function getNextCronTime(expression: string, afterMs: number): number | null {
  try {
    const job = new Cron(expression);
    const next = job.nextRun(new Date(afterMs));
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}

/**
 * Check if a task can meaningfully run after being enabled.
 * Returns a warning key if the task will never fire, null otherwise.
 */
export function validateTaskActivation(task: ScheduledTask): string | null {
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 'at' type with past datetime → will never fire
  if (task.schedule.type === 'at') {
    const targetMs = new Date(task.schedule.datetime).getTime();
    if (targetMs <= now) {
      return 'TASK_AT_PAST';
    }
  }

  // expiresAt is today or in the past → task expired
  if (task.expiresAt && task.expiresAt <= todayStr) {
    return 'TASK_EXPIRED';
  }

  return null;
}

// --- Startup Recovery ---

/**
 * Reset tasks that were stuck in "running" state (e.g., app crashed mid-execution).
 * Should be called once at scheduler startup.
 */
export function resetStuckRunningTasks(workspaceRootPath: string): void {
  const data = loadScheduledTasksData(workspaceRootPath);
  const now = new Date().toISOString();
  let changed = false;

  // Reset stuck runs
  for (const run of data.runs) {
    if (run.status === 'running') {
      run.status = 'error';
      run.finishedAt = now;
      run.error = 'Application was closed during execution';
      changed = true;
    }
  }

  // Reset stuck task states
  for (const task of data.tasks) {
    if (task.state.runningAtMs !== null) {
      task.state.runningAtMs = null;
      task.state.lastStatus = 'error';
      task.state.lastError = 'Application was closed during execution';
      changed = true;
    }
  }

  if (changed) {
    saveScheduledTasksData(workspaceRootPath, data);
  }
}
