import { ipcMain } from 'electron'
import {
  addLlmConnection,
  deleteLlmConnection,
  ensureConfigDir,
  generateWorkspaceId,
  getDefaultLlmConnection,
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  getLlmConnection,
  getLlmConnections,
  getWorkspaceByNameOrId,
  isAnthropicProvider,
  isCompatProvider,
  isCopilotProvider,
  isOpenAIProvider,
  loadStoredConfig,
  saveConfig,
  setDefaultLlmConnection,
  touchLlmConnection,
  type LlmConnection,
  type LlmConnectionWithStatus,
  type Workspace,
  updateLlmConnection,
} from '@agent-operator/shared/config'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { createWorkspaceAtPath, getDefaultWorkspaceName, getDefaultWorkspacesDir, loadWorkspaceConfig, saveWorkspaceConfig } from '@agent-operator/shared/workspaces'
import { isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import { IPC_CHANNELS, type LlmConnectionSetup } from '../../shared/types'
import { createBuiltInConnection } from '../connection-setup-logic'
import { ipcLog } from '../logger'
import { getModelRefreshService } from '../model-fetchers'
import type { SessionManager } from '../sessions'

export function registerLlmConnectionHandlers(sessionManager: SessionManager): void {
  ipcMain.handle(IPC_CHANNELS.SETUP_LLM_CONNECTION, async (_event, setup: LlmConnectionSetup): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getCredentialManager()

      let connection = getLlmConnection(setup.slug)
      let isNewConnection = false

      if (!connection) {
        connection = createBuiltInConnection(setup.slug, setup.baseUrl)
        if (!connection) {
          return { success: false, error: `Unknown connection slug: ${setup.slug}` }
        }
        isNewConnection = true
      }

      const updates: Partial<LlmConnection> = {}
      if (setup.baseUrl !== undefined) {
        const hasCustomEndpoint = !!setup.baseUrl
        updates.baseUrl = setup.baseUrl ?? undefined

        if (isAnthropicProvider(connection.providerType) && connection.authType !== 'oauth') {
          const providerType = hasCustomEndpoint ? 'anthropic_compat' as const : 'anthropic' as const
          updates.providerType = providerType
          updates.authType = hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key'
          if (!hasCustomEndpoint) {
            updates.models = getDefaultModelsForConnection(providerType)
            updates.defaultModel = getDefaultModelForConnection(providerType)
          }
        }

        if (isOpenAIProvider(connection.providerType) && connection.authType !== 'oauth') {
          const providerType = hasCustomEndpoint ? 'openai_compat' as const : 'openai' as const
          updates.providerType = providerType
          updates.authType = hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key'
          if (!hasCustomEndpoint) {
            updates.models = getDefaultModelsForConnection(providerType)
            updates.defaultModel = getDefaultModelForConnection(providerType)
          }
        }
      }

      if (setup.defaultModel !== undefined) {
        updates.defaultModel = setup.defaultModel ?? undefined
      }
      if (setup.models !== undefined) {
        updates.models = setup.models ?? undefined
      }

      const pendingConnection: LlmConnection = {
        ...connection,
        ...updates,
      }

      if (updates.models && updates.models.length > 0) {
        const updateModelIds = updates.models
          .map(model => typeof model === 'string' ? model : model.id)
          .filter(Boolean)

        if (pendingConnection.defaultModel && !updateModelIds.includes(pendingConnection.defaultModel)) {
          return { success: false, error: `Default model "${pendingConnection.defaultModel}" is not in the provided model list.` }
        }
        if (!pendingConnection.defaultModel) {
          const firstModelId = updateModelIds[0]
          pendingConnection.defaultModel = firstModelId
          updates.defaultModel = firstModelId
        }
      }

      if (isCompatProvider(pendingConnection.providerType)) {
        const compatModelIds = (pendingConnection.models ?? [])
          .map(model => typeof model === 'string' ? model : model.id)
          .filter(Boolean)

        if (!pendingConnection.defaultModel) {
          return { success: false, error: 'Default model is required for compatible endpoints.' }
        }
        if (compatModelIds.length === 0) {
          return { success: false, error: 'At least one model is required for compatible endpoints.' }
        }
        if (!compatModelIds.includes(pendingConnection.defaultModel)) {
          return {
            success: false,
            error: `Default model "${pendingConnection.defaultModel}" is not in the compatible model list.`,
          }
        }
      }

      if (isNewConnection) {
        const storedConfig = loadStoredConfig()
        if (!storedConfig) {
          ensureConfigDir()
          const workspaceId = generateWorkspaceId()
          const rootPath = `${getDefaultWorkspacesDir()}/${workspaceId}`
          const defaultWorkspaceName = getDefaultWorkspaceName()
          saveConfig({
            workspaces: [{
              id: workspaceId,
              name: defaultWorkspaceName,
              rootPath,
              createdAt: Date.now(),
            }],
            activeWorkspaceId: workspaceId,
            activeSessionId: null,
            llmConnections: [],
          })
          createWorkspaceAtPath(rootPath, defaultWorkspaceName, {
            model: pendingConnection.defaultModel ?? getDefaultModelForConnection(pendingConnection.providerType),
            defaultLlmConnection: pendingConnection.slug,
          })
          ipcLog.info('Created initial config and workspace for fresh install')
        }
        const added = addLlmConnection(pendingConnection)
        if (!added) {
          return { success: false, error: 'Connection already exists' }
        }
        ipcLog.info(`Created LLM connection: ${setup.slug}`)
      } else if (Object.keys(updates).length > 0) {
        const updated = updateLlmConnection(setup.slug, updates)
        if (!updated) {
          return { success: false, error: 'Failed to update connection' }
        }
        ipcLog.info(`Updated LLM connection settings: ${setup.slug}`)
      }

      if (setup.credential) {
        if (pendingConnection.authType === 'oauth') {
          await manager.setLlmOAuth(setup.slug, { accessToken: setup.credential })
          ipcLog.info('Saved OAuth token to LLM connection')
        } else {
          await manager.setLlmApiKey(setup.slug, setup.credential)
          ipcLog.info('Saved API key to LLM connection')
        }
      }

      setDefaultLlmConnection(setup.slug)

      getModelRefreshService().refreshNow(setup.slug).catch(err => {
        ipcLog.warn(`Model refresh after setup failed for ${setup.slug}:`, err)
      })

      await sessionManager.reinitializeAuth(getDefaultLlmConnection() || setup.slug)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('Failed to setup LLM connection:', message)
      return { success: false, error: message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_API_CONNECTION, async (_event, apiKey: string, baseUrl?: string, models?: string[]): Promise<{ success: boolean; error?: string; modelCount?: number }> => {
    const trimmedKey = apiKey?.trim()
    const trimmedUrl = baseUrl?.trim()
    const normalizedModels = (models ?? []).map(m => m.trim()).filter(Boolean)

    if (!trimmedKey && !trimmedUrl) {
      return { success: false, error: 'API key is required' }
    }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const hasRealKey = !!trimmedKey
      const client = new Anthropic({
        ...(trimmedUrl ? { baseURL: trimmedUrl } : {}),
        ...(trimmedUrl
          ? (hasRealKey
              ? { apiKey: trimmedKey, authToken: trimmedKey }
              : { authToken: 'ollama', apiKey: null })
          : { apiKey: trimmedKey, authToken: null }),
      })

      if (normalizedModels.length > 0) {
        const testModelId = normalizedModels[0]!
        await client.messages.create({
          model: testModelId,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return { success: true, modelCount: normalizedModels.length }
      }

      let testModel: string
      if (!trimmedUrl || trimmedUrl.includes('openrouter.ai') || trimmedUrl.includes('ai-gateway.vercel.sh')) {
        testModel = getDefaultModelForConnection('anthropic')
      } else {
        return { success: false, error: 'Please specify a model for custom endpoints' }
      }

      await client.messages.create({
        model: testModel,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 'test_tool', description: 'Test tool', input_schema: { type: 'object' as const, properties: {} } }],
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()
      ipcLog.info(`[testApiConnection] Error: ${message.slice(0, 500)}`)

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and ensure the server is running.' }
      }
      if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('authentication')) {
        return { success: false, error: 'Invalid API key' }
      }
      if (lower.includes('404') && !lower.includes('model')) {
        return { success: false, error: 'Endpoint not found. Ensure the server supports Anthropic Messages API (/v1/messages).' }
      }
      if (lower.includes('model not found') || lower.includes('invalid model') || (lower.includes('404') && lower.includes('model'))) {
        return { success: false, error: normalizedModels[0] ? `Model "${normalizedModels[0]}" not found.` : 'Could not access the default model.' }
      }
      if (lower.includes('tool') && lower.includes('support')) {
        return { success: false, error: 'Selected model does not support tool/function calling.' }
      }
      return { success: false, error: message.slice(0, 300) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_OPENAI_CONNECTION, async (_event, apiKey: string, baseUrl?: string, models?: string[]): Promise<{ success: boolean; error?: string }> => {
    const trimmedKey = apiKey?.trim()
    const trimmedUrl = baseUrl?.trim()
    const normalizedModels = (models ?? []).map(m => m.trim()).filter(Boolean)

    if (!trimmedKey) {
      return { success: false, error: 'API key is required' }
    }

    try {
      const effectiveBaseUrl = trimmedUrl || 'https://api.openai.com'
      const modelsUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/v1/models`

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        if (normalizedModels.length > 0) {
          const payload = await response.json()
          const available = new Set((payload?.data ?? []).map((item: { id?: string }) => item.id).filter(Boolean))
          const missing = normalizedModels.find(model => !available.has(model))
          if (missing) {
            return { success: false, error: `Model "${missing}" not found.` }
          }
        }
        return { success: true }
      }

      if (response.status === 401) return { success: false, error: 'Invalid API key' }
      if (response.status === 403) return { success: false, error: 'Access denied. Check API key permissions.' }
      if (response.status === 404) return { success: false, error: 'Endpoint not found. Check base URL.' }
      if (response.status === 429) return { success: false, error: 'Rate limited or quota exceeded.' }

      const text = await response.text().catch(() => '')
      return { success: false, error: text.slice(0, 300) || `API error: ${response.status} ${response.statusText}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()
      ipcLog.info(`[testOpenAiConnection] Error: ${message.slice(0, 500)}`)

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and network.' }
      }
      return { success: false, error: message.slice(0, 300) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_LIST, async (): Promise<LlmConnection[]> => {
    return getLlmConnections()
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_LIST_WITH_STATUS, async (): Promise<LlmConnectionWithStatus[]> => {
    const connections = getLlmConnections()
    const credentialManager = getCredentialManager()
    const defaultSlug = getDefaultLlmConnection()

    return Promise.all(connections.map(async (connection): Promise<LlmConnectionWithStatus> => {
      const hasCredentials = await credentialManager.hasLlmCredentials(
        connection.slug,
        connection.authType,
        connection.providerType,
      )
      return {
        ...connection,
        isAuthenticated: connection.authType === 'none' || hasCredentials,
        isDefault: connection.slug === defaultSlug,
      }
    }))
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_GET, async (_event, slug: string): Promise<LlmConnection | null> => {
    return getLlmConnection(slug)
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SAVE, async (_event, connection: LlmConnection): Promise<{ success: boolean; error?: string }> => {
    try {
      const existing = getLlmConnection(connection.slug)
      if (existing) {
        const { slug: _slug, ...updates } = connection
        const success = updateLlmConnection(connection.slug, updates)
        if (!success) {
          return { success: false, error: 'Failed to update connection' }
        }
      } else {
        const success = addLlmConnection(connection)
        if (!success) {
          return { success: false, error: 'Connection with this slug already exists' }
        }
      }

      ipcLog.info(`LLM connection saved: ${connection.slug}`)

      if (getDefaultLlmConnection() === connection.slug) {
        await sessionManager.reinitializeAuth()
      }

      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to save LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_API_KEY, async (_event, slug: string, apiKey: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const connection = getLlmConnection(slug)
      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      const normalizedApiKey = apiKey.trim()
      if (!normalizedApiKey) {
        return { success: false, error: 'API key is required' }
      }

      if (!isSafeHttpHeaderValue(normalizedApiKey)) {
        return { success: false, error: 'API key appears masked or contains invalid characters. Please paste the full key.' }
      }

      const credentialManager = getCredentialManager()
      await credentialManager.setLlmApiKey(slug, normalizedApiKey)

      if (getDefaultLlmConnection() === slug) {
        await sessionManager.reinitializeAuth()
      }

      ipcLog.info(`LLM connection API key updated: ${slug}`)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set LLM connection API key:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_DELETE, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const existing = getLlmConnection(slug)
      if (!existing) {
        return { success: false, error: 'Connection not found' }
      }

      const success = deleteLlmConnection(slug)
      if (!success) {
        return { success: false, error: 'Failed to delete connection' }
      }

      getModelRefreshService().stopConnection(slug)

      const credentialManager = getCredentialManager()
      await credentialManager.deleteLlmCredentials(slug)
      ipcLog.info(`LLM connection deleted: ${slug}`)

      await sessionManager.reinitializeAuth()

      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to delete LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_TEST, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const connection = getLlmConnection(slug)
      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      const credentialManager = getCredentialManager()
      const hasCredentials = await credentialManager.hasLlmCredentials(
        slug,
        connection.authType,
        connection.providerType,
      )
      if (
        !hasCredentials
        && connection.authType !== 'none'
        && connection.authType !== 'environment'
        && connection.authType !== 'iam_credentials'
        && connection.authType !== 'service_account_file'
      ) {
        return { success: false, error: 'No credentials configured' }
      }

      const isOpenAiProvider =
        connection.providerType === 'openai' || connection.providerType === 'openai_compat'
      const isAnthropicProviderConnection =
        connection.providerType === 'anthropic' || connection.providerType === 'anthropic_compat'

      if (isCopilotProvider(connection.providerType) && connection.authType === 'oauth') {
        const oauth = await credentialManager.getLlmOAuth(slug)
        if (!oauth?.accessToken) {
          return { success: false, error: 'Not authenticated. Please sign in with GitHub.' }
        }

        try {
          await getModelRefreshService().refreshNow(slug)
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error'
          ipcLog.error(`Copilot model fetch failed during validation: ${msg}`)
          return { success: false, error: `Failed to load Copilot models: ${msg}` }
        }

        touchLlmConnection(slug)
        return { success: true }
      }

      if (isOpenAiProvider) {
        if (connection.providerType === 'openai_compat' && !connection.defaultModel) {
          return { success: false, error: 'Default model is required for OpenAI-compatible providers.' }
        }

        if (connection.authType === 'oauth') {
          touchLlmConnection(slug)
          return { success: true }
        }

        const apiKey = (connection.authType === 'api_key'
          || connection.authType === 'api_key_with_endpoint'
          || connection.authType === 'bearer_token')
          ? await credentialManager.getLlmApiKey(slug)
          : null

        if (apiKey && !isSafeHttpHeaderValue(apiKey)) {
          return {
            success: false,
            error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
          }
        }

        const baseUrl = (connection.baseUrl || 'https://api.openai.com').replace(/\/$/, '')
        const response = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const configuredModels = (connection.models ?? [])
            .map(model => typeof model === 'string' ? model : model.id)
            .filter(Boolean)
          if (configuredModels.length > 0) {
            const payload = await response.json()
            const available = new Set(
              (Array.isArray(payload?.data) ? payload.data : [])
                .map((item: { id?: string }) => item.id)
                .filter(Boolean),
            )
            const missing = configuredModels.find(model => !available.has(model))
            if (missing) {
              return { success: false, error: `Model "${missing}" not found. Check the model name and try again.` }
            }
          }

          touchLlmConnection(slug)
          return { success: true }
        }

        if (response.status === 401) return { success: false, error: 'Invalid API key' }
        if (response.status === 403) return { success: false, error: 'API key does not have permission to access this resource' }
        if (response.status === 404) return { success: false, error: 'API endpoint not found. Check the base URL.' }
        if (response.status === 429) return { success: false, error: 'Rate limit exceeded. Please try again.' }

        try {
          const body = await response.json()
          const message = body?.error?.message
          if (typeof message === 'string' && message.length > 0) {
            return { success: false, error: message }
          }
        } catch {
          // fall through
        }
        return { success: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      if (isAnthropicProviderConnection) {
        if (connection.providerType === 'anthropic_compat' && !connection.defaultModel) {
          return { success: false, error: 'Default model is required for Anthropic-compatible providers.' }
        }

        if (connection.authType === 'oauth') {
          touchLlmConnection(slug)
          return { success: true }
        }
        if (connection.authType === 'iam_credentials' || connection.authType === 'service_account_file') {
          touchLlmConnection(slug)
          return { success: true }
        }

        const authKey = (connection.authType === 'api_key'
          || connection.authType === 'api_key_with_endpoint'
          || connection.authType === 'bearer_token')
          ? await credentialManager.getLlmApiKey(slug)
          : (connection.authType === 'environment' ? process.env.ANTHROPIC_API_KEY || null : null)

        if (authKey && !isSafeHttpHeaderValue(authKey)) {
          return {
            success: false,
            error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
          }
        }

        if (!authKey && connection.authType !== 'none') {
          return { success: false, error: 'Could not retrieve credentials' }
        }

        const testModel = connection.defaultModel || (
          connection.models?.[0]
            ? (typeof connection.models[0] === 'string'
                ? connection.models[0]
                : connection.models[0].id)
            : undefined
        )
        if (!testModel) {
          return { success: false, error: 'Default model is required for this connection.' }
        }

        const baseUrl = (connection.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
        const useBearerAuth = connection.authType === 'bearer_token' || !!connection.baseUrl
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
        })

        if (response.ok) {
          touchLlmConnection(slug)
          return { success: true }
        }

        if (response.status === 401) return { success: false, error: 'Authentication failed. Check your API key or token.' }
        if (response.status === 404) return { success: false, error: 'Endpoint not found. Ensure the server supports Anthropic Messages API.' }
        if (response.status === 429) return { success: false, error: 'Rate limited or quota exceeded. Try again later.' }

        try {
          const body = await response.json()
          const message = body?.error?.message
          if (typeof message === 'string' && message.length > 0) {
            return { success: false, error: message }
          }
        } catch {
          // fall through
        }
        return { success: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      touchLlmConnection(slug)

      getModelRefreshService().refreshNow(slug).catch(err => {
        ipcLog.warn(`Model refresh after test failed for ${slug}:`, err)
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and network.' }
      }
      if (lower.includes('unauthorized') || lower.includes('authentication')) {
        return { success: false, error: 'Authentication failed. Check your credentials.' }
      }
      if (lower.includes('rate limit') || lower.includes('quota')) {
        return { success: false, error: 'Rate limited or quota exceeded. Try again later.' }
      }

      ipcLog.info(`[LLM_CONNECTION_TEST] Error for ${slug}: ${message.slice(0, 500)}`)
      return { success: false, error: message.slice(0, 200) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_DEFAULT, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const success = setDefaultLlmConnection(slug)
      if (!success) {
        return { success: false, error: 'Connection not found' }
      }

      ipcLog.info(`Global default LLM connection set to: ${slug}`)
      await sessionManager.reinitializeAuth()
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_WORKSPACE_DEFAULT, async (_event, workspaceId: string, slug: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspace = getWorkspaceOrThrow(workspaceId)

      if (slug) {
        const connection = getLlmConnection(slug)
        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }
      }

      const config = loadWorkspaceConfig(workspace.rootPath)
      if (!config) {
        return { success: false, error: 'Failed to load workspace config' }
      }

      config.defaults = config.defaults || {}
      if (slug) {
        config.defaults.defaultLlmConnection = slug
      } else {
        delete config.defaults.defaultLlmConnection
      }

      saveWorkspaceConfig(workspace.rootPath, config)
      ipcLog.info(`Workspace ${workspaceId} default LLM connection set to: ${slug}`)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set workspace default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_REFRESH_MODELS, async (_event, slug: string): Promise<void> => {
    await getModelRefreshService().refreshNow(slug)
  })
}

function getWorkspaceOrThrow(workspaceId: string): Workspace {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return workspace
}
