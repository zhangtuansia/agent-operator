import { contextBridge, ipcRenderer } from 'electron'
import { buildClientApi } from '../transport/build-api'
import { CHANNEL_MAP } from '../transport/channel-map'

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

contextBridge.exposeInMainWorld('electronAPI', api)
