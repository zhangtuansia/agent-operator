import type { RpcServer } from '../../transport/server'
import { IPC_CHANNELS } from '../../shared/types'

export function registerUiPreferenceGuiHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.NOTIFICATION_SHOW, async (_ctx, title: string, body: string, workspaceId: string, sessionId: string) => {
    const { showNotification } = await import('../notifications')
    showNotification(title, body, workspaceId, sessionId)
  })

  server.handle(IPC_CHANNELS.NOTIFICATION_GET_ENABLED, async () => {
    const { getNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    return getNotificationsEnabled()
  })

  server.handle(IPC_CHANNELS.NOTIFICATION_SET_ENABLED, async (_ctx, enabled: boolean) => {
    const { setNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    setNotificationsEnabled(enabled)

    if (enabled) {
      const { showNotification } = await import('../notifications')
      showNotification('Notifications enabled', 'You will be notified when tasks complete.', '', '')
    }
  })

  server.handle(IPC_CHANNELS.LANGUAGE_GET, async () => {
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    return config?.uiLanguage || null
  })

  server.handle(IPC_CHANNELS.LANGUAGE_SET, async (_ctx, language: 'en' | 'zh') => {
    const { loadStoredConfig, saveConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    if (config) {
      config.uiLanguage = language
      saveConfig(config)
    }
  })

  server.handle(IPC_CHANNELS.POWER_SET_KEEP_AWAKE, async (_ctx, enabled: boolean) => {
    const { setKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    const { setKeepAwakeSetting } = await import('../power-manager')
    setKeepAwakeWhileRunning(enabled)
    setKeepAwakeSetting(enabled)
  })

  server.handle(IPC_CHANNELS.BADGE_UPDATE, async (_ctx, count: number) => {
    const { updateBadgeCount } = await import('../notifications')
    updateBadgeCount(count)
  })

  server.handle(IPC_CHANNELS.BADGE_CLEAR, async () => {
    const { clearBadgeCount } = await import('../notifications')
    clearBadgeCount()
  })

  server.handle(IPC_CHANNELS.BADGE_SET_ICON, async (_ctx, dataUrl: string) => {
    const { setDockIconWithBadge } = await import('../notifications')
    setDockIconWithBadge(dataUrl)
  })

  server.handle(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE, async () => {
    const { isAnyWindowFocused } = await import('../notifications')
    return isAnyWindowFocused()
  })
}
