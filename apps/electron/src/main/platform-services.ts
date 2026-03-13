import { app, nativeImage, nativeTheme, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import type { PlatformServices } from '@agent-operator/server-core/runtime/platform'
import { getLogFilePath, isDebugMode, mainLog } from './logger'

async function loadImage(input: Buffer | string) {
  const buffer = typeof input === 'string' ? await readFile(input) : input
  return nativeImage.createFromBuffer(buffer)
}

export function createElectronPlatformServices(): PlatformServices {
  return {
    appRootPath: app.isPackaged ? app.getAppPath() : process.cwd(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    appLocale: () => app.getLocale(),
    imageProcessor: {
      async getMetadata(buffer: Buffer) {
        try {
          const image = nativeImage.createFromBuffer(buffer)
          if (image.isEmpty()) return null
          const size = image.getSize()
          return { width: size.width, height: size.height }
        } catch {
          return null
        }
      },
      async process(input, opts = {}) {
        const image = await loadImage(input)
        if (image.isEmpty()) {
          throw new Error('Invalid image input')
        }

        let processed = image
        if (opts.resize) {
          processed = processed.resize({
            width: opts.resize.width,
            height: opts.resize.height,
          })
        }

        if (opts.format === 'jpeg') {
          return processed.toJPEG(Math.max(1, Math.min(100, opts.quality ?? 90)))
        }

        return processed.toPNG()
      },
    },
    openPath: async (path: string) => {
      const error = await shell.openPath(path)
      if (error) {
        throw new Error(error)
      }
    },
    openExternal: async (url: string) => {
      await shell.openExternal(url)
    },
    showItemInFolder: (path: string) => {
      shell.showItemInFolder(path)
    },
    quit: () => app.quit(),
    systemDarkMode: () => nativeTheme.shouldUseDarkColors,
    logger: mainLog,
    isDebugMode,
    getLogFilePath,
  }
}
