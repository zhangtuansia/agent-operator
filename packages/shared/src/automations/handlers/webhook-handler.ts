/**
 * WebhookHandler - processes webhook automation actions for app events.
 */

import { appendFile } from 'fs/promises';
import { join } from 'path';
import type { AutomationHandler, AutomationsConfigProvider } from './types.ts';
import type { BaseEventPayload, EventBus } from '../event-bus.ts';
import type { AppEvent, AutomationEvent, WebhookAction, WebhookActionResult } from '../types.ts';
import { APP_EVENTS } from '../types.ts';
import { AUTOMATIONS_HISTORY_FILE } from '../constants.ts';
import { buildWebhookEnv, expandEnvVars, matcherMatches } from '../utils.ts';
import {
  createWebhookHistoryEntry,
  executeWithRetry,
  expandWebhookAction,
  isTransientFailure,
  redactUrl,
} from '../webhook-utils.ts';
import { RetryScheduler } from '../retry-scheduler.ts';
import { createLogger } from '../../utils/debug.ts';

const log = createLogger('webhook-handler');

export interface WebhookHandlerOptions {
  workspaceId: string;
  workspaceRootPath: string;
  onWebhookResults?: (results: WebhookActionResult[]) => void;
  onError?: (event: AutomationEvent, error: Error) => void;
}

interface WebhookTask {
  action: WebhookAction;
  matcherId: string;
}

class EndpointRateLimiter {
  private windows = new Map<string, number[]>();
  private readonly maxPerMinute: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxPerMinute = 30) {
    this.maxPerMinute = maxPerMinute;
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 120_000;
      for (const [origin, timestamps] of this.windows) {
        if (timestamps.every((timestamp) => timestamp < cutoff)) {
          this.windows.delete(origin);
        }
      }
    }, 300_000);
  }

  allow(url: string): boolean {
    const origin = this.getOrigin(url);
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (this.windows.get(origin) ?? []).filter((timestamp) => timestamp > windowStart);

    if (timestamps.length >= this.maxPerMinute) {
      return false;
    }

    timestamps.push(now);
    this.windows.set(origin, timestamps);
    return true;
  }

  private getOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.windows.clear();
  }
}

export class WebhookHandler implements AutomationHandler {
  private readonly options: WebhookHandlerOptions;
  private readonly configProvider: AutomationsConfigProvider;
  private readonly rateLimiter = new EndpointRateLimiter(30);
  private readonly retryScheduler: RetryScheduler;
  private bus: EventBus | null = null;
  private boundHandler: ((event: AutomationEvent, payload: BaseEventPayload) => Promise<void>) | null = null;

  constructor(options: WebhookHandlerOptions, configProvider: AutomationsConfigProvider) {
    this.options = options;
    this.configProvider = configProvider;
    this.retryScheduler = new RetryScheduler({ workspaceRootPath: options.workspaceRootPath });
  }

  subscribe(bus: EventBus): void {
    this.bus = bus;
    this.boundHandler = this.handleEvent.bind(this);
    bus.onAny(this.boundHandler);
    this.retryScheduler.start();
    log.debug('[WebhookHandler] Subscribed to event bus');
  }

  private async handleEvent(event: AutomationEvent, payload: BaseEventPayload): Promise<void> {
    if (!APP_EVENTS.includes(event as AppEvent)) {
      return;
    }

    const matchers = this.configProvider.getMatchersForEvent(event);
    if (matchers.length === 0) return;

    const webhookTasks: WebhookTask[] = [];
    for (const matcher of matchers) {
      if (!matcherMatches(matcher, event, payload as unknown as Record<string, unknown>)) continue;
      for (const action of matcher.actions) {
        if (action.type === 'webhook') {
          webhookTasks.push({ action, matcherId: matcher.id ?? 'unknown' });
        }
      }
    }

    if (webhookTasks.length === 0) return;

    log.debug(`[WebhookHandler] Processing ${webhookTasks.length} webhooks for ${event}`);

    const env = buildWebhookEnv(event, payload);
    const results: WebhookActionResult[] = new Array(webhookTasks.length);
    const toExecute: Array<{ index: number; task: WebhookTask }> = [];

    for (let index = 0; index < webhookTasks.length; index++) {
      const task = webhookTasks[index]!;
      const resolvedUrl = expandEnvVars(task.action.url, env);
      if (!this.rateLimiter.allow(resolvedUrl)) {
        log.debug(`[WebhookHandler] Rate-limited: ${redactUrl(resolvedUrl)}`);
        results[index] = {
          type: 'webhook',
          url: resolvedUrl,
          statusCode: 0,
          success: false,
          error: 'Rate-limited: too many requests to this endpoint',
          durationMs: 0,
          attempts: 0,
        };
      } else {
        toExecute.push({ index, task });
      }
    }

    if (toExecute.length > 0) {
      const webhookOpts = { env, retry: { maxAttempts: 2 } };
      const outcomes = await Promise.allSettled(
        toExecute.map(({ task }) => executeWithRetry(task.action, webhookOpts)),
      );

      for (let index = 0; index < outcomes.length; index++) {
        const outcome = outcomes[index]!;
        const target = toExecute[index]!;
        if (outcome.status === 'fulfilled') {
          results[target.index] = outcome.value;
        } else {
          results[target.index] = {
            type: 'webhook',
            url: target.task.action.url,
            statusCode: 0,
            success: false,
            error: outcome.reason?.message ?? 'Unknown error',
          };
        }
      }
    }

    const historyPath = join(this.options.workspaceRootPath, AUTOMATIONS_HISTORY_FILE);
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!;
      const task = webhookTasks[index]!;

      if (!result.success) {
        log.debug(`[WebhookHandler] ${result.url} -> ${result.error}`);
      }

      const entry = createWebhookHistoryEntry({
        matcherId: task.matcherId,
        ok: result.success,
        method: task.action.method,
        url: result.url,
        statusCode: result.statusCode,
        durationMs: result.durationMs ?? 0,
        attempts: result.attempts,
        error: result.error,
        responseBody: result.responseBody,
      });
      void appendFile(historyPath, `${JSON.stringify(entry)}\n`, 'utf-8');

      if (isTransientFailure(result) && result.attempts && result.attempts > 1) {
        const expandedAction = expandWebhookAction(task.action, env);
        void this.retryScheduler.enqueue(task.matcherId, expandedAction, result.url, result.error);
      }
    }

    if (results.length > 0 && this.options.onWebhookResults) {
      this.options.onWebhookResults(results);
    }
  }

  dispose(): void {
    if (this.bus && this.boundHandler) {
      this.bus.offAny(this.boundHandler);
      this.boundHandler = null;
    }
    this.bus = null;
    this.rateLimiter.dispose();
    this.retryScheduler.dispose();
    log.debug('[WebhookHandler] Disposed');
  }
}
