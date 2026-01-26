/**
 * Codex Authentication
 *
 * Handles authentication detection and OAuth flow for OpenAI Codex.
 * Codex stores credentials in ~/.codex/ directory.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import open from 'open';
import { debug } from '../utils/debug.ts';

/**
 * Get the Codex home directory
 */
export function getCodexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

/**
 * Get path to Codex auth file
 */
function getAuthFilePath(): string {
  const codexHome = getCodexHome();
  // Codex uses either auth.json or .credentials.json depending on version
  const authJson = join(codexHome, 'auth.json');
  const credentialsJson = join(codexHome, '.credentials.json');

  if (existsSync(authJson)) return authJson;
  if (existsSync(credentialsJson)) return credentialsJson;

  return authJson; // Default path
}

/**
 * Check if Codex is authenticated
 * Returns true if valid credentials exist in ~/.codex/
 */
export function isCodexAuthenticated(): boolean {
  try {
    const authFile = getAuthFilePath();

    if (!existsSync(authFile)) {
      debug('[CodexAuth] No auth file found');
      return false;
    }

    const content = readFileSync(authFile, 'utf-8');
    const auth = JSON.parse(content);

    // Check for valid token
    if (auth.access_token || auth.token || auth.api_key) {
      debug('[CodexAuth] Valid credentials found');
      return true;
    }

    debug('[CodexAuth] Auth file exists but no valid token');
    return false;
  } catch (error) {
    debug('[CodexAuth] Error checking auth:', error);
    return false;
  }
}

/**
 * Async version of isCodexAuthenticated
 */
export async function isCodexAuthenticatedAsync(): Promise<boolean> {
  return isCodexAuthenticated();
}

/**
 * Get Codex auth status with details
 */
export interface CodexAuthStatus {
  authenticated: boolean;
  authType?: 'oauth' | 'api_key';
  email?: string;
  expiresAt?: number;
}

export function getCodexAuthStatus(): CodexAuthStatus {
  try {
    const authFile = getAuthFilePath();

    if (!existsSync(authFile)) {
      return { authenticated: false };
    }

    const content = readFileSync(authFile, 'utf-8');
    const auth = JSON.parse(content);

    if (auth.access_token || auth.token) {
      return {
        authenticated: true,
        authType: 'oauth',
        email: auth.email || auth.user?.email,
        expiresAt: auth.expires_at || auth.expiry,
      };
    }

    if (auth.api_key) {
      return {
        authenticated: true,
        authType: 'api_key',
      };
    }

    return { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

/**
 * Start Codex OAuth flow
 * Opens browser for ChatGPT login
 */
export async function startCodexOAuth(
  onStatus?: (message: string) => void
): Promise<void> {
  onStatus?.('Opening browser for ChatGPT login...');

  // Codex CLI handles OAuth internally via `codex login`
  // We spawn the login command which opens the browser
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    // Try to find codex executable
    const codexPaths = [
      'codex', // In PATH
      join(homedir(), '.local', 'bin', 'codex'), // Common install location
      '/usr/local/bin/codex',
    ];

    let codexPath = 'codex';
    for (const path of codexPaths) {
      try {
        if (path === 'codex' || existsSync(path)) {
          codexPath = path;
          break;
        }
      } catch {
        continue;
      }
    }

    debug('[CodexAuth] Starting OAuth with:', codexPath);
    onStatus?.('Starting Codex login...');

    const loginProcess = spawn(codexPath, ['login'], {
      stdio: 'inherit', // Show output to user
      shell: true,
    });

    loginProcess.on('close', (code) => {
      if (code === 0) {
        onStatus?.('Login successful!');
        resolve();
      } else {
        reject(new Error(`Codex login failed with code ${code}`));
      }
    });

    loginProcess.on('error', (error) => {
      debug('[CodexAuth] Login error:', error);
      // Fallback: try to open Codex website for manual login instructions
      onStatus?.('Could not start Codex CLI. Please install Codex first.');
      open('https://developers.openai.com/codex/quickstart/');
      reject(error);
    });
  });
}

/**
 * Clear Codex authentication
 * Removes stored credentials
 */
export async function clearCodexAuth(): Promise<void> {
  const { unlink } = await import('fs/promises');

  const codexHome = getCodexHome();
  const authFiles = [
    join(codexHome, 'auth.json'),
    join(codexHome, '.credentials.json'),
  ];

  for (const file of authFiles) {
    try {
      if (existsSync(file)) {
        await unlink(file);
        debug('[CodexAuth] Removed:', file);
      }
    } catch (error) {
      debug('[CodexAuth] Error removing file:', file, error);
    }
  }
}
