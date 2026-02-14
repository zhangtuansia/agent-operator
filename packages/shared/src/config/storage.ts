import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, copyFileSync, readdirSync as readdirSyncFs } from 'fs';
import { join, dirname, basename } from 'path';
import { getCredentialManager } from '../credentials/index.ts';
import { getOrCreateLatestSession, type SessionConfig } from '../sessions/index.ts';
import {
  discoverWorkspacesInDefaultLocation,
  getDefaultWorkspacesDir,
  loadWorkspaceConfig,
  createWorkspaceAtPath,
  isValidWorkspace,
} from '../workspaces/storage.ts';
import { findIconFile } from '../utils/icon.ts';
import { initializeDocs } from '../docs/index.ts';
import { expandPath, toPortablePath, getBundledAssetsDir } from '../utils/paths.ts';
import { isSafeHttpHeaderValue } from '../utils/mask.ts';
import { debug } from '../utils/debug.ts';
import { CONFIG_DIR } from './paths.ts';
import type { StoredAttachment, StoredMessage } from '@agent-operator/core/types';
import type { Plan } from '../agent/plan-types.ts';
import type { PermissionMode } from '../agent/mode-manager.ts';
import { BUNDLED_CONFIG_DEFAULTS, type ConfigDefaults } from './config-defaults-schema.ts';
import {
  getDefaultModelsForConnection,
  getDefaultModelForConnection,
  isValidProviderAuthCombination,
  type LlmConnection,
  type LlmAuthType,
  type LlmProviderType,
} from './llm-connections.ts';
import {
  getModelsForProvider,
  getDefaultModelForProvider,
  isBedrockArn,
  isBedrockModelId,
  type ModelDefinition,
} from './models.ts';

// Re-export CONFIG_DIR for convenience (centralized in paths.ts)
export { CONFIG_DIR } from './paths.ts';

// Re-export base types from core (single source of truth)
export type {
  Workspace,
  McpAuthType,
  AuthType,
  OAuthCredentials,
} from '@agent-operator/core/types';

// Import for local use
import type { Workspace, AuthType } from '@agent-operator/core/types';


/**
 * Custom model definition for user-defined models
 */
export interface CustomModelDefinition {
  id: string;           // API 调用使用的模型 ID (必填)
  name: string;         // UI 显示名称 (必填)
  shortName?: string;   // 短名称 (可选)
  description?: string; // 描述 (可选)
}

/**
 * Provider configuration for third-party AI APIs
 */
export interface ProviderConfig {
  provider: string;  // Provider ID: 'minimax' | 'glm' | 'deepseek' | 'bedrock' | 'custom'
  baseURL: string;   // API base URL (not used for Bedrock)
  apiFormat: 'anthropic' | 'openai';  // API format to use
  // AWS Bedrock specific settings
  awsRegion?: string;  // AWS region for Bedrock (e.g., 'us-east-1')
  // Custom models for Custom provider
  customModels?: CustomModelDefinition[];  // User-defined model list
}

/**
 * Agent type - which AI backend to use
 */
export type AgentType = 'claude' | 'codex';

// Config stored in JSON file (credentials stored in encrypted file, not here)
export interface StoredConfig {
  authType?: AuthType;
  // LLM Connections (migrated abstraction from legacy auth/provider fields)
  llmConnections?: LlmConnection[];
  // Slug of default connection for new sessions
  defaultLlmConnection?: string;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;  // Currently active session (primary scope)
  model?: string;
  // Agent type: 'claude' (Anthropic) or 'codex' (OpenAI). Default: 'claude'
  agentType?: AgentType;
  // Provider configuration (for third-party AI APIs)
  providerConfig?: ProviderConfig;
  // Notifications
  notificationsEnabled?: boolean;  // Desktop notifications for task completion (default: true)
  // Appearance
  colorTheme?: string;  // ID of selected preset theme (e.g., 'dracula', 'nord'). Default: 'default'
  richToolDescriptions?: boolean;  // Include tool intent/display names in intercepted tool calls. Default: true
  // UI Language
  uiLanguage?: 'en' | 'zh';  // UI display language. Default: system language
  // Auto-update
  dismissedUpdateVersion?: string;  // Version that user dismissed (skip notifications for this version)
  // Input settings
  autoCapitalisation?: boolean;  // Auto-capitalize first letter when typing (default: true)
  sendMessageKey?: 'enter' | 'cmd-enter';  // Key to send messages (default: 'enter')
  spellCheck?: boolean;  // Enable spell check in input (default: false)
}

const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CONFIG_DEFAULTS_FILE = join(CONFIG_DIR, 'config-defaults.json');
const DEEPSEEK_PROVIDER_ID = 'deepseek';
const DEEPSEEK_ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';

/**
 * Load config defaults from file, or use bundled defaults as fallback.
 */
export function loadConfigDefaults(): ConfigDefaults {
  try {
    if (existsSync(CONFIG_DEFAULTS_FILE)) {
      const content = readFileSync(CONFIG_DEFAULTS_FILE, 'utf-8');
      return JSON.parse(content) as ConfigDefaults;
    }
  } catch {
    // Fall through to bundled defaults
  }
  return BUNDLED_CONFIG_DEFAULTS;
}

/**
 * Ensure config-defaults.json exists (copy from bundled if not).
 */
export function ensureConfigDefaults(bundledDefaultsPath?: string): void {
  if (existsSync(CONFIG_DEFAULTS_FILE)) {
    return; // Already exists, don't overwrite
  }

  // Try to copy from bundled resources
  if (bundledDefaultsPath && existsSync(bundledDefaultsPath)) {
    try {
      const content = readFileSync(bundledDefaultsPath, 'utf-8');
      writeFileSync(CONFIG_DEFAULTS_FILE, content, 'utf-8');
      return;
    } catch {
      // Fall through to write bundled defaults
    }
  }

  // Fallback: write bundled defaults directly
  writeFileSync(
    CONFIG_DEFAULTS_FILE,
    JSON.stringify(BUNDLED_CONFIG_DEFAULTS, null, 2),
    'utf-8'
  );
}

export function ensureConfigDir(bundledResourcesDir?: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  // Initialize bundled docs (creates ~/.cowork/docs/ with sources.md, agents.md, permissions.md)
  initializeDocs();

  // Initialize config defaults
  const bundledDefaultsPath = bundledResourcesDir
    ? join(bundledResourcesDir, 'config-defaults.json')
    : undefined;
  ensureConfigDefaults(bundledDefaultsPath);

  // Initialize tool icons (CLI tool icons for turn card display)
  ensureToolIcons();
}

export function loadStoredConfig(): StoredConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as StoredConfig;

    // Must have workspaces array
    if (!Array.isArray(config.workspaces)) {
      return null;
    }

    // Expand path variables (~ and ${HOME}) for portability
    for (const workspace of config.workspaces) {
      workspace.rootPath = expandPath(workspace.rootPath);
    }

    // Validate active workspace exists
    const activeWorkspace = config.workspaces.find(w => w.id === config.activeWorkspaceId);
    if (!activeWorkspace) {
      // Default to first workspace
      config.activeWorkspaceId = config.workspaces[0]?.id || null;
    }

    // Ensure workspace folder structure exists for all workspaces
    for (const workspace of config.workspaces) {
      if (!isValidWorkspace(workspace.rootPath)) {
        createWorkspaceAtPath(workspace.rootPath, workspace.name);
      }
    }

    return config;
  } catch {
    return null;
  }
}

function getConnectionModelId(model: ModelDefinition | string): string {
  return typeof model === 'string' ? model : model.id;
}

function ensureModelInConnectionModels(
  models: Array<ModelDefinition | string>,
  modelId: string,
): Array<ModelDefinition | string> {
  if (!modelId) return models;

  const modelIds = models.map(getConnectionModelId);
  if (modelIds.includes(modelId)) {
    return models;
  }

  const hasObjectModels = models.some(model => typeof model !== 'string');
  if (hasObjectModels) {
    const injected: ModelDefinition = {
      id: modelId,
      name: modelId,
      shortName: modelId,
      description: 'Imported from legacy config',
    };
    return [injected, ...models];
  }

  return [modelId, ...models];
}

