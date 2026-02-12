import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getCredentialManager } from '../credentials/index.ts';
import {
  addLlmConnection,
  getLlmConnection,
  getLlmConnections,
} from '../config/storage.ts';
import {
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  type LlmConnection,
} from '../config/llm-connections.ts';
import {
  startChatGptOAuth,
  exchangeChatGptCode,
  refreshChatGptTokens,
} from './chatgpt-oauth.ts';

export interface ClaudeCliCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface ClaudeOAuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

const CLAUDE_CREDENTIAL_PATHS = [
  join(homedir(), '.claude', '.credentials.json'),
  join(homedir(), '.claude', 'credentials.json'),
  join(homedir(), '.config', 'claude', '.credentials.json'),
  join(homedir(), '.config', 'claude', 'credentials.json'),
];

function parseExpiresAt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // Accept both seconds and milliseconds.
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function normalizeCredentials(record: unknown): ClaudeCliCredentials | null {
  if (!record || typeof record !== 'object') return null;
  const obj = record as Record<string, unknown>;

  const accessTokenRaw =
    obj.accessToken
    ?? obj.access_token
    ?? obj.token
    ?? obj.oauth_token;
  if (typeof accessTokenRaw !== 'string' || accessTokenRaw.trim().length === 0) {
    return null;
  }

  const refreshTokenRaw = obj.refreshToken ?? obj.refresh_token;
  const refreshToken = typeof refreshTokenRaw === 'string' && refreshTokenRaw.trim().length > 0
    ? refreshTokenRaw
    : undefined;

  const expiresAt = parseExpiresAt(
    obj.expiresAt ?? obj.expires_at ?? obj.expiration ?? obj.expiry,
  );

  return {
    accessToken: accessTokenRaw,
    refreshToken,
    expiresAt,
  };
}

function extractCredentialsFromJson(raw: string): ClaudeCliCredentials | null {
  const parsed = JSON.parse(raw) as unknown;
  const direct = normalizeCredentials(parsed);
  if (direct) return direct;

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const nestedCandidates = [
      obj.credentials,
      obj.oauth,
      obj.auth,
      obj.tokens,
      obj.claude,
    ];
    for (const candidate of nestedCandidates) {
      const nested = normalizeCredentials(candidate);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Best-effort import of legacy Claude CLI credentials.
 * Returns null when credentials are unavailable or unsupported.
 */
export function getExistingClaudeCredentials(): ClaudeCliCredentials | null {
  for (const filePath of CLAUDE_CREDENTIAL_PATHS) {
    try {
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, 'utf-8');
      const creds = extractCredentialsFromJson(content);
      if (creds) return creds;
    } catch {
      // Ignore malformed or unreadable files and continue searching.
    }
  }
  return null;
}

export function getExistingClaudeToken(): string | null {
  return getExistingClaudeCredentials()?.accessToken ?? null;
}

export function isClaudeCliInstalled(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Legacy Claude CLI flow compatibility.
 * We keep this API for existing Electron IPC wiring, but native OAuth is preferred.
 */
export async function runClaudeSetupToken(onStatus?: (message: string) => void): Promise<ClaudeOAuthResult> {
  onStatus?.('Checking Claude CLI...');
  if (!isClaudeCliInstalled()) {
    return {
      success: false,
      error: 'Claude CLI is not installed. Please use "Sign in with Claude" instead.',
    };
  }

  onStatus?.('Running claude setup-token...');
  try {
    const result = spawnSync('claude', ['setup-token', '--print'], {
      encoding: 'utf8',
      timeout: 120_000,
    });

    const stdout = `${result.stdout ?? ''}`.trim();
    const stderr = `${result.stderr ?? ''}`.trim();

    if (result.status !== 0) {
      return {
        success: false,
        error: stderr || stdout || `claude setup-token failed with exit code ${result.status ?? -1}`,
      };
    }

    // Prefer explicit token formats first.
    const tokenMatch =
      stdout.match(/sk-ant-[A-Za-z0-9._-]+/)?.[0]
      ?? stdout.match(/access[_\s-]?token["'\s:=]+([A-Za-z0-9._-]+)/i)?.[1]
      ?? (stdout.length > 20 && !stdout.includes('\n') ? stdout : undefined);

    const fallbackToken = getExistingClaudeToken() ?? undefined;
    const token = tokenMatch ?? fallbackToken;

    if (!token) {
      return {
        success: false,
        error: 'Could not read token from Claude CLI output. Please use "Sign in with Claude" instead.',
      };
    }

    return { success: true, token };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
    };
  }
}

function resolveCodexConnectionSlug(): string {
  const explicit = getLlmConnection('codex');
  if (explicit && explicit.providerType === 'openai' && explicit.authType === 'oauth') {
    return explicit.slug;
  }

  const firstOpenAiOauth = getLlmConnections().find(
    (connection) => connection.providerType === 'openai' && connection.authType === 'oauth',
  );
  return firstOpenAiOauth?.slug ?? 'codex';
}

function ensureCodexConnection(slug: string): void {
  if (getLlmConnection(slug)) return;

  const connection: LlmConnection = {
    slug,
    name: 'Codex',
    providerType: 'openai',
    authType: 'oauth',
    models: getDefaultModelsForConnection('openai'),
    defaultModel: getDefaultModelForConnection('openai'),
    createdAt: Date.now(),
  };

  addLlmConnection(connection);
}

/**
 * Compatibility wrapper for existing settings IPC.
 * Starts native ChatGPT OAuth and stores tokens on the Codex connection.
 */
export async function startCodexOAuth(onStatus?: (message: string) => void): Promise<void> {
  const connectionSlug = resolveCodexConnectionSlug();
  ensureCodexConnection(connectionSlug);

  const code = await startChatGptOAuth(onStatus);
  const tokens = await exchangeChatGptCode(code, onStatus);

  const manager = getCredentialManager();
  await manager.setLlmOAuth(connectionSlug, {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
}

/**
 * Compatibility wrapper for existing settings IPC.
 * Checks token presence and refreshes if needed.
 */
export async function isCodexAuthenticated(): Promise<boolean> {
  const connectionSlug = resolveCodexConnectionSlug();
  const manager = getCredentialManager();
  const oauth = await manager.getLlmOAuth(connectionSlug);
  if (!oauth) return false;

  const hasRequiredTokens = Boolean(oauth.accessToken) && Boolean(oauth.idToken);
  if (!hasRequiredTokens) return false;

  if (!oauth.expiresAt || Date.now() < oauth.expiresAt - 5 * 60 * 1000) {
    return true;
  }

  if (!oauth.refreshToken) {
    return false;
  }

  try {
    const refreshed = await refreshChatGptTokens(oauth.refreshToken);
    await manager.setLlmOAuth(connectionSlug, {
      accessToken: refreshed.accessToken,
      idToken: refreshed.idToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    });
    return true;
  } catch {
    return false;
  }
}
