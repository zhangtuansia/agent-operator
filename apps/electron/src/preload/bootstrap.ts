import { contextBridge, ipcRenderer } from 'electron'
import { buildClientApi } from '../transport/build-api'
import { WsRpcClient } from '../transport/client'
import { CHANNEL_MAP } from '../transport/channel-map'
import { shouldUseWsChannel } from '../transport/ws-channels'
import { BROWSER_TOOLBAR_CHANNELS, IPC_CHANNELS } from '../shared/types'
import type { ElectronAPI } from '../shared/types'

const wsPort = ipcRenderer.sendSync('__get-ws-port') as number
const wsToken = ipcRenderer.sendSync('__get-ws-token') as string
const webContentsId = ipcRenderer.sendSync('__get-web-contents-id') as number
const workspaceFromQuery = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('workspaceId') || ''
  : ''
const workspaceId = workspaceFromQuery || (ipcRenderer.sendSync('__get-workspace-id') as string)

const wsClient = new WsRpcClient(`ws://127.0.0.1:${wsPort}`, {
  token: wsToken,
  webContentsId,
  workspaceId,
  autoReconnect: true,
})

void wsClient.connect().catch(() => {})

const api = buildClientApi(
  {
    invoke: (channel, ...args) => {
      if (shouldUseWsChannel(channel)) {
        return wsClient.invoke(channel, ...args)
      }
      return ipcRenderer.invoke(channel, ...args)
    },
    on: (channel, callback) => {
      if (shouldUseWsChannel(channel)) {
        return wsClient.on(channel, (...args) => callback(...args))
      }
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
  CHANNEL_MAP,
)

function exposeBrowserToolbarApi(): void {
  const instanceId = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('instanceId') || ''
    : ''

  const invokeTransport = (channel: string, ...args: unknown[]) => {
    if (shouldUseWsChannel(channel)) {
      return wsClient.invoke(channel, ...args)
    }
    return ipcRenderer.invoke(channel, ...args)
  }

  contextBridge.exposeInMainWorld('browserToolbar', {
    instanceId,
    navigate: (url: string) => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.NAVIGATE, instanceId, url),
    goBack: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.GO_BACK, instanceId),
    goForward: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.GO_FORWARD, instanceId),
    reload: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.RELOAD, instanceId),
    stop: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.STOP, instanceId),
    getLanguage: () => invokeTransport(IPC_CHANNELS.LANGUAGE_GET) as Promise<'en' | 'zh' | null>,
    setMenuGeometry: (open: boolean, height = 0) => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY, instanceId, open, height),
    hideWindow: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.HIDE, instanceId),
    closeWindowEntirely: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.DESTROY, instanceId),
    onStateUpdate: (callback: (state: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
      ipcRenderer.on(BROWSER_TOOLBAR_CHANNELS.STATE_UPDATE, handler)
      return () => ipcRenderer.removeListener(BROWSER_TOOLBAR_CHANNELS.STATE_UPDATE, handler)
    },
    onThemeColor: (callback: (color: string | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, color: string | null) => callback(color)
      ipcRenderer.on(BROWSER_TOOLBAR_CHANNELS.THEME_COLOR, handler)
      return () => ipcRenderer.removeListener(BROWSER_TOOLBAR_CHANNELS.THEME_COLOR, handler)
    },
    onForceCloseMenu: (callback: (payload: { reason?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { reason?: string }) => callback(payload)
      ipcRenderer.on(BROWSER_TOOLBAR_CHANNELS.FORCE_CLOSE_MENU, handler)
      return () => ipcRenderer.removeListener(BROWSER_TOOLBAR_CHANNELS.FORCE_CLOSE_MENU, handler)
    },
  })
}

contextBridge.exposeInMainWorld('electronAPI', api as ElectronAPI)
exposeBrowserToolbarApi()