function formatProviderName(provider: string): string {
  return provider
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cloneModelsForConnection(models: ModelDefinition[]): Array<ModelDefinition | string> {
  return models.map(model => ({ ...model }));
}

function hasModelInConnectionModels(
  modelId: string | undefined,
  models: Array<ModelDefinition | string>,
): boolean {
  if (!modelId) return false;
  return models.some(model => getConnectionModelId(model) === modelId);
}

function normalizeProviderConfig(providerConfig: ProviderConfig): ProviderConfig {
  const providerId = providerConfig.provider.toLowerCase();
  if (providerId !== DEEPSEEK_PROVIDER_ID) {
    return providerConfig;
  }

  const trimmedBaseUrl = providerConfig.baseURL.trim();
  const isLegacyDeepseekBaseUrl = /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/i.test(trimmedBaseUrl);
  const normalizedBaseUrl = !trimmedBaseUrl || isLegacyDeepseekBaseUrl
    ? DEEPSEEK_ANTHROPIC_BASE_URL
    : trimmedBaseUrl;

  return {
    ...providerConfig,
    baseURL: normalizedBaseUrl,
    apiFormat: 'anthropic',
  };
}

function derivePrimaryLlmConnection(config: StoredConfig): LlmConnection {
  const now = Date.now();
  const existing = config.llmConnections ?? [];
  const providerConfig = config.providerConfig ? normalizeProviderConfig(config.providerConfig) : undefined;
  const agentType = config.agentType ?? 'claude';

  let slug = 'anthropic-api';
  let name = 'Anthropic (API Key)';
  let providerType: LlmProviderType = 'anthropic';
  let authType: LlmAuthType = 'api_key';
  let baseUrl: string | undefined;
  let awsRegion: string | undefined;

  if (agentType === 'codex') {
    slug = 'codex';
    name = 'Codex';
    providerType = 'openai';
    authType = 'oauth';
  } else if (config.authType === 'bedrock' || providerConfig?.provider === 'bedrock') {
    slug = 'bedrock';
    name = 'AWS Bedrock';
    providerType = 'bedrock';
    authType = 'environment';
    awsRegion = providerConfig?.awsRegion;
  } else if (providerConfig) {
    providerType = providerConfig.apiFormat === 'openai' ? 'openai_compat' : 'anthropic_compat';
    authType = 'api_key_with_endpoint';
    slug = `${providerConfig.provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-compat`;
    name = `${formatProviderName(providerConfig.provider)} Compatible`;
    baseUrl = providerConfig.baseURL || undefined;
  } else if (config.authType === 'oauth_token') {
    slug = 'claude-max';
    name = 'Claude Max';
    providerType = 'anthropic';
    authType = 'oauth';
  }

  if (!isValidProviderAuthCombination(providerType, authType)) {
    if (config.authType === 'oauth_token') {
      slug = 'claude-max';
      name = 'Claude Max';
      providerType = 'anthropic';
      authType = 'oauth';
      baseUrl = undefined;
    } else {
      slug = 'anthropic-api';
      name = 'Anthropic (API Key)';
      providerType = 'anthropic';
      authType = 'api_key';
      baseUrl = undefined;
    }
  }

  const providerPresetModels = providerConfig
    ? getModelsForProvider(providerConfig.provider, providerConfig.customModels)
    : [];
  let models = providerPresetModels.length > 0
    ? cloneModelsForConnection(providerPresetModels)
    : getDefaultModelsForConnection(providerType);

  const providerDefaultModel = providerConfig
    ? getDefaultModelForProvider(providerConfig.provider, providerConfig.customModels)
    : getDefaultModelForConnection(providerType);
  const defaultModel = hasModelInConnectionModels(config.model, models)
    ? config.model!
    : providerDefaultModel;
  models = ensureModelInConnectionModels(models, defaultModel);

  const previous = existing.find(connection => connection.slug === slug);
  return {
    slug,
    name,
    providerType,
    authType,
    baseUrl,
    awsRegion,
    models,
    defaultModel,
    createdAt: previous?.createdAt ?? now,
    lastUsedAt: previous?.lastUsedAt,
  };
}

function ensureDefaultLlmConnection(config: StoredConfig): boolean {
  if (!config.llmConnections || config.llmConnections.length === 0) {
    return false;
  }

  const defaultExists = config.llmConnections.some(c => c.slug === config.defaultLlmConnection);
  if (!config.defaultLlmConnection || !defaultExists) {
    config.defaultLlmConnection = config.llmConnections[0]!.slug;
    return true;
  }

  return false;
}

function backfillConnectionModels(config: StoredConfig): boolean {
  if (!config.llmConnections || config.llmConnections.length === 0) {
    return false;
  }

  let changed = false;
  for (const connection of config.llmConnections) {
    let models = connection.models;
    if (!models || models.length === 0) {
      models = getDefaultModelsForConnection(connection.providerType);
      connection.models = models;
      changed = true;
    }

    let defaultModel = connection.defaultModel;
    if (!defaultModel) {
      defaultModel = getDefaultModelForConnection(connection.providerType);
      connection.defaultModel = defaultModel;
      changed = true;
    }

    if (defaultModel && models) {
      const fixedModels = ensureModelInConnectionModels(models, defaultModel);
      if (JSON.stringify(fixedModels) !== JSON.stringify(models)) {
        connection.models = fixedModels;
        changed = true;
      }
    }
  }

  return changed;
}

function readExplicitBedrockModelFromClaudeSettings(): string | undefined {
  try {
    const home = process.env.HOME;
    if (!home) return undefined;
    const settingsPath = join(home, '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return undefined;
    const raw = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as { model?: unknown };
    const model = typeof parsed.model === 'string' ? parsed.model.trim() : '';
    if (!model) return undefined;
    return isBedrockArn(model) || isBedrockModelId(model) ? model : undefined;
  } catch {
    return undefined;
  }
}

function getLegacyBedrockSignal(config: StoredConfig): {
  enabled: boolean;
  awsRegion?: string;
  model?: string;
} {
  const readValue = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const envBedrockModel = [
    readValue(process.env.ANTHROPIC_MODEL),
    readValue(process.env.ANTHROPIC_DEFAULT_OPUS_MODEL),
    readValue(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL),
    readValue(process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL),
    readValue(process.env.ANTHROPIC_SMALL_FAST_MODEL),
  ].find((model): model is string => !!model && (isBedrockArn(model) || isBedrockModelId(model)));

  const settingsBedrockModel = readExplicitBedrockModelFromClaudeSettings();
  const awsRegion = readValue(process.env.AWS_REGION) || config.providerConfig?.awsRegion;
  const awsProfile = readValue(process.env.AWS_PROFILE) || readValue(process.env.CLAUDE_CODE_AWS_PROFILE);
  const explicitBedrockFlag = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
  const enabled = Boolean(
    explicitBedrockFlag
    || config.authType === 'bedrock'
    || config.providerConfig?.provider === 'bedrock'
    || awsRegion
    || awsProfile
    || envBedrockModel
    || settingsBedrockModel
  );

  return {
    enabled,
    awsRegion,
    model: envBedrockModel || settingsBedrockModel,
  };
}

function ensureLegacyBedrockConnection(config: StoredConfig): boolean {
  const signal = getLegacyBedrockSignal(config);
  if (!signal.enabled) return false;

  if (!config.llmConnections) {
    config.llmConnections = [];
  }

  const bedrockDefaults = getDefaultModelsForConnection('bedrock');
  const bedrockDefaultModel = getDefaultModelForConnection('bedrock');
  const preferredSignalModel = signal.model && hasModelInConnectionModels(signal.model, bedrockDefaults)
    ? signal.model
    : undefined;

  const existing = config.llmConnections.find(connection => connection.providerType === 'bedrock');
  if (existing) {
    let changed = false;

    if (!existing.models || existing.models.length === 0) {
      existing.models = bedrockDefaults;
      changed = true;
    }

    const existingModelPool = existing.models ?? bedrockDefaults;
    const preferredDefaultModel = preferredSignalModel && hasModelInConnectionModels(preferredSignalModel, existingModelPool)
      ? preferredSignalModel
      : bedrockDefaultModel;
    if (!existing.defaultModel || !hasModelInConnectionModels(existing.defaultModel, existingModelPool)) {
      existing.defaultModel = preferredDefaultModel;
      changed = true;
    }

    if (!existing.awsRegion && signal.awsRegion) {
      existing.awsRegion = signal.awsRegion;
      changed = true;
    }

    if (
      existing.authType !== 'environment'
      && existing.authType !== 'iam_credentials'
      && existing.authType !== 'bearer_token'
    ) {
      existing.authType = 'environment';
      changed = true;
    }

    return changed;
  }

  let slug = 'bedrock';
  let suffix = 2;
  while (config.llmConnections.some(connection => connection.slug === slug)) {
    slug = `bedrock-${suffix++}`;
  }

  config.llmConnections.push({
    slug,
    name: 'AWS Bedrock',
    providerType: 'bedrock',
    authType: 'environment',
    models: bedrockDefaults,
    defaultModel: preferredSignalModel ?? bedrockDefaultModel,
    awsRegion: signal.awsRegion,
    createdAt: Date.now(),
  });
  return true;
}

function syncPrimaryLlmConnection(config: StoredConfig): boolean {
  let changed = false;
  if (config.providerConfig) {
    const normalizedProviderConfig = normalizeProviderConfig(config.providerConfig);
    if (JSON.stringify(normalizedProviderConfig) !== JSON.stringify(config.providerConfig)) {
      config.providerConfig = normalizedProviderConfig;
      changed = true;
    }
  }

  // Only derive and sync a primary connection from legacy config when there's
  // something to migrate (authType or providerConfig is set). If neither is set
  // and the user already has connections configured via onboarding, skip the
  // derivation to avoid creating a phantom 'anthropic-api' connection.
  const hasLegacyConfig = !!config.authType || !!config.providerConfig;
  const hasExistingConnections = (config.llmConnections ?? []).length > 0;

  if (hasLegacyConfig || !hasExistingConnections) {
    const primary = derivePrimaryLlmConnection(config);
    const existingConnections = config.llmConnections ?? [];

    const index = existingConnections.findIndex(connection => connection.slug === primary.slug);
    if (index >= 0) {
      const current = existingConnections[index]!;
      const next: LlmConnection = {
        ...current,
        ...primary,
        createdAt: current.createdAt || primary.createdAt,
        lastUsedAt: current.lastUsedAt ?? primary.lastUsedAt,
      };
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        existingConnections[index] = next;
        changed = true;
      }
    } else {
      existingConnections.push(primary);
      changed = true;
    }

    if (!config.llmConnections) {
      config.llmConnections = existingConnections;
    }

    // Only set default to primary when no default exists yet
    if (!config.defaultLlmConnection) {
      config.defaultLlmConnection = primary.slug;
      changed = true;
    }
  }

  if (ensureLegacyBedrockConnection(config)) {
    changed = true;
  }

  if (backfillConnectionModels(config)) {
    changed = true;
  }
  if (ensureDefaultLlmConnection(config)) {
    changed = true;
  }

  return changed;
}

/**
 * Auto-detect external credentials (Claude Code/CLI, ANTHROPIC_API_KEY env, AWS Bedrock).
 * If no config exists yet, creates one with the detected connection so onboarding is skipped.
 * Must be called BEFORE migrateLegacyLlmConnectionsConfig.
 */
export async function autoDetectExternalCredentials(): Promise<void> {
  // Only run for fresh installs (no config file yet)
  const existing = loadStoredConfig();
  if (existing) return;

  const manager = getCredentialManager();

  // Priority 1: Check for Claude Code/CLI OAuth credentials (~/.claude/.credentials.json)
  try {
    // Dynamic import to avoid circular dependencies (auth → config → auth)
    const compat = await import('../auth/compat.ts');
    const cliCreds = compat.getExistingClaudeCredentials();
    if (cliCreds?.accessToken) {
      const slug = 'claude-max';
      const connection: LlmConnection = {
        slug,
        name: 'Claude Max',
        providerType: 'anthropic',
        authType: 'oauth',
        models: getDefaultModelsForConnection('anthropic'),
        defaultModel: getDefaultModelForConnection('anthropic'),
        createdAt: Date.now(),
      };

      const workspaceId = generateWorkspaceId();
      const config: StoredConfig = {
        authType: 'oauth_token',
        llmConnections: [connection],
        defaultLlmConnection: slug,
        workspaces: [{
          id: workspaceId,
          name: 'Default',
          rootPath: `${getDefaultWorkspacesDir()}/${workspaceId}`,
          createdAt: Date.now(),
        }],
        activeWorkspaceId: workspaceId,
        activeSessionId: null,
      };

      ensureConfigDir();
      saveConfig(config);

      // Import credentials
      await manager.setLlmOAuth(slug, {
        accessToken: cliCreds.accessToken,
        refreshToken: cliCreds.refreshToken,
        expiresAt: cliCreds.expiresAt,
      });
      // Also save to legacy location for backwards compatibility
      await manager.setClaudeOAuthCredentials({
        accessToken: cliCreds.accessToken,
        refreshToken: cliCreds.refreshToken,
        expiresAt: cliCreds.expiresAt,
        source: 'cli',
      });

      debug('[autoDetect] Imported Claude Code/CLI OAuth credentials');
      return;
    }
  } catch {
    // Ignore errors reading Claude CLI credentials
  }

  // Priority 2: Check for ANTHROPIC_API_KEY environment variable
  const envApiKey = process.env.COWORK_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (envApiKey && envApiKey.trim()) {
    const slug = 'anthropic-api';
    const connection: LlmConnection = {
      slug,
      name: 'Anthropic (API Key)',
      providerType: 'anthropic',
      authType: 'api_key',
      models: getDefaultModelsForConnection('anthropic'),
      defaultModel: getDefaultModelForConnection('anthropic'),
      createdAt: Date.now(),
    };

    const workspaceId = generateWorkspaceId();
    const config: StoredConfig = {
      authType: 'api_key',
      llmConnections: [connection],
      defaultLlmConnection: slug,
      workspaces: [{
        id: workspaceId,
        name: 'Default',
        rootPath: `${getDefaultWorkspacesDir()}/${workspaceId}`,
        createdAt: Date.now(),
      }],
      activeWorkspaceId: workspaceId,
      activeSessionId: null,
    };

    ensureConfigDir();
    saveConfig(config);

    // Store the key in connection-scoped credential store
    await manager.setLlmApiKey(slug, envApiKey.trim());
    // Also store in legacy location
    await manager.setApiKey(envApiKey.trim());

    debug('[autoDetect] Imported ANTHROPIC_API_KEY from environment');
    return;
  }

  // Priority 3: Check for AWS Bedrock credentials (environment-based)
  const bedrockSignal = Boolean(
    process.env.CLAUDE_CODE_USE_BEDROCK === '1'
    || process.env.AWS_REGION
    || process.env.AWS_PROFILE
    || process.env.CLAUDE_CODE_AWS_PROFILE
  );
  if (bedrockSignal) {
    const slug = 'bedrock';
    const connection: LlmConnection = {
      slug,
      name: 'AWS Bedrock',
      providerType: 'bedrock',
      authType: 'environment',
      models: getDefaultModelsForConnection('bedrock'),
      defaultModel: getDefaultModelForConnection('bedrock'),
      awsRegion: process.env.AWS_REGION,
      createdAt: Date.now(),
    };

    const workspaceId = generateWorkspaceId();
    const config: StoredConfig = {
      authType: 'bedrock',
      llmConnections: [connection],
      defaultLlmConnection: slug,
      workspaces: [{
        id: workspaceId,
        name: 'Default',
        rootPath: `${getDefaultWorkspacesDir()}/${workspaceId}`,
        createdAt: Date.now(),
      }],
      activeWorkspaceId: workspaceId,
      activeSessionId: null,
    };

    ensureConfigDir();
    saveConfig(config);

    debug('[autoDetect] Created Bedrock connection from environment');
    return;
  }
}

/**
 * Backward-compatible migration.
 * Creates or syncs LLM connections from legacy auth/provider config fields.
 */
export function migrateLegacyLlmConnectionsConfig(): void {
  const config = loadStoredConfig();
  if (!config) return;

  const changed = syncPrimaryLlmConnection(config);
  if (changed) {
    saveConfig(config);
  }
}

/**
 * Backfill connection-scoped credentials from legacy global credentials.
 * Keeps legacy entries for compatibility; only writes missing connection creds.
 */
export async function migrateLegacyLlmConnectionCredentials(): Promise<void> {
  const config = loadStoredConfig();
  if (!config?.llmConnections || config.llmConnections.length === 0) {
    return;
  }

  const manager = getCredentialManager();
  const legacyApiKey = await manager.getApiKey();
  const validLegacyApiKey = legacyApiKey && isSafeHttpHeaderValue(legacyApiKey)
    ? legacyApiKey
    : null;
  const legacyClaudeOAuth = await manager.getClaudeOAuthCredentials();

  for (const connection of config.llmConnections) {
    const isApiKeyAuth =
      connection.authType === 'api_key'
      || connection.authType === 'api_key_with_endpoint'
      || connection.authType === 'bearer_token';

    if (isApiKeyAuth) {
      const existing = await manager.getLlmApiKey(connection.slug);
      if (!existing && validLegacyApiKey) {
        await manager.setLlmApiKey(connection.slug, validLegacyApiKey);
      }
      continue;
    }

    if (connection.authType === 'oauth' && connection.providerType === 'anthropic') {
      const existingOauth = await manager.getLlmOAuth(connection.slug);
      if (!existingOauth?.accessToken && legacyClaudeOAuth?.accessToken) {
        await manager.setLlmOAuth(connection.slug, {
          accessToken: legacyClaudeOAuth.accessToken,
          refreshToken: legacyClaudeOAuth.refreshToken,
          expiresAt: legacyClaudeOAuth.expiresAt,
        });
      }
    }
  }
}

/**
 * Get the Anthropic API key from credential store
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  const manager = getCredentialManager();
  return manager.getApiKey();
}

/**
 * Get the Claude OAuth token from credential store
 */
export async function getClaudeOAuthToken(): Promise<string | null> {
  const manager = getCredentialManager();
  return manager.getClaudeOAuth();
}



export function saveConfig(config: StoredConfig): void {
  ensureConfigDir();

  // Convert paths to portable form (~ prefix) for cross-machine compatibility
  const storageConfig: StoredConfig = {
    ...config,
    workspaces: config.workspaces.map(ws => ({
      ...ws,
      rootPath: toPortablePath(ws.rootPath),
    })),
  };

  writeFileSync(CONFIG_FILE, JSON.stringify(storageConfig, null, 2), 'utf-8');
}

export async function updateApiKey(newApiKey: string): Promise<boolean> {
  const config = loadStoredConfig();
  if (!config) return false;
  const normalizedApiKey = newApiKey.trim();
  if (!normalizedApiKey || !isSafeHttpHeaderValue(normalizedApiKey)) return false;

  // Save API key to credential store
  const manager = getCredentialManager();
  await manager.setApiKey(normalizedApiKey);

  // Update auth type in config (but not the key itself)
  config.authType = 'api_key';
  syncPrimaryLlmConnection(config);
  saveConfig(config);
  return true;
}

export function getAuthType(): AuthType {
  const config = loadStoredConfig();
  if (config?.authType !== undefined) {
    return config.authType;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.authType;
}

export function setAuthType(authType: AuthType): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.authType = authType;
  syncPrimaryLlmConnection(config);
  saveConfig(config);
}

export function getModel(): string | null {
  const config = loadStoredConfig();
  return config?.model ?? null;
}

export function setModel(model: string): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.model = model;
  syncPrimaryLlmConnection(config);
  saveConfig(config);
}

