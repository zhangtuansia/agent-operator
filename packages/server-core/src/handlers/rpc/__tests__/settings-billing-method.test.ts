import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import type { BillingMethodInfo } from '@agent-operator/shared/ipc/types'
import type { HandlerDeps } from '../../handler-deps'
import type { RpcServer, HandlerFn } from '../../../transport/types'

let currentAuthType: 'api_key' | 'oauth_token' | 'bedrock' = 'api_key'
let currentProviderConfig: { provider: string; baseURL?: string; apiFormat?: 'anthropic' | 'openai' } | null = null
let currentDefaultConnectionSlug: string | null = null
let currentConnections = new Map<string, {
  slug: string
  providerType: string
  authType: string
  baseUrl?: string
  awsRegion?: string
  defaultModel?: string
}>()
let currentStoredConfigProviderConfig: { provider: string; baseURL?: string; apiFormat?: 'anthropic' | 'openai' } | null = null
let currentLegacyModel: string | null = null
let currentLegacyApiKey: string | null = null
let currentLegacyClaudeOAuth: string | null = null
let currentHasLlmCredentials = true
const updateLlmConnectionCalls: Array<{ slug: string; updates: Record<string, unknown> }> = []
const setLlmApiKeyCalls: Array<{ slug: string; apiKey: string }> = []
const setLlmOAuthCalls: Array<{ slug: string; credentials: Record<string, unknown> }> = []

mock.module('@agent-operator/shared/config', () => ({
  getPreferencesPath: () => '/tmp/preferences.json',
  getSessionDraft: () => null,
  setSessionDraft: () => {},
  deleteSessionDraft: () => {},
  getAllSessionDrafts: () => ({}),
  getWorkspaceByNameOrId: () => null,
  getAgentType: () => 'claude',
  getAuthType: () => currentAuthType,
  getCustomModels: () => [],
  getDefaultLlmConnection: () => currentDefaultConnectionSlug,
  getLlmConnection: (slug: string) => currentConnections.get(slug) ?? null,
  getModel: () => currentLegacyModel,
  getProviderConfig: () => currentProviderConfig,
  ensureConfigDir: () => {},
  loadStoredConfig: () => (currentStoredConfigProviderConfig ? { providerConfig: currentStoredConfigProviderConfig } : null),
  saveConfig: () => {},
  setAgentType: () => {},
  setAuthType: () => {},
  setCustomModels: () => {},
  setModel: () => {},
  setProviderConfig: () => {},
  updateLlmConnection: (slug: string, updates: Record<string, unknown>) => {
    updateLlmConnectionCalls.push({ slug, updates })
    const current = currentConnections.get(slug)
    if (current) {
      currentConnections.set(slug, { ...current, ...updates })
    }
    return true
  },
  updateCustomModel: () => [],
  addCustomModel: () => [],
  deleteCustomModel: () => [],
  reorderCustomModels: () => [],
}))

mock.module('@agent-operator/shared/credentials', () => ({
  getCredentialManager: () => ({
    getApiKey: async () => currentLegacyApiKey,
    getClaudeOAuth: async () => currentLegacyClaudeOAuth,
    hasLlmCredentials: async () => currentHasLlmCredentials,
    setLlmApiKey: async (slug: string, apiKey: string) => {
      setLlmApiKeyCalls.push({ slug, apiKey })
    },
    setLlmOAuth: async (slug: string, credentials: Record<string, unknown>) => {
      setLlmOAuthCalls.push({ slug, credentials })
    },
    setApiKey: async () => {},
    setClaudeOAuth: async () => {},
    setClaudeOAuthCredentials: async () => {},
    delete: async () => false,
  }),
}))

mock.module('@agent-operator/shared/auth', () => ({
  isCodexAuthenticated: async () => false,
  startCodexOAuth: async () => {},
  getExistingClaudeCredentials: () => null,
}))

import { registerSettingsHandlers } from '../settings'

class TestRpcServer implements RpcServer {
  handlers = new Map<string, HandlerFn>()

  handle(channel: string, handler: HandlerFn): void {
    this.handlers.set(channel, handler)
  }

  push(): void {}

  async invokeClient(): Promise<undefined> {
    return undefined
  }
}

