import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, open, rename, writeFile } from 'fs/promises'
import type { BackendConfig, BackendSelection, SdkMcpServerConfig } from '@agent-operator/shared/agent/backend'
import { CodexAgent } from '@agent-operator/shared/agent'
import { getSessionPath as getSessionStoragePath } from '@agent-operator/shared/sessions'
import { generateBridgeConfig, generateCodexConfig, getCredentialCachePath, type CredentialCacheEntry } from '@agent-operator/shared/codex'
import {
  loadWorkspaceSources,
  isSourceUsable,
  getSourceCredentialManager,
  type LoadedSource,
  type TokenRefreshManager,
} from '@agent-operator/shared/sources'
import type { AutomationSystem } from '@agent-operator/shared/automations'
import { expandPath } from '@agent-operator/shared/utils'
import { sessionLog } from './logger'

export type McpServerDir = 'bridge-mcp-server' | 'session-mcp-server' | 'pi-agent-server'

export function getBundledBunPath(): string | undefined {
  if (!app.isPackaged) {
    return undefined
  }

  const bunBinary = process.platform === 'win32' ? 'bun.exe' : 'bun'
  const bunBasePath = process.platform === 'win32' ? process.resourcesPath : app.getAppPath()
  const bunPath = join(bunBasePath, 'vendor', 'bun', bunBinary)
  if (existsSync(bunPath)) {
    return bunPath
  }
  sessionLog.warn(`Bundled Bun not found at ${bunPath}; falling back to system bun`)
  return undefined
}

export function resolveMcpServerPath(serverDir: McpServerDir): { path: string; exists: boolean } {
  const candidates = app.isPackaged
    ? [
        join(app.getAppPath(), 'resources', serverDir, 'index.js'),
        join(process.resourcesPath, serverDir, 'index.js'),
      ]
    : [
        join(process.cwd(), 'packages', serverDir, 'dist', 'index.js'),
        join(process.cwd(), 'apps', 'electron', 'resources', serverDir, 'index.js'),
      ]

  const resolved = candidates.find(candidate => existsSync(candidate))
  return {
    path: resolved ?? candidates[0],
    exists: !!resolved,
  }
}

