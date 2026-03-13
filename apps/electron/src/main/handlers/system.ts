import { app } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC_CHANNELS } from '../../shared/types'
import { getBundledResourceDir } from '../resource-paths'
import type { RpcServer } from '../../transport/server'

export function registerSystemGuiHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return {
      app: app.getVersion(),
      os: process.platform,
      osVersion: process.getSystemVersion?.() || '',
      arch: process.arch,
    }
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
