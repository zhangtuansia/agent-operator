/**
 * LLM Connections
 *
 * Named provider configurations that users can add, configure, and switch between.
 * This module is intentionally transport-agnostic so it can be used by both
 * Electron main and browser-safe renderer code.
 */

import {
  type ModelDefinition,
  CLAUDE_MODELS,
  BEDROCK_MODELS,
  DEEPSEEK_MODELS,
  GLM_MODELS,
  MINIMAX_MODELS,
  DOUBAO_MODELS,
  KIMI_MODELS,
} from './models.ts';

// ============================================================
// Types
// ============================================================

/**
 * Provider type determines which backend implementation to use.
 */
export type LlmProviderType =
  | 'anthropic'
  | 'anthropic_compat'
  | 'openai'
  | 'openai_compat'
  | 'bedrock'
  | 'vertex'
  | 'copilot';

/**
 * @deprecated Use LlmProviderType instead.
 */
export type LlmConnectionType = 'anthropic' | 'openai' | 'openai-compat';

/**
 * Authentication mechanism for the connection.
 */
export type LlmAuthType =
  | 'api_key'
  | 'api_key_with_endpoint'
  | 'oauth'
  | 'iam_credentials'
  | 'bearer_token'
  | 'service_account_file'
  | 'environment'
  | 'none';

/**
 * LLM connection configuration.
 */
export interface LlmConnection {
  /** URL-safe identifier */
  slug: string;
  /** Display name */
  name: string;
  /** Provider type determines backend behavior */
  providerType: LlmProviderType;
  /**
   * @deprecated Legacy field for migration compatibility.
   */
  type?: LlmConnectionType;
  /** Optional custom base URL */
  baseUrl?: string;
  /** Authentication mechanism */
  authType: LlmAuthType;
  /** Optional custom models for compat providers */
  models?: Array<ModelDefinition | string>;
  /** Default model */
  defaultModel?: string;
  /**
   * Optional codex binary path for OpenAI provider connections.
   * If absent, runtime should use `codex` from PATH.
   */
  codexPath?: string;
  /** AWS region for bedrock connections */
  awsRegion?: string;
  /** GCP project for vertex connections */
  gcpProjectId?: string;
  /** GCP region for vertex connections */
  gcpRegion?: string;
  /** Created timestamp */
  createdAt: number;
  /** Last-used timestamp */
  lastUsedAt?: number;
}

/**
 * Connection with runtime auth status metadata.
 */
export interface LlmConnectionWithStatus extends LlmConnection {
  isAuthenticated: boolean;
  authError?: string;
  isDefault?: boolean;
}

// ============================================================
// Built-in model defaults
// ============================================================

const OPENAI_MODELS: ModelDefinition[] = [
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    shortName: 'Codex',
    description: 'OpenAI reasoning model',
  },
  {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    shortName: 'Codex Mini',
    description: 'Fast OpenAI model',
  },
];

// ============================================================
// Helpers
// ============================================================

/**
 * Convention: last model in `models` is used as the mini model.
 */
export function getMiniModel(connection: Pick<LlmConnection, 'models'>): string | undefined {
  if (!connection.models || connection.models.length === 0) return undefined;
  const last = connection.models[connection.models.length - 1];
  return last == null ? undefined : typeof last === 'string' ? last : last.id;
}

/**
 * Convention: last model in `models` is used as the summarization model.
 */
export function getSummarizationModel(connection: Pick<LlmConnection, 'models'>): string | undefined {
  if (!connection.models || connection.models.length === 0) return undefined;
  const last = connection.models[connection.models.length - 1];
  return last == null ? undefined : typeof last === 'string' ? last : last.id;
}

/**
 * Generate a URL-safe slug from display name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validate slug format.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
}

/**
 * Credential key convention.
 */
export function getLlmCredentialKey(slug: string, credentialType: 'api_key' | 'oauth_token'): string {
  return `llm::${slug}::${credentialType}`;
}

/**
 * Storage type used by the credential layer.
 */
export type LlmCredentialStorageType =
  | 'api_key'
  | 'oauth_token'
  | 'iam_credentials'
  | 'service_account'
  | null;

/**
 * Map auth type to credential storage type.
 */
