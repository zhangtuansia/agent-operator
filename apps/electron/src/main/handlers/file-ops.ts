import { BrowserWindow, webContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ipcLog } from '../logger'
import type { WindowManager } from '../window-manager'
import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'

interface FileOpsHandlerOptions {
  validateFilePath: (path: string) => Promise<string>
  applyFileOpsRateLimit: (channel: string) => void
}

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.READ_FILE_OPTIONAL,
  IPC_CHANNELS.MENU_UNDO,
  IPC_CHANNELS.MENU_REDO,
  IPC_CHANNELS.MENU_CUT,
  IPC_CHANNELS.MENU_COPY,
  IPC_CHANNELS.MENU_PASTE,
  IPC_CHANNELS.MENU_SELECT_ALL,
  IPC_CHANNELS.MENU_ZOOM_IN,
  IPC_CHANNELS.MENU_ZOOM_OUT,
  IPC_CHANNELS.MENU_ZOOM_RESET,
  IPC_CHANNELS.MENU_MINIMIZE,
  IPC_CHANNELS.MENU_MAXIMIZE,
  IPC_CHANNELS.MENU_NEW_WINDOW_ACTION,
] as const

function getWebContentsFromId(id: number | undefined) {
  if (!id) return null
  const contents = webContents.fromId(id)
  if (!contents || contents.isDestroyed()) return null
  return contents
}

export function registerFileOpsHandlers(
  server: RpcServer,
  windowManager: WindowManager,
  options: FileOpsHandlerOptions,
): void {
  server.handle(IPC_CHANNELS.READ_FILE_OPTIONAL, async (_ctx, path: string) => {
    options.applyFileOpsRateLimit('READ_FILE_OPTIONAL')

    try {
      const safePath = await options.validateFilePath(path)
      return await readFile(safePath, 'utf-8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('readFileOptional error:', message)
      throw new Error(`Failed to read file: ${message}`)
    }
  })

  server.handle(IPC_CHANNELS.MENU_UNDO, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.undo() })
  server.handle(IPC_CHANNELS.MENU_REDO, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.redo() })
  server.handle(IPC_CHANNELS.MENU_CUT, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.cut() })
  server.handle(IPC_CHANNELS.MENU_COPY, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.copy() })
  server.handle(IPC_CHANNELS.MENU_PASTE, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.paste() })
  server.handle(IPC_CHANNELS.MENU_SELECT_ALL, (ctx) => { getWebContentsFromId(ctx.webContentsId)?.selectAll() })

  server.handle(IPC_CHANNELS.MENU_ZOOM_IN, (ctx) => {
    const contents = getWebContentsFromId(ctx.webContentsId)
    if (!contents) return
    const level = contents.getZoomLevel()
    contents.setZoomLevel(level + 0.5)
  })
  server.handle(IPC_CHANNELS.MENU_ZOOM_OUT, (ctx) => {
    const contents = getWebContentsFromId(ctx.webContentsId)
    if (!contents) return
    const level = contents.getZoomLevel()
    contents.setZoomLevel(level - 0.5)
  })
  server.handle(IPC_CHANNELS.MENU_ZOOM_RESET, (ctx) => {
    getWebContentsFromId(ctx.webContentsId)?.setZoomLevel(0)
  })

  server.handle(IPC_CHANNELS.MENU_MINIMIZE, () => {
    const window = BrowserWindow.getFocusedWindow()
    window?.minimize()
  })
  server.handle(IPC_CHANNELS.MENU_MAXIMIZE, () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  server.handle(IPC_CHANNELS.MENU_NEW_WINDOW_ACTION, () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return

    const workspaceId = windowManager.getWorkspaceForWindow(focused.webContents.id)
    if (workspaceId) {
      windowManager.createWindow({ workspaceId })
    }
  })
}