function createDeps(): HandlerDeps {
  return {
    sessionManager: {
      reinitializeAuth: async () => {},
      getSession: async () => null,
      updateSessionModel: async () => {},
    } as never,
    oauthFlowStore: {} as never,
    platform: {
      appRootPath: '/app',
      resourcesPath: '/resources',
      isPackaged: false,
      appVersion: '0.0.0',
      imageProcessor: {
        async getMetadata() {
          return null
        },
        async process() {
          return Buffer.alloc(0)
        },
      },
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
      isDebugMode: false,
    },
  }
}

describe('registerSettingsHandlers GET_BILLING_METHOD', () => {
  beforeEach(() => {
    currentAuthType = 'api_key'
    currentProviderConfig = null
    currentDefaultConnectionSlug = null
    currentConnections = new Map()
    currentStoredConfigProviderConfig = null
    currentLegacyModel = null
    currentLegacyApiKey = null
    currentLegacyClaudeOAuth = null
    currentHasLlmCredentials = true
    updateLlmConnectionCalls.length = 0
    setLlmApiKeyCalls.length = 0
    setLlmOAuthCalls.length = 0
  })

  async function invokeGetBillingMethod(): Promise<BillingMethodInfo> {
    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.GET_BILLING_METHOD)
    expect(handler).toBeDefined()
    return await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 })
  }

  async function invokeGetStoredConfig(): Promise<{ providerConfig?: unknown } | null> {
    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.GET_STORED_CONFIG)
    expect(handler).toBeDefined()
    return await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 })
  }

  async function invokeUpdateBillingMethod(authType: 'api_key' | 'oauth_token' | 'bedrock', credential?: string): Promise<void> {
    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.UPDATE_BILLING_METHOD)
    expect(handler).toBeDefined()
    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, authType, credential)
  }

  async function invokeUpdateProviderConfig(providerConfig: { provider: string; baseURL: string; apiFormat: 'anthropic' | 'openai' }): Promise<void> {
    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.UPDATE_PROVIDER_CONFIG)
    expect(handler).toBeDefined()
    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, providerConfig)
  }

  it('reports bedrock from the default connection instead of legacy auth state', async () => {
    currentAuthType = 'api_key'
    currentLegacyApiKey = 'legacy-key'
    currentDefaultConnectionSlug = 'bedrock-default'
    currentConnections.set('bedrock-default', {
      slug: 'bedrock-default',
      providerType: 'bedrock',
      authType: 'environment',
    })

    const result = await invokeGetBillingMethod()

    expect(result).toEqual({
      authType: 'bedrock',
      hasCredential: true,
      provider: 'bedrock',
    })
  })

  it('reports anthropic oauth from the default connection', async () => {
    currentDefaultConnectionSlug = 'claude-max'
    currentConnections.set('claude-max', {
      slug: 'claude-max',
      providerType: 'anthropic',
      authType: 'oauth',
    })

    const result = await invokeGetBillingMethod()

    expect(result).toEqual({
      authType: 'oauth_token',
      hasCredential: true,
      provider: 'anthropic',
    })
  })

  it('maps compat providers to api_key and preserves the configured provider id', async () => {
    currentProviderConfig = {
      provider: 'deepseek',
      baseURL: 'https://api.deepseek.com/anthropic',
      apiFormat: 'anthropic',
    }
    currentHasLlmCredentials = false
    currentDefaultConnectionSlug = 'deepseek-compat'
    currentConnections.set('deepseek-compat', {
      slug: 'deepseek-compat',
      providerType: 'anthropic_compat',
      authType: 'api_key_with_endpoint',
    })

    const result = await invokeGetBillingMethod()

    expect(result).toEqual({
      authType: 'api_key',
      hasCredential: false,
      provider: 'deepseek',
    })
  })

  it('falls back to legacy billing state for unsupported default connection types', async () => {
    currentAuthType = 'oauth_token'
    currentLegacyClaudeOAuth = 'legacy-oauth-token'
    currentDefaultConnectionSlug = 'codex'
    currentConnections.set('codex', {
      slug: 'codex',
      providerType: 'openai',
      authType: 'oauth',
    })

    const result = await invokeGetBillingMethod()

    expect(result).toEqual({
      authType: 'oauth_token',
      hasCredential: true,
      provider: 'anthropic',
    })
  })

  it('derives stored provider config from the default compat connection', async () => {
    currentProviderConfig = {
      provider: 'deepseek',
      baseURL: 'https://legacy.example/anthropic',
      apiFormat: 'anthropic',
    }
    currentStoredConfigProviderConfig = currentProviderConfig
    currentDefaultConnectionSlug = 'deepseek-compat'
    currentConnections.set('deepseek-compat', {
      slug: 'deepseek-compat',
      providerType: 'anthropic_compat',
      authType: 'api_key_with_endpoint',
      baseUrl: 'https://api.deepseek.com/anthropic',
    })

    const result = await invokeGetStoredConfig()

    expect(result).toEqual({
      providerConfig: {
        provider: 'deepseek',
        baseURL: 'https://api.deepseek.com/anthropic',
        apiFormat: 'anthropic',
        customModels: undefined,
      },
    })
  })

  it('falls back to legacy stored config when the default connection is not representable in api settings', async () => {
    currentStoredConfigProviderConfig = {
      provider: 'anthropic',
      baseURL: 'https://api.anthropic.com',
      apiFormat: 'anthropic',
    }
    currentDefaultConnectionSlug = 'codex'
    currentConnections.set('codex', {
      slug: 'codex',
      providerType: 'openai',
      authType: 'oauth',
    })

    const result = await invokeGetStoredConfig()

    expect(result).toEqual({
      providerConfig: {
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com',
        apiFormat: 'anthropic',
      },
    })
  })

  it('syncs api key billing updates to the default anthropic connection', async () => {
    currentDefaultConnectionSlug = 'anthropic-api'
    currentConnections.set('anthropic-api', {
      slug: 'anthropic-api',
      providerType: 'anthropic',
      authType: 'oauth',
    })

    await invokeUpdateBillingMethod('api_key', 'sk-test')

    expect(setLlmApiKeyCalls).toEqual([{ slug: 'anthropic-api', apiKey: 'sk-test' }])
    expect(updateLlmConnectionCalls).toEqual([
      { slug: 'anthropic-api', updates: { authType: 'api_key' } },
    ])
  })

  it('syncs provider config updates to the default connection shape', async () => {
    currentAuthType = 'api_key'
    currentDefaultConnectionSlug = 'anthropic-api'
    currentConnections.set('anthropic-api', {
      slug: 'anthropic-api',
      providerType: 'anthropic',
      authType: 'api_key',
    })

    await invokeUpdateProviderConfig({
      provider: 'deepseek',
      baseURL: 'https://api.deepseek.com/anthropic',
      apiFormat: 'anthropic',
    })

    expect(updateLlmConnectionCalls).toEqual([
      {
        slug: 'anthropic-api',
        updates: {
          providerType: 'anthropic_compat',
          authType: 'api_key_with_endpoint',
          baseUrl: 'https://api.deepseek.com/anthropic',
        },
      },
    ])
  })

  it('returns the default connection model before falling back to legacy config model', async () => {
    currentLegacyModel = 'legacy-claude-sonnet'
    currentDefaultConnectionSlug = 'bedrock-default'
    currentConnections.set('bedrock-default', {
      slug: 'bedrock-default',
      providerType: 'bedrock',
      authType: 'environment',
      defaultModel: 'arn:aws:bedrock:us-west-2:123:application-inference-profile/test-model',
    })

    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.GET_MODEL)
    expect(handler).toBeDefined()

    const result = await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 })

    expect(result).toBe('arn:aws:bedrock:us-west-2:123:application-inference-profile/test-model')
  })

  it('syncs model updates to the default connection', async () => {
    currentDefaultConnectionSlug = 'anthropic-api'
    currentConnections.set('anthropic-api', {
      slug: 'anthropic-api',
      providerType: 'anthropic',
      authType: 'api_key',
      defaultModel: 'claude-sonnet-old',
    })

    const server = new TestRpcServer()
    registerSettingsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.settings.SET_MODEL)
    expect(handler).toBeDefined()

    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, 'claude-sonnet-new')

    expect(updateLlmConnectionCalls).toEqual([
      {
        slug: 'anthropic-api',
        updates: { defaultModel: 'claude-sonnet-new' },
      },
    ])
  })
})