export function authTypeToCredentialStorageType(authType: LlmAuthType): LlmCredentialStorageType {
  switch (authType) {
    case 'api_key':
    case 'api_key_with_endpoint':
    case 'bearer_token':
      return 'api_key';
    case 'oauth':
      return 'oauth_token';
    case 'iam_credentials':
      return 'iam_credentials';
    case 'service_account_file':
      return 'service_account';
    case 'environment':
    case 'none':
      return null;
  }
}

/**
 * @deprecated Use authTypeToCredentialStorageType().
 */
export function authTypeToCredentialType(authType: LlmAuthType): 'api_key' | 'oauth_token' | null {
  const storageType = authTypeToCredentialStorageType(authType);
  if (storageType === 'api_key' || storageType === 'oauth_token') {
    return storageType;
  }
  return null;
}

/**
 * Whether an auth type requires a custom endpoint field.
 */
export function authTypeRequiresEndpoint(authType: LlmAuthType): boolean {
  return authType === 'api_key_with_endpoint';
}

/**
 * Whether provider is a compat provider.
 */
export function isCompatProvider(providerType: LlmProviderType): boolean {
  return providerType === 'anthropic_compat' || providerType === 'openai_compat';
}

/**
 * Whether provider uses Anthropic-style models/backends.
 */
export function isAnthropicProvider(providerType: LlmProviderType): boolean {
  return (
    providerType === 'anthropic'
    || providerType === 'anthropic_compat'
    || providerType === 'bedrock'
    || providerType === 'vertex'
  );
}

/**
 * Whether provider uses OpenAI/Codex models/backends.
 */
export function isOpenAIProvider(providerType: LlmProviderType): boolean {
  return providerType === 'openai' || providerType === 'openai_compat';
}

/**
 * Whether provider uses GitHub Copilot backend.
 */
export function isCopilotProvider(providerType: LlmProviderType): boolean {
  return providerType === 'copilot';
}

/**
 * Registry models for standard providers.
 * Compat providers intentionally return empty here.
 */
export function getModelsForProviderType(providerType: LlmProviderType): ModelDefinition[] {
  if (isCompatProvider(providerType)) {
    return [];
  }

  if (providerType === 'bedrock') {
    return BEDROCK_MODELS;
  }

  if (providerType === 'openai') {
    return OPENAI_MODELS;
  }

  if (providerType === 'copilot') {
    return [];
  }

  return CLAUDE_MODELS;
}

/**
 * Model defaults for a connection provider type.
 * Compat providers use explicit string model IDs.
 */
export function getDefaultModelsForConnection(providerType: LlmProviderType): Array<ModelDefinition | string> {
  if (providerType === 'openai_compat') return [
    'openai/gpt-5.3-codex',
    'openai/gpt-5.1-codex-mini',
  ];
  if (providerType === 'openai') return OPENAI_MODELS;
  if (providerType === 'bedrock') return BEDROCK_MODELS;
  if (providerType === 'copilot') return [];
  if (providerType === 'anthropic_compat') return [
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-haiku-4.5',
  ];
  return CLAUDE_MODELS;
}

/**
 * Default model ID for a provider type.
 */
export function getDefaultModelForConnection(providerType: LlmProviderType): string {
  if (providerType === 'copilot') {
    // Copilot models are dynamic; use a stable placeholder until listModels() refreshes.
    return 'gpt-5';
  }
  const models = getDefaultModelsForConnection(providerType);
  const first = models[0];
  if (!first) return CLAUDE_MODELS[0]!.id;
  return typeof first === 'string' ? first : first.id;
}

/**
 * Get default models for a specific built-in slug (third-party compat).
 */
export function getDefaultModelsForSlug(slug: string): Array<ModelDefinition | string> {
  switch (slug) {
    case 'deepseek-api': return DEEPSEEK_MODELS;
    case 'glm-api': return GLM_MODELS;
    case 'minimax-api': return MINIMAX_MODELS;
    case 'doubao-api': return DOUBAO_MODELS;
    case 'kimi-api': return KIMI_MODELS;
    default: return [];
  }
}

/**
 * Get default model ID for a specific built-in slug.
 */
