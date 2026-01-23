import { Menu, app, shell, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { WindowManager } from './window-manager'
import { mainLog } from './logger'

// Store reference for rebuilding menu
let cachedWindowManager: WindowManager | null = null

// Hidden developer mode - activated by clicking version info 5 times
let developerModeEnabled = false
let versionClickCount = 0
let lastVersionClickTime = 0
const VERSION_CLICK_THRESHOLD = 5
const VERSION_CLICK_TIMEOUT = 3000 // 3 seconds to complete the clicks

/**
 * Check if developer mode is enabled
 */
export function isDeveloperMode(): boolean {
  return developerModeEnabled || !app.isPackaged
}

/**
 * Handle version click for hidden developer mode activation
 */
function handleVersionClick(): void {
  const now = Date.now()

  // Reset count if too much time has passed
  if (now - lastVersionClickTime > VERSION_CLICK_TIMEOUT) {
    versionClickCount = 0
  }

  lastVersionClickTime = now
  versionClickCount++

  if (versionClickCount >= VERSION_CLICK_THRESHOLD && !developerModeEnabled) {
    developerModeEnabled = true
    mainLog.info('[menu] Developer mode enabled!')

    // Show notification
    const { dialog } = require('electron')
    dialog.showMessageBox({
      type: 'info',
      title: 'Developer Mode',
      message: 'Developer mode enabled!',
      detail: 'You can now use Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) to open DevTools.',
      buttons: ['OK']
    })

    // Rebuild menu to show dev options
    rebuildMenu()
  }
}

/**
 * Creates and sets the application menu for macOS.
 * Includes only relevant items for the Cowork app.
 *
 * Call rebuildMenu() when update state changes to refresh the menu.
 */
export function createApplicationMenu(windowManager: WindowManager): void {
  cachedWindowManager = windowManager
  rebuildMenu()
}

/**
 * Rebuilds the application menu with current update state.
 * Call this when update availability changes.
 */
export async function rebuildMenu(): Promise<void> {
  if (!cachedWindowManager) return

  const windowManager = cachedWindowManager
  const isMac = process.platform === 'darwin'

  // Get current update state
  const { getUpdateInfo, installUpdate, checkForUpdates } = await import('./auto-update')
  const updateInfo = getUpdateInfo()
  const updateReady = updateInfo.available && updateInfo.downloadState === 'ready'

  // Build the update menu item based on state
  const updateMenuItem: Electron.MenuItemConstructorOptions = updateReady
    ? {
        label: `Install Update…\t【${updateInfo.latestVersion}】`,
        click: async () => {
          await installUpdate()
        }
      }
    : {
        label: 'Check for Updates…',
        click: async () => {
          await checkForUpdates({ autoDownload: true })
        }
      }

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: 'Cowork',
      submenu: [
        { role: 'about' as const, label: 'About Cowork' },
        updateMenuItem,
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer(IPC_CHANNELS.MENU_OPEN_SETTINGS)
        },
        { type: 'separator' as const },
        { role: 'hide' as const, label: 'Hide Cowork' },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const, label: 'Quit Cowork' }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer(IPC_CHANNELS.MENU_NEW_CHAT)
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow()
            if (focused) {
              const workspaceId = windowManager.getWorkspaceForWindow(focused.webContents.id)
              if (workspaceId) {
                windowManager.createWindow({ workspaceId })
              }
            }
          }
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit menu (standard roles for text editing)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { role: 'resetZoom' as const },
        // Dev tools in development OR when developer mode is enabled
        ...(isDeveloperMode() ? [
          { type: 'separator' as const },
          { role: 'reload' as const },
          { role: 'forceReload' as const },
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const }
        ] : [])
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const }
        ] : [])
      ]
    },

    // Debug menu (development or developer mode)
    ...(isDeveloperMode() ? [{
      label: 'Debug',
      submenu: [
        {
          label: 'Check for Updates',
          click: async () => {
            const { checkForUpdates } = await import('./auto-update')
            const info = await checkForUpdates({ autoDownload: false })
            mainLog.info('[debug-menu] Update check result:', info)
          }
        },
        {
          label: 'Download Update',
          click: async () => {
            const { downloadUpdate } = await import('./auto-update')
            try {
              await downloadUpdate()
              mainLog.info('[debug-menu] Download complete')
            } catch (err) {
              mainLog.error('[debug-menu] Download failed:', err)
            }
          }
        },
        {
          label: 'Install Update',
          click: async () => {
            const { installUpdate } = await import('./auto-update')
            try {
              await installUpdate()
            } catch (err) {
              mainLog.error('[debug-menu] Install failed:', err)
            }
          }
        },
        { type: 'separator' as const },
        {
          label: 'Reset to Defaults...',
          click: async () => {
            const { dialog } = await import('electron')
            await dialog.showMessageBox({
              type: 'info',
              message: 'Reset to Defaults',
              detail: 'To reset Cowork to defaults, quit the app and run:\n\nbun run fresh-start\n\nThis will delete all configuration, credentials, workspaces, and sessions.',
              buttons: ['OK']
            })
          }
        }
      ]
    }] : []),

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => sendToRenderer(IPC_CHANNELS.MENU_KEYBOARD_SHORTCUTS)
        },
        { type: 'separator' as const },
        {
          label: `Version ${app.getVersion()}`,
          click: handleVersionClick
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Sends an IPC message to the focused renderer window.
 */
function sendToRenderer(channel: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel)
  }
}
