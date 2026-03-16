/**
 * Persistent deferred retry queue for failed webhook automations.
 */

import { appendFile, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WebhookAction, WebhookActionResult } from './types.ts';
import { AUTOMATIONS_HISTORY_FILE, AUTOMATIONS_RETRY_QUEUE_FILE } from './constants.ts';
import { createWebhookHistoryEntry, executeWebhookRequest } from './webhook-utils.ts';
import { createLogger } from '../utils/debug.ts';

const log = createLogger('retry-scheduler');

const DEFERRED_DELAYS_MS = [
  5 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

const MAX_DEFERRED_ATTEMPTS = DEFERRED_DELAYS_MS.length;
const TICK_INTERVAL_MS = 60_000;

export interface RetryQueueEntry {
  id: string;
  matcherId: string;
  action: WebhookAction;
  expandedUrl: string;
  deferredAttempt: number;
  nextRetryAt: number;
  createdAt: number;
  lastError?: string;
}

export interface RetrySchedulerOptions {
  workspaceRootPath: string;
}

export class RetryScheduler {
  private readonly workspaceRootPath: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(options: RetrySchedulerOptions) {
    this.workspaceRootPath = options.workspaceRootPath;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    log.debug('[RetryScheduler] Started');
    setTimeout(() => void this.tick(), 5_000);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.debug('[RetryScheduler] Disposed');
  }

  async enqueue(
    matcherId: string,
    action: WebhookAction,
    expandedUrl: string,
    lastError?: string,
  ): Promise<void> {
    const entry: RetryQueueEntry = {
      id: `${matcherId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      matcherId,
      action,
      expandedUrl,
      deferredAttempt: 0,
      nextRetryAt: Date.now() + DEFERRED_DELAYS_MS[0]!,
      createdAt: Date.now(),
      lastError,
    };

    const queuePath = join(this.workspaceRootPath, AUTOMATIONS_RETRY_QUEUE_FILE);
    await appendFile(queuePath, `${JSON.stringify(entry)}\n`, 'utf-8');
    log.debug(`[RetryScheduler] Enqueued ${entry.id}`);
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const queuePath = join(this.workspaceRootPath, AUTOMATIONS_RETRY_QUEUE_FILE);
      const historyPath = join(this.workspaceRootPath, AUTOMATIONS_HISTORY_FILE);

      let raw: string;
      try {
        raw = await readFile(queuePath, 'utf-8');
      } catch {
        return;
      }

      const lines = raw.trim().split('\n').filter(Boolean);
      if (lines.length === 0) return;

      const entries: RetryQueueEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as RetryQueueEntry);
        } catch {
          // Ignore malformed lines.
        }
      }

      const remaining: RetryQueueEntry[] = [];
      const now = Date.now();

      for (const entry of entries) {
        if (entry.nextRetryAt > now) {
          remaining.push(entry);
          continue;
        }

        log.debug(`[RetryScheduler] Retrying ${entry.id}`);
        let result: WebhookActionResult;
        try {
          result = await executeWebhookRequest(entry.action, { timeoutMs: 30_000 });
        } catch (err) {
          result = {
            type: 'webhook',
            url: entry.expandedUrl,
            statusCode: 0,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }

        if (result.success) {
          const historyEntry = createWebhookHistoryEntry({
            matcherId: entry.matcherId,
            ok: true,
            method: entry.action.method,
            url: entry.expandedUrl,
            statusCode: result.statusCode,
            durationMs: result.durationMs ?? 0,
            attempts: entry.deferredAttempt + 1,
          });
          void appendFile(historyPath, `${JSON.stringify(historyEntry)}\n`, 'utf-8');
          continue;
        }

        if (entry.deferredAttempt + 1 >= MAX_DEFERRED_ATTEMPTS) {
          const historyEntry = createWebhookHistoryEntry({
            matcherId: entry.matcherId,
            ok: false,
            method: entry.action.method,
            url: entry.expandedUrl,
            statusCode: result.statusCode,
            durationMs: result.durationMs ?? 0,
            attempts: entry.deferredAttempt + 1,
            error: result.error ?? 'Unknown error',
          });
          void appendFile(historyPath, `${JSON.stringify(historyEntry)}\n`, 'utf-8');
          continue;
        }

        const nextDelay = DEFERRED_DELAYS_MS[entry.deferredAttempt + 1]!;
        remaining.push({
          ...entry,
          deferredAttempt: entry.deferredAttempt + 1,
          nextRetryAt: Date.now() + nextDelay,
          lastError: result.error,
        });
      }

      if (remaining.length === 0) {
        await writeFile(queuePath, '', 'utf-8');
      } else {
        await writeFile(queuePath, `${remaining.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf-8');
      }
    } catch (err) {
      log.debug(`[RetryScheduler] Tick error: ${err}`);
    } finally {
      this.processing = false;
    }
  }
}