export function getDefaultModelForSlug(slug: string): string | undefined {
  const models = getDefaultModelsForSlug(slug);
  if (models.length === 0) return undefined;
  const first = models[0];
  return typeof first === 'string' ? first : first?.id;
}

/**
 * Shared fallback chain resolver.
 */
export function resolveEffectiveConnectionSlug(
  sessionConnection: string | undefined,
  workspaceDefault: string | undefined,
  connections: Pick<LlmConnectionWithStatus, 'slug' | 'isDefault'>[],
): string | undefined {
  return sessionConnection
    ?? workspaceDefault
    ?? connections.find(c => c.isDefault)?.slug
    ?? connections[0]?.slug;
}

/**
 * Whether a session points to a deleted/unavailable connection.
 */
export function isSessionConnectionUnavailable(
  sessionConnection: string | undefined,
  connections: Pick<LlmConnectionWithStatus, 'slug'>[],
): boolean {
  if (!sessionConnection) return false;
  return !connections.some(c => c.slug === sessionConnection);
}

/**
 * Whether auth uses OAuth browser flow.
 */
export function authTypeIsOAuth(authType: LlmAuthType): boolean {
  return authType === 'oauth';
}

/**
 * Validate provider/auth combinations.
 */
export function isValidProviderAuthCombination(
  providerType: LlmProviderType,
  authType: LlmAuthType,
): boolean {
  const validCombinations: Record<LlmProviderType, LlmAuthType[]> = {
    anthropic: ['api_key', 'oauth'],
    anthropic_compat: ['api_key_with_endpoint'],
    openai: ['api_key', 'oauth'],
    openai_compat: ['api_key_with_endpoint', 'none', 'api_key'],
    bedrock: ['bearer_token', 'iam_credentials', 'environment'],
    vertex: ['oauth', 'service_account_file', 'environment'],
    copilot: ['oauth'],
  };

  return validCombinations[providerType]?.includes(authType) ?? false;
}

/**
 * Validate custom codex path existence for OpenAI provider.
 */
export function validateCodexPath(connection: LlmConnection): { isValid: boolean; error?: string } {
  if (connection.providerType !== 'openai') {
    return { isValid: true };
  }

  if (!connection.codexPath) {
    return { isValid: true };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { existsSync } = require('fs');
    if (!existsSync(connection.codexPath)) {
      return {
        isValid: false,
        error: `Codex binary not found at path: ${connection.codexPath}. Remove it to use 'codex' from PATH.`,
      };
    }
  } catch {
    return { isValid: true };
  }

  return { isValid: true };
}

// ============================================================
// Migration helpers
// ============================================================

/**
 * Migrate legacy connection type to provider type.
 */
export function migrateConnectionType(legacyType: LlmConnectionType): LlmProviderType {
  switch (legacyType) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'openai-compat':
      return 'openai_compat';
  }
}

/**
 * Migrate legacy auth to current LLM auth type.
 */
export function migrateAuthType(
  legacyAuthType: 'api_key' | 'oauth' | 'none',
  hasCustomEndpoint: boolean,
): LlmAuthType {
  switch (legacyAuthType) {
    case 'api_key':
      return hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key';
    case 'oauth':
      return 'oauth';
    case 'none':
      return 'none';
  }
}

/**
 * Migrate legacy connection object into the current shape.
 */
export function migrateLlmConnection(legacy: {
  slug: string;
  name: string;
  type: LlmConnectionType;
  baseUrl?: string;
  authType: 'api_key' | 'oauth' | 'none';
  models?: ModelDefinition[];
  defaultModel?: string;
  codexPath?: string;
  createdAt: number;
  lastUsedAt?: number;
}): LlmConnection {
  const providerType = migrateConnectionType(legacy.type);
  const hasCustomEndpoint = !!legacy.baseUrl && legacy.type !== 'anthropic';
  const authType = migrateAuthType(legacy.authType, hasCustomEndpoint);

  return {
    slug: legacy.slug,
    name: legacy.name,
    providerType,
    type: legacy.type,
    baseUrl: legacy.baseUrl,
    authType,
    models: legacy.models,
    defaultModel: legacy.defaultModel,
    codexPath: legacy.codexPath,
    createdAt: legacy.createdAt,
    lastUsedAt: legacy.lastUsedAt,
  };
}
