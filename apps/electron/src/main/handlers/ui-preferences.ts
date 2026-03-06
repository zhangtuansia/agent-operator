import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/types'

export function registerUiPreferenceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LOGO_GET_URL, async (_event, serviceUrl: string, provider?: string) => {
    const { getLogoUrl } = await import('@agent-operator/shared/utils/logo')
    return getLogoUrl(serviceUrl, provider)
  })

  ipcMain.handle(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS, async () => {
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

  ipcMain.handle(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS, async () => {
    const { getRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    return getRichToolDescriptions()
  })

  ipcMain.handle(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS, async (_event, enabled: boolean) => {
    const { setRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    setRichToolDescriptions(enabled)
  })

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SHOW, async (_event, title: string, body: string, workspaceId: string, sessionId: string) => {
    const { showNotification } = await import('../notifications')
    showNotification(title, body, workspaceId, sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_ENABLED, async () => {
    const { getNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    return getNotificationsEnabled()
  })

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SET_ENABLED, async (_event, enabled: boolean) => {
    const { setNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    setNotificationsEnabled(enabled)

    if (enabled) {
      const { showNotification } = await import('../notifications')
      showNotification('Notifications enabled', 'You will be notified when tasks complete.', '', '')
    }
  })

  ipcMain.handle(IPC_CHANNELS.LANGUAGE_GET, async () => {
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    return config?.uiLanguage || null
  })

  ipcMain.handle(IPC_CHANNELS.LANGUAGE_SET, async (_event, language: 'en' | 'zh') => {
    const { loadStoredConfig, saveConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    if (config) {
      config.uiLanguage = language
      saveConfig(config)
    }
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION, async () => {
    const { getAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    return getAutoCapitalisation()
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION, async (_event, enabled: boolean) => {
    const { setAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    setAutoCapitalisation(enabled)
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY, async () => {
    const { getSendMessageKey } = await import('@agent-operator/shared/config/storage')
    return getSendMessageKey()
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY, async (_event, key: 'enter' | 'cmd-enter') => {
    const { setSendMessageKey } = await import('@agent-operator/shared/config/storage')
    setSendMessageKey(key)
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_GET_SPELL_CHECK, async () => {
    const { getSpellCheck } = await import('@agent-operator/shared/config/storage')
    return getSpellCheck()
  })

  ipcMain.handle(IPC_CHANNELS.INPUT_SET_SPELL_CHECK, async (_event, enabled: boolean) => {
    const { setSpellCheck } = await import('@agent-operator/shared/config/storage')
    setSpellCheck(enabled)
  })

  ipcMain.handle(IPC_CHANNELS.POWER_GET_KEEP_AWAKE, async () => {
    const { getKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    return getKeepAwakeWhileRunning()
  })

  ipcMain.handle(IPC_CHANNELS.POWER_SET_KEEP_AWAKE, async (_event, enabled: boolean) => {
    const { setKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    const { setKeepAwakeSetting } = await import('../power-manager')
    setKeepAwakeWhileRunning(enabled)
    setKeepAwakeSetting(enabled)
  })

  ipcMain.handle(IPC_CHANNELS.BADGE_UPDATE, async (_event, count: number) => {
    const { updateBadgeCount } = await import('../notifications')
    updateBadgeCount(count)
  })

  ipcMain.handle(IPC_CHANNELS.BADGE_CLEAR, async () => {
    const { clearBadgeCount } = await import('../notifications')
    clearBadgeCount()
  })

  ipcMain.handle(IPC_CHANNELS.BADGE_SET_ICON, async (_event, dataUrl: string) => {
    const { setDockIconWithBadge } = await import('../notifications')
    setDockIconWithBadge(dataUrl)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE, async () => {
    const { isAnyWindowFocused } = await import('../notifications')
    return isAnyWindowFocused()
  })
}
