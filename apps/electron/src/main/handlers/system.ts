import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/types'

export function registerSystemHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_THEME, () => {
    return nativeTheme.shouldUseDarkColors
  })

  ipcMain.handle(IPC_CHANNELS.GET_HOME_DIR, () => {
    return homedir()
  })

  ipcMain.handle(IPC_CHANNELS.IS_DEBUG_MODE, () => {
    return !app.isPackaged
  })

  ipcMain.handle(IPC_CHANNELS.GITBASH_CHECK, async () => {
    const platform = process.platform as 'win32' | 'darwin' | 'linux'
    if (platform !== 'win32') {
      return { found: true, path: null, platform }
    }

    const commonPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'bash.exe'),
    ]

    for (const bashPath of commonPaths) {
      if (existsSync(bashPath)) {
        return { found: true, path: bashPath, platform }
      }
    }

    return { found: false, path: null, platform }
  })

  ipcMain.handle(IPC_CHANNELS.GITBASH_BROWSE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      title: 'Select bash.exe',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
      defaultPath: 'C:\\Program Files\\Git\\bin',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.GITBASH_SET_PATH, async (_event, bashPath: string) => {
    try {
      if (!existsSync(bashPath)) {
        return { success: false, error: 'File does not exist at the specified path' }
      }
      if (!bashPath.toLowerCase().endsWith('.exe')) {
        return { success: false, error: 'Path must be an executable (.exe) file' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to validate Git Bash path' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return {
      app: app.getVersion(),
      os: process.platform,
      osVersion: process.getSystemVersion?.() || '',
      arch: process.arch,
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_VERSIONS, () => {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_RELEASE_NOTES, async () => {
    const { getCombinedReleaseNotes } = await import('@agent-operator/shared/release-notes')
    return getCombinedReleaseNotes()
  })

  ipcMain.handle(IPC_CHANNELS.GET_LATEST_RELEASE_VERSION, async () => {
    const { getLatestReleaseVersion } = await import('@agent-operator/shared/release-notes')
    return getLatestReleaseVersion()
  })

  ipcMain.handle(IPC_CHANNELS.GET_FONTS_PATH, () => {
    if (!app.isPackaged) {
      return './resources/fonts'
    }
    return `file://${process.resourcesPath}/fonts`
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    const { openReleaseDownloadsPage, getUpdateInfo } = await import('../auto-update')
    await openReleaseDownloadsPage()
    return getUpdateInfo()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_INFO, async () => {
    const { getUpdateInfo } = await import('../auto-update')
    return getUpdateInfo()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
    const { openReleaseDownloadsPage } = await import('../auto-update')
    return openReleaseDownloadsPage()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_DISMISS, async (_event, version: string) => {
    const { setDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    setDismissedUpdateVersion(version)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_DISMISSED, async () => {
    const { getDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    return getDismissedUpdateVersion()
  })
}
