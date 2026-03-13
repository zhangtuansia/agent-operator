import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'path'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import {
  getPreferencesPath,
  getSessionDraft,
  setSessionDraft,
  deleteSessionDraft,
  getAllSessionDrafts,
  getWorkspaceByNameOrId,
  getAgentType,
  getAuthType,
  getCustomModels,
  getModel,
  getProviderConfig,
  loadStoredConfig,
  setAgentType,
  setAuthType,
  setCustomModels,
  setModel,
  setProviderConfig,
  updateCustomModel,
  addCustomModel,
  deleteCustomModel,
  reorderCustomModels,
  type AgentType,
} from '@agent-operator/shared/config'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { isCodexAuthenticated, startCodexOAuth, getExistingClaudeCredentials } from '@agent-operator/shared/auth'
import { isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import { getWorkspaceOrThrow } from '@agent-operator/server-core/handlers'
import type { RpcServer } from '@agent-operator/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { requestClientOpenFileDialog } from '@agent-operator/server-core/transport'
import type { AuthType, BillingMethodInfo, CustomModel } from '@agent-operator/shared/ipc/types'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.settings.GET_BILLING_METHOD,
  RPC_CHANNELS.settings.UPDATE_BILLING_METHOD,
  RPC_CHANNELS.settings.GET_AGENT_TYPE,
  RPC_CHANNELS.settings.SET_AGENT_TYPE,
  RPC_CHANNELS.settings.CHECK_CODEX_AUTH,
  RPC_CHANNELS.settings.START_CODEX_LOGIN,
  RPC_CHANNELS.settings.GET_STORED_CONFIG,
  RPC_CHANNELS.settings.UPDATE_PROVIDER_CONFIG,
  RPC_CHANNELS.settings.GET_MODEL,
  RPC_CHANNELS.settings.SET_MODEL,
  RPC_CHANNELS.workspace.SETTINGS_GET,
  RPC_CHANNELS.workspace.SETTINGS_UPDATE,
  RPC_CHANNELS.customModels.GET,
  RPC_CHANNELS.customModels.SET,
  RPC_CHANNELS.customModels.ADD,
  RPC_CHANNELS.customModels.UPDATE,
  RPC_CHANNELS.customModels.DELETE,
  RPC_CHANNELS.customModels.REORDER,
  RPC_CHANNELS.preferences.READ,
  RPC_CHANNELS.preferences.WRITE,
  RPC_CHANNELS.drafts.GET,
  RPC_CHANNELS.drafts.SET,
  RPC_CHANNELS.drafts.DELETE,
  RPC_CHANNELS.drafts.GET_ALL,
  RPC_CHANNELS.input.GET_AUTO_CAPITALISATION,
  RPC_CHANNELS.input.SET_AUTO_CAPITALISATION,
  RPC_CHANNELS.input.GET_SEND_MESSAGE_KEY,
  RPC_CHANNELS.input.SET_SEND_MESSAGE_KEY,
  RPC_CHANNELS.input.GET_SPELL_CHECK,
  RPC_CHANNELS.input.SET_SPELL_CHECK,
  RPC_CHANNELS.power.GET_KEEP_AWAKE,
  RPC_CHANNELS.appearance.GET_RICH_TOOL_DESCRIPTIONS,
  RPC_CHANNELS.appearance.SET_RICH_TOOL_DESCRIPTIONS,
  RPC_CHANNELS.sessions.GET_MODEL,
  RPC_CHANNELS.sessions.SET_MODEL,
  RPC_CHANNELS.dialog.OPEN_FOLDER,
] as const

