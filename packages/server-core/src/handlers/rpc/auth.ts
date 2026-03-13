import { unlink } from 'fs/promises'
import { join } from 'path'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { CONFIG_DIR, loadStoredConfig } from '@agent-operator/shared/config'
import type { RpcServer } from '@agent-operator/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { requestClientConfirmDialog } from '@agent-operator/server-core/transport'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.auth.LOGOUT,
  RPC_CHANNELS.auth.SHOW_LOGOUT_CONFIRMATION,
  RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION,
  RPC_CHANNELS.credentials.HEALTH_CHECK,
] as const

function isChineseLocale(deps: HandlerDeps): boolean {
  return (loadStoredConfig()?.uiLanguage || deps.platform.appLocale?.() || '').startsWith('zh')
}

async function clearRuntimeSessions(deps: HandlerDeps): Promise<void> {
  const sessions = await deps.sessionManager.getSessions()
  await Promise.allSettled(
    sessions
      .filter((session) => session.status === 'running')
      .map((session) => deps.sessionManager.cancelProcessing(session.id)),
  )
}

export function registerAuthHandlers(server: RpcServer, deps: HandlerDeps): void {
  // Show logout confirmation dialog (routed to client)
  server.handle(RPC_CHANNELS.auth.SHOW_LOGOUT_CONFIRMATION, async (ctx) => {
    const isZh = isChineseLocale(deps)
    const result = await requestClientConfirmDialog(server, ctx.clientId, {
      type: 'warning',
      buttons: [isZh ? '取消' : 'Cancel', isZh ? '退出登录' : 'Log Out'],
      defaultId: 0,
      cancelId: 0,
      title: isZh ? '退出登录' : 'Log Out',
      message: isZh ? '确定要退出登录吗？' : 'Are you sure you want to log out?',
      detail: isZh ? '所有对话将被删除，此操作无法撤消。' : 'All conversations will be deleted. This action cannot be undone.',
    })
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Log Out
    return result.response === 1
  })

  // Show delete session confirmation dialog (routed to client)
  server.handle(RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION, async (ctx, name: string) => {
    const isZh = isChineseLocale(deps)
    const result = await requestClientConfirmDialog(server, ctx.clientId, {
      type: 'warning',
      buttons: [isZh ? '取消' : 'Cancel', isZh ? '删除' : 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: isZh ? '删除对话' : 'Delete Conversation',
      message: isZh ? `确定要删除「${name}」吗？` : `Are you sure you want to delete: "${name}"?`,
      detail: isZh ? '此操作无法撤消。' : 'This action cannot be undone.',
    })
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Delete
    return result.response === 1
  })

  // Logout - clear all credentials and config
  server.handle(RPC_CHANNELS.auth.LOGOUT, async () => {
    try {
      await clearRuntimeSessions(deps)

      const manager = getCredentialManager()

      // List and delete all stored credentials
      const allCredentials = await manager.list()
      for (const credId of allCredentials) {
        await manager.delete(credId)
      }

      // Delete the config file
      const configPath = join(CONFIG_DIR, 'config.json')
      await unlink(configPath).catch(() => {
        // Ignore if file doesn't exist
      })

      deps.platform.logger.info('Logout complete - cleared all sessions, credentials and config')
    } catch (error) {
      deps.platform.logger.error('Logout error:', error)
      throw error
    }
  })

  // Credential health check - validates credential store is readable and usable
  // Called on app startup to detect corruption, machine migration, or missing credentials
  server.handle(RPC_CHANNELS.credentials.HEALTH_CHECK, async () => {
    const manager = getCredentialManager()
    return manager.checkHealth()
  })
}
