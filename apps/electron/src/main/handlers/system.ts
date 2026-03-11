import { app, BrowserWindow, dialog, nativeTheme, webContents } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC_CHANNELS } from '../../shared/types'
import { getBundledResourceDir } from '../resource-paths'
import type { RpcServer } from '../../transport/server'

function getWindowFromWebContentsId(id: number | undefined): BrowserWindow | null {
  if (!id) return null
  const contents = webContents.fromId(id)
  if (!contents || contents.isDestroyed()) return null
  return BrowserWindow.fromWebContents(contents)
}

export function registerSystemHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.GET_SYSTEM_THEME, () => {
    return nativeTheme.shouldUseDarkColors
  })

  server.handle(IPC_CHANNELS.GET_HOME_DIR, () => {
    return homedir()
  })

  server.handle(IPC_CHANNELS.IS_DEBUG_MODE, () => {
    return !app.isPackaged
  })

  server.handle(IPC_CHANNELS.GITBASH_CHECK, async () => {
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

  server.handle(IPC_CHANNELS.GITBASH_BROWSE, async (ctx) => {
    const window = getWindowFromWebContentsId(ctx.webContentsId)
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

  server.handle(IPC_CHANNELS.GITBASH_SET_PATH, async (_ctx, bashPath: string) => {
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

  server.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return {
      app: app.getVersion(),
      os: process.platform,
      osVersion: process.getSystemVersion?.() || '',
      arch: process.arch,
    }
  })

  server.handle(IPC_CHANNELS.GET_VERSIONS, () => {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    }
  })

  server.handle(IPC_CHANNELS.GET_RELEASE_NOTES, async () => {
    const { getCombinedReleaseNotes } = await import('@agent-operator/shared/release-notes')
    return getCombinedReleaseNotes()
  })

  server.handle(IPC_CHANNELS.GET_LATEST_RELEASE_VERSION, async () => {
    const { getLatestReleaseVersion } = await import('@agent-operator/shared/release-notes')
    return getLatestReleaseVersion()
  })

  server.handle(IPC_CHANNELS.GET_FONTS_PATH, () => {
    const fontsDir = getBundledResourceDir('fonts')
    if (fontsDir) {
      return pathToFileURL(fontsDir).href
    }

    if (!app.isPackaged) {
      return pathToFileURL(join(process.cwd(), 'apps/electron/resources/fonts')).href
    }

    return pathToFileURL(join(process.resourcesPath, 'app/dist/resources/fonts')).href
  })

  server.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    const { openReleaseDownloadsPage, getUpdateInfo } = await import('../auto-update')
    await openReleaseDownloadsPage()
    return getUpdateInfo()
  })

  server.handle(IPC_CHANNELS.UPDATE_GET_INFO, async () => {
    const { getUpdateInfo } = await import('../auto-update')
    return getUpdateInfo()
  })

  server.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
    const { openReleaseDownloadsPage } = await import('../auto-update')
    return openReleaseDownloadsPage()
  })

  server.handle(IPC_CHANNELS.UPDATE_DISMISS, async (_ctx, version: string) => {
    const { setDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    setDismissedUpdateVersion(version)
  })

  server.handle(IPC_CHANNELS.UPDATE_GET_DISMISSED, async () => {
    const { getDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    return getDismissedUpdateVersion()
  })
}