/**
 * Get the agent type (claude or codex).
 * Defaults to 'claude' if not set.
 */
export function getAgentType(): AgentType {
  const config = loadStoredConfig();
  return config?.agentType ?? 'claude';
}

/**
 * Set the agent type (claude or codex).
 */
export function setAgentType(agentType: AgentType): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.agentType = agentType;
  syncPrimaryLlmConnection(config);
  saveConfig(config);
}

/**
 * Get the provider configuration for third-party AI APIs.
 * Returns null if using default Anthropic API.
 */
export function getProviderConfig(): ProviderConfig | null {
  const config = loadStoredConfig();
  return config?.providerConfig ?? null;
}

/**
 * Set the provider configuration for third-party AI APIs.
 * Pass null to clear and use default Anthropic API.
 * Note: This preserves existing customModels when updating other fields.
 */
export function setProviderConfig(providerConfig: ProviderConfig | null): void {
  const config = loadStoredConfig();
  if (!config) return;
  if (providerConfig) {
    const normalizedConfig = normalizeProviderConfig(providerConfig);
    // Preserve existing customModels if not provided in the new config
    const existingCustomModels = config.providerConfig?.customModels;
    config.providerConfig = {
      ...normalizedConfig,
      customModels: normalizedConfig.customModels ?? existingCustomModels,
    };
  } else {
    delete config.providerConfig;
  }
  syncPrimaryLlmConnection(config);
  saveConfig(config);
}

