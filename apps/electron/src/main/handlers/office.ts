import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'
import { getOfficeServerUrl, startOfficeServer } from '../office-server'
import { officeAgentBulkSync, getSessionIdForAgent } from '../office-state-bridge'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import { buildOfficeBulkSyncSessions } from './office-session-sync'

let officeWindow: BrowserWindow | null = null
// Reference to the main app window for navigation
let mainWindow: BrowserWindow | null = null

/**
 * Set the main window reference so we can navigate to sessions.
 */
export function setMainWindowRef(win: BrowserWindow): void {
  mainWindow = win
}

/**
 * Dispatch a message event into the office window via executeJavaScript.
 * Bypasses WebSocket (Electron BrowserWindow WebSocket onopen is unreliable).
 */
export function dispatchToOfficeWindow(msg: Record<string, unknown>): void {
  if (!officeWindow || officeWindow.isDestroyed()) return
  const json = JSON.stringify(msg).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  officeWindow.webContents.executeJavaScript(
    `window.dispatchEvent(new MessageEvent('message', { data: JSON.parse('${json}') }));`
  ).catch(() => { /* window may have been destroyed */ })
}

export function registerOfficeHandlers(server: RpcServer, sessionManager?: ISessionManager): void {
  // Handle focus-session IPC from office window preload
  ipcMain.on('office:focus-session', (_event, agentId: number) => {
    const sessionId = getSessionIdForAgent(agentId)
    if (!sessionId) {
      console.log(`[OfficeWindow] No session found for agent ${agentId}`)
      return
    }
    console.log(`[OfficeWindow] Focusing session ${sessionId} (agent ${agentId})`)

    // Send navigation command to main renderer window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus()
      mainWindow.webContents.send(IPC_CHANNELS.OFFICE_NAVIGATE_TO_SESSION, sessionId)
    }
  })

  server.handle(IPC_CHANNELS.OFFICE_GET_SERVER_URL, async () => {
    const existingUrl = getOfficeServerUrl()
    const url = existingUrl || await startOfficeServer()
    if (!url) return null

    const sessions = await buildOfficeBulkSyncSessions(sessionManager)
    officeAgentBulkSync(sessions)

    return url
  })

  server.handle(IPC_CHANNELS.OFFICE_OPEN_WINDOW, async () => {
    // If the office window is already open, focus it
    if (officeWindow && !officeWindow.isDestroyed()) {
      if (officeWindow.isMinimized()) {
        officeWindow.restore()
      }
      officeWindow.focus()
      return
    }

    // Start the office server if not running
    const existingUrl = getOfficeServerUrl()
    const url = existingUrl || await startOfficeServer()
    if (!url) {
      console.warn('[OfficeWindow] Cannot open: office server unavailable')
      return
    }

    // Sync sessions before opening
    const sessions = await buildOfficeBulkSyncSessions(sessionManager)
    officeAgentBulkSync(sessions)

    const isMac = process.platform === 'darwin'

    officeWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      title: '办公室 - DAZI',
      autoHideMenuBar: true,
      ...(isMac && {
        titleBarStyle: 'default',
        vibrancy: 'under-window',
        visualEffectState: 'active',
      }),
      webPreferences: {
        contextIsolation: false, // Allow injecting window.dazi
        nodeIntegration: false,
      },
    })

    // Inject the dazi bridge API via executeJavaScript
    // Since contextIsolation is false, we can use ipcRenderer directly
    officeWindow.webContents.on('did-finish-load', () => {
      officeWindow?.webContents.executeJavaScript(`
        try {
          var ipcRenderer = require('electron').ipcRenderer;
          window.dazi = {
            focusSession: function(agentId) {
              ipcRenderer.send('office:focus-session', agentId);
            }
          };
          console.log('[DAZI] Bridge API injected (ipcRenderer)');
        } catch(e) {
          // Fallback: use fetch to server
          window.dazi = {
            focusSession: function(agentId) {
              console.log('[DAZI] focusSession fallback: ' + agentId);
            }
          };
          console.log('[DAZI] Bridge API injected (fallback)');
        }
      `).catch(() => {})
    })

    // Capture console messages from the office window for debugging
    officeWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 1) {
        const prefix = ['[OfficeUI:V]', '[OfficeUI:I]', '[OfficeUI:W]', '[OfficeUI:E]'][level] || '[OfficeUI]'
        console.log(`${prefix} ${message}`)
      }
    })

    officeWindow.loadURL(`${url}/?desktop=1`)

    officeWindow.once('ready-to-show', () => {
      officeWindow?.show()
      // After UI is fully loaded, inject existing agents via executeJavaScript
      setTimeout(async () => {
        if (!officeWindow || officeWindow.isDestroyed()) return
        try {
          const http = await import('http')
          const data = await new Promise<string>((resolve, reject) => {
            http.get(`${url}/api/health`, (res: any) => {
              let d = ''
              res.on('data', (c: string) => d += c)
              res.on('end', () => resolve(d))
            }).on('error', reject)
          })
          const health = JSON.parse(data)
          if (health.agents > 0) {
            const agentIds = Array.from({ length: health.agents }, (_, i) => i + 1)
            console.log(`[OfficeWindow] Injecting ${health.agents} agents`)
            dispatchToOfficeWindow({
              type: 'existingAgents',
              agents: agentIds,
              agentMeta: {},
              folderNames: {},
            })
          }
        } catch (e) {
          console.error('[OfficeWindow] Failed to inject agents:', e)
        }
      }, 2000)
    })

    officeWindow.on('closed', () => {
      officeWindow = null
      console.log('[OfficeWindow] Closed')
    })

    console.log(`[OfficeWindow] Opened at ${url}`)
  })
}

/**
 * Check if the office window is currently open.
 */
export function isOfficeWindowOpen(): boolean {
  return officeWindow != null && !officeWindow.isDestroyed()
}
