import '@sentry/electron/preload'
import { contextBridge, ipcRenderer, shell } from 'electron'
import {
  CLIENT_CONFIRM_DIALOG,
  CLIENT_OPEN_EXTERNAL,
  CLIENT_OPEN_FILE_DIALOG,
  CLIENT_OPEN_PATH,
  CLIENT_SHOW_IN_FOLDER,
  LOCAL_CLIENT_CAPABILITIES,
  type ConfirmDialogSpec,
  type FileDialogSpec,
} from '@agent-operator/server-core/transport/capabilities'
import type { ElectronAPI } from '../shared/types'
import { BROWSER_TOOLBAR_CHANNELS, IPC_CHANNELS } from '../shared/types'
import { buildClientApi } from '../transport/build-api'
import { WsRpcClient, type TransportConnectionState } from '../transport/client'
import { CHANNEL_MAP } from '../transport/channel-map'
import { shouldUseWsChannel } from '../transport/ws-channels'

function getFirstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

let wsUrl: string
let wsToken: string
let webContentsId: number
let workspaceId: string
let wsMode: 'local' | 'remote'

function isDeepLinkUrl(url: string): boolean {
  return url.startsWith('agentoperator://') || url.startsWith('dazi://')
}

function normalizeDeepLinkUrl(url: string): string {
  return url.startsWith('dazi://') ? `agentoperator://${url.slice('dazi://'.length)}` : url
}

const remoteServerUrl = getFirstEnv('DAZI_SERVER_URL', 'COWORK_SERVER_URL', 'CRAFT_SERVER_URL')
const remoteServerToken = getFirstEnv('DAZI_SERVER_TOKEN', 'COWORK_SERVER_TOKEN', 'CRAFT_SERVER_TOKEN')
const remoteWorkspaceId = getFirstEnv('DAZI_WORKSPACE_ID', 'COWORK_WORKSPACE_ID', 'CRAFT_WORKSPACE_ID')

if (remoteServerUrl) {
  wsMode = 'remote'
  wsUrl = remoteServerUrl
  wsToken = remoteServerToken ?? ''
  webContentsId = ipcRenderer.sendSync('__get-web-contents-id') as number
  workspaceId = remoteWorkspaceId || (ipcRenderer.sendSync('__get-workspace-id') as string)

  const parsed = new URL(wsUrl)
  const isLocalhost = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '::1'
  if (parsed.protocol === 'ws:' && !isLocalhost) {
    throw new Error(
      'Refusing to connect to remote server over unencrypted ws://. Use wss:// for non-localhost connections.',
    )
  }
} else {
  wsMode = 'local'
  const wsPort = ipcRenderer.sendSync('__get-ws-port') as number
  wsUrl = `ws://127.0.0.1:${wsPort}`
  wsToken = (ipcRenderer.sendSync('__get-ws-token') as string) || ''
  webContentsId = ipcRenderer.sendSync('__get-web-contents-id') as number
  const workspaceFromQuery = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('workspaceId') || ''
    : ''
  workspaceId = workspaceFromQuery || (ipcRenderer.sendSync('__get-workspace-id') as string)
}

const client = new WsRpcClient(wsUrl, {
  token: wsToken,
  workspaceId,
  webContentsId,
  autoReconnect: true,
  mode: wsMode,
  clientCapabilities: [...LOCAL_CLIENT_CAPABILITIES],
})

client.handleCapability(CLIENT_OPEN_EXTERNAL, async (url: string) => {
  if (isDeepLinkUrl(url)) {
    await ipcRenderer.invoke('__deeplink:open', normalizeDeepLinkUrl(url))
    return
  }
  await shell.openExternal(url)
})
client.handleCapability(CLIENT_OPEN_PATH, async (path: string) => {
  const error = await shell.openPath(path)
  return { error: error || undefined }
})
client.handleCapability(CLIENT_SHOW_IN_FOLDER, (path: string) => {
  shell.showItemInFolder(path)
})
client.handleCapability(CLIENT_CONFIRM_DIALOG, async (spec: ConfirmDialogSpec) => {
  return await ipcRenderer.invoke('__dialog:showMessageBox', spec)
})
client.handleCapability(CLIENT_OPEN_FILE_DIALOG, async (spec: FileDialogSpec) => {
  return await ipcRenderer.invoke('__dialog:showOpenDialog', spec)
})

client.connect()

