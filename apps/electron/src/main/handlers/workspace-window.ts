import { BrowserWindow, webContents } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addWorkspace,
  CONFIG_DIR,
  getWorkspaceByNameOrId,
  setActiveWorkspace,
} from '@agent-operator/shared/config'
import { perf } from '@agent-operator/shared/utils'
import { ipcLog, windowLog } from '../logger'
import type { SessionManager } from '../sessions'
import type { WindowManager } from '../window-manager'
import { IPC_CHANNELS } from '../../shared/types'
import { closeTrayPanel, getTrayPanelWorkspace, getTrayWindowMode, resizeTrayPanel } from '../tray'
import type { RpcServer } from '../../transport/server'

function getWindowFromWebContentsId(id: number | undefined): BrowserWindow | null {
  if (!id) return null
  const contents = webContents.fromId(id)
  if (!contents || contents.isDestroyed()) return null
  return BrowserWindow.fromWebContents(contents)
}

export function registerWorkspaceWindowHandlers(server: RpcServer, sessionManager: SessionManager, windowManager: WindowManager): void {
  server.handle(IPC_CHANNELS.GET_WORKSPACES, async () => {
    return sessionManager.getWorkspaces()
  })

  server.handle(IPC_CHANNELS.CREATE_WORKSPACE, async (_ctx, folderPath: string, name: string) => {
    const rootPath = folderPath
    const workspace = addWorkspace({ name, rootPath })
    setActiveWorkspace(workspace.id)
    ipcLog.info(`Created workspace "${name}" at ${rootPath}`)
    return workspace
  })

  server.handle(IPC_CHANNELS.CHECK_WORKSPACE_SLUG, async (_ctx, slug: string) => {
    const defaultWorkspacesDir = join(CONFIG_DIR, 'workspaces')
    const workspacePath = join(defaultWorkspacesDir, slug)
    const exists = existsSync(workspacePath)
    return { exists, path: workspacePath }
  })

  server.handle(IPC_CHANNELS.GET_WINDOW_WORKSPACE, (ctx) => {
    const senderId = ctx.webContentsId
    const workspaceId = windowManager.getWorkspaceForWindow(senderId!) ?? getTrayPanelWorkspace(senderId!)
    if (workspaceId) {
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (workspace) {
        sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
      }
    }
    return workspaceId
  })

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

  server.handle(IPC_CHANNELS.GET_WINDOW_MODE, (ctx) => {
    return getTrayWindowMode(ctx.webContentsId!) ?? 'main'
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

  server.handle(IPC_CHANNELS.SWITCH_WORKSPACE, async (ctx, workspaceId: string) => {
    const end = perf.start('ipc.switchWorkspace', { workspaceId })
    const senderId = ctx.webContentsId!
    const updated = windowManager.updateWindowWorkspace(senderId, workspaceId)

    if (!updated) {
      const win = getWindowFromWebContentsId(senderId)
      if (win) {
        windowManager.registerWindow(win, workspaceId)
        windowLog.info(`Re-registered window ${senderId} for workspace ${workspaceId}`)
      }
    }

    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (workspace) {
      sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
    }
    end()
  })
}
