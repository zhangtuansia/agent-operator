import { dialog, ipcMain } from 'electron'
import type { Dirent } from 'node:fs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import {
  getAgentType,
  getAuthType,
  getCustomModels,
  getLlmConnection,
  getModel,
  getPreferencesPath,
  getProviderConfig,
  getSessionDraft,
  getWorkspaceByNameOrId,
  loadStoredConfig,
  reorderCustomModels,
  setAgentType,
  setAuthType,
  setCustomModels,
  setModel,
  setProviderConfig,
  setSessionDraft,
  type AgentType,
  type Workspace,
  updateCustomModel,
  addCustomModel,
  deleteCustomModel,
  deleteSessionDraft,
  getAllSessionDrafts,
} from '@agent-operator/shared/config'
import { isCodexAuthenticated, startCodexOAuth } from '@agent-operator/shared/auth'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import {
  WorkspaceIdSchema,
  WorkspaceSettingKeySchema,
} from '@agent-operator/shared/ipc/schemas'
import { isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import { loadWorkspaceConfig, saveWorkspaceConfig } from '@agent-operator/shared/workspaces'
import type { SessionManager } from '../sessions'
import { validateIpcArgs } from '../ipc-validator'
import { ipcLog } from '../logger'
import {
  IPC_CHANNELS,
  type AuthType,
  type BillingMethodInfo,
  type CustomModel,
  type FileSearchResult,
} from '../../shared/types'

interface SettingsHandlerOptions {
  applySensitiveRateLimit?: (channel: string) => void
}

export function registerSettingsHandlers(sessionManager: SessionManager, options: SettingsHandlerOptions = {}): void {
  const applySensitiveRateLimit = options.applySensitiveRateLimit ?? (() => {})

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_BILLING_METHOD, async (): Promise<BillingMethodInfo> => {
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

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_BILLING_METHOD, async (_event, authType: AuthType, credential?: string) => {
    applySensitiveRateLimit('SETTINGS_UPDATE_BILLING_METHOD')

    const manager = getCredentialManager()
    const normalizedCredential = credential?.trim()

    if (normalizedCredential && authType === 'api_key' && !isSafeHttpHeaderValue(normalizedCredential)) {
      throw new Error('API key appears masked or contains invalid characters. Please paste the full key.')
    }

    if (normalizedCredential) {
      if (authType === 'api_key') {
        await manager.setApiKey(normalizedCredential)
      } else if (authType === 'oauth_token') {
        const { getExistingClaudeCredentials } = await import('@agent-operator/shared/auth')
        const cliCreds = getExistingClaudeCredentials()
        if (cliCreds) {
          await manager.setClaudeOAuthCredentials({
            accessToken: cliCreds.accessToken,
            refreshToken: cliCreds.refreshToken,
            expiresAt: cliCreds.expiresAt,
          })
          ipcLog.info('Saved Claude OAuth credentials with refresh token')
        } else {
          await manager.setClaudeOAuth(normalizedCredential)
          ipcLog.info('Saved Claude OAuth access token only')
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

    ipcLog.info(`Billing method updated to: ${authType}`)

    try {
      await sessionManager.reinitializeAuth()
      ipcLog.info('Reinitialized auth after billing update')
    } catch (authError) {
      ipcLog.error('Failed to reinitialize auth:', authError)
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_AGENT_TYPE, async (): Promise<AgentType> => {
    return getAgentType()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_AGENT_TYPE, async (_event, agentType: AgentType) => {
    setAgentType(agentType)
    ipcLog.info(`Agent type updated to: ${agentType}`)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CHECK_CODEX_AUTH, async (): Promise<boolean> => {
    return isCodexAuthenticated()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_START_CODEX_LOGIN, async () => {
    try {
      await startCodexOAuth((status) => {
        ipcLog.info(`Codex OAuth status: ${status}`)
      })
      return { success: true }
    } catch (error) {
      ipcLog.error('Codex login error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_STORED_CONFIG, async () => {
    const config = loadStoredConfig()
    return config ? { providerConfig: config.providerConfig } : null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_PROVIDER_CONFIG, async (_event, providerConfig: {
    provider: string
    baseURL: string
    apiFormat: 'anthropic' | 'openai'
  }) => {
    setProviderConfig(providerConfig)
    ipcLog.info(`Provider config updated: ${providerConfig.provider} - ${providerConfig.baseURL}`)

    try {
      await sessionManager.reinitializeAuth()
      ipcLog.info('Reinitialized auth after provider config update')
    } catch (authError) {
      ipcLog.error('Failed to reinitialize auth:', authError)
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_MODEL, async (): Promise<string | null> => getModel())

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_MODEL, async (_event, model: string) => {
    setModel(model)
    ipcLog.info(`Model updated to: ${model}`)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_MODEL, async (_event, sessionId: string, _workspaceId: string): Promise<string | null> => {
    const session = await sessionManager.getSession(sessionId)
    return session?.model ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_SET_MODEL, async (_event, sessionId: string, workspaceId: string, model: string | null, connection?: string) => {
    await sessionManager.updateSessionModel(sessionId, workspaceId, model, connection)
    ipcLog.info(`Session ${sessionId} model updated to: ${model}`)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_GET, async () => getCustomModels())

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_SET, async (_event, models: CustomModel[]) => {
    setCustomModels(models)
    ipcLog.info(`Custom models set: ${models.length} models`)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_ADD, async (_event, model: CustomModel) => {
    const updatedModels = addCustomModel(model)
    ipcLog.info(`Custom model added: ${model.id} (${model.name})`)
    return updatedModels
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_UPDATE, async (_event, modelId: string, updates: Partial<CustomModel>) => {
    const updatedModels = updateCustomModel(modelId, updates)
    ipcLog.info(`Custom model updated: ${modelId}`)
    return updatedModels
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_DELETE, async (_event, modelId: string) => {
    const updatedModels = deleteCustomModel(modelId)
    ipcLog.info(`Custom model deleted: ${modelId}`)
    return updatedModels
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_REORDER, async (_event, modelIds: string[]) => {
    const updatedModels = reorderCustomModels(modelIds)
    ipcLog.info(`Custom models reordered: ${modelIds.join(', ')}`)
    return updatedModels
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.FS_SEARCH, async (_event, basePath: string, query: string): Promise<FileSearchResult[]> => {
    if (!basePath || !isAbsolute(basePath)) return []

    const rootPath = normalize(resolve(basePath))
    if (!existsSync(rootPath)) return []

    const { readdir } = await import('node:fs/promises')

    const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo'])
    const maxDepth = 8
    const maxEntries = 5000
    const maxResults = 1000
    const results: FileSearchResult[] = []
    const queue: Array<{ dirPath: string; depth: number }> = [{ dirPath: rootPath, depth: 0 }]
    let scannedEntries = 0

    while (queue.length > 0 && scannedEntries < maxEntries && results.length < maxResults) {
      const current = queue.shift()
      if (!current) break

      let entries: Dirent[]
      try {
        entries = await readdir(current.dirPath, { withFileTypes: true }) as Dirent[]
      } catch {
        continue
      }

      entries.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
        return left.name.localeCompare(right.name)
      })

      for (const entry of entries) {
        scannedEntries += 1
        if (scannedEntries > maxEntries) break
        if (entry.isSymbolicLink()) continue

        const absolutePath = join(current.dirPath, entry.name)
        const relativePath = relative(rootPath, absolutePath).replace(/\\/g, '/')
        if (!relativePath || relativePath.startsWith('..')) continue

        results.push({
          name: entry.name,
          path: absolutePath,
          type: entry.isDirectory() ? 'directory' : 'file',
          relativePath,
        })
        if (results.length >= maxResults) break

        if (entry.isDirectory() && current.depth < maxDepth && !ignoredDirectories.has(entry.name)) {
          queue.push({ dirPath: absolutePath, depth: current.depth + 1 })
        }
      }
    }

    return rankFileSearchResults(results, query.trim().toLowerCase())
  })

  ipcMain.handle(IPC_CHANNELS.DEBUG_LOG, async (_event, ...args: unknown[]) => {
    ipcLog.debug('[renderer]', ...args)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SETTINGS_GET, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`Workspace not found: ${workspaceId}`)
      return null
    }

    const config = loadWorkspaceConfig(workspace.rootPath)

    return {
      name: config?.name,
      model: config?.defaults?.model,
      defaultLlmConnection: config?.defaults?.defaultLlmConnection,
      permissionMode: config?.defaults?.permissionMode,
      cyclablePermissionModes: config?.defaults?.cyclablePermissionModes,
      thinkingLevel: config?.defaults?.thinkingLevel,
      workingDirectory: config?.defaults?.workingDirectory,
      localMcpEnabled: config?.localMcpServers?.enabled ?? true,
    }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SETTINGS_UPDATE, async (_event, workspaceId: unknown, key: unknown, value: unknown) => {
    const validatedWorkspaceId = validateIpcArgs<string>(WorkspaceIdSchema, workspaceId, 'WORKSPACE_SETTINGS_UPDATE.workspaceId')
    const validatedKey = validateIpcArgs<string>(WorkspaceSettingKeySchema, key, 'WORKSPACE_SETTINGS_UPDATE.key')

    const workspace = getWorkspaceOrThrow(validatedWorkspaceId)
    const config = loadWorkspaceConfig(workspace.rootPath)
    if (!config) {
      throw new Error(`Failed to load workspace config: ${workspaceId}`)
    }

    if (validatedKey === 'defaultLlmConnection' && value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        throw new Error('defaultLlmConnection must be a string or null')
      }
      const connection = getLlmConnection(value)
      if (!connection) {
        throw new Error(`LLM connection not found: ${value}`)
      }
    }

    if (validatedKey === 'name') {
      config.name = String(value).trim()
    } else if (validatedKey === 'localMcpEnabled') {
      config.localMcpServers = config.localMcpServers || { enabled: true }
      config.localMcpServers.enabled = Boolean(value)
    } else if (validatedKey === 'defaultLlmConnection') {
      config.defaults = config.defaults || {}
      if (typeof value === 'string' && value.length > 0) {
        config.defaults.defaultLlmConnection = value
      } else {
        delete config.defaults.defaultLlmConnection
      }
    } else {
      config.defaults = config.defaults || {}
      ;(config.defaults as Record<string, unknown>)[validatedKey] = value
    }

    saveWorkspaceConfig(workspace.rootPath, config)
    ipcLog.info(`Workspace setting updated: ${validatedKey} = ${JSON.stringify(value)}`)
  })

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_READ, async () => {
    const path = getPreferencesPath()
    if (!existsSync(path)) {
      return { content: '{}', exists: false, path }
    }
    return { content: readFileSync(path, 'utf-8'), exists: true, path }
  })

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_WRITE, async (_event, content: string) => {
    try {
      JSON.parse(content)
      const path = getPreferencesPath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DRAFTS_GET, async (_event, sessionId: string) => getSessionDraft(sessionId))

  ipcMain.handle(IPC_CHANNELS.DRAFTS_SET, async (_event, sessionId: string, text: string) => {
    setSessionDraft(sessionId, text)
  })

  ipcMain.handle(IPC_CHANNELS.DRAFTS_DELETE, async (_event, sessionId: string) => {
    deleteSessionDraft(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.DRAFTS_GET_ALL, async () => getAllSessionDrafts())
}

function getWorkspaceOrThrow(workspaceId: string): Workspace {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return workspace
}

function getFileSearchScore(result: FileSearchResult, query: string): number {
  if (!query) return 0

  const normalizedQuery = query.toLowerCase()
  const name = result.name.toLowerCase()
  const relativePath = result.relativePath.toLowerCase()

  if (name === normalizedQuery) return 0
  if (name.startsWith(normalizedQuery)) return 1
  if (relativePath.startsWith(normalizedQuery)) return 2
  if (name.includes(normalizedQuery)) return 3
  if (relativePath.includes(`/${normalizedQuery}`)) return 4
  if (relativePath.includes(normalizedQuery)) return 5
  return 10
}

function rankFileSearchResults(results: FileSearchResult[], query: string): FileSearchResult[] {
  return [...results].sort((left, right) => {
    const scoreDelta = getFileSearchScore(left, query) - getFileSearchScore(right, query)
    if (scoreDelta !== 0) return scoreDelta

    const pathLengthDelta = left.relativePath.length - right.relativePath.length
    if (pathLengthDelta !== 0) return pathLengthDelta

    return left.relativePath.localeCompare(right.relativePath)
  })
}
