import type { RpcServer } from '../../transport/server'
import { IPC_CHANNELS } from '../../shared/types'

export function registerUiPreferenceHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.LOGO_GET_URL, async (_ctx, serviceUrl: string, provider?: string) => {
    const { getLogoUrl } = await import('@agent-operator/shared/utils/logo')
    return getLogoUrl(serviceUrl, provider)
  })

  server.handle(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS, async () => {
    const { getToolIconsDir } = await import('@agent-operator/shared/config/storage')
    const { loadToolIconConfig } = await import('@agent-operator/shared/utils/cli-icon-resolver')
    const { encodeIconToDataUrl } = await import('@agent-operator/shared/utils/icon-encoder')
    const { join } = await import('node:path')

    const toolIconsDir = getToolIconsDir()
    const config = loadToolIconConfig(toolIconsDir)
    if (!config) {
      return []
    }

    return config.tools
      .map((tool) => {
        const iconPath = join(toolIconsDir, tool.icon)
        const iconDataUrl = encodeIconToDataUrl(iconPath)
        if (!iconDataUrl) return null
        return {
          id: tool.id,
          displayName: tool.displayName,
          iconDataUrl,
          commands: tool.commands,
        }
      })
      .filter(Boolean)
  })

  server.handle(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS, async () => {
    const { getRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    return getRichToolDescriptions()
  })

  server.handle(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS, async (_ctx, enabled: boolean) => {
    const { setRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    setRichToolDescriptions(enabled)
  })

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

  server.handle(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION, async () => {
    const { getAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    return getAutoCapitalisation()
  })

  server.handle(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION, async (_ctx, enabled: boolean) => {
    const { setAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    setAutoCapitalisation(enabled)
  })

  server.handle(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY, async () => {
    const { getSendMessageKey } = await import('@agent-operator/shared/config/storage')
    return getSendMessageKey()
  })

  server.handle(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY, async (_ctx, key: 'enter' | 'cmd-enter') => {
    const { setSendMessageKey } = await import('@agent-operator/shared/config/storage')
    setSendMessageKey(key)
  })

  server.handle(IPC_CHANNELS.INPUT_GET_SPELL_CHECK, async () => {
    const { getSpellCheck } = await import('@agent-operator/shared/config/storage')
    return getSpellCheck()
  })

  server.handle(IPC_CHANNELS.INPUT_SET_SPELL_CHECK, async (_ctx, enabled: boolean) => {
    const { setSpellCheck } = await import('@agent-operator/shared/config/storage')
    setSpellCheck(enabled)
  })

  server.handle(IPC_CHANNELS.POWER_GET_KEEP_AWAKE, async () => {
    const { getKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    return getKeepAwakeWhileRunning()
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
