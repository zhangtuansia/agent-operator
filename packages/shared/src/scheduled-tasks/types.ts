/**
 * Scheduled Task Types
 *
 * Adapted from LobsterAI scheduled task types.
 * Supports one-time (at), interval, and cron scheduling.
 */

// --- Schedule Types ---

export interface ScheduleAt {
  type: 'at';
  datetime: string; // ISO 8601
}

export interface ScheduleInterval {
  type: 'interval';
  intervalMs: number;
  unit: 'minutes' | 'hours' | 'days';
  value: number;
}

export interface ScheduleCron {
  type: 'cron';
  expression: string; // 5-field CRON expression
}

export type Schedule = ScheduleAt | ScheduleInterval | ScheduleCron;

// --- Task State ---

export type TaskLastStatus = 'success' | 'error' | 'running' | null;

export interface TaskState {
  nextRunAtMs: number | null;
  lastRunAtMs: number | null;
  lastStatus: TaskLastStatus;
  lastError: string | null;
  lastDurationMs: number | null;
  runningAtMs: number | null;
  consecutiveErrors: number;
  /** Total number of completed runs (success or error) */
  totalRuns: number;
}

// --- Scheduled Task ---

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: Schedule;
  prompt: string;
  workingDirectory: string;
  systemPrompt: string;
  expiresAt: string | null; // ISO 8601 date (day precision), null = no expiry
  /** Send system notification on completion (default true) */
  notify: boolean;
  /** Session ID to reuse for task runs (if set, scheduler sends to this session instead of creating new ones) */
  sessionId?: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
}

// --- Run History ---

export interface ScheduledTaskRun {
  id: string;
  taskId: string;
  sessionId: string | null;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  trigger: 'scheduled' | 'manual';
}

/** Run record with task name (for global history list) */
export interface ScheduledTaskRunWithName extends ScheduledTaskRun {
  taskName: string;
}

// --- Input Types ---

export interface ScheduledTaskInput {
  name: string;
  description: string;
  schedule: Schedule;
  prompt: string;
  workingDirectory: string;
  systemPrompt: string;
  expiresAt: string | null;
  enabled: boolean;
  /** Send system notification on completion (default true) */
  notify: boolean;
  /** Session ID to bind this task to (runs will send messages to this session) */
  sessionId?: string;
}

// --- IPC Events ---

export interface ScheduledTaskStatusEvent {
  taskId: string;
  state: TaskState;
}

export interface ScheduledTaskRunEvent {
  run: ScheduledTaskRun;
}
