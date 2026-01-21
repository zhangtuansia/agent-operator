/**
 * Auth environment variable management
 *
 * Centralizes the pattern of setting/clearing environment variables
 * when switching between authentication modes.
 */

import type { AuthType } from '../config/storage.ts';

export interface ApiKeyCredentials {
  apiKey: string;
}

export interface ClaudeMaxCredentials {
  oauthToken: string;
}

/**
 * Configuration for third-party AI providers that are Anthropic API compatible.
 */
export interface ProviderEnvironment {
  baseURL?: string;   // Custom API base URL (e.g., MiniMax, GLM, DeepSeek)
  apiFormat?: 'anthropic' | 'openai';  // API format (for future OpenAI-compatible providers)
}

export type AuthCredentials =
  | { type: 'api_key'; credentials: ApiKeyCredentials; provider?: ProviderEnvironment }
  | { type: 'oauth_token'; credentials: ClaudeMaxCredentials };

/**
 * Set environment variables for the specified auth type.
 *
 * This clears conflicting env vars and sets the appropriate ones
 * for the selected authentication mode.
 *
 * @param auth - The auth type and credentials to configure
 */
export function setAuthEnvironment(auth: AuthCredentials): void {
  // Clear all auth-related env vars first
  clearAuthEnvironment();

  switch (auth.type) {
    case 'api_key':
      process.env.ANTHROPIC_API_KEY = auth.credentials.apiKey;
      // Set custom base URL for third-party providers (MiniMax, GLM, DeepSeek, etc.)
      if (auth.provider?.baseURL) {
        process.env.ANTHROPIC_BASE_URL = auth.provider.baseURL;
      }
      break;

    case 'oauth_token':
      process.env.CLAUDE_CODE_OAUTH_TOKEN = auth.credentials.oauthToken;
      break;
  }
}

/**
 * Clear all auth-related environment variables.
 */
export function clearAuthEnvironment(): void {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.ANTHROPIC_BASE_URL;
}
