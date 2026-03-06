import { ipcMain } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getAppPermissionsDir,
  getSourcePermissionsPath,
  getWorkspacePermissionsPath,
  loadSourcePermissionsConfig,
  permissionsConfigCache,
} from '@agent-operator/shared/agent'
import { getWorkspaceByNameOrId, type Workspace } from '@agent-operator/shared/config'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { OperatorMcpClient } from '@agent-operator/shared/mcp'
import {
  createSource,
  deleteSource,
  getSourceCredentialManager,
  loadSource,
  loadSourceConfig,
  loadWorkspaceSources,
  saveSourceConfig,
  type CreateSourceInput,
  type FolderSourceConfig,
} from '@agent-operator/shared/sources'
import { IPC_CHANNELS, type EnsureGwsInstalledResult } from '../../shared/types'
import { ipcLog } from '../logger'
import type { SessionManager } from '../sessions'

interface SourcesHandlerOptions {
  ensureGwsInstalled: () => Promise<EnsureGwsInstalledResult>
}

type LoadedWorkspaceSource = Awaited<ReturnType<typeof loadWorkspaceSources>>[number]

export function registerSourceHandlers(sessionManager: SessionManager, options: SourcesHandlerOptions): void {
  let ensureGwsInstalledInFlight: Promise<EnsureGwsInstalledResult> | null = null

  ipcMain.handle(IPC_CHANNELS.SOURCES_ENSURE_GWS_INSTALLED, async () => {
    if (!ensureGwsInstalledInFlight) {
      ensureGwsInstalledInFlight = options.ensureGwsInstalled()
        .catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }))
        .finally(() => {
          ensureGwsInstalledInFlight = null
        })
    }

    return ensureGwsInstalledInFlight
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_GET, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SOURCES_GET: Workspace not found: ${workspaceId}`)
      return []
    }

    sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
    await repairLegacyGoogleWorkspaceSources(workspace.rootPath, options.ensureGwsInstalled)
    return loadWorkspaceSources(workspace.rootPath)
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_CREATE, async (_event, workspaceId: string, config: Partial<CreateSourceInput>) => {
    const workspace = getRequiredWorkspace(workspaceId)
    return createSource(workspace.rootPath, {
      name: config.name || 'New Source',
      provider: config.provider || 'custom',
      type: config.type || 'mcp',
      enabled: config.enabled ?? true,
      mcp: config.mcp,
      api: config.api,
      local: config.local,
      icon: config.icon,
    })
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_UPDATE, async (_event, workspaceId: string, sourceSlug: string, config: Partial<FolderSourceConfig>) => {
    const workspace = getRequiredWorkspace(workspaceId)
    const existing = loadSourceConfig(workspace.rootPath, sourceSlug)
    if (!existing) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    const updated: FolderSourceConfig = {
      ...existing,
      ...config,
      id: existing.id,
      slug: existing.slug,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      mcp: config.mcp ? { ...existing.mcp, ...config.mcp } : existing.mcp,
      api: config.api ? { ...existing.api, ...config.api } : existing.api,
      local: config.local ? { ...existing.local, ...config.local } : existing.local,
    }

    saveSourceConfig(workspace.rootPath, updated)
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_DELETE, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getRequiredWorkspace(workspaceId)
    deleteSource(workspace.rootPath, sourceSlug)
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_START_OAUTH, async (_event, workspaceId: string, sourceSlug: string) => {
    try {
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) {
        return { success: false, error: `Workspace not found: ${workspaceId}` }
      }

      const source = loadSource(workspace.rootPath, sourceSlug)
      if (!source || source.config.type !== 'mcp' || !source.config.mcp?.url) {
        return { success: false, error: 'Source not found or not an MCP source' }
      }

      const credManager = getSourceCredentialManager()
      const result = await credManager.authenticate(source, {
        onStatus: (message) => ipcLog.info(`[OAuth] ${source.config.name}: ${message}`),
        onError: (error) => ipcLog.error(`[OAuth] ${source.config.name} error: ${error}`),
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      const token = await credManager.getToken(source)
      ipcLog.info(`Source OAuth complete: ${sourceSlug}`)
      return { success: true, accessToken: token }
    } catch (error) {
      ipcLog.error('Source OAuth failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_SAVE_CREDENTIALS, async (_event, workspaceId: string, sourceSlug: string, credential: string) => {
    const workspace = getRequiredWorkspace(workspaceId)
    const source = loadSource(workspace.rootPath, sourceSlug)
    if (!source) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    const credManager = getSourceCredentialManager()
    await credManager.save(source, { value: credential })
    ipcLog.info(`Saved credentials for source: ${sourceSlug}`)
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_GET_PERMISSIONS, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    return readJsonFileIfExists(getSourcePermissionsPath(workspace.rootPath, sourceSlug), 'Error reading permissions config:')
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_PERMISSIONS, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    return readJsonFileIfExists(getWorkspacePermissionsPath(workspace.rootPath), 'Error reading workspace permissions config:')
  })

  ipcMain.handle(IPC_CHANNELS.DEFAULT_PERMISSIONS_GET, async () => {
    const defaultPath = join(getAppPermissionsDir(), 'default.json')
    return {
      config: readJsonFileIfExists(defaultPath, 'Error reading default permissions config:'),
      path: defaultPath,
    }
  })

  ipcMain.handle(IPC_CHANNELS.SOURCES_GET_MCP_TOOLS, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return { success: false, error: 'Workspace not found' }

    try {
      const sources = await loadWorkspaceSources(workspace.rootPath)
      const source = sources.find((entry) => entry.config.slug === sourceSlug)
      if (!source) return { success: false, error: 'Source not found' }
      if (source.config.type !== 'mcp') return { success: false, error: 'Source is not an MCP server' }
      if (!source.config.mcp) return { success: false, error: 'MCP config not found' }

      if (source.config.connectionStatus === 'needs_auth') {
        return { success: false, error: 'Source requires authentication' }
      }
      if (source.config.connectionStatus === 'failed') {
        return { success: false, error: source.config.connectionError || 'Connection failed' }
      }
      if (source.config.connectionStatus === 'untested') {
        return { success: false, error: 'Source has not been tested yet' }
      }

      const client = await createMcpClient(sourceSlug, source)
      const tools = await client.listTools()
      await client.close()

      if (
        source.config.provider === 'googleworkspace'
        && source.config.mcp.transport === 'stdio'
        && tools.length === 0
        && !hasGoogleWorkspaceServiceSelection(source.config.mcp.args)
      ) {
        return {
          success: false,
          error: 'Google Workspace CLI started without any enabled services. Reconfigure this source with `gws mcp -s all` or choose specific services.',
        }
      }

      loadSourcePermissionsConfig(workspace.rootPath, sourceSlug)
      const mergedConfig = permissionsConfigCache.getMergedConfig({
        workspaceRootPath: workspace.rootPath,
        activeSourceSlugs: [sourceSlug],
      })

      return {
        success: true,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          allowed: mergedConfig.readOnlyMcpPatterns.some((pattern: RegExp) => pattern.test(tool.name)),
        })),
      }
    } catch (error) {
      ipcLog.error('Failed to get MCP tools:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tools'

      if (errorMessage.includes('404')) {
        return { success: false, error: 'MCP server endpoint not found. The server may be offline or the URL may be incorrect.' }
      }
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return { success: false, error: 'Authentication failed. Please re-authenticate with this source.' }
      }

      return { success: false, error: errorMessage }
    }
  })
}

function getRequiredWorkspace(workspaceId: string): Workspace {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return workspace
}

function readJsonFileIfExists(path: string, logPrefix: string): unknown | null {
  if (!existsSync(path)) return null

  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    ipcLog.error(logPrefix, error)
    return null
  }
}

function hasGoogleWorkspaceServiceSelection(args: string[] | undefined): boolean {
  if (!args || args.length === 0) return false

  return args.some((arg, index) => {
    if (arg === '-s' || arg === '--services') {
      return typeof args[index + 1] === 'string' && args[index + 1]!.trim().length > 0
    }

    return arg.startsWith('--services=') || arg.startsWith('-s=')
  })
}

async function repairLegacyGoogleWorkspaceSources(
  workspaceRootPath: string,
  ensureGwsInstalled: () => Promise<EnsureGwsInstalledResult>,
): Promise<void> {
  const sources = loadWorkspaceSources(workspaceRootPath)
  const legacySources = sources.filter((source) => {
    if (source.config.provider !== 'googleworkspace') return false
    if (source.config.type !== 'mcp') return false
    if (source.config.mcp?.transport !== 'stdio') return false

    const args = source.config.mcp.args ?? []
    return args.length === 1 && args[0] === 'mcp'
  })

  if (legacySources.length === 0) return

  const ensureResult = await ensureGwsInstalled()
  if (!ensureResult.success || !ensureResult.command) {
    ipcLog.warn('[sources] Failed to repair legacy Google Workspace source(s): gws is unavailable', ensureResult.error)
    return
  }

  const desiredArgs = [...(ensureResult.argsPrefix ?? []), 'mcp', '-s', 'all']

  for (const source of legacySources) {
    const updated: FolderSourceConfig = {
      ...source.config,
      enabled: true,
      updatedAt: Date.now(),
      mcp: {
        ...source.config.mcp,
        transport: 'stdio',
        command: ensureResult.command,
        args: desiredArgs,
        env: ensureResult.env,
        authType: 'none',
      },
    }

    saveSourceConfig(workspaceRootPath, updated)
    ipcLog.info(`[sources] Repaired legacy Google Workspace source: ${source.config.slug}`)
  }
}

async function createMcpClient(sourceSlug: string, source: LoadedWorkspaceSource): Promise<OperatorMcpClient> {
  if (source.config.mcp?.transport === 'stdio') {
    if (!source.config.mcp.command) {
      throw new Error('Stdio MCP source is missing required "command" field')
    }

    ipcLog.info(`Fetching MCP tools via stdio: ${source.config.mcp.command}`)
    return new OperatorMcpClient({
      transport: 'stdio',
      command: source.config.mcp.command,
      args: source.config.mcp.args,
      env: source.config.mcp.env,
    })
  }

  if (!source.config.mcp?.url) {
    throw new Error('MCP source URL is required for HTTP/SSE transport')
  }

  let accessToken: string | undefined
  if (source.config.mcp.authType === 'oauth' || source.config.mcp.authType === 'bearer') {
    const credentialManager = getCredentialManager()
    const credentialId = source.config.mcp.authType === 'oauth'
      ? { type: 'source_oauth' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
      : { type: 'source_bearer' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
    const credential = await credentialManager.get(credentialId)
    accessToken = credential?.value
  }

  ipcLog.info(`Fetching MCP tools from ${source.config.mcp.url}`)
  return new OperatorMcpClient({
    transport: 'http',
    url: source.config.mcp.url,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
}
