/**
 * Minimal preload script for the Office BrowserWindow.
 * Exposes a single IPC function to let the pixel office UI
 * communicate back to the main process (e.g., focus a session).
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dazi', {
  /**
   * Focus a session in the main window by its pixel agent ID.
   */
  focusSession: (agentId: number) => {
    ipcRenderer.send('office:focus-session', agentId)
  },
})
