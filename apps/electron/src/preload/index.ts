import { contextBridge, ipcRenderer } from 'electron'
import { buildClientApi } from '../transport/build-api'
import { CHANNEL_MAP } from '../transport/channel-map'
import { BROWSER_TOOLBAR_CHANNELS, IPC_CHANNELS } from '../shared/types'
import type {
  BrowserClickOptions,
  BrowserConsoleLevel,
  BrowserConsoleEntry,
  BrowserInstanceInfo,
  BrowserKeyOptions,
  BrowserNetworkEntry,
  BrowserNetworkState,
  BrowserPaneAPI,
  BrowserPaneCreateOptions,
  BrowserScrollOptions,
  BrowserScreenshotOptions,
  BrowserWaitOptions,
  ElectronAPI,
} from '../shared/types'

const api = buildClientApi(
  {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, callback) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
  CHANNEL_MAP,
)

function addBrowserPaneApi(target: ElectronAPI): ElectronAPI {
  const subscribe = <T,>(channel: string, callback: (payload: T) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

  const browserPane: BrowserPaneAPI = {
    create: (input?: string | BrowserPaneCreateOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_CREATE, input),
    destroy: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_DESTROY, id),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_LIST) as Promise<BrowserInstanceInfo[]>,
    navigate: (id: string, url: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_NAVIGATE, id, url),
    goBack: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_GO_BACK, id),
    goForward: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD, id),
    reload: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_RELOAD, id),
    stop: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_STOP, id),
    focus: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_FOCUS, id),
    snapshot: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_SNAPSHOT, id),
    click: (id: string, ref: string, options?: BrowserClickOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_CLICK, id, ref, options),
    clickAt: (id: string, x: number, y: number) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_CLICK_AT, id, x, y),
    drag: (id: string, x1: number, y1: number, x2: number, y2: number) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_DRAG, id, x1, y1, x2, y2),
    fill: (id: string, ref: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_FILL, id, ref, value),
    select: (id: string, ref: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_SELECT, id, ref, value),
    upload: (id: string, ref: string, filePaths: string[]) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_UPLOAD, id, ref, filePaths),
    type: (id: string, text: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_TYPE, id, text),
    key: (id: string, key: string, options?: BrowserKeyOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_KEY, id, key, options),
    screenshot: (id: string, options?: BrowserScreenshotOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_SCREENSHOT, id, options),
    evaluate: (id: string, expression: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_EVALUATE, id, expression),
    scroll: (id: string, options?: BrowserScrollOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_SCROLL, id, options),
    wait: (id: string, options: BrowserWaitOptions) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_WAIT, id, options),
    console: (id: string, limit?: number, level?: BrowserConsoleLevel | 'all') => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_CONSOLE, id, limit, level) as Promise<BrowserConsoleEntry[]>,
    network: (id: string, limit?: number, state?: BrowserNetworkState | 'all') => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_NETWORK, id, limit, state) as Promise<BrowserNetworkEntry[]>,
    setClipboard: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_SET_CLIPBOARD, text),
    getClipboard: () => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_GET_CLIPBOARD),
    paste: (id: string, text: string) => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_PANE_PASTE, id, text),
    onStateChanged: (callback) => subscribe(IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED, callback),
    onRemoved: (callback) => subscribe(IPC_CHANNELS.BROWSER_PANE_REMOVED, callback),
    onInteracted: (callback) => subscribe(IPC_CHANNELS.BROWSER_PANE_INTERACTED, callback),
  }

  return Object.assign(target, { browserPane })
}

function exposeBrowserToolbarApi(): void {
  const instanceId = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('instanceId') || ''
    : ''

  contextBridge.exposeInMainWorld('browserToolbar', {
    instanceId,
    navigate: (url: string) => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.NAVIGATE, instanceId, url),
    goBack: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.GO_BACK, instanceId),
    goForward: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.GO_FORWARD, instanceId),
    reload: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.RELOAD, instanceId),
    stop: () => ipcRenderer.invoke(BROWSER_TOOLBAR_CHANNELS.STOP, instanceId),
    getLanguage: () => ipcRenderer.invoke(IPC_CHANNELS.LANGUAGE_GET) as Promise<'en' | 'zh' | null>,
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

contextBridge.exposeInMainWorld('electronAPI', addBrowserPaneApi(api as ElectronAPI))
exposeBrowserToolbarApi()
