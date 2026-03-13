import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { loadWorkspaceSources, saveSourceConfig, type FolderSourceConfig } from '@agent-operator/shared/sources'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import type { RpcServer } from '../../transport/server'
import { IPC_CHANNELS, type EnsureGwsInstalledResult } from '../../shared/types'
import { ipcLog } from '../logger'

interface SourcesHandlerOptions {
  ensureGwsInstalled: () => Promise<EnsureGwsInstalledResult>
}

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.SOURCES_ENSURE_GWS_INSTALLED,
] as const

export function registerSourceHandlers(server: RpcServer, options: SourcesHandlerOptions): void {
  let ensureGwsInstalledInFlight: Promise<EnsureGwsInstalledResult> | null = null

  server.handle(IPC_CHANNELS.SOURCES_ENSURE_GWS_INSTALLED, async () => {
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
}

export function createPrepareWorkspaceSources(
  sessionManager: ISessionManager,
  options: SourcesHandlerOptions,
): (workspaceId: string, workspaceRootPath: string) => Promise<void> {
  return async (workspaceId: string, workspaceRootPath: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SOURCES_GET: Workspace not found: ${workspaceId}`)
      return
    }

    sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
    await repairLegacyGoogleWorkspaceSources(workspaceRootPath, options.ensureGwsInstalled)
  }
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
