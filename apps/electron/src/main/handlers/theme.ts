import { ipcMain } from 'electron'
import { join } from 'node:path'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import type { SessionManager } from '../sessions'
import type { WindowManager } from '../window-manager'
import { IPC_CHANNELS } from '../../shared/types'

export function registerThemeHandlers(sessionManager: SessionManager, windowManager: WindowManager): void {
  ipcMain.handle(IPC_CHANNELS.THEME_GET_APP, async () => {
    const { loadAppTheme } = await import('@agent-operator/shared/config/storage')
    return loadAppTheme()
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_PRESETS, async () => {
    const { loadPresetThemes } = await import('@agent-operator/shared/config/storage')
    const bundledThemesDir = join(__dirname, 'resources/themes')
    return loadPresetThemes(bundledThemesDir)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_LOAD_PRESET, async (_event, themeId: string) => {
    const { loadPresetTheme } = await import('@agent-operator/shared/config/storage')
    return loadPresetTheme(themeId)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_COLOR_THEME, async () => {
    const { getColorTheme } = await import('@agent-operator/shared/config/storage')
    return getColorTheme()
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SET_COLOR_THEME, async (_event, themeId: string) => {
    const { setColorTheme } = await import('@agent-operator/shared/config/storage')
    setColorTheme(themeId)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_BROADCAST_PREFERENCES, async (event, preferences: { mode: string; colorTheme: string; font: string }) => {
    const senderId = event.sender.id
    for (const managed of windowManager.getAllWindows()) {
      if (
        !managed.window.isDestroyed()
        && !managed.window.webContents.isDestroyed()
        && managed.window.webContents.mainFrame
        && managed.window.webContents.id !== senderId
      ) {
        managed.window.webContents.send(IPC_CHANNELS.THEME_PREFERENCES_CHANGED, preferences)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_WORKSPACE_COLOR_THEME, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null
    const { getWorkspaceColorTheme } = await import('@agent-operator/shared/workspaces/storage')
    return getWorkspaceColorTheme(workspace.rootPath) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SET_WORKSPACE_COLOR_THEME, async (_event, workspaceId: string, themeId: string | null) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return
    const { setWorkspaceColorTheme } = await import('@agent-operator/shared/workspaces/storage')
    setWorkspaceColorTheme(workspace.rootPath, themeId ?? undefined)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_WORKSPACE_CHANGED, (event, workspaceId: string, themeId: string | null) => {
    for (const managed of windowManager.getAllWindows()) {
      if (
        !managed.window.isDestroyed()
        && !managed.window.webContents.isDestroyed()
        && managed.window.webContents.mainFrame
        && managed.window.webContents !== event.sender
      ) {
        managed.window.webContents.send(IPC_CHANNELS.THEME_WORKSPACE_CHANGED, { workspaceId, themeId })
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_ALL_WORKSPACE_THEMES, async () => {
    const { getWorkspaceColorTheme } = await import('@agent-operator/shared/workspaces/storage')
    const themes: Record<string, string | undefined> = {}
    for (const workspace of sessionManager.getWorkspaces()) {
      themes[workspace.id] = getWorkspaceColorTheme(workspace.rootPath)
    }
    return themes
  })
}