/**
 * Get custom models for the Custom provider.
 * Returns empty array if no custom models are defined.
 */
export function getCustomModels(): CustomModelDefinition[] {
  const config = loadStoredConfig();
  return config?.providerConfig?.customModels ?? [];
}

/**
 * Set custom models for the Custom provider.
 * Replaces all existing custom models.
 */
export function setCustomModels(models: CustomModelDefinition[]): void {
  const config = loadStoredConfig();
  if (!config) return;

  // Ensure providerConfig exists
  if (!config.providerConfig) {
    config.providerConfig = {
      provider: 'custom',
      baseURL: '',
      apiFormat: 'anthropic',
    };
  }

  config.providerConfig.customModels = models;
  syncPrimaryLlmConnection(config);
  saveConfig(config);
}

/**
 * Add a custom model.
 * Returns the updated list of custom models.
 * Throws if a model with the same ID already exists.
 */
export function addCustomModel(model: CustomModelDefinition): CustomModelDefinition[] {
  const models = getCustomModels();

  // Check for duplicate ID
  if (models.some(m => m.id === model.id)) {
    throw new Error(`Model with ID "${model.id}" already exists`);
  }

  const updatedModels = [...models, model];
  setCustomModels(updatedModels);
  return updatedModels;
}

/**
 * Update an existing custom model.
 * Returns the updated list of custom models.
 * Throws if the model is not found.
 */
export function updateCustomModel(modelId: string, updates: Partial<Omit<CustomModelDefinition, 'id'>>): CustomModelDefinition[] {
  const models = getCustomModels();
  const index = models.findIndex(m => m.id === modelId);

  if (index === -1) {
    throw new Error(`Model with ID "${modelId}" not found`);
  }

  const updatedModels = [...models];
  // Explicitly construct the updated model to avoid type issues with partial updates
  const currentModel = updatedModels[index]!;
  updatedModels[index] = {
    id: currentModel.id,
    name: updates.name ?? currentModel.name,
    shortName: updates.shortName !== undefined ? updates.shortName : currentModel.shortName,
    description: updates.description !== undefined ? updates.description : currentModel.description,
  };
  setCustomModels(updatedModels);
  return updatedModels;
}