export function registerSettingsHandlers(server: RpcServer, deps: HandlerDeps): void {
  server.handle(RPC_CHANNELS.settings.GET_BILLING_METHOD, async (): Promise<BillingMethodInfo> => {
    const authType = getAuthType()
    const manager = getCredentialManager()
    const providerConfig = getProviderConfig()

    let hasCredential = false
    if (authType === 'api_key') {
      hasCredential = !!(await manager.getApiKey())
    } else if (authType === 'oauth_token') {
      hasCredential = !!(await manager.getClaudeOAuth())
    } else if (authType === 'bedrock') {
      hasCredential = true
    }

    let provider: string | undefined
    if (authType === 'bedrock') {
      provider = 'bedrock'
    } else if (authType === 'oauth_token') {
      provider = 'anthropic'
    } else {
      provider = providerConfig?.provider
    }

    const billingAuthType: BillingMethodInfo['authType'] =
      authType === 'api_key' || authType === 'oauth_token' || authType === 'bedrock'
        ? authType
        : 'api_key'

    return { authType: billingAuthType, hasCredential, provider }
  })

  server.handle(RPC_CHANNELS.settings.UPDATE_BILLING_METHOD, async (_ctx, authType: AuthType, credential?: string) => {
    const manager = getCredentialManager()
    const normalizedCredential = credential?.trim()

    if (normalizedCredential && authType === 'api_key' && !isSafeHttpHeaderValue(normalizedCredential)) {
      throw new Error('API key appears masked or contains invalid characters. Please paste the full key.')
    }

    if (normalizedCredential) {
      if (authType === 'api_key') {
        await manager.setApiKey(normalizedCredential)
      } else if (authType === 'oauth_token') {
        const cliCreds = getExistingClaudeCredentials()
        if (cliCreds) {
          await manager.setClaudeOAuthCredentials({
            accessToken: cliCreds.accessToken,
            refreshToken: cliCreds.refreshToken,
            expiresAt: cliCreds.expiresAt,
          })
          deps.platform.logger.info('Saved Claude OAuth credentials with refresh token')
        } else {
          await manager.setClaudeOAuth(normalizedCredential)
          deps.platform.logger.info('Saved Claude OAuth access token only')
        }
      }
    }

    const oldAuthType = getAuthType()
    if (oldAuthType !== authType) {
      if (oldAuthType === 'api_key') {
        await manager.delete({ type: 'anthropic_api_key' })
      } else if (oldAuthType === 'oauth_token') {
        await manager.delete({ type: 'claude_oauth' })
      }
    }

    setAuthType(authType)

    try {
      await deps.sessionManager.reinitializeAuth()
    } catch (authError) {
      deps.platform.logger.error('Failed to reinitialize auth:', authError)
    }
  })

  server.handle(RPC_CHANNELS.settings.GET_AGENT_TYPE, async (): Promise<AgentType> => getAgentType())

  server.handle(RPC_CHANNELS.settings.SET_AGENT_TYPE, async (_ctx, agentType: AgentType) => {
    setAgentType(agentType)
    deps.platform.logger.info(`Agent type updated to: ${agentType}`)
  })

  server.handle(RPC_CHANNELS.settings.CHECK_CODEX_AUTH, async (): Promise<boolean> => {
    return isCodexAuthenticated()
  })

  server.handle(RPC_CHANNELS.settings.START_CODEX_LOGIN, async () => {
    try {
      await startCodexOAuth((status) => {
        deps.platform.logger.info(`Codex OAuth status: ${status}`)
      })
      return { success: true }
    } catch (error) {
      deps.platform.logger.error('Codex login error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  })

  server.handle(RPC_CHANNELS.settings.GET_STORED_CONFIG, async () => {
    const config = loadStoredConfig()
    return config ? { providerConfig: config.providerConfig } : null
  })

  server.handle(RPC_CHANNELS.settings.UPDATE_PROVIDER_CONFIG, async (_ctx, providerConfig: {
    provider: string
    baseURL: string
    apiFormat: 'anthropic' | 'openai'
  }) => {
    setProviderConfig(providerConfig)

    try {
      await deps.sessionManager.reinitializeAuth()
    } catch (authError) {
      deps.platform.logger.error('Failed to reinitialize auth:', authError)
    }
  })

  server.handle(RPC_CHANNELS.settings.GET_MODEL, async (): Promise<string | null> => getModel())

  server.handle(RPC_CHANNELS.settings.SET_MODEL, async (_ctx, model: string) => {
    setModel(model)
    deps.platform.logger.info(`Model updated to: ${model}`)
  })

  server.handle(RPC_CHANNELS.customModels.GET, async () => getCustomModels())

  server.handle(RPC_CHANNELS.customModels.SET, async (_ctx, models: CustomModel[]) => {
    setCustomModels(models)
    deps.platform.logger.info(`Custom models set: ${models.length} models`)
  })

  server.handle(RPC_CHANNELS.customModels.ADD, async (_ctx, model: CustomModel) => {
    const updatedModels = addCustomModel(model)
    deps.platform.logger.info(`Custom model added: ${model.id} (${model.name})`)
    return updatedModels
  })

  server.handle(RPC_CHANNELS.customModels.UPDATE, async (_ctx, modelId: string, updates: Partial<CustomModel>) => {
    const updatedModels = updateCustomModel(modelId, updates)
    deps.platform.logger.info(`Custom model updated: ${modelId}`)
    return updatedModels
  })

  server.handle(RPC_CHANNELS.customModels.DELETE, async (_ctx, modelId: string) => {
    const updatedModels = deleteCustomModel(modelId)
    deps.platform.logger.info(`Custom model deleted: ${modelId}`)
    return updatedModels
  })

  server.handle(RPC_CHANNELS.customModels.REORDER, async (_ctx, modelIds: string[]) => {
    const updatedModels = reorderCustomModels(modelIds)
    deps.platform.logger.info(`Custom models reordered: ${modelIds.join(', ')}`)
    return updatedModels
  })

  // ============================================================
  // Settings - Model (Session-Specific)
  // ============================================================

  // Get session-specific model
  server.handle(RPC_CHANNELS.sessions.GET_MODEL, async (_ctx, sessionId: string, _workspaceId: string): Promise<string | null> => {
    const session = await deps.sessionManager.getSession(sessionId)
    return session?.model ?? null
  })

  // Set session-specific model (and optionally connection)
  server.handle(RPC_CHANNELS.sessions.SET_MODEL, async (_ctx, sessionId: string, workspaceId: string, model: string | null, connection?: string) => {
    await deps.sessionManager.updateSessionModel(sessionId, workspaceId, model, connection)
    deps.platform.logger.info(`Session ${sessionId} model updated to: ${model}${connection ? ` (connection: ${connection})` : ''}`)
  })

  // Open native folder dialog for selecting working directory (routed to client)
  server.handle(RPC_CHANNELS.dialog.OPEN_FOLDER, async (ctx) => {
    const result = await requestClientOpenFileDialog(server, ctx.clientId, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ============================================================
  // Workspace Settings (per-workspace configuration)
  // ============================================================

  // Get workspace settings (model, permission mode, working directory, credential strategy)
  server.handle(RPC_CHANNELS.workspace.SETTINGS_GET, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      deps.platform.logger.error(`Workspace not found: ${workspaceId}`)
      return null
    }

    // Load workspace config
    const { loadWorkspaceConfig } = await import('@agent-operator/shared/workspaces')
    const config = loadWorkspaceConfig(workspace.rootPath)

    return {
      name: config?.name,
      model: config?.defaults?.model,
      permissionMode: config?.defaults?.permissionMode,
      cyclablePermissionModes: config?.defaults?.cyclablePermissionModes,
      thinkingLevel: config?.defaults?.thinkingLevel,
      workingDirectory: config?.defaults?.workingDirectory,
      localMcpEnabled: config?.localMcpServers?.enabled ?? true,
      defaultLlmConnection: config?.defaults?.defaultLlmConnection,
      enabledSourceSlugs: config?.defaults?.enabledSourceSlugs ?? [],
    }
  })

  // Update a workspace setting
  server.handle(RPC_CHANNELS.workspace.SETTINGS_UPDATE, async (_ctx, workspaceId: string, key: string, value: unknown) => {
    const workspace = getWorkspaceOrThrow(workspaceId)

    // Validate key is a known workspace setting
    const validKeys = ['name', 'model', 'enabledSourceSlugs', 'permissionMode', 'cyclablePermissionModes', 'thinkingLevel', 'workingDirectory', 'localMcpEnabled', 'defaultLlmConnection']
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid workspace setting key: ${key}. Valid keys: ${validKeys.join(', ')}`)
    }

    // Validate defaultLlmConnection exists before saving
    if (key === 'defaultLlmConnection' && value !== undefined && value !== null) {
      const { getLlmConnection } = await import('@agent-operator/shared/config/storage')
      if (!getLlmConnection(value as string)) {
        throw new Error(`LLM connection "${value}" not found`)
      }
    }

    const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@agent-operator/shared/workspaces')
    const config = loadWorkspaceConfig(workspace.rootPath)
    if (!config) {
      throw new Error(`Failed to load workspace config: ${workspaceId}`)
    }

    // Handle 'name' specially - it's a top-level config property, not in defaults
    if (key === 'name') {
      config.name = String(value).trim()
    } else if (key === 'localMcpEnabled') {
      // Store in localMcpServers.enabled (top-level, not in defaults)
      config.localMcpServers = config.localMcpServers || { enabled: true }
      config.localMcpServers.enabled = Boolean(value)
    } else {
      // Update the setting in defaults
      config.defaults = config.defaults || {}
      ;(config.defaults as Record<string, unknown>)[key] = value
    }

    // Save the config
    saveWorkspaceConfig(workspace.rootPath, config)
    deps.platform.logger.info(`Workspace setting updated: ${key} = ${JSON.stringify(value)}`)
  })

  // ============================================================
  // User Preferences
  // ============================================================

  // Read user preferences file
  server.handle(RPC_CHANNELS.preferences.READ, async () => {
    const path = getPreferencesPath()
    if (!existsSync(path)) {
      return { content: '{}', exists: false, path }
    }
    return { content: readFileSync(path, 'utf-8'), exists: true, path }
  })

  // Write user preferences file (validates JSON before saving)
  server.handle(RPC_CHANNELS.preferences.WRITE, async (_, content: string) => {
    try {
      JSON.parse(content) // Validate JSON
      const path = getPreferencesPath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ============================================================
  // Session Drafts (persisted input text)
  // ============================================================

  // Get draft text for a session
  server.handle(RPC_CHANNELS.drafts.GET, async (_ctx, sessionId: string) => {
    return getSessionDraft(sessionId)
  })

  // Set draft text for a session (pass empty string to clear)
  server.handle(RPC_CHANNELS.drafts.SET, async (_ctx, sessionId: string, text: string) => {
    setSessionDraft(sessionId, text)
  })

  // Delete draft for a session
  server.handle(RPC_CHANNELS.drafts.DELETE, async (_ctx, sessionId: string) => {
    deleteSessionDraft(sessionId)
  })

  // Get all drafts (for loading on app start)
  server.handle(RPC_CHANNELS.drafts.GET_ALL, async () => {
    return getAllSessionDrafts()
  })

  // ============================================================
  // Input Settings
  // ============================================================

  // Get auto-capitalisation setting
  server.handle(RPC_CHANNELS.input.GET_AUTO_CAPITALISATION, async () => {
    const { getAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    return getAutoCapitalisation()
  })

  // Set auto-capitalisation setting
  server.handle(RPC_CHANNELS.input.SET_AUTO_CAPITALISATION, async (_ctx, enabled: boolean) => {
    const { setAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    setAutoCapitalisation(enabled)
  })

  // Get send message key setting
  server.handle(RPC_CHANNELS.input.GET_SEND_MESSAGE_KEY, async () => {
    const { getSendMessageKey } = await import('@agent-operator/shared/config/storage')
    return getSendMessageKey()
  })

  // Set send message key setting
  server.handle(RPC_CHANNELS.input.SET_SEND_MESSAGE_KEY, async (_ctx, key: 'enter' | 'cmd-enter') => {
    const { setSendMessageKey } = await import('@agent-operator/shared/config/storage')
    setSendMessageKey(key)
  })

  // Get spell check setting
  server.handle(RPC_CHANNELS.input.GET_SPELL_CHECK, async () => {
    const { getSpellCheck } = await import('@agent-operator/shared/config/storage')
    return getSpellCheck()
  })

  // Set spell check setting
  server.handle(RPC_CHANNELS.input.SET_SPELL_CHECK, async (_ctx, enabled: boolean) => {
    const { setSpellCheck } = await import('@agent-operator/shared/config/storage')
    setSpellCheck(enabled)
  })

  // ============================================================
  // Power Settings
  // ============================================================

  // Get keep awake while running setting
  server.handle(RPC_CHANNELS.power.GET_KEEP_AWAKE, async () => {
    const { getKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    return getKeepAwakeWhileRunning()
  })

  // ============================================================
  // Appearance Settings
  // ============================================================

  // Get rich tool descriptions setting
  server.handle(RPC_CHANNELS.appearance.GET_RICH_TOOL_DESCRIPTIONS, async () => {
    const { getRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    return getRichToolDescriptions()
  })

  // Set rich tool descriptions setting
  server.handle(RPC_CHANNELS.appearance.SET_RICH_TOOL_DESCRIPTIONS, async (_ctx, enabled: boolean) => {
    const { setRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    setRichToolDescriptions(enabled)
  })
}
