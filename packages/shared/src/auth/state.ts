/**
 * Unified Auth State Management
 *
 * Provides a single source of truth for all authentication state:
 * - OAuth (for accessing API and MCP servers)
 * - Billing configuration (api_key, oauth_token, or bedrock)
 * - Workspace/MCP configuration
 */

import { getCredentialManager } from '../credentials/index.ts';
import { loadStoredConfig, getActiveWorkspace, saveConfig, generateWorkspaceId, type AuthType, type Workspace } from '../config/storage.ts';
import { getDefaultWorkspacesDir } from '../workspaces/storage.ts';
import { refreshClaudeToken, isTokenExpired, getExistingClaudeCredentials } from './claude-token.ts';
import { debug } from '../utils/debug.ts';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Debug logging to file (for GUI launch debugging)
function debugLog(msg: string): void {
  try {
    const logDir = join(homedir(), '.agent-operator', 'logs');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, 'bedrock-debug.log');
    const timestamp = new Date().toISOString();
    appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  } catch {
    // Ignore logging errors
  }
}

/**
 * Shell config files to check for Bedrock configuration.
 */
const SHELL_CONFIG_FILES = ['.zshrc', '.bashrc', '.bash_profile', '.profile'];

/**
 * Check if user has CLAUDE_CODE_USE_BEDROCK=1 in their shell config files.
 * This is needed because macOS GUI apps don't inherit shell environment variables.
 * Also extracts and sets AWS_REGION if found.
 */
