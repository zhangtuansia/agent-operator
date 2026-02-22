/**
 * Credential Manager
 *
 * Main interface for credential storage. Automatically selects the best
 * available backend and provides convenience methods for common operations.
 *
 * Backend priority:
 *   1. Environment variables (server deployment, read-only)
 *   2. Encrypted file storage (cross-platform, no OS keychain prompts)
 */

import type { CredentialBackend } from './backends/types.ts';
import type { CredentialId, CredentialType, StoredCredential } from './types.ts';
import type { LlmAuthType, LlmProviderType } from '../config/llm-connections.ts';
import { SecureStorageBackend } from './backends/secure-storage.ts';
import { EnvironmentBackend } from './backends/env.ts';
import { debug } from '../utils/debug.ts';

export class CredentialManager {
  private backends: CredentialBackend[] = [];
  private writeBackend: CredentialBackend | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Explicitly initialize the credential manager.
   * This is optional - methods auto-initialize via ensureInitialized().
   * Use this for eager initialization at app startup if desired.
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Internal: ensure initialization has completed.
   * Called automatically by all public methods.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Prevent race condition with concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    // Clear promise on failure so initialization can be retried
    this.initPromise = this._doInitialize().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    await this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    // Register backends in priority order (secure storage + environment)
    const potentialBackends: CredentialBackend[] = [
      new SecureStorageBackend(),
      new EnvironmentBackend(),
    ];

    // Check which backends are available
    for (const backend of potentialBackends) {
      if (await backend.isAvailable()) {
        this.backends.push(backend);
        debug(`[CredentialManager] Backend available: ${backend.name} (priority ${backend.priority})`);
      }
    }

    // Sort by priority (highest first)
    this.backends.sort((a, b) => b.priority - a.priority);

    // Find the first writable backend (not environment)
    this.writeBackend = this.backends.find((b) => b.name !== 'environment') || null;

    if (this.writeBackend) {
      debug(`[CredentialManager] Using write backend: ${this.writeBackend.name}`);
    } else {
      debug(`[CredentialManager] WARNING: No writable backend available.`);
    }

