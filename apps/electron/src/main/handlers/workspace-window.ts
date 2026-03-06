import { BrowserWindow, ipcMain } from 'electron'
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

export function registerWorkspaceWindowHandlers(sessionManager: SessionManager, windowManager: WindowManager): void {
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACES, async () => {
    return sessionManager.getWorkspaces()
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_WORKSPACE, async (_event, folderPath: string, name: string) => {
    const rootPath = folderPath
    const workspace = addWorkspace({ name, rootPath })
    setActiveWorkspace(workspace.id)
    ipcLog.info(`Created workspace "${name}" at ${rootPath}`)
    return workspace
  })

  ipcMain.handle(IPC_CHANNELS.CHECK_WORKSPACE_SLUG, async (_event, slug: string) => {
    const defaultWorkspacesDir = join(CONFIG_DIR, 'workspaces')
    const workspacePath = join(defaultWorkspacesDir, slug)
    const exists = existsSync(workspacePath)
    return { exists, path: workspacePath }
  })

  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_WORKSPACE, (event) => {
    const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
    if (workspaceId) {
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (workspace) {
        sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
      }
    }
    return workspaceId
  })

  ipcMain.handle(IPC_CHANNELS.GET_PENDING_DEEP_LINK, (event) => {
    return windowManager.getPendingDeepLink(event.sender.id)
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_WORKSPACE, async (_event, workspaceId: string) => {
    windowManager.focusOrCreateWindow(workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW, async (_event, workspaceId: string, sessionId: string) => {
    const deepLink = `agentoperator://allChats/chat/${sessionId}`
    windowManager.createWindow({
      workspaceId,
      focused: true,
      initialDeepLink: deepLink,
    })
  })

  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_MODE, () => {
    return 'main'
  })

  ipcMain.handle(IPC_CHANNELS.CLOSE_WINDOW, (event) => {
    windowManager.closeWindow(event.sender.id)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE, (event) => {
    windowManager.forceCloseWindow(event.sender.id)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS, (event, visible: boolean) => {
    windowManager.setTrafficLightsVisible(event.sender.id, visible)
  })

  ipcMain.handle(IPC_CHANNELS.SWITCH_WORKSPACE, async (event, workspaceId: string) => {
    const end = perf.start('ipc.switchWorkspace', { workspaceId })
    const updated = windowManager.updateWindowWorkspace(event.sender.id, workspaceId)

    if (!updated) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        windowManager.registerWindow(win, workspaceId)
        windowLog.info(`Re-registered window ${event.sender.id} for workspace ${workspaceId}`)
      }
    }

    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (workspace) {
      sessionManager.setupConfigWatcher(workspace.rootPath, workspace.id)
    }
    end()
  })
}