function checkShellConfigForBedrock(): boolean {
  const home = homedir();
  debugLog(`checkShellConfigForBedrock: home = ${home}`);

  for (const configFile of SHELL_CONFIG_FILES) {
    const configPath = join(home, configFile);
    debugLog(`checkShellConfigForBedrock: checking ${configPath}`);
    try {
      if (existsSync(configPath)) {
        debugLog(`checkShellConfigForBedrock: ${configPath} exists, reading...`);
        const content = readFileSync(configPath, 'utf-8');
        // Look for export CLAUDE_CODE_USE_BEDROCK=1 (with or without quotes)
        const hasBedrockExport = /export\s+CLAUDE_CODE_USE_BEDROCK\s*=\s*["']?1["']?/.test(content);
        debugLog(`checkShellConfigForBedrock: ${configPath} hasBedrockExport = ${hasBedrockExport}`);
        if (hasBedrockExport) {
          debug(`[auth] Found CLAUDE_CODE_USE_BEDROCK=1 in ${configPath}`);

          // Also extract AWS_REGION if present
          const regionMatch = content.match(/export\s+AWS_REGION\s*=\s*["']?([a-z0-9-]+)["']?/);
          if (regionMatch && !process.env.AWS_REGION) {
            process.env.AWS_REGION = regionMatch[1];
            debug(`[auth] Found AWS_REGION=${regionMatch[1]} in ${configPath}`);
          }

          // Extract AWS_PROFILE if present
          const profileMatch = content.match(/export\s+(?:AWS_PROFILE|CLAUDE_CODE_AWS_PROFILE)\s*=\s*["']?([a-zA-Z0-9_-]+)["']?/);
          if (profileMatch && !process.env.AWS_PROFILE) {
            process.env.AWS_PROFILE = profileMatch[1];
            debug(`[auth] Found AWS_PROFILE=${profileMatch[1]} in ${configPath}`);
          }

          return true;
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  return false;
}

/**
 * Check if AWS credentials are configured for Bedrock.
 * Looks for ~/.aws/credentials file existence as a hint.
 */
function hasAwsCredentials(): boolean {
  const awsCredentialsPath = join(homedir(), '.aws', 'credentials');
  return existsSync(awsCredentialsPath);
}

/**
 * Check if AWS Bedrock mode is enabled.
 * Detection sources (any of these triggers Bedrock mode):
 * 1. Environment variable: CLAUDE_CODE_USE_BEDROCK=1
 * 2. Config file: authType === 'bedrock'
 * 3. Shell config files (.zshrc, .bashrc, etc.) contain CLAUDE_CODE_USE_BEDROCK=1
 */
export function isBedrockMode(): boolean {
  debugLog('isBedrockMode() called');
  debugLog(`process.env.CLAUDE_CODE_USE_BEDROCK = ${process.env.CLAUDE_CODE_USE_BEDROCK}`);

  // Check environment variable first (highest priority)
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    debugLog('Detected via env var');
    return true;
  }

  // Check config file
  const config = loadStoredConfig();
  debugLog(`config.authType = ${config?.authType}`);
  if (config?.authType === 'bedrock') {
    debugLog('Detected via config file');
    return true;
  }

  // Check shell config files (for macOS GUI apps that don't inherit env vars)
  debugLog('Checking shell config files...');
  if (checkShellConfigForBedrock()) {
    // Also set the env var so SDK subprocess can use it
    process.env.CLAUDE_CODE_USE_BEDROCK = '1';
    debugLog('Detected via shell config, set env var');
    return true;
  }

  debugLog('Not in Bedrock mode');
  return false;
}

/**
 * Auto-create minimal config for Bedrock users who have environment variables set
 * but no config.json file yet. This allows them to skip onboarding entirely.
 */
function ensureBedrockConfig(): void {
  debugLog('ensureBedrockConfig() called');
  const bedrockMode = isBedrockMode();
  debugLog(`ensureBedrockConfig: isBedrockMode() = ${bedrockMode}`);

  if (!bedrockMode) return;

  const existingConfig = loadStoredConfig();
  debugLog(`ensureBedrockConfig: existingConfig.authType = ${existingConfig?.authType}`);
  if (existingConfig?.authType === 'bedrock') return; // Already configured

  debugLog('Bedrock mode detected, auto-creating config');
  debug('[auth] Bedrock mode detected, auto-creating config');

  const workspaceId = generateWorkspaceId();
  saveConfig({
    authType: 'bedrock',
    workspaces: [{
      id: workspaceId,
      name: 'Default',
      rootPath: `${getDefaultWorkspacesDir()}/${workspaceId}`,
      createdAt: Date.now(),
    }],
    activeWorkspaceId: workspaceId,
    activeSessionId: null,
  });
}

// ============================================
// Types
// ============================================

export interface AuthState {
  /** Platform authentication (for accessing API and MCP) */
  craft: {
    hasToken: boolean;
    token: string | null;
  };

  /** Claude API billing configuration */
  billing: {
    /** Configured billing type, or null if not yet configured */
    type: AuthType | null;
    /** True if we have the required credentials for the configured billing type */
    hasCredentials: boolean;
    /** Anthropic API key (if using api_key auth type) */
    apiKey: string | null;
    /** Claude Max OAuth token (if using oauth_token auth type) */
    claudeOAuthToken: string | null;
  };

  /** Workspace/MCP configuration */
  workspace: {
    hasWorkspace: boolean;
    active: Workspace | null;
  };
}

export interface SetupNeeds {
  /** No auth token AND no workspace → show full onboarding (new user) */
  needsAuth: boolean;
  /** Has workspace but token expired/missing → show simple re-login screen */
  needsReauth: boolean;
  /** No billing type configured → show billing picker */
  needsBillingConfig: boolean;
  /** Billing type set but missing credentials → show credential entry */
  needsCredentials: boolean;
  /** Everything complete → go straight to App */
  isFullyConfigured: boolean;
}

// ============================================
// Functions
// ============================================

/**
 * Get and refresh Claude OAuth token if needed
 * This function:
 * 1. Checks if we have a token in our credential store
 * 2. If not, tries to import from Claude CLI keychain
 * 3. If token is expired and we have a refresh token, refreshes it
 * 4. Returns the valid access token
 */
async function getValidClaudeOAuthToken(): Promise<string | null> {
  const manager = getCredentialManager();

  // Try to get credentials from our store
  let creds = await manager.getClaudeOAuthCredentials();

  // If we don't have credentials in our store, try to import from Claude CLI
  if (!creds) {
    const cliCreds = getExistingClaudeCredentials();
    if (cliCreds) {
      debug('[auth] Importing Claude credentials from CLI keychain');
      await manager.setClaudeOAuthCredentials({
        accessToken: cliCreds.accessToken,
        refreshToken: cliCreds.refreshToken,
        expiresAt: cliCreds.expiresAt,
      });
      creds = cliCreds;
    }
  }

  if (!creds) {
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(creds.expiresAt)) {
    debug('[auth] Claude OAuth token expired, attempting refresh');

    // Try to refresh if we have a refresh token
    if (creds.refreshToken) {
      try {
        const refreshed = await refreshClaudeToken(creds.refreshToken);
        debug('[auth] Successfully refreshed Claude OAuth token');

        // Store the new credentials
        await manager.setClaudeOAuthCredentials({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        });

        return refreshed.accessToken;
      } catch (error) {
        debug('[auth] Failed to refresh Claude OAuth token:', error);
        // Token refresh failed - return null to trigger re-authentication
        return null;
      }
    } else {
      debug('[auth] No refresh token available, cannot refresh expired token');
      return null;
    }
  }

  return creds.accessToken;
}

/**
 * Get complete authentication state from all sources (config file + credential store)
 */
export async function getAuthState(): Promise<AuthState> {
  debugLog('getAuthState() called');

  // Auto-create config for Bedrock users if needed
  debugLog('Calling ensureBedrockConfig()...');
  ensureBedrockConfig();

  const config = loadStoredConfig();
  debugLog(`config.authType = ${config?.authType}`);
  debugLog(`config.workspaces.length = ${config?.workspaces?.length ?? 0}`);
  debugLog(`config.activeWorkspaceId = ${config?.activeWorkspaceId}`);
  const manager = getCredentialManager();

  const craftToken = await manager.getOperatorOAuth();
  const apiKey = await manager.getApiKey();
  const claudeOAuth = await getValidClaudeOAuthToken();
  const activeWorkspace = getActiveWorkspace();

  // Determine if billing credentials are satisfied based on auth type
  let hasCredentials = false;
  if (config?.authType === 'api_key') {
    hasCredentials = !!apiKey;
  } else if (config?.authType === 'oauth_token') {
    hasCredentials = !!claudeOAuth;
  } else if (config?.authType === 'bedrock') {
    // Bedrock uses AWS credentials from ~/.aws/credentials, not our credential store
    hasCredentials = true;
  }

  return {
    craft: {
      hasToken: !!craftToken,
      token: craftToken,
    },
    billing: {
      type: config?.authType ?? null,
      hasCredentials,
      apiKey,
      claudeOAuthToken: claudeOAuth,
    },
    workspace: {
      hasWorkspace: !!activeWorkspace,
      active: activeWorkspace,
    },
  };
}

/**
 * Derive what setup steps are needed based on current auth state
 */
export function getSetupNeeds(state: AuthState): SetupNeeds {
  debugLog('getSetupNeeds() called');
  debugLog(`state.craft.hasToken = ${state.craft.hasToken}`);
  debugLog(`state.billing.type = ${state.billing.type}`);
  debugLog(`state.billing.hasCredentials = ${state.billing.hasCredentials}`);
  debugLog(`state.workspace.hasWorkspace = ${state.workspace.hasWorkspace}`);

  // OAuth is only required for new users (no workspace) who need to select a space during onboarding
  const needsAuth = !state.craft.hasToken && !state.workspace.hasWorkspace;

  // Reauth is not needed for api_key or oauth_token billing
  const needsReauth = false;

  // Need billing config if no billing type is set
  const needsBillingConfig = state.billing.type === null;

  // Need credentials if billing type is set but credentials are missing
  const needsCredentials = state.billing.type !== null && !state.billing.hasCredentials;

  const isFullyConfigured = !needsAuth && !needsReauth && !needsBillingConfig && !needsCredentials;

  debugLog(`getSetupNeeds result: needsAuth=${needsAuth}, needsBillingConfig=${needsBillingConfig}, needsCredentials=${needsCredentials}, isFullyConfigured=${isFullyConfigured}`);

  return {
    needsAuth,
    needsReauth,
    needsBillingConfig,
    needsCredentials,
    isFullyConfigured,
  };
}