    this.initialized = true;
  }

  /** Get the name of the active write backend */
  getActiveBackendName(): string | null {
    return this.writeBackend?.name || null;
  }

  /**
   * Get a credential by ID, trying all backends.
   * Automatically initializes if needed.
   */
  async get(id: CredentialId): Promise<StoredCredential | null> {
    await this.ensureInitialized();

    for (const backend of this.backends) {
      try {
        const cred = await backend.get(id);
        if (cred) {
          debug(`[CredentialManager] Found ${id.type} in ${backend.name}`);
          return cred;
        }
      } catch (err) {
        debug(`[CredentialManager] Error reading from ${backend.name}:`, err);
      }
    }

    return null;
  }

  /**
   * Set a credential using the write backend.
   * Automatically initializes if needed.
   */
  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    await this.ensureInitialized();

    if (!this.writeBackend) {
      throw new Error('No writable credential backend available');
    }

    await this.writeBackend.set(id, credential);
    debug(`[CredentialManager] Saved ${id.type} to ${this.writeBackend.name}`);
  }

  /**
   * Delete a credential from all backends.
   * Automatically initializes if needed.
   */
  async delete(id: CredentialId): Promise<boolean> {
    await this.ensureInitialized();

    let deleted = false;
    for (const backend of this.backends) {
      if (backend.name === 'environment') continue;

      try {
        if (await backend.delete(id)) {
          deleted = true;
          debug(`[CredentialManager] Deleted ${id.type} from ${backend.name}`);
        }
      } catch (err) {
        debug(`[CredentialManager] Error deleting from ${backend.name}:`, err);
      }
    }

    return deleted;
  }

  /**
   * List credentials matching a filter.
   * Automatically initializes if needed.
   */
  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    await this.ensureInitialized();

    const seen = new Set<string>();
    const results: CredentialId[] = [];

    for (const backend of this.backends) {
      try {
        const ids = await backend.list(filter);
        for (const id of ids) {
          const key = JSON.stringify(id);
          if (!seen.has(key)) {
            seen.add(key);
            results.push(id);
          }
        }
      } catch (err) {
        debug(`[CredentialManager] Error listing from ${backend.name}:`, err);
      }
    }

    return results;
  }

  // ============================================================
  // Convenience Methods
  // ============================================================

  /** Get Anthropic API key */
  async getApiKey(): Promise<string | null> {
    const cred = await this.get({ type: 'anthropic_api_key' });
    return cred?.value || null;
  }

  /** Set Anthropic API key */
  async setApiKey(key: string): Promise<void> {
    await this.set({ type: 'anthropic_api_key' }, { value: key });
  }

  /** Get Claude OAuth token */
  async getClaudeOAuth(): Promise<string | null> {
    const cred = await this.get({ type: 'claude_oauth' });
    return cred?.value || null;
  }

  /** Set Claude OAuth token */
  async setClaudeOAuth(token: string): Promise<void> {
    await this.set({ type: 'claude_oauth' }, { value: token });
  }

  /** Get Claude OAuth credentials (with refresh token and expiry) */
  async getClaudeOAuthCredentials(): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    source?: 'native' | 'cli';
  } | null> {
    const cred = await this.get({ type: 'claude_oauth' });
    if (!cred) return null;

    return {
      accessToken: cred.value,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
      source: cred.source,
    };
  }

  /** Set Claude OAuth credentials (with refresh token and expiry) */
  async setClaudeOAuthCredentials(credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    source?: 'native' | 'cli';
  }): Promise<void> {
    await this.set({ type: 'claude_oauth' }, {
      value: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
      source: credentials.source,
    });
  }

  /** Get Operator OAuth token */
  async getOperatorOAuth(): Promise<string | null> {
    const operatorCred = await this.get({ type: 'operator_oauth' });
    if (operatorCred?.value) {
      return operatorCred.value;
    }

    // Backward compatibility for older stores.
    const legacyCred = await this.get({ type: 'craft_oauth' });
    return legacyCred?.value || null;
  }

  /** Set Operator OAuth token */
  async setOperatorOAuth(token: string): Promise<void> {
    await this.set({ type: 'operator_oauth' }, { value: token });
    // Keep legacy credential in sync during migration window.
    await this.set({ type: 'craft_oauth' }, { value: token });
  }

  /** Get workspace OAuth credentials */
  async getWorkspaceOAuth(
    workspaceId: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
    tokenType?: string;
  } | null> {
    const cred = await this.get({ type: 'workspace_oauth', workspaceId });
    if (!cred) return null;

    return {
      accessToken: cred.value,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
      clientId: cred.clientId,
      tokenType: cred.tokenType,
    };
  }

  /** Set workspace OAuth credentials */
  async setWorkspaceOAuth(
    workspaceId: string,
    credentials: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      clientId?: string;
      tokenType?: string;
    }
  ): Promise<void> {
    await this.set(
      { type: 'workspace_oauth', workspaceId },
      {
        value: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
        clientId: credentials.clientId,
        tokenType: credentials.tokenType,
      }
    );
  }

  /** Get workspace bearer token */
  async getWorkspaceBearer(workspaceId: string): Promise<string | null> {
    const cred = await this.get({ type: 'workspace_bearer', workspaceId });
    return cred?.value || null;
  }

  /** Set workspace bearer token */
  async setWorkspaceBearer(workspaceId: string, token: string): Promise<void> {
    await this.set({ type: 'workspace_bearer', workspaceId }, { value: token });
  }

  /** Delete all credentials for a workspace */
  async deleteWorkspaceCredentials(workspaceId: string): Promise<void> {
    // Delete workspace-level credentials
    await this.delete({ type: 'workspace_oauth', workspaceId });
    await this.delete({ type: 'workspace_bearer', workspaceId });

    // Delete all source credentials for this workspace
    const allCreds = await this.list({ workspaceId });
    for (const cred of allCreds) {
      await this.delete(cred);
    }
  }

  // ============================================================
  // LLM Connection Credentials
  // ============================================================

  /** Get API key for an LLM connection */
  async getLlmApiKey(connectionSlug: string): Promise<string | null> {
    const cred = await this.get({ type: 'llm_api_key', connectionSlug });
    return cred?.value || null;
  }

  /** Set API key for an LLM connection */
  async setLlmApiKey(connectionSlug: string, apiKey: string): Promise<void> {
    await this.set({ type: 'llm_api_key', connectionSlug }, { value: apiKey });
  }

  /** Get OAuth credentials for an LLM connection */
  async getLlmOAuth(connectionSlug: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    idToken?: string;
  } | null> {
    const cred = await this.get({ type: 'llm_oauth', connectionSlug });
    if (!cred) return null;
    return {
      accessToken: cred.value,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
      idToken: cred.idToken,
    };
  }

  /** Set OAuth credentials for an LLM connection */
  async setLlmOAuth(connectionSlug: string, credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    idToken?: string;
  }): Promise<void> {
    await this.set({ type: 'llm_oauth', connectionSlug }, {
      value: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
      idToken: credentials.idToken,
    });
  }

  /** Delete all credentials for an LLM connection */
  async deleteLlmCredentials(connectionSlug: string): Promise<void> {
    await this.delete({ type: 'llm_api_key', connectionSlug });
    await this.delete({ type: 'llm_oauth', connectionSlug });
  }

  /**
   * Check whether an LLM connection has usable credentials for the given auth type.
   */
  async hasLlmCredentials(
    connectionSlug: string,
    authType: LlmAuthType,
    providerType?: LlmProviderType,
  ): Promise<boolean> {
    switch (authType) {
      case 'none':
      case 'environment':
        return true;
      case 'api_key':
      case 'api_key_with_endpoint':
      case 'bearer_token': {
        const apiKey = await this.getLlmApiKey(connectionSlug);
        return !!apiKey;
      }
      case 'oauth': {
        const oauth = await this.getLlmOAuth(connectionSlug);
        if (!oauth) return false;
        // OpenAI OAuth requires idToken for downstream codex token injection.
        if (providerType === 'openai' && (!oauth.idToken || !oauth.accessToken)) {
          return false;
        }
        if (oauth.expiresAt && this.isExpired({ value: oauth.accessToken, expiresAt: oauth.expiresAt })) {
          return !!oauth.refreshToken;
        }
        return true;
      }
      case 'iam_credentials':
      case 'service_account_file':
        // Not migrated yet in this repo
        return false;
      default: {
        const _exhaustive: never = authType;
        return _exhaustive;
      }
    }
  }

  /**
   * Check the health of the credential store.
   *
   * Validates:
   * 1. The credential file can be read and decrypted (if it exists)
   * 2. The default LLM connection has valid credentials
   *
   * Use on app startup to detect issues before users hit cryptic errors.
   */
  async checkHealth(): Promise<import('./types.ts').CredentialHealthStatus> {
    const issues: import('./types.ts').CredentialHealthIssue[] = [];

    try {
      await this.ensureInitialized();
      // Try to list credentials — triggers decryption
      await this.list({});
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const lowerMsg = errorMsg.toLowerCase();

      if (lowerMsg.includes('decrypt') || lowerMsg.includes('cipher') || lowerMsg.includes('authentication tag')) {
        issues.push({
          type: 'decryption_failed',
          message: 'Credentials from another machine detected. Please re-authenticate.',
          error: errorMsg,
        });
      } else if (lowerMsg.includes('json') || lowerMsg.includes('parse') || lowerMsg.includes('unexpected')) {
        issues.push({
          type: 'file_corrupted',
          message: 'Credential file is corrupted. Please re-authenticate.',
          error: errorMsg,
        });
      } else {
        issues.push({
          type: 'file_corrupted',
          message: 'Failed to read credentials. Please re-authenticate.',
          error: errorMsg,
        });
      }

      return { healthy: false, issues };
    }

    // Check if default connection has credentials
    try {
      const { getDefaultLlmConnection, getLlmConnection } = await import('../config/storage.ts');
      const defaultSlug = getDefaultLlmConnection();

      if (defaultSlug) {
        const connection = getLlmConnection(defaultSlug);
        if (connection && connection.authType !== 'none' && connection.authType !== 'environment') {
          const hasCredentials = await this.hasLlmCredentials(
            defaultSlug,
            connection.authType,
            connection.providerType
          );
          if (!hasCredentials) {
            issues.push({
              type: 'no_default_credentials',
              message: `No credentials found for default connection "${connection.name}".`,
            });
          }
        }
      }
    } catch {
      // Config not yet initialized — skip this check
      debug('[CredentialManager] Skipping default connection check - config not available');
    }

    return { healthy: issues.length === 0, issues };
  }

  /** Check if a credential is expired (with 5-minute buffer) */
  isExpired(credential: StoredCredential): boolean {
    if (!credential.expiresAt) return false;
    // Consider expired if within 5 minutes of expiry
    return Date.now() > credential.expiresAt - 5 * 60 * 1000;
  }
}

// Singleton instance
let manager: CredentialManager | null = null;

export function getCredentialManager(): CredentialManager {
  if (!manager) {
    manager = new CredentialManager();
  }
  return manager;
}