/**
 * Delete a custom model.
 * Returns the updated list of custom models.
 */
export function deleteCustomModel(modelId: string): CustomModelDefinition[] {
  const models = getCustomModels();
  const updatedModels = models.filter(m => m.id !== modelId);
  setCustomModels(updatedModels);
  return updatedModels;
}

/**
 * Reorder custom models.
 * Pass the model IDs in the desired order.
 * Returns the updated list of custom models.
 */
export function reorderCustomModels(modelIds: string[]): CustomModelDefinition[] {
  const models = getCustomModels();
  const modelMap = new Map(models.map(m => [m.id, m]));

  // Build reordered list
  const reorderedModels: CustomModelDefinition[] = [];
  for (const id of modelIds) {
    const model = modelMap.get(id);
    if (model) {
      reorderedModels.push(model);
      modelMap.delete(id);
    }
  }

  // Append any models not in the reorder list (shouldn't happen, but be safe)
  for (const model of modelMap.values()) {
    reorderedModels.push(model);
  }

  setCustomModels(reorderedModels);
  return reorderedModels;
}

// ============================================
// LLM Connections
// ============================================

// Re-export connection types for convenience
export type {
  LlmConnection,
  LlmProviderType,
  LlmAuthType,
  LlmConnectionWithStatus,
} from './llm-connections.ts';

/**
 * Get all configured LLM connections.
 * Returns an empty array if migration has not run yet.
 */
export function getLlmConnections(): LlmConnection[] {
  const config = loadStoredConfig();
  return config?.llmConnections ?? [];
}

/**
 * Get a specific LLM connection by slug.
 */
export function getLlmConnection(slug: string): LlmConnection | null {
  const connections = getLlmConnections();
  return connections.find(connection => connection.slug === slug) ?? null;
}

/**
 * Add a new LLM connection.
 * Returns false if slug already exists or config is unavailable.
 */
export function addLlmConnection(connection: LlmConnection): boolean {
  const config = loadStoredConfig();
  if (!config) return false;

  if (!config.llmConnections) {
    config.llmConnections = [];
  }

  if (config.llmConnections.some(existing => existing.slug === connection.slug)) {
    return false;
  }

  config.llmConnections.push({
    ...connection,
    createdAt: connection.createdAt || Date.now(),
  });

  ensureDefaultLlmConnection(config);
  backfillConnectionModels(config);
  saveConfig(config);
  return true;
}

/**
 * Update an existing LLM connection by slug.
 * Returns false if not found.
 */
export function updateLlmConnection(
  slug: string,
  updates: Partial<Omit<LlmConnection, 'slug'>>,
): boolean {
  const config = loadStoredConfig();
  if (!config?.llmConnections || config.llmConnections.length === 0) {
    return false;
  }

  const index = config.llmConnections.findIndex(connection => connection.slug === slug);
  if (index === -1) return false;

  const existing = config.llmConnections[index]!;
  config.llmConnections[index] = {
    slug: existing.slug,
    name: updates.name ?? existing.name,
    providerType: updates.providerType ?? existing.providerType,
    type: updates.type ?? existing.type,
    authType: updates.authType ?? existing.authType,
    createdAt: updates.createdAt ?? existing.createdAt,
    baseUrl: updates.baseUrl !== undefined ? updates.baseUrl : existing.baseUrl,
    models: updates.models !== undefined ? updates.models : existing.models,
    defaultModel: updates.defaultModel !== undefined ? updates.defaultModel : existing.defaultModel,
    codexPath: updates.codexPath !== undefined ? updates.codexPath : existing.codexPath,
    awsRegion: updates.awsRegion !== undefined ? updates.awsRegion : existing.awsRegion,
    gcpProjectId: updates.gcpProjectId !== undefined ? updates.gcpProjectId : existing.gcpProjectId,
    gcpRegion: updates.gcpRegion !== undefined ? updates.gcpRegion : existing.gcpRegion,
    lastUsedAt: updates.lastUsedAt !== undefined ? updates.lastUsedAt : existing.lastUsedAt,
  };

  backfillConnectionModels(config);
  ensureDefaultLlmConnection(config);
  saveConfig(config);
  return true;
}

/**
 * Delete an LLM connection.
 * Returns false if not found.
 */
export function deleteLlmConnection(slug: string): boolean {
  const config = loadStoredConfig();
  if (!config?.llmConnections || config.llmConnections.length === 0) {
    return false;
  }

  const index = config.llmConnections.findIndex(connection => connection.slug === slug);
  if (index === -1) return false;

  config.llmConnections.splice(index, 1);
  if (config.defaultLlmConnection === slug) {
    config.defaultLlmConnection = config.llmConnections[0]?.slug;
  }

  saveConfig(config);
  return true;
}

/**
 * Get the default LLM connection slug.
 */
export function getDefaultLlmConnection(): string | null {
  const config = loadStoredConfig();
  if (!config?.llmConnections || config.llmConnections.length === 0) {
    return null;
  }
  return config.defaultLlmConnection ?? config.llmConnections[0]!.slug;
}

/**
 * Set default LLM connection.
 * Returns false if slug does not exist.
 */
export function setDefaultLlmConnection(slug: string): boolean {
  const config = loadStoredConfig();
  if (!config?.llmConnections || config.llmConnections.length === 0) {
    return false;
  }

  if (!config.llmConnections.some(connection => connection.slug === slug)) {
    return false;
  }

  config.defaultLlmConnection = slug;
  saveConfig(config);
  return true;
}

/**
 * Update last-used timestamp for a connection.
 */
export function touchLlmConnection(slug: string): void {
  const config = loadStoredConfig();
  if (!config?.llmConnections) return;

  const connection = config.llmConnections.find(item => item.slug === slug);
  if (!connection) return;

  connection.lastUsedAt = Date.now();
  saveConfig(config);
}


/**
 * Get whether desktop notifications are enabled.
 * Defaults to true if not set.
 */
export function getNotificationsEnabled(): boolean {
  const config = loadStoredConfig();
  if (config?.notificationsEnabled !== undefined) {
    return config.notificationsEnabled;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.notificationsEnabled;
}

/**
 * Set whether desktop notifications are enabled.
 */
export function setNotificationsEnabled(enabled: boolean): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.notificationsEnabled = enabled;
  saveConfig(config);
}

// ============================================
// Input Settings
// ============================================

/**
 * Get whether auto-capitalisation is enabled.
 * Defaults to true if not set.
 */
export function getAutoCapitalisation(): boolean {
  const config = loadStoredConfig();
  if (config?.autoCapitalisation !== undefined) {
    return config.autoCapitalisation;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.autoCapitalisation;
}

/**
 * Set whether auto-capitalisation is enabled.
 */
export function setAutoCapitalisation(enabled: boolean): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.autoCapitalisation = enabled;
  saveConfig(config);
}

/**
 * Get the key combination used to send messages.
 * Defaults to 'enter' if not set.
 */
export function getSendMessageKey(): 'enter' | 'cmd-enter' {
  const config = loadStoredConfig();
  if (config?.sendMessageKey !== undefined) {
    return config.sendMessageKey;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.sendMessageKey;
}

/**
 * Set the key combination used to send messages.
 */
export function setSendMessageKey(key: 'enter' | 'cmd-enter'): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.sendMessageKey = key;
  saveConfig(config);
}

/**
 * Get whether spell check is enabled in the input.
 * Defaults to false if not set.
 */
export function getSpellCheck(): boolean {
  const config = loadStoredConfig();
  if (config?.spellCheck !== undefined) {
    return config.spellCheck;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.spellCheck;
}

/**
 * Set whether spell check is enabled in the input.
 */
export function setSpellCheck(enabled: boolean): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.spellCheck = enabled;
  saveConfig(config);
}

