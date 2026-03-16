/**
 * Webhook execution utilities shared by automation runtime and RPC test paths.
 */

import type { WebhookAction, WebhookActionResult } from './types.ts';
import { DEFAULT_WEBHOOK_METHOD, HISTORY_FIELD_MAX_LENGTH } from './constants.ts';
import { expandEnvVars } from './utils.ts';

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.length > 20) {
      return `${parsed.origin}${parsed.pathname.slice(0, 15)}...`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return `${url.slice(0, 30)}...`;
  }
}

export function createWebhookHistoryEntry(opts: {
  matcherId: string;
  ok: boolean;
  method?: string;
  url: string;
  statusCode: number;
  durationMs: number;
  attempts?: number;
  error?: string;
  responseBody?: string;
}): Record<string, unknown> {
  return {
    id: opts.matcherId,
    ts: Date.now(),
    ok: opts.ok,
    webhook: {
      method: opts.method ?? DEFAULT_WEBHOOK_METHOD,
      url: redactUrl(opts.url),
      statusCode: opts.statusCode,
      durationMs: opts.durationMs,
      ...(opts.attempts && opts.attempts > 1 ? { attempts: opts.attempts } : {}),
      ...(opts.error ? { error: opts.error.slice(0, HISTORY_FIELD_MAX_LENGTH) } : {}),
      ...(opts.responseBody ? { responseBody: opts.responseBody.slice(0, HISTORY_FIELD_MAX_LENGTH) } : {}),
    },
  };
}

export function createPromptHistoryEntry(opts: {
  matcherId: string;
  ok: boolean;
  sessionId?: string;
  prompt?: string;
  error?: string;
}): Record<string, unknown> {
  return {
    id: opts.matcherId,
    ts: Date.now(),
    ok: opts.ok,
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts.prompt ? { prompt: opts.prompt.slice(0, HISTORY_FIELD_MAX_LENGTH) } : {}),
    ...(opts.error ? { error: opts.error.slice(0, HISTORY_FIELD_MAX_LENGTH) } : {}),
  };
}

export function expandWebhookAction(action: WebhookAction, env: Record<string, string>): WebhookAction {
  const expanded: WebhookAction = {
    ...action,
    url: expandEnvVars(action.url, env),
  };

  if (action.headers) {
    expanded.headers = {};
    for (const [key, value] of Object.entries(action.headers)) {
      expanded.headers[key] = expandEnvVars(value, env);
    }
  }

  if (typeof action.body === 'string') {
    expanded.body = expandEnvVars(action.body, env);
  } else if (action.body !== undefined && typeof action.body === 'object' && action.body !== null) {
    expanded.body = JSON.parse(expandEnvVars(JSON.stringify(action.body), env));
  }

  if (action.auth) {
    if (action.auth.type === 'basic') {
      expanded.auth = {
        type: 'basic',
        username: expandEnvVars(action.auth.username, env),
        password: expandEnvVars(action.auth.password, env),
      };
    } else {
      expanded.auth = {
        type: 'bearer',
        token: expandEnvVars(action.auth.token, env),
      };
    }
  }

  return expanded;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface ExecuteWebhookOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  retry?: RetryConfig;
}

export async function executeWebhookRequest(
  action: WebhookAction,
  options?: ExecuteWebhookOptions,
): Promise<WebhookActionResult> {
  const env = options?.env;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = action.method ?? DEFAULT_WEBHOOK_METHOD;
  const url = env ? expandEnvVars(action.url, env) : action.url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        type: 'webhook',
        url,
        statusCode: 0,
        success: false,
        error: `Invalid URL scheme "${parsed.protocol}" - only http and https are allowed`,
        durationMs: 0,
      };
    }
  } catch {
    return {
      type: 'webhook',
      url,
      statusCode: 0,
      success: false,
      error: `Invalid URL after variable expansion: "${url.slice(0, 50)}"`,
      durationMs: 0,
    };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};

    if (action.auth) {
      if (action.auth.type === 'basic') {
        const user = env ? expandEnvVars(action.auth.username, env) : action.auth.username;
        const pass = env ? expandEnvVars(action.auth.password, env) : action.auth.password;
        headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
      } else {
        const token = env ? expandEnvVars(action.auth.token, env) : action.auth.token;
        headers.Authorization = `Bearer ${token}`;
      }
    }

    if (action.headers) {
      for (const [key, value] of Object.entries(action.headers)) {
        headers[key] = env ? expandEnvVars(value, env) : value;
      }
    }

    let requestBody: string | undefined;
    if (method !== 'GET' && action.body !== undefined) {
      const bodyFormat = action.bodyFormat ?? 'json';

      if (bodyFormat === 'json') {
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
        if (typeof action.body === 'string') {
          requestBody = env ? expandEnvVars(action.body, env) : action.body;
        } else {
          const raw = JSON.stringify(action.body);
          requestBody = env ? expandEnvVars(raw, env) : raw;
        }
      } else if (bodyFormat === 'form') {
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        if (typeof action.body === 'object' && action.body !== null) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(action.body as Record<string, unknown>)) {
            const raw = String(value ?? '');
            params.append(key, env ? expandEnvVars(raw, env) : raw);
          }
          requestBody = params.toString();
        } else {
          const raw = String(action.body);
          requestBody = env ? expandEnvVars(raw, env) : raw;
        }
      } else {
        const raw = String(action.body);
        requestBody = env ? expandEnvVars(raw, env) : raw;
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const success = response.status >= 200 && response.status < 300;
    const maxResponseSize = 4096;
    let responseBody: string | undefined;

    try {
      const text = await response.text();
      if (action.captureResponse) {
        responseBody = text.length > maxResponseSize
          ? `${text.slice(0, maxResponseSize)}...(truncated)`
          : text;
      }
    } catch {
      // Ignore body consumption errors.
    }

    return {
      type: 'webhook',
      url,
      statusCode: response.status,
      success,
      error: success ? undefined : `HTTP ${response.status} ${response.statusText}`,
      durationMs: Date.now() - start,
      ...(responseBody !== undefined ? { responseBody } : {}),
    };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const error = isTimeout
      ? `Request timed out after ${timeoutMs}ms`
      : err instanceof Error ? err.message : 'Unknown error';

    return {
      type: 'webhook',
      url,
      statusCode: 0,
      success: false,
      error,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isTransientFailure(result: WebhookActionResult): boolean {
  if (result.success) return false;
  if (result.statusCode >= 400 && result.statusCode < 500) return false;
  return true;
}

export async function executeWithRetry(
  action: WebhookAction,
  options?: ExecuteWebhookOptions,
): Promise<WebhookActionResult> {
  const maxAttempts = options?.retry?.maxAttempts ?? 0;

  if (maxAttempts <= 0) {
    const result = await executeWebhookRequest(action, options);
    return { ...result, attempts: 1 };
  }

  const initialDelay = options?.retry?.initialDelayMs ?? 1000;
  const maxDelay = options?.retry?.maxDelayMs ?? 10_000;
  const totalStart = Date.now();
  let lastResult: WebhookActionResult | undefined;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    lastResult = await executeWebhookRequest(action, options);

    if (!isTransientFailure(lastResult)) {
      return {
        ...lastResult,
        attempts: attempt + 1,
        durationMs: Date.now() - totalStart,
      };
    }

    if (attempt === maxAttempts) break;

    const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    await new Promise((resolve) => setTimeout(resolve, delay + jitter));
  }

  return {
    ...lastResult!,
    attempts: maxAttempts + 1,
    durationMs: Date.now() - totalStart,
  };
}
