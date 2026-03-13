import { BrowserWindow, webContents } from 'electron'
import type { WindowManager } from '../window-manager'
import { IPC_CHANNELS } from '../../shared/types'
import { closeTrayPanel, resizeTrayPanel } from '../tray'
import type { RpcServer } from '../../transport/server'

function getWindowFromWebContentsId(id: number | undefined): BrowserWindow | null {
  if (!id) return null
  const contents = webContents.fromId(id)
  if (!contents || contents.isDestroyed()) return null
  return BrowserWindow.fromWebContents(contents)
}

export function registerWorkspaceGuiHandlers(server: RpcServer, windowManager: WindowManager): void {
  server.handle(IPC_CHANNELS.GET_PENDING_DEEP_LINK, (ctx) => {
    return windowManager.getPendingDeepLink(ctx.webContentsId!)
  })

  server.handle(IPC_CHANNELS.OPEN_WORKSPACE, async (_ctx, workspaceId: string) => {
    windowManager.focusOrCreateWindow(workspaceId)
  })

  server.handle(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW, async (_ctx, workspaceId: string, sessionId: string) => {
    const deepLink = `agentoperator://allChats/chat/${sessionId}`
    windowManager.createWindow({
      workspaceId,
      focused: true,
      initialDeepLink: deepLink,
    })
  })

  server.handle(IPC_CHANNELS.CLOSE_WINDOW, (ctx) => {
    const senderId = ctx.webContentsId!
    if (closeTrayPanel(senderId)) {
      return
    }
    if (windowManager.getWorkspaceForWindow(senderId)) {
      windowManager.closeWindow(senderId)
      return
    }
    const win = getWindowFromWebContentsId(senderId)
    if (win && !win.isDestroyed()) {
      win.close()
    }
  })

  server.handle(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE, (ctx) => {
    const senderId = ctx.webContentsId!
    if (closeTrayPanel(senderId)) {
      return
    }
    if (windowManager.getWorkspaceForWindow(senderId)) {
      windowManager.forceCloseWindow(senderId)
      return
    }
    const win = getWindowFromWebContentsId(senderId)
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  })

  server.handle(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS, (_ctx, visible: boolean) => {
    if (_ctx.webContentsId) {
      windowManager.setTrafficLightsVisible(_ctx.webContentsId, visible)
    }
  })

  server.handle(IPC_CHANNELS.WINDOW_SET_TRAY_PANEL_HEIGHT, (ctx, height: number) => {
    return resizeTrayPanel(ctx.webContentsId!, height)
  })
}