// Note: getDefaultWorkingDirectory/setDefaultWorkingDirectory removed
// Working directory is now stored per-workspace in workspace config.json (defaults.workingDirectory)
// Note: getDefaultPermissionMode/getEnabledPermissionModes removed
// Permission settings are now stored per-workspace in workspace config.json (defaults.permissionMode, defaults.cyclablePermissionModes)

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Clear all configuration and credentials (for logout).
 * Deletes config file and credentials file.
 */
export async function clearAllConfig(): Promise<void> {
  // Delete config file
  if (existsSync(CONFIG_FILE)) {
    rmSync(CONFIG_FILE);
  }

  // Delete credentials file
  const credentialsFile = join(CONFIG_DIR, 'credentials.enc');
  if (existsSync(credentialsFile)) {
    rmSync(credentialsFile);
  }

  // Optionally: Delete workspace data (conversations)
  const workspacesDir = join(CONFIG_DIR, 'workspaces');
  if (existsSync(workspacesDir)) {
    rmSync(workspacesDir, { recursive: true });
  }
}

// ============================================
// Workspace Management Functions
// ============================================

/**
 * Generate a unique workspace ID.
 * Uses a random UUID-like format.
 */
export function generateWorkspaceId(): string {
  // Generate random bytes and format as UUID-like string (8-4-4-4-12)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Find workspace icon file at workspace_root/icon.*
 * Returns absolute path to icon file if found, null otherwise
 */
export function findWorkspaceIcon(rootPath: string): string | null {
  return findIconFile(rootPath) ?? null;
}

export function getWorkspaces(): Workspace[] {
  const config = loadStoredConfig();
  const workspaces = config?.workspaces || [];

  // Resolve workspace names from folder config and local icons
  return workspaces.map(w => {
    // Read name from workspace folder config (single source of truth)
    const wsConfig = loadWorkspaceConfig(w.rootPath);
    const name = wsConfig?.name || basename(w.rootPath) || 'Untitled';

    // If workspace has a stored iconUrl that's a remote URL, use it
    // Otherwise check for local icon file
    let iconUrl = w.iconUrl;
    if (!iconUrl || (!iconUrl.startsWith('http://') && !iconUrl.startsWith('https://'))) {
      const localIcon = findWorkspaceIcon(w.rootPath);
      if (localIcon) {
        // Convert absolute path to file:// URL for Electron renderer
        // Append mtime as cache-buster so UI refreshes when icon changes
        try {
          const mtime = statSync(localIcon).mtimeMs;
          iconUrl = `file://${localIcon}?t=${mtime}`;
        } catch {
          iconUrl = `file://${localIcon}`;
        }
      }
    }

    return { ...w, name, iconUrl };
  });
}

export function getActiveWorkspace(): Workspace | null {
  const config = loadStoredConfig();
  if (!config || !config.activeWorkspaceId) {
    return config?.workspaces[0] || null;
  }
  return config.workspaces.find(w => w.id === config.activeWorkspaceId) || config.workspaces[0] || null;
}

/**
 * Find a workspace by name (case-insensitive) or ID.
 * Useful for CLI -w flag to specify workspace.
 */
export function getWorkspaceByNameOrId(nameOrId: string): Workspace | null {
  const workspaces = getWorkspaces();
  return workspaces.find(w =>
    w.id === nameOrId ||
    w.name.toLowerCase() === nameOrId.toLowerCase()
  ) || null;
}

export function setActiveWorkspace(workspaceId: string): void {
  const config = loadStoredConfig();
  if (!config) return;

  const workspace = config.workspaces.find(w => w.id === workspaceId);
  if (!workspace) return;

  config.activeWorkspaceId = workspaceId;
  saveConfig(config);
}

/**
 * Atomically switch to a workspace and load/create a session.
 * This prevents race conditions by doing both operations together.
 *
 * @param workspaceId The ID of the workspace to switch to
 * @returns The workspace and session, or null if workspace not found
 */
export async function switchWorkspaceAtomic(workspaceId: string): Promise<{ workspace: Workspace; session: SessionConfig } | null> {
  const config = loadStoredConfig();
  if (!config) return null;

  const workspace = config.workspaces.find(w => w.id === workspaceId);
  if (!workspace) return null;

  // Get or create the latest session for this workspace
  const session = await getOrCreateLatestSession(workspace.rootPath);

  // Update active workspace in config
  config.activeWorkspaceId = workspaceId;
  workspace.lastAccessedAt = Date.now();
  saveConfig(config);

  return { workspace, session };
}

/**
 * Add a workspace to the global config.
 * @param workspace - Workspace data (must include rootPath)
 */
export function addWorkspace(workspace: Omit<Workspace, 'id' | 'createdAt'>): Workspace {
  const config = loadStoredConfig();
  if (!config) {
    throw new Error('No config found');
  }

  // Check if workspace with same rootPath already exists
  const existing = config.workspaces.find(w => w.rootPath === workspace.rootPath);
  if (existing) {
    // Update existing workspace with new settings
    const updated: Workspace = {
      ...existing,
      ...workspace,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    const existingIndex = config.workspaces.indexOf(existing);
    config.workspaces[existingIndex] = updated;
    saveConfig(config);
    return updated;
  }

  const newWorkspace: Workspace = {
    ...workspace,
    id: generateWorkspaceId(),
    createdAt: Date.now(),
  };

  // Create workspace folder structure if it doesn't exist
  if (!isValidWorkspace(newWorkspace.rootPath)) {
    createWorkspaceAtPath(newWorkspace.rootPath, newWorkspace.name);
  }

  config.workspaces.push(newWorkspace);

  // If this is the only workspace, make it active
  if (config.workspaces.length === 1) {
    config.activeWorkspaceId = newWorkspace.id;
  }

  saveConfig(config);
  return newWorkspace;
}

/**
 * Sync workspaces by discovering workspaces in the default location
 * that aren't already tracked in the global config.
 * Call this on app startup.
 */
export function syncWorkspaces(): void {
  const config = loadStoredConfig();
  if (!config) return;

  const discoveredPaths = discoverWorkspacesInDefaultLocation();
  const trackedPaths = new Set(config.workspaces.map(w => w.rootPath));

  let added = false;
  for (const rootPath of discoveredPaths) {
    if (trackedPaths.has(rootPath)) continue;

    // Load the workspace config to get name
    const wsConfig = loadWorkspaceConfig(rootPath);
    if (!wsConfig) continue;

    const newWorkspace: Workspace = {
      id: wsConfig.id || generateWorkspaceId(),
      name: wsConfig.name,
      rootPath,
      createdAt: wsConfig.createdAt || Date.now(),
    };

    config.workspaces.push(newWorkspace);
    added = true;
  }

  if (added) {
    // If no active workspace, set to first
    if (!config.activeWorkspaceId && config.workspaces.length > 0) {
      config.activeWorkspaceId = config.workspaces[0]!.id;
    }
    saveConfig(config);
  }
}

export async function removeWorkspace(workspaceId: string): Promise<boolean> {
  const config = loadStoredConfig();
  if (!config) return false;

  const index = config.workspaces.findIndex(w => w.id === workspaceId);
  if (index === -1) return false;

  config.workspaces.splice(index, 1);

  // If we removed the active workspace, switch to first available
  if (config.activeWorkspaceId === workspaceId) {
    config.activeWorkspaceId = config.workspaces[0]?.id || null;
  }

  saveConfig(config);

  // Clean up credential store credentials for this workspace
  const manager = getCredentialManager();
  await manager.deleteWorkspaceCredentials(workspaceId);

  return true;
}

// Note: renameWorkspace() was removed - workspace names are now stored only in folder config
// Use updateWorkspaceSetting('name', ...) to rename workspaces via the folder config

// ============================================
// Workspace Conversation Persistence
// ============================================

const WORKSPACES_DIR = join(CONFIG_DIR, 'workspaces');

function ensureWorkspaceDir(workspaceId: string): string {
  const dir = join(WORKSPACES_DIR, workspaceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}


// Re-export types from core for convenience
export type { StoredAttachment, StoredMessage } from '@agent-operator/core/types';

export interface WorkspaceConversation {
  messages: StoredMessage[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextTokens: number;
    costUsd: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  savedAt: number;
}

// Save workspace conversation (messages + token usage)
export function saveWorkspaceConversation(
  workspaceId: string,
  messages: StoredMessage[],
  tokenUsage: WorkspaceConversation['tokenUsage']
): void {
  const dir = ensureWorkspaceDir(workspaceId);
  const filePath = join(dir, 'conversation.json');

  const conversation: WorkspaceConversation = {
    messages,
    tokenUsage,
    savedAt: Date.now(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  } catch (e) {
    // Handle cyclic structures or other serialization errors
    console.error(`[storage] [CYCLIC STRUCTURE] Failed to save workspace conversation:`, e);
    console.error(`[storage] Message count: ${messages.length}, message types: ${messages.map(m => m.type).join(', ')}`);
    // Try to save with sanitized messages
    try {
      const sanitizedMessages = messages.map((m, i) => {
        let safeToolInput = m.toolInput;
        if (m.toolInput) {
          try {
            JSON.stringify(m.toolInput);
          } catch (inputErr) {
            console.error(`[storage] [CYCLIC STRUCTURE] in message ${i} toolInput (tool: ${m.toolName}), keys: ${Object.keys(m.toolInput).join(', ')}, error: ${inputErr}`);
            safeToolInput = { error: '[non-serializable input]' };
          }
        }
        return { ...m, toolInput: safeToolInput };
      });
      const sanitizedConversation: WorkspaceConversation = {
        messages: sanitizedMessages,
        tokenUsage,
        savedAt: Date.now(),
      };
      writeFileSync(filePath, JSON.stringify(sanitizedConversation, null, 2), 'utf-8');
      console.error(`[storage] Saved sanitized workspace conversation successfully`);
    } catch (e2) {
      console.error(`[storage] Failed to save even sanitized workspace conversation:`, e2);
    }
  }
}

// Load workspace conversation
export function loadWorkspaceConversation(workspaceId: string): WorkspaceConversation | null {
  const filePath = join(WORKSPACES_DIR, workspaceId, 'conversation.json');

  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as WorkspaceConversation;
  } catch {
    return null;
  }
}

// Get workspace data directory path
export function getWorkspaceDataPath(workspaceId: string): string {
  return join(WORKSPACES_DIR, workspaceId);
}

// Clear workspace conversation
export function clearWorkspaceConversation(workspaceId: string): void {
  const filePath = join(WORKSPACES_DIR, workspaceId, 'conversation.json');
  if (existsSync(filePath)) {
    writeFileSync(filePath, '{}', 'utf-8');
  }

  // Also clear any active plan (plans are session-scoped)
  clearWorkspacePlan(workspaceId);
}

// ============================================
// Plan Storage (Session-Scoped)
// Plans are stored per-workspace and cleared with /clear
// ============================================

/**
 * Save a plan for a workspace.
 * Plans are session-scoped - they persist during the session but are
 * cleared when the user runs /clear or starts a new session.
 */
export function saveWorkspacePlan(workspaceId: string, plan: Plan): void {
  const dir = ensureWorkspaceDir(workspaceId);
  const filePath = join(dir, 'plan.json');
  writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * Load the current plan for a workspace.
 * Returns null if no plan exists.
 */
export function loadWorkspacePlan(workspaceId: string): Plan | null {
  const filePath = join(WORKSPACES_DIR, workspaceId, 'plan.json');

  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Plan;
  } catch {
    return null;
  }
}

/**
 * Clear the plan for a workspace.
 * Called when user runs /clear or cancels a plan.
 */
export function clearWorkspacePlan(workspaceId: string): void {
  const filePath = join(WORKSPACES_DIR, workspaceId, 'plan.json');
  if (existsSync(filePath)) {
    rmSync(filePath);
  }
}

// ============================================
// Session Input Drafts
// Persists input text per session across app restarts
// ============================================

const DRAFTS_FILE = join(CONFIG_DIR, 'drafts.json');

interface DraftsData {
  drafts: Record<string, string>;
  updatedAt: number;
}

/**
 * Load all drafts from disk
 */
function loadDraftsData(): DraftsData {
  try {
    if (!existsSync(DRAFTS_FILE)) {
      return { drafts: {}, updatedAt: 0 };
    }
    const content = readFileSync(DRAFTS_FILE, 'utf-8');
    return JSON.parse(content) as DraftsData;
  } catch {
    return { drafts: {}, updatedAt: 0 };
  }
}

/**
 * Save drafts to disk
 */
function saveDraftsData(data: DraftsData): void {
  ensureConfigDir();
  data.updatedAt = Date.now();
  writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get draft text for a session
 */
export function getSessionDraft(sessionId: string): string | null {
  const data = loadDraftsData();
  return data.drafts[sessionId] ?? null;
}

/**
 * Set draft text for a session
 * Pass empty string to clear the draft
 */
export function setSessionDraft(sessionId: string, text: string): void {
  const data = loadDraftsData();
  if (text) {
    data.drafts[sessionId] = text;
  } else {
    delete data.drafts[sessionId];
  }
  saveDraftsData(data);
}

/**
 * Delete draft for a session
 */
export function deleteSessionDraft(sessionId: string): void {
  const data = loadDraftsData();
  delete data.drafts[sessionId];
  saveDraftsData(data);
}

/**
 * Get all drafts as a record
 */
export function getAllSessionDrafts(): Record<string, string> {
  const data = loadDraftsData();
  return data.drafts;
}

// ============================================
// Theme Storage (App-level only)
// ============================================

import type { ThemeOverrides, ThemeFile, PresetTheme } from './theme.ts';
import { readdirSync } from 'fs';

const APP_THEME_FILE = join(CONFIG_DIR, 'theme.json');
const APP_THEMES_DIR = join(CONFIG_DIR, 'themes');

/**
 * Get the app-level themes directory.
 * Preset themes are stored at ~/.cowork/themes/
 */
export function getAppThemesDir(): string {
  return APP_THEMES_DIR;
}

/**
 * Load app-level theme overrides
 */
export function loadAppTheme(): ThemeOverrides | null {
  try {
    if (!existsSync(APP_THEME_FILE)) {
      return null;
    }
    const content = readFileSync(APP_THEME_FILE, 'utf-8');
    return JSON.parse(content) as ThemeOverrides;
  } catch {
    return null;
  }
}

/**
 * Save app-level theme overrides
 */
export function saveAppTheme(theme: ThemeOverrides): void {
  ensureConfigDir();
  writeFileSync(APP_THEME_FILE, JSON.stringify(theme, null, 2), 'utf-8');
}


// ============================================
// Preset Themes (app-level)
// ============================================

/**
 * Ensure preset themes directory exists and has bundled themes.
 * Copies bundled themes from the provided directory to app themes dir on first run.
 * Only copies if theme doesn't exist (preserves user edits).
 * @param bundledThemesDir - Path to bundled themes (e.g., Electron's resources/themes)
 */
export function ensurePresetThemes(bundledThemesDir?: string): void {
  const themesDir = getAppThemesDir();

  // Create themes directory if it doesn't exist
  if (!existsSync(themesDir)) {
    mkdirSync(themesDir, { recursive: true });
  }

  // If no bundled themes directory provided, just ensure the directory exists
  if (!bundledThemesDir || !existsSync(bundledThemesDir)) {
    return;
  }

  // Copy each bundled theme if it doesn't exist in app themes dir
  try {
    const bundledFiles = readdirSync(bundledThemesDir).filter(f => f.endsWith('.json'));
    for (const file of bundledFiles) {
      const destPath = join(themesDir, file);
      if (!existsSync(destPath)) {
        const srcPath = join(bundledThemesDir, file);
        const content = readFileSync(srcPath, 'utf-8');
        writeFileSync(destPath, content, 'utf-8');
      }
    }
  } catch {
    // Ignore errors - themes are optional
  }
}

/**
 * Load all preset themes from app themes directory.
 * Returns array of PresetTheme objects sorted by name.
 * @param bundledThemesDir - Optional path to bundled themes (for Electron)
 */
export function loadPresetThemes(bundledThemesDir?: string): PresetTheme[] {
  ensurePresetThemes(bundledThemesDir);

  const themesDir = getAppThemesDir();
  if (!existsSync(themesDir)) {
    return [];
  }

  const themes: PresetTheme[] = [];

  try {
    const files = readdirSync(themesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const id = file.replace('.json', '');
      const path = join(themesDir, file);
      try {
        const content = readFileSync(path, 'utf-8');
        const theme = JSON.parse(content) as ThemeFile;
        // Resolve relative backgroundImage paths to file:// URLs
        const resolvedTheme = resolveThemeBackgroundImage(theme, path);
        themes.push({ id, path, theme: resolvedTheme });
      } catch {
        // Skip invalid theme files
      }
    }
  } catch {
    return [];
  }

  // Sort by name (default first, then alphabetically)
  return themes.sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    return (a.theme.name || a.id).localeCompare(b.theme.name || b.id);
  });
}

/**
 * Get MIME type from file extension for data URL encoding.
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

/**
 * Resolve relative backgroundImage paths to data URLs.
 * If the backgroundImage is a relative path (no protocol), resolve it relative to the theme's directory,
 * read the file, and convert it to a data URL. This is necessary because the renderer process
 * cannot access file:// URLs directly when running on localhost in dev mode.
 * @param theme - Theme object to process
 * @param themePath - Absolute path to the theme's JSON file
 */
function resolveThemeBackgroundImage(theme: ThemeFile, themePath: string): ThemeFile {
  if (!theme.backgroundImage) {
    return theme;
  }

  // Check if it's already an absolute URL (has protocol like http://, https://, data:)
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(theme.backgroundImage);
  if (hasProtocol) {
    return theme;
  }

  // It's a relative path - resolve it relative to the theme's directory
  const themeDir = dirname(themePath);
  const absoluteImagePath = join(themeDir, theme.backgroundImage);

  // Read the file and convert to data URL so renderer can use it
  // (file:// URLs are blocked in renderer when running on localhost)
  try {
    if (!existsSync(absoluteImagePath)) {
      console.warn(`Theme background image not found: ${absoluteImagePath}`);
      return theme;
    }

    const imageBuffer = readFileSync(absoluteImagePath);
    const base64 = imageBuffer.toString('base64');
    const mimeType = getMimeType(absoluteImagePath);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return {
      ...theme,
      backgroundImage: dataUrl,
    };
  } catch (error) {
    console.warn(`Failed to read theme background image: ${absoluteImagePath}`, error);
    return theme;
  }
}

/**
 * Load a specific preset theme by ID.
 * @param id - Theme ID (filename without .json)
 */
export function loadPresetTheme(id: string): PresetTheme | null {
  const themesDir = getAppThemesDir();
  const path = join(themesDir, `${id}.json`);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const theme = JSON.parse(content) as ThemeFile;
    // Resolve relative backgroundImage paths to file:// URLs
    const resolvedTheme = resolveThemeBackgroundImage(theme, path);
    return { id, path, theme: resolvedTheme };
  } catch {
    return null;
  }
}

/**
 * Get the path to the app-level preset themes directory.
 */
export function getPresetThemesDir(): string {
  return getAppThemesDir();
}

/**
 * Reset a preset theme to its bundled default.
 * Copies the bundled version over the user's version.
 * @param id - Theme ID to reset
 * @param bundledThemesDir - Path to bundled themes (e.g., Electron's resources/themes)
 */
export function resetPresetTheme(id: string, bundledThemesDir?: string): boolean {
  // Bundled themes directory must be provided (e.g., by Electron)
  if (!bundledThemesDir) {
    return false;
  }

  const bundledPath = join(bundledThemesDir, `${id}.json`);
  const themesDir = getAppThemesDir();
  const destPath = join(themesDir, `${id}.json`);

  if (!existsSync(bundledPath)) {
    return false;
  }

  try {
    const content = readFileSync(bundledPath, 'utf-8');
    if (!existsSync(themesDir)) {
      mkdirSync(themesDir, { recursive: true });
    }
    writeFileSync(destPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Color Theme Selection (stored in config)
// ============================================

/**
 * Get the currently selected color theme ID.
 * Returns 'default' if not set.
 */
export function getColorTheme(): string {
  const config = loadStoredConfig();
  if (config?.colorTheme !== undefined) {
    return config.colorTheme;
  }
  const defaults = loadConfigDefaults();
  return defaults.defaults.colorTheme;
}

/**
 * Set the color theme ID.
 */
export function setColorTheme(themeId: string): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.colorTheme = themeId;
  saveConfig(config);
}

/**
 * Get rich tool descriptions setting.
 * Defaults to true when unset or config missing.
 */
export function getRichToolDescriptions(): boolean {
  const config = loadStoredConfig();
  if (config?.richToolDescriptions !== undefined) {
    return config.richToolDescriptions;
  }
  return true;
}

/**
 * Set rich tool descriptions setting.
 */
export function setRichToolDescriptions(enabled: boolean): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.richToolDescriptions = enabled;
  saveConfig(config);
}

// ============================================
// Auto-Update Dismissed Version
// ============================================

/**
 * Get the dismissed update version.
 * Returns null if no version is dismissed.
 */
export function getDismissedUpdateVersion(): string | null {
  const config = loadStoredConfig();
  return config?.dismissedUpdateVersion ?? null;
}

/**
 * Set the dismissed update version.
 * Pass the version string to dismiss notifications for that version.
 */
export function setDismissedUpdateVersion(version: string): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.dismissedUpdateVersion = version;
  saveConfig(config);
}

/**
 * Clear the dismissed update version.
 * Call this when a new version is released (or on successful update).
 */
export function clearDismissedUpdateVersion(): void {
  const config = loadStoredConfig();
  if (!config) return;
  delete config.dismissedUpdateVersion;
  saveConfig(config);
}

// ============================================
// Tool Icons (CLI tool icons for turn card display)
// ============================================

const TOOL_ICONS_DIR_NAME = 'tool-icons';

/**
 * Returns the path to the tool-icons directory: ~/.cowork/tool-icons/
 */
export function getToolIconsDir(): string {
  return join(CONFIG_DIR, TOOL_ICONS_DIR_NAME);
}

/**
 * Ensure tool-icons directory exists and has bundled defaults.
 * Resolves bundled path automatically via getBundledAssetsDir('tool-icons').
 * Copies bundled tool-icons.json and icon files on first run.
 * Only copies files that don't already exist (preserves user customizations).
 */
export function ensureToolIcons(): void {
  const toolIconsDir = getToolIconsDir();

  // Create tool-icons directory if it doesn't exist
  if (!existsSync(toolIconsDir)) {
    mkdirSync(toolIconsDir, { recursive: true });
  }

  // Resolve bundled tool-icons directory via shared asset resolver
  const bundledToolIconsDir = getBundledAssetsDir('tool-icons');
  if (!bundledToolIconsDir) {
    return;
  }

  // Copy each bundled file if it doesn't exist in the target dir
  // This includes tool-icons.json and all icon files (png, ico, svg, jpg)
  try {
    const bundledFiles = readdirSyncFs(bundledToolIconsDir);
    for (const file of bundledFiles) {
      const destPath = join(toolIconsDir, file);
      if (!existsSync(destPath)) {
        const srcPath = join(bundledToolIconsDir, file);
        copyFileSync(srcPath, destPath);
      }
    }
  } catch {
    // Ignore errors — tool icons are optional enhancement
  }
}
