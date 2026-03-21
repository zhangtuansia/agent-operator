/**
 * Agent Factory
 *
 * Creates the appropriate AI agent based on configuration.
 * Supports two agents:
 * - ClaudeAgent (Anthropic) - Default, using @anthropic-ai/claude-agent-sdk
 * - CodexAgent (OpenAI) - Using app-server mode with JSON-RPC
 *
 * Both agents implement AgentBackend directly.
 *
 * LLM Connections:
 * - Backends can be created from LLM connection configs
 * - providerType determines SDK selection and credential routing
 * - authType determines how credentials are retrieved
 */

import type {
  AgentBackend,
  BackendSelection,
  BackendConfig,
  CoreBackendConfig,
  AgentProvider,
  BackendHostRuntimeContext,
  LlmProviderType,
  LlmAuthType,
  PostInitResult,
  AnthropicRuntime,
} from './types.ts';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ClaudeAgent } from '../claude-agent.ts';
import { CodexAgent } from '../codex-agent.ts';
import { CopilotAgent } from '../copilot-agent.ts';
import { PiAgent } from '../pi-agent.ts';
import { OperatorAgent } from '../operator-agent.ts';
import { expandPath } from '../../utils/paths.ts';
import {
  initializeBackendHostRuntime as initializeBackendHostRuntimeBootstrap,
  resolveBackendHostTooling as resolveBackendHostToolingPaths,
  resolveBackendRuntimePaths,
  type ResolvedBackendHostTooling,
  type ResolvedBackendRuntimePaths,
} from './internal/runtime-resolver.ts';
import {
  getLlmConnection,
  getDefaultLlmConnection,
  type LlmConnection,
} from '../../config/storage.ts';
// Import deprecated type for legacy migration function only
import type { LlmConnectionType } from '../../config/llm-connections.ts';
// Import validation helpers for provider-auth combinations and codexPath
import {
  getDefaultModelForConnection,
  getPiModelsForAuthProvider,
  getAllPiModels,
  isValidProviderAuthCombination,
  validateCodexPath,
} from '../../config/index.ts';
import type { ModelFetchResult, ModelFetcherCredentials } from '../../config/model-fetcher.ts';
import { parseValidationError } from '../../config/llm-validation.ts';
import { getCredentialManager } from '../../credentials/index.ts';
import { isSafeHttpHeaderValue } from '../../utils/mask.ts';

type StoredConnectionValidationResult = {
  success: boolean;
  error?: string;
  shouldRefreshModels?: boolean;
};

/**
 * Detect provider from stored auth type.
 *
 * Maps authentication types to their corresponding providers:
 * - api_key, oauth_token → Anthropic (Claude) by default
 *
 * Note: Provider is now determined by LLM connection type, not auth type.
 * This function is kept for backward compatibility.
 *
 * @param authType - The stored authentication type
 * @returns The detected provider
 */
export function detectProvider(authType: string): AgentProvider {
  switch (authType) {
    case 'api_key':
    case 'oauth_token':
      return 'anthropic';

    // Default to Anthropic for unknown types
    default:
      return 'anthropic';
  }
}

/**
 * Create the appropriate backend based on configuration.
 *
 * @param config - Backend configuration including provider selection
 * @returns An initialized AgentBackend instance
 * @throws Error if the requested provider is not yet implemented
 *
 * @example
 * ```typescript
 * // Create Anthropic (Claude) backend
 * const backend = createBackend({
 *   provider: 'anthropic',
 *   workspace: myWorkspace,
 *   model: 'claude-sonnet-4-5-20250929',
 * });
 *
 * // Create Codex backend (uses app-server mode)
 * const codexBackend = createBackend({
 *   provider: 'openai',
 *   workspace: myWorkspace,
 * });
 * ```
 */
