import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { pushTyped, type RpcServer } from '@agent-operator/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.labels.LIST,
  RPC_CHANNELS.labels.CREATE,
  RPC_CHANNELS.labels.DELETE,
] as const

export function registerLabelsHandlers(server: RpcServer, deps: HandlerDeps): void {
  // List all labels for a workspace
  server.handle(RPC_CHANNELS.labels.LIST, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listLabels } = await import('@agent-operator/shared/labels/storage')
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    const storedLang = loadStoredConfig()?.uiLanguage
    const systemLang = deps.platform.appLocale?.()?.startsWith('zh') ? 'zh' : undefined
    const locale = storedLang || systemLang
    return listLabels(workspace.rootPath, locale)
  })

  // Create a new label in a workspace
  server.handle(RPC_CHANNELS.labels.CREATE, async (_ctx, workspaceId: string, input: import('@agent-operator/shared/labels').CreateLabelInput) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { createLabel } = await import('@agent-operator/shared/labels/crud')
    const label = createLabel(workspace.rootPath, input)
    pushTyped(server, RPC_CHANNELS.labels.CHANGED, { to: 'workspace', workspaceId }, workspaceId)
    return label
  })

  // Delete a label (and descendants) from a workspace
  server.handle(RPC_CHANNELS.labels.DELETE, async (_ctx, workspaceId: string, labelId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteLabel } = await import('@agent-operator/shared/labels/crud')
    const result = deleteLabel(workspace.rootPath, labelId)
    pushTyped(server, RPC_CHANNELS.labels.CHANGED, { to: 'workspace', workspaceId }, workspaceId)
    return result
  })
}