const WS_INVOKE_CHANNELS = new Set(
  Object.values(CHANNEL_MAP)
    .filter((entry): entry is Extract<(typeof CHANNEL_MAP)[keyof typeof CHANNEL_MAP], { type: 'invoke' }> => entry.type === 'invoke')
    .map(entry => entry.channel),
)

function useWsInvokeChannel(channel: string): boolean {
  return wsMode === 'remote' || WS_INVOKE_CHANNELS.has(channel)
}

function useWsChannel(channel: string): boolean {
  return wsMode === 'remote' || shouldUseWsChannel(channel)
}

const api = buildClientApi(
  {
    invoke: (channel, ...args) => {
      if (useWsInvokeChannel(channel)) {
        return client.invoke(channel, ...args)
      }
      return ipcRenderer.invoke(channel, ...args)
    },
    on: (channel, callback) => {
      if (useWsChannel(channel)) {
        return client.on(channel, (...args) => callback(...args))
      }
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
  CHANNEL_MAP,
  (channel) => useWsInvokeChannel(channel) ? client.isChannelAvailable(channel) : true,
)

function formatTransportReason(state: TransportConnectionState): string {
  const err = state.lastError
  if (err) {
    const codePart = err.code ? ` [${err.code}]` : ''
    return `${err.kind}${codePart}: ${err.message}`
  }
  if (state.lastClose?.code != null) {
    const reason = state.lastClose.reason ? ` (${state.lastClose.reason})` : ''
    return `close ${state.lastClose.code}${reason}`
  }
  return 'no additional details'
}

if (wsMode === 'remote') {
  client.onConnectionStateChanged((state) => {
    const emitToMain = (level: 'info' | 'warn' | 'error', message: string) => {
      ipcRenderer.send('__transport:status', {
        level,
        message,
        status: state.status,
        attempt: state.attempt,
        nextRetryInMs: state.nextRetryInMs,
        error: state.lastError,
        close: state.lastClose,
        url: state.url,
      })
    }

    if (state.status === 'connected') {
      const message = `[transport] connected to ${state.url}`
      console.info(message)
      emitToMain('info', message)
      return
    }

    if (state.status === 'reconnecting') {
      const retry = state.nextRetryInMs != null ? ` retry in ${state.nextRetryInMs}ms` : ''
      const message = `[transport] reconnecting (attempt ${state.attempt})${retry} - ${formatTransportReason(state)}`
      console.warn(message)
      emitToMain('warn', message)
      return
    }

    if (state.status === 'failed' || state.status === 'disconnected') {
      const message = `[transport] ${state.status} - ${formatTransportReason(state)}`
      console.error(message)
      emitToMain('error', message)
    }
  })
}

;(api as ElectronAPI).getTransportConnectionState = async () => client.getConnectionState()
;(api as ElectronAPI).onTransportConnectionStateChanged = (
  callback: (state: TransportConnectionState) => void,
) => client.onConnectionStateChanged(callback)
;(api as ElectronAPI).reconnectTransport = async () => {
  client.reconnectNow()
}

;(api as ElectronAPI).performOAuth = async (args: {
  sourceSlug: string
  sessionId?: string
  authRequestId?: string
}): Promise<{ success: boolean; error?: string; email?: string }> => {
  return await ipcRenderer.invoke('__oauth:performFlow', {
    ...args,
    workspaceId,
    mode: wsMode,
  })
}

;(api as ElectronAPI).startClaudeOAuth = async (): Promise<{
  success: boolean
  authUrl?: string
  error?: string
}> => {
  try {
    const result = await client.invoke(IPC_CHANNELS.ONBOARDING_START_CLAUDE_OAUTH)
    if (result.success && result.authUrl) {
      await shell.openExternal(result.authUrl)
    }
    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Claude OAuth failed',
    }
  }
}

;(api as ElectronAPI).startChatGptOAuth = async (
  connectionSlug: string,
): Promise<{ success: boolean; error?: string }> => {
  return await ipcRenderer.invoke('__oauth:performChatGptFlow', {
    connectionSlug,
    mode: wsMode,
  })
}

;(api as ElectronAPI).cancelChatGptOAuth = async (): Promise<{ success: boolean }> => {
  return await ipcRenderer.invoke('__oauth:cancelChatGptFlow')
}

function exposeBrowserToolbarApi(): void {
  const instanceId = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('instanceId') || ''
    : ''

  const invokeTransport = (channel: string, ...args: unknown[]) => {
    if (useWsChannel(channel)) {
      return client.invoke(channel, ...args)
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