export function createBackend(config: BackendConfig): AgentBackend {
  switch (config.provider) {
    case 'anthropic':
      if (config.anthropicRuntime === 'operator') {
        return new OperatorAgent({
          workspace: config.workspace,
          session: config.session,
          model: config.model,
          providerType: config.providerType,
          connectionSlug: config.connectionSlug,
          thinkingLevel: config.thinkingLevel,
          onSdkSessionIdUpdate: config.onSdkSessionIdUpdate,
          onSdkSessionIdCleared: config.onSdkSessionIdCleared,
          getRecoveryMessages: config.getRecoveryMessages,
          isHeadless: config.isHeadless,
          debugMode: config.debugMode,
          systemPromptPreset: config.systemPromptPreset,
          automationSystem: config.automationSystem,
        }) as unknown as AgentBackend;
      }

      // ClaudeAgent implements AgentBackend directly
      return new ClaudeAgent(config);

    case 'openai':
      // CodexAgent implements AgentBackend directly
      // Auth is handled via ChatGPT Plus OAuth (native flow)
      return new CodexAgent(config);

    case 'copilot':
      // CopilotAgent implements AgentBackend directly
      // Auth is handled via GitHub OAuth
      return new CopilotAgent(config);

    case 'pi':
      // PiAgent implements AgentBackend directly
      // Runtime is provided by pi-agent-server subprocess.
      return new PiAgent(config);

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Create the appropriate agent based on configuration.
 * Alias for createBackend - prefer this name for new code.
 */
export const createAgent = createBackend;

export function createBackendFromResolvedContext(args: {
  context: ResolvedBackendContext;
  coreConfig: CoreBackendConfig;
  hostRuntime?: BackendHostRuntimeContext;
  providerOptions?: unknown;
}): AgentBackend {
  const { context, coreConfig } = args;
  const resolvedPaths = args.hostRuntime
    ? resolveBackendRuntimePaths(args.hostRuntime)
    : undefined;

  return createBackend({
    provider: context.provider,
    anthropicRuntime: context.anthropicRuntime,
    providerType: context.connection?.providerType,
    authType: context.authType,
    connectionSlug: context.connection?.slug,
    piAuthProvider: context.connection?.piAuthProvider,
    baseUrl: context.connection?.baseUrl,
    workspace: coreConfig.workspace,
    session: coreConfig.session,
    model: context.resolvedModel,
    miniModel: coreConfig.miniModel,
    thinkingLevel: coreConfig.thinkingLevel,
    isHeadless: coreConfig.isHeadless,
    debugMode: coreConfig.debugMode,
    systemPromptPreset: coreConfig.systemPromptPreset,
    automationSystem: coreConfig.automationSystem,
    mcpToken: undefined,
    onSdkSessionIdUpdate: coreConfig.onSdkSessionIdUpdate,
    onSdkSessionIdCleared: coreConfig.onSdkSessionIdCleared,
    getRecoveryMessages: coreConfig.getRecoveryMessages,
    getBranchSeedMessages: coreConfig.getBranchSeedMessages,
    markBranchSeedApplied: coreConfig.markBranchSeedApplied,
    onImageResize: coreConfig.onImageResize,
    initialSources: coreConfig.initialSources,
    envOverrides: coreConfig.envOverrides,
    mcpPool: coreConfig.mcpPool,
    poolServerUrl: coreConfig.poolServerUrl,
    copilotCliPath: resolvedPaths?.copilotCliPath,
    copilotInterceptorPath: resolvedPaths?.copilotInterceptorPath,
    nodePath: resolvedPaths?.nodeRuntimePath || 'bun',
    bridgeServerPath: undefined,
    sessionServerPath: undefined,
    piServerPath: resolvedPaths?.piServerPath,
    piInterceptorPath: resolvedPaths?.piInterceptorPath,
  } as BackendConfig);
}

/**
 * Get list of currently available providers.
 *
 * @returns Array of provider identifiers that have working implementations
 */
export function getAvailableProviders(): AgentProvider[] {
  return ['anthropic', 'openai', 'copilot', 'pi'];
}

/**
 * Check if a provider is available for use.
 *
 * @param provider - Provider to check
 * @returns true if the provider has a working implementation
 */
export function isProviderAvailable(provider: AgentProvider): boolean {
  return getAvailableProviders().includes(provider);
}

export function initializeBackendHostRuntime(args: {
  hostRuntime: BackendHostRuntimeContext;
  strict?: boolean;
}): ResolvedBackendRuntimePaths {
  return initializeBackendHostRuntimeBootstrap(args);
}

export function resolveBackendHostTooling(args: {
  hostRuntime: BackendHostRuntimeContext;
}): ResolvedBackendHostTooling {
  return resolveBackendHostToolingPaths(args.hostRuntime);
}

export interface BackendCapabilities {
  needsHttpPoolServer: boolean;
}

export interface ResolvedBackendContext {
  connection: LlmConnection | null;
  provider: AgentProvider;
  authType?: LlmAuthType;
  resolvedModel: string;
  capabilities: BackendCapabilities;
  anthropicRuntime?: AnthropicRuntime;
}

export const BACKEND_CAPABILITIES: Record<AgentProvider, BackendCapabilities> = {
  anthropic: { needsHttpPoolServer: false },
  openai: { needsHttpPoolServer: true },
  copilot: { needsHttpPoolServer: true },
  pi: { needsHttpPoolServer: false },
};

// ============================================================
// LLM Connection Support
// ============================================================

/**
 * Resolve the backend provider to instantiate for a connection.
 *
 * Allows callers to override the SDK/backend choice while still preserving
 * the connection's providerType/authType for credential routing.
 */
export function resolveBackendProvider(args: {
  connection?: Pick<LlmConnection, 'providerType'> | null;
  preferredProvider?: AgentProvider;
  fallbackProvider?: AgentProvider;
}): AgentProvider {
  const { connection, preferredProvider, fallbackProvider = 'anthropic' } = args;
  if (preferredProvider) return preferredProvider;
  if (!connection?.providerType) return fallbackProvider;
  return providerTypeToAgentProvider(connection.providerType);
}

export function resolveBackendSelection(args: {
  connection?: Pick<LlmConnection, 'providerType'> | null;
  agentType?: string | null;
  runtime?: 'default' | 'electron-session' | 'headless';
  fallbackProvider?: AgentProvider;
}): BackendSelection {
  const { connection, agentType, runtime = 'default', fallbackProvider = 'anthropic' } = args;
  const preferredProvider: AgentProvider | undefined =
    agentType === 'codex'
      ? 'openai'
      : agentType === 'pi'
        ? 'pi'
        : connection?.providerType === 'bedrock'
          ? 'pi'
        : connection?.providerType === 'anthropic_compat'
          ? 'pi'
        : undefined;

  const provider = resolveBackendProvider({
    connection,
    preferredProvider,
    fallbackProvider,
  });

  return {
    provider,
    anthropicRuntime:
      provider === 'anthropic' && runtime !== 'default'
        ? 'operator'
        : undefined,
  };
}

/**
 * Map LlmProviderType to AgentProvider (SDK selection).
 *
 * AgentProvider determines which backend class to instantiate:
 * - 'anthropic' → ClaudeAgent
 * - 'openai' → CodexAgent
 *
 * @param providerType - The full provider type from LLM connection
 * @returns The agent provider for SDK selection
 */
export function providerTypeToAgentProvider(providerType: LlmProviderType): AgentProvider {
  switch (providerType) {
    // Anthropic SDK backends
    case 'anthropic':
    case 'anthropic_compat':
    case 'bedrock':    // Bedrock uses Anthropic SDK with different auth
    case 'vertex':     // Vertex uses Anthropic SDK with different auth
      return 'anthropic';

    // OpenAI/Codex backends
    case 'openai':
    case 'openai_compat':
      return 'openai';

    // GitHub Copilot backend
    case 'copilot':
      return 'copilot';

    // Pi backend
    case 'pi':
      return 'pi';

    default:
      // Exhaustive check
      const _exhaustive: never = providerType;
      return 'anthropic';
  }
}

/**
 * @deprecated Use providerTypeToAgentProvider instead.
 * Map legacy LLM connection type to agent provider.
 *
 * @param connectionType - The legacy LLM connection type
 * @returns The corresponding agent provider
 */
export function connectionTypeToProvider(connectionType: LlmConnectionType): AgentProvider {
  switch (connectionType) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
    case 'openai-compat':
      return 'openai';
    default:
      return 'anthropic';
  }
}

/**
 * @deprecated Use LlmAuthType directly - no mapping needed.
 * Map legacy LLM auth type to backend auth type.
 *
 * @param authType - The legacy LLM connection auth type
 * @returns The corresponding backend auth type
 */
export function connectionAuthTypeToBackendAuthType(
  authType: LlmAuthType
): LlmAuthType | undefined {
  switch (authType) {
    case 'api_key':
    case 'api_key_with_endpoint':
    case 'oauth':
    case 'bearer_token':
    case 'iam_credentials':
    case 'service_account_file':
      // Pass through auth types that the backend handles
      return authType;
    case 'none':
    case 'environment':
      // These auth types don't require explicit credential passing
      return undefined;
  }
}

/**
 * Get LLM connection for a session.
 * Resolution order: session.llmConnection > workspace.defaults.defaultLlmConnection > global default
 *
 * @param sessionConnection - Connection slug from session (may be undefined)
 * @param workspaceDefaultConnection - Workspace default connection (may be undefined)
 * @returns The resolved LLM connection or null if not found
 */
export function resolveSessionConnection(
  sessionConnection?: string,
  workspaceDefaultConnection?: string
): LlmConnection | null {
  // 1. Session-level connection (locked after first message)
  if (sessionConnection) {
    const connection = getLlmConnection(sessionConnection);
    if (connection) return connection;
  }

  // 2. Workspace default
  if (workspaceDefaultConnection) {
    const connection = getLlmConnection(workspaceDefaultConnection);
    if (connection) return connection;
  }

  // 3. Global default
  const defaultSlug = getDefaultLlmConnection();
  if (!defaultSlug) return null;
  return getLlmConnection(defaultSlug);
}

/**
 * Resolve connection + provider/auth/model/capabilities in one call.
 * Keeps orchestration layers free from provider-specific branching.
 */
export function resolveBackendContext(args: {
  sessionConnectionSlug?: string;
  workspaceDefaultConnectionSlug?: string;
  managedModel?: string;
  runtime?: 'default' | 'electron-session' | 'headless';
  agentType?: string | null;
  fallbackProvider?: AgentProvider;
}): ResolvedBackendContext {
  const connection = resolveSessionConnection(
    args.sessionConnectionSlug,
    args.workspaceDefaultConnectionSlug,
  );
  const selection = resolveBackendSelection({
    connection,
    agentType: args.agentType,
    runtime: args.runtime,
    fallbackProvider: args.fallbackProvider,
  });
  const provider = selection.provider;
  const authType = connection
    ? connectionAuthTypeToBackendAuthType(connection.authType)
    : undefined;
  const resolvedModel =
    args.managedModel
    || connection?.defaultModel
    || getDefaultModelForConnection(provider, connection?.piAuthProvider);

  return {
    connection,
    provider,
    authType,
    resolvedModel,
    capabilities: BACKEND_CAPABILITIES[provider],
    anthropicRuntime: selection.anthropicRuntime,
  };
}

/**
 * Create backend configuration from an LLM connection.
 *
 * @param connection - The LLM connection config
 * @param baseConfig - Base backend config (workspace, session, etc.)
 * @returns Complete BackendConfig ready for createBackend()
 */
export function createConfigFromConnection(
  connection: LlmConnection,
  baseConfig: Omit<BackendConfig, 'provider' | 'authType' | 'providerType'>,
  preferredProvider?: AgentProvider,
): BackendConfig {
  // Use new providerType if available, fall back to legacy type
  const providerType = connection.providerType || (connection.type ? connectionTypeToProvider(connection.type) as unknown as LlmProviderType : 'anthropic');
  const provider = resolveBackendProvider({
    connection: { providerType },
    preferredProvider,
  });

  return {
    ...baseConfig,
    provider,
    providerType,
    authType: connection.authType,
    connectionSlug: connection.slug,
    piAuthProvider: connection.piAuthProvider,
    baseUrl: connection.baseUrl,
    // Use connection's default model if no model specified in baseConfig
    model: baseConfig.model || connection.defaultModel,
  };
}

/**
 * Create backend from an LLM connection slug.
 *
 * @param connectionSlug - The LLM connection slug
 * @param baseConfig - Base backend config (workspace, session, etc.)
 * @returns An initialized AgentBackend instance
 * @throws Error if connection not found or has invalid provider-auth combination
 */
export function createBackendFromConnection(
  connectionSlug: string,
  baseConfig: Omit<BackendConfig, 'provider' | 'authType'>,
  preferredProviderOrHostRuntime?: AgentProvider | BackendHostRuntimeContext,
  hostRuntime?: BackendHostRuntimeContext,
): AgentBackend {
  const connection = getLlmConnection(connectionSlug);
  if (!connection) {
    throw new Error(`LLM connection not found: ${connectionSlug}`);
  }

  const preferredProvider = typeof preferredProviderOrHostRuntime === 'string'
    ? preferredProviderOrHostRuntime
    : undefined;
  const resolvedHostRuntime = typeof preferredProviderOrHostRuntime === 'string'
    ? hostRuntime
    : preferredProviderOrHostRuntime;

  // Validate provider-auth combination before creating backend
  // This catches invalid configurations early with a clear error message
  if (!isValidProviderAuthCombination(connection.providerType, connection.authType)) {
    throw new Error(
      `Invalid LLM connection configuration: provider '${connection.providerType}' ` +
      `does not support auth type '${connection.authType}'. ` +
      `Please update the connection settings for '${connection.name}'.`
    );
  }

  // Validate codexPath exists for OpenAI/Codex connections
  const codexValidation = validateCodexPath(connection);
  if (!codexValidation.isValid) {
    throw new Error(codexValidation.error);
  }

  if (resolvedHostRuntime) {
    const context = resolveBackendContext({
      sessionConnectionSlug: connectionSlug,
      managedModel: baseConfig.model,
      runtime: baseConfig.isHeadless ? 'headless' : 'electron-session',
      agentType: preferredProvider === 'pi' ? 'pi' : preferredProvider === 'openai' ? 'codex' : undefined,
    });
    return createBackendFromResolvedContext({
      context,
      coreConfig: baseConfig,
      hostRuntime: resolvedHostRuntime,
    });
  }

  const config = createConfigFromConnection(connection, baseConfig, preferredProvider);
  return createBackend(config);
}

export function resolveSetupTestConnectionHint(args: {
  provider: AgentProvider;
  baseUrl?: string;
  piAuthProvider?: string;
}): Pick<LlmConnection, 'providerType' | 'piAuthProvider'> {
  if (args.provider === 'openai') {
    return {
      providerType: args.baseUrl ? 'openai_compat' : 'openai',
    };
  }

  if (args.provider === 'pi') {
    return {
      providerType: 'pi',
      piAuthProvider: args.piAuthProvider,
    };
  }

  return {
    providerType: args.baseUrl ? 'anthropic_compat' : 'anthropic',
  };
}

export async function fetchBackendModels(args: {
  connection: LlmConnection;
  credentials: ModelFetcherCredentials;
  hostRuntime: BackendHostRuntimeContext;
  timeoutMs?: number;
}): Promise<ModelFetchResult> {
  const timeoutMs = args.timeoutMs ?? 30_000;
  const { connection, credentials } = args;

  switch (connection.providerType) {
    case 'anthropic':
    case 'anthropic_compat': {
      if (connection.authType === 'environment') {
        throw new Error('Dynamic model discovery not supported for environment auth; using fallback chain.');
      }

      const apiKey = credentials.apiKey;
      const oauthAccessToken = credentials.oauthAccessToken;
      if (!apiKey && !oauthAccessToken) {
        throw new Error('Anthropic credentials required to fetch models');
      }

      const baseUrl = (connection.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
      const headers: Record<string, string> = {
        'anthropic-version': '2023-06-01',
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      } else if (oauthAccessToken) {
        headers.authorization = `Bearer ${oauthAccessToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const allRawModels: Array<{
          id: string;
          display_name: string;
          created_at: string;
          type: string;
        }> = [];
        let afterId: string | undefined;

        do {
          const params = new URLSearchParams({ limit: '100' });
          if (afterId) params.set('after_id', afterId);

          const response = await fetch(`${baseUrl}/v1/models?${params}`, {
            headers,
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Anthropic /v1/models failed: ${response.status} ${response.statusText}`);
          }

          const data = await response.json() as {
            data?: Array<{ id: string; display_name: string; created_at: string; type: string }>;
            has_more?: boolean;
            last_id?: string;
          };
          if (Array.isArray(data.data)) {
            allRawModels.push(...data.data);
          }

          if (data.has_more && data.last_id) {
            afterId = data.last_id;
          } else {
            break;
          }
        } while (true);

        if (allRawModels.length === 0) {
          throw new Error('No models returned from Anthropic API');
        }

        return {
          models: allRawModels
            .filter(
              (m) =>
                m.id.startsWith('claude-')
                && !m.id.startsWith('claude-2')
                && !m.id.startsWith('claude-instant')
                && !m.id.startsWith('claude-1'),
            )
            .map((m) => ({
              id: m.id,
              name: m.display_name,
              shortName: (() => {
                const stripped = m.id
                  .replace('claude-', '')
                  .replace(/-\d{8}$/, '')
                  .replace(/-latest$/, '');
                const variant = stripped
                  .replace(/^[\d.-]+/, '')
                  .replace(/-[\d.]+$/, '')
                  .replace(/^-/, '');
                return variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : stripped;
              })(),
              description: '',
              contextWindow: 200_000,
            })),
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    case 'bedrock':
    case 'vertex':
      throw new Error('Dynamic model discovery not available for Bedrock/Vertex; using fallback chain.');

    case 'openai':
    case 'codex': {
      const apiKey = credentials.apiKey;
      const oauthAccessToken = credentials.oauthAccessToken;
      if (!apiKey && !oauthAccessToken) {
        throw new Error('OpenAI credentials required to fetch models');
      }

      const baseUrl = (connection.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/v1/models`, {
          headers: {
            authorization: `Bearer ${apiKey || oauthAccessToken}`,
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`OpenAI /v1/models failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
          data?: Array<{ id: string; created: number; owned_by: string }>;
        };
        if (!data.data || data.data.length === 0) {
          throw new Error('No models returned from OpenAI API');
        }

        const supportedPrefixes = ['gpt-', 'o1', 'o3', 'o4', 'codex-'];
        const excludedPatterns = ['gpt-3.5', 'gpt-4-base', 'realtime', 'audio', 'whisper', 'tts', 'dall-e', 'davinci', 'babbage', 'embedding'];

        const models = data.data
          .filter(m => {
            const lower = m.id.toLowerCase();
            return supportedPrefixes.some(p => lower.startsWith(p))
              && !excludedPatterns.some(p => lower.includes(p));
          })
          .sort((a, b) => b.created - a.created)
          .map(m => ({
            id: m.id,
            name: m.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-').replace(/^Gpt/, 'GPT'),
            shortName: m.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-').replace(/^Gpt/, 'GPT').replace(/-\d{8}$/, ''),
            description: '',
            contextWindow: m.id.includes('codex') ? 192_000 : 128_000,
          }));

        return { models, serverDefault: models[0]?.id };
      } finally {
        clearTimeout(timeout);
      }
    }

    case 'pi': {
      const models = connection.piAuthProvider
        ? getPiModelsForAuthProvider(connection.piAuthProvider)
        : getAllPiModels();
      if (models.length === 0) {
        throw new Error('No Pi models available from SDK registry');
      }
      return { models };
    }

    default:
      throw new Error(`Model discovery not implemented for provider: ${connection.providerType}`);
  }
}

export async function validateStoredBackendConnection(args: {
  slug: string;
  hostRuntime: BackendHostRuntimeContext;
}): Promise<StoredConnectionValidationResult> {
  try {
    const connection = getLlmConnection(args.slug);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const credentialManager = getCredentialManager();
    const hasCredentials = await credentialManager.hasLlmCredentials(
      args.slug,
      connection.authType,
      connection.providerType,
    );

    if (
      !hasCredentials
      && connection.authType !== 'none'
      && connection.authType !== 'environment'
      && connection.authType !== 'iam_credentials'
      && connection.authType !== 'service_account_file'
    ) {
      return { success: false, error: 'No credentials configured' };
    }

    if (connection.providerType === 'copilot' && connection.authType === 'oauth') {
      const oauth = await credentialManager.getLlmOAuth(args.slug);
      if (!oauth?.accessToken) {
        return { success: false, error: 'Not authenticated. Please sign in with GitHub.' };
      }
      return { success: true, shouldRefreshModels: true };
    }

    if (connection.providerType === 'openai' || connection.providerType === 'openai_compat') {
      if (connection.providerType === 'openai_compat' && !connection.defaultModel) {
        return { success: false, error: 'Default model is required for OpenAI-compatible providers.' };
      }

      if (connection.authType === 'oauth') {
        return { success: true };
      }

      const apiKey = (
        connection.authType === 'api_key'
        || connection.authType === 'api_key_with_endpoint'
        || connection.authType === 'bearer_token'
      )
        ? await credentialManager.getLlmApiKey(args.slug)
        : null;

      if (apiKey && !isSafeHttpHeaderValue(apiKey)) {
        return {
          success: false,
          error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
        };
      }

      const baseUrl = (connection.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) return { success: true, shouldRefreshModels: true };
      if (response.status === 401) return { success: false, error: 'Invalid API key' };
      if (response.status === 403) return { success: false, error: 'API key does not have permission to access this resource' };
      if (response.status === 404) return { success: false, error: 'API endpoint not found. Check the base URL.' };
      if (response.status === 429) return { success: false, error: 'Rate limit exceeded. Please try again.' };

      try {
        const body = await response.json() as { error?: { message?: string } };
        if (body?.error?.message) {
          return { success: false, error: body.error.message };
        }
      } catch {
        // Ignore body parse failures and fall through to generic status message.
      }

      return { success: false, error: `API error: ${response.status} ${response.statusText}` };
    }

    if (
      connection.providerType === 'anthropic'
      || connection.providerType === 'anthropic_compat'
      || connection.providerType === 'bedrock'
      || connection.providerType === 'vertex'
    ) {
      if (connection.providerType === 'anthropic_compat' && !connection.defaultModel) {
        return { success: false, error: 'Default model is required for Anthropic-compatible providers.' };
      }

      if (connection.authType === 'oauth') return { success: true };
      if (connection.authType === 'iam_credentials' || connection.authType === 'service_account_file') {
        return { success: true };
      }
      if (connection.authType === 'environment' && connection.providerType !== 'anthropic_compat') {
        return { success: true };
      }

      const authKey = (
        connection.authType === 'api_key'
        || connection.authType === 'api_key_with_endpoint'
        || connection.authType === 'bearer_token'
      )
        ? await credentialManager.getLlmApiKey(args.slug)
        : null;

      if (authKey && !isSafeHttpHeaderValue(authKey)) {
        return {
          success: false,
          error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
        };
      }
      if (!authKey && connection.authType !== 'none' && connection.authType !== 'environment') {
        return { success: false, error: 'Could not retrieve credentials' };
      }

      const testModel = connection.defaultModel || (
        connection.models?.[0]
          ? (typeof connection.models[0] === 'string' ? connection.models[0] : connection.models[0].id)
          : undefined
      );
      if (!testModel) {
        return { success: false, error: 'Default model is required for this connection.' };
      }

      const baseUrl = (connection.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
      const useBearerAuth = connection.authType === 'bearer_token' || !!connection.baseUrl;
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useBearerAuth
            ? (authKey ? { Authorization: `Bearer ${authKey}` } : {})
            : {
                ...(authKey ? { 'x-api-key': authKey } : {}),
                'anthropic-version': '2023-06-01',
              }),
        },
        body: JSON.stringify({
          model: testModel,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      if (response.ok) return { success: true };
      if (response.status === 401) return { success: false, error: 'Authentication failed. Check your API key or token.' };
      if (response.status === 404) return { success: false, error: 'Endpoint not found. Ensure the server supports Anthropic Messages API.' };
      if (response.status === 429) return { success: false, error: 'Rate limited or quota exceeded. Try again later.' };

      try {
        const body = await response.json() as { error?: { message?: string } };
        if (body?.error?.message) {
          return { success: false, error: body.error.message };
        }
      } catch {
        // Ignore body parse failures and fall through to generic status message.
      }

      return { success: false, error: `API error: ${response.status} ${response.statusText}` };
    }

    if (connection.providerType === 'pi') {
      const apiKey = await credentialManager.getLlmApiKey(args.slug);
      if (!apiKey || !isSafeHttpHeaderValue(apiKey)) {
        return {
          success: false,
          error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
        };
      }

      const result = await testBackendConnection({
        provider: 'pi',
        apiKey,
        model: connection.defaultModel || getDefaultModelForConnection('pi', connection.piAuthProvider),
        hostRuntime: args.hostRuntime,
        connection: {
          providerType: 'pi',
          piAuthProvider: connection.piAuthProvider,
        },
      });

      return result.success
        ? { success: true, shouldRefreshModels: true }
        : { success: false, error: result.error };
    }

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: parseValidationError(msg) };
  }
}

export async function cleanupSourceRuntimeArtifacts(
  workspaceRootPath: string,
  disabledSourceSlugs: string[],
): Promise<void> {
  const normalizedWorkspaceRootPath = expandPath(workspaceRootPath);
  await Promise.all(
    disabledSourceSlugs.map(async (sourceSlug) => {
      const cachePath = join(normalizedWorkspaceRootPath, 'sources', sourceSlug, '.credential-cache.json');
      await rm(cachePath, { force: true });
    }),
  );
}

export async function testBackendConnection(args: {
  provider: AgentProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  hostRuntime: BackendHostRuntimeContext;
  timeoutMs?: number;
  allowEmptyApiKey?: boolean;
  models?: string[];
  connection?: Pick<LlmConnection, 'providerType' | 'piAuthProvider'>;
}): Promise<{ success: boolean; error?: string }> {
  const trimmedKey = args.apiKey.trim();
  if (!trimmedKey && !args.allowEmptyApiKey) {
    return { success: false, error: 'API key is required' };
  }

  if (args.provider === 'openai') {
    try {
      const effectiveBaseUrl = (args.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);
      try {
        const response = await fetch(`${effectiveBaseUrl}/v1/models`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          try {
            const body = await response.json() as { error?: { message?: string } };
            if (body?.error?.message) {
              return { success: false, error: body.error.message };
            }
          } catch {
            // Ignore body parse failures.
          }
          return { success: false, error: `API error: ${response.status} ${response.statusText}` };
        }

        if (args.models && args.models.length > 0) {
          const payload = await response.json() as { data?: Array<{ id?: string }> };
          const available = new Set((payload?.data ?? []).map((item) => item.id).filter(Boolean));
          const missing = args.models.find((model) => !available.has(model));
          if (missing) {
            return { success: false, error: `Model "${missing}" not found.` };
          }
        }

        return { success: true };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (args.provider === 'anthropic') {
    try {
      const baseUrl = (args.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
      const useBearerAuth = !!args.baseUrl;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 20_000);
      try {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(useBearerAuth
              ? { Authorization: `Bearer ${trimmedKey}` }
              : {
                  'x-api-key': trimmedKey,
                  'anthropic-version': '2023-06-01',
                }),
          },
          body: JSON.stringify({
            model: args.model,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Say ok' }],
          }),
        });

        if (response.ok) return { success: true };
        try {
          const body = await response.json() as { error?: { message?: string } };
          if (body?.error?.message) {
            return { success: false, error: body.error.message };
          }
        } catch {
          // Ignore body parse failures.
        }
        return { success: false, error: `API error: ${response.status} ${response.statusText}` };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (args.provider !== 'pi') {
    return { success: false, error: `Provider not implemented for connection test: ${args.provider}` };
  }

  const tempSlug = `__test-${Date.now()}`;
  const credentialManager = getCredentialManager();
  await credentialManager.setLlmApiKey(tempSlug, trimmedKey);

  try {
    const resolvedPaths = resolveBackendRuntimePaths(args.hostRuntime);
    const agent = createBackend({
      provider: 'pi',
      providerType: args.connection?.providerType ?? 'pi',
      authType: 'api_key',
      connectionSlug: tempSlug,
      piAuthProvider: args.connection?.piAuthProvider,
      workspace: {
        id: '__test',
        name: 'Connection Test',
        rootPath: homedir(),
        createdAt: 0,
      },
      isHeadless: true,
      model: args.model,
      piServerPath: resolvedPaths.piServerPath,
      piInterceptorPath: resolvedPaths.piInterceptorPath,
      nodePath: resolvedPaths.nodeRuntimePath || 'bun',
    });

    try {
      const timeoutMs = args.timeoutMs ?? 20_000;
      const text = await Promise.race([
        agent.runMiniCompletion('Say ok'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection test timed out')), timeoutMs),
        ),
      ]);

      return text
        ? { success: true }
        : { success: false, error: 'No response from provider. Check your API key.' };
    } finally {
      agent.destroy();
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await credentialManager.deleteLlmCredentials(tempSlug).catch(() => {});
  }
}