async function writeFileSecure(targetPath: string, content: string, mode: number = 0o600): Promise<void> {
  const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`
  const file = await open(tempPath, 'wx', mode)
  try {
    await file.writeFile(content, 'utf-8')
  } finally {
    await file.close()
  }
  await rename(tempPath, targetPath)
}

async function writeBridgeCredentialCaches(sources: LoadedSource[]): Promise<void> {
  const credentialManager = getSourceCredentialManager()
  for (const source of sources) {
    const credential = await credentialManager.load(source)
    if (!credential?.value) continue

    const sourceDir = join(source.workspaceRootPath, 'sources', source.config.slug)
    await mkdir(sourceDir, { recursive: true })

    const cacheEntry: CredentialCacheEntry = {
      value: credential.value,
      expiresAt: credential.expiresAt,
    }
    const cachePath = getCredentialCachePath(source.workspaceRootPath, source.config.slug)
    await writeFileSecure(cachePath, JSON.stringify(cacheEntry), 0o600)
  }
}

export async function setupCodexSessionConfig(
  sessionPath: string,
  sources: LoadedSource[],
  mcpServerConfigs: Record<string, SdkMcpServerConfig>,
  sessionId?: string,
  workspaceRootPath?: string,
): Promise<string> {
  const codexHome = join(sessionPath, '.codex-home')
  await mkdir(codexHome, { recursive: true })

  const bridgeServer = resolveMcpServerPath('bridge-mcp-server')
  if (!bridgeServer.exists) {
    sessionLog.warn(
      `Bridge MCP server not found at ${bridgeServer.path}. API sources will be unavailable in Codex sessions.`,
    )
  }

  const sessionServer = resolveMcpServerPath('session-mcp-server')
  if (!sessionServer.exists) {
    sessionLog.warn(
      `Session MCP server not found at ${sessionServer.path}. Session-scoped tools may be unavailable in Codex sessions.`,
    )
  }

  const workspaceId = sources[0]?.workspaceId
  const bridgeConfigPath = join(codexHome, 'bridge-config.json')
  const plansFolderPath = sessionId && workspaceRootPath
    ? join(expandPath(workspaceRootPath), 'sessions', sessionId, 'plans')
    : undefined

  const configResult = generateCodexConfig({
    sources,
    mcpServerConfigs,
    sessionPath,
    bridgeServerPath: bridgeServer.exists ? bridgeServer.path : undefined,
    bridgeConfigPath: bridgeServer.exists ? bridgeConfigPath : undefined,
    workspaceId,
    sessionServerPath: sessionServer.exists && sessionId && workspaceRootPath ? sessionServer.path : undefined,
    sessionId,
    workspaceRootPath,
    plansFolderPath,
    nodePath: getBundledBunPath() ?? 'bun',
  })

  await writeFile(join(codexHome, 'config.toml'), configResult.toml, 'utf-8')
  for (const warning of configResult.warnings) {
    sessionLog.warn(`Source config warning [${warning.sourceSlug}]: ${warning.message}`)
  }

  if (configResult.needsBridge) {
    await writeFile(bridgeConfigPath, generateBridgeConfig(sources), 'utf-8')
    const apiSources = sources.filter(source => source.config.type === 'api' && source.config.enabled)
    await writeBridgeCredentialCaches(apiSources)
  }

  return codexHome
}

export async function setupCopilotBridgeConfig(copilotConfigDir: string, sources: LoadedSource[]): Promise<void> {
  const apiSources = sources.filter(source => source.config.type === 'api' && source.config.enabled)
  if (apiSources.length === 0) return

  await mkdir(copilotConfigDir, { recursive: true })
  await writeFile(join(copilotConfigDir, 'bridge-config.json'), generateBridgeConfig(sources), 'utf-8')
  await writeBridgeCredentialCaches(apiSources)
}

export async function syncSessionBackendSourceConfig(args: {
  provider: BackendSelection['provider']
  sessionId: string
  workspaceRootPath: string
  sources: LoadedSource[]
  mcpServers: Record<string, SdkMcpServerConfig>
}): Promise<{ shouldReconnectCodex: boolean }> {
  const { provider, sessionId, workspaceRootPath, sources, mcpServers } = args
  const usableSources = sources.filter(isSourceUsable)
  const sessionPath = getSessionStoragePath(workspaceRootPath, sessionId)

  if (provider === 'copilot') {
    const copilotConfigDir = join(sessionPath, '.copilot-config')
    await setupCopilotBridgeConfig(copilotConfigDir, usableSources)
    return { shouldReconnectCodex: false }
  }

  if (provider === 'openai') {
    await setupCodexSessionConfig(
      sessionPath,
      usableSources,
      mcpServers,
      sessionId,
      workspaceRootPath,
    )
    return { shouldReconnectCodex: true }
  }

  return { shouldReconnectCodex: false }
}

export async function reconcileSessionBackendRuntime(args: {
  provider: BackendSelection['provider']
  agent: unknown
  sessionId: string
  context: string
  reconnectRequested?: boolean
  pendingReconnect?: boolean
}): Promise<boolean> {
  const {
    provider,
    agent,
    sessionId,
    context,
    reconnectRequested = false,
    pendingReconnect = false,
  } = args

  if (provider !== 'openai' || !(agent instanceof CodexAgent)) {
    return false
  }

  const shouldReconnect = reconnectRequested || pendingReconnect
  if (!shouldReconnect) {
    return false
  }

  if (agent.isProcessing()) {
    sessionLog.info(`Deferring Codex reconnect for session ${sessionId} (${context})`)
    return true
  }

  try {
    await agent.reconnect()
    sessionLog.info(`Codex reconnected for session ${sessionId} (${context})`)
    return false
  } catch (error) {
    sessionLog.warn(
      `Failed to reconnect Codex for session ${sessionId} (${context}):`,
      error instanceof Error ? error.message : error,
    )
    return true
  }
}

interface BuildServersFromSourcesResult {
  mcpServers: Record<string, SdkMcpServerConfig>
  apiServers: Record<string, unknown>
}

type BuildServersFromSourcesFn = (
  sources: LoadedSource[],
  sessionPath?: string,
  tokenRefreshManager?: TokenRefreshManager,
  summarize?: (prompt: string) => Promise<string | null>,
) => Promise<BuildServersFromSourcesResult>

interface CreateSessionBackendConfigArgs {
  backendSelection: BackendSelection
  sharedBackendConfig: Omit<BackendConfig, 'provider' | 'model'>
  resolvedConnection: {
    slug: string
    providerType: BackendConfig['providerType']
    authType: BackendConfig['authType']
    defaultModel?: string
    baseUrl?: string
  } | null
  resolvedModel?: string
  sessionId: string
  workspaceRootPath: string
  enabledSourceSlugs?: string[]
  tokenRefreshManager?: TokenRefreshManager
  systemPromptPreset?: BackendConfig['systemPromptPreset']
  automationSystem?: AutomationSystem
  copilotCliPath?: string
  copilotInterceptorPath?: string
  piServerPath?: string
  piInterceptorPath?: string
  buildServersFromSources: BuildServersFromSourcesFn
}

export async function createSessionBackendConfig(args: CreateSessionBackendConfigArgs): Promise<{
  config: BackendConfig
  providerLabel: string
}> {
  const {
    backendSelection,
    sharedBackendConfig,
    resolvedConnection,
    resolvedModel,
    sessionId,
    workspaceRootPath,
    enabledSourceSlugs,
    tokenRefreshManager,
    systemPromptPreset,
    automationSystem,
    copilotCliPath,
    copilotInterceptorPath,
    piServerPath,
    piInterceptorPath,
    buildServersFromSources,
  } = args

  const sessionPath = getSessionStoragePath(workspaceRootPath, sessionId)

  switch (backendSelection.provider) {
    case 'openai': {
      const codexModel = resolvedModel ?? resolvedConnection?.defaultModel
      const enabledSlugs = enabledSourceSlugs || []
      const allSources = loadWorkspaceSources(workspaceRootPath)
      const enabledSources = allSources.filter(source =>
        enabledSlugs.includes(source.config.slug) && isSourceUsable(source),
      )
      const { mcpServers } = await buildServersFromSources(
        enabledSources,
        sessionPath,
        tokenRefreshManager,
      )
      const codexHome = await setupCodexSessionConfig(
        sessionPath,
        enabledSources,
        mcpServers,
        sessionId,
        workspaceRootPath,
      )

      return {
        providerLabel: 'Codex',
        config: {
          provider: 'openai',
          ...sharedBackendConfig,
          baseUrl: resolvedConnection?.baseUrl,
          model: codexModel,
          codexHome,
        },
      }
    }

    case 'copilot': {
      const copilotModel = resolvedModel ?? resolvedConnection?.defaultModel
      const copilotConfigDir = join(sessionPath, '.copilot-config')
      await mkdir(copilotConfigDir, { recursive: true })

      const sessionServer = resolveMcpServerPath('session-mcp-server')
      if (!sessionServer.exists) {
        sessionLog.warn(
          `Session MCP server not found at ${sessionServer.path}. Session-scoped tools may be unavailable in Copilot sessions.`,
        )
      }

      const bridgeServer = resolveMcpServerPath('bridge-mcp-server')
      if (!bridgeServer.exists) {
        sessionLog.warn(
          `Bridge MCP server not found at ${bridgeServer.path}. API sources may be unavailable in Copilot sessions.`,
        )
      }

      return {
        providerLabel: 'Copilot',
        config: {
          provider: 'copilot',
          ...sharedBackendConfig,
          model: copilotModel,
          copilotCliPath,
          copilotInterceptorPath,
          copilotConfigDir,
          sessionServerPath: sessionServer.exists ? sessionServer.path : undefined,
          bridgeServerPath: bridgeServer.exists ? bridgeServer.path : undefined,
          nodePath: getBundledBunPath() ?? 'bun',
        },
      }
    }

    case 'pi': {
      const piModel = resolvedModel ?? resolvedConnection?.defaultModel
      if (!piServerPath) {
        throw new Error('PI provider selected, but pi-agent-server is not available. Please run `bun --cwd packages/pi-agent-server run build`.')
      }

      return {
        providerLabel: 'Pi',
        config: {
          provider: 'pi',
          ...sharedBackendConfig,
          model: piModel,
          nodePath: getBundledBunPath() ?? 'bun',
          piServerPath,
          piInterceptorPath,
        },
      }
    }

    case 'anthropic':
    default:
      return {
        providerLabel: 'Claude',
        config: {
          provider: 'anthropic',
          anthropicRuntime: backendSelection.anthropicRuntime,
          ...sharedBackendConfig,
          model: resolvedModel,
          systemPromptPreset,
          automationSystem,
        },
      }
  }
}
