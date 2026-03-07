import { BrowserWindow, Menu, Tray, app, nativeImage, screen, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getWorkspaces } from '@agent-operator/shared/config'
import type { WindowManager } from './window-manager'
import { loadWindowState } from './window-state'
import { mainLog } from './logger'
import { createGhostTrayFrames, GHOST_TRAY_FRAME_INTERVAL_MS } from './tray-ghost'

let tray: Tray | null = null
let trayAnimationTimer: ReturnType<typeof setInterval> | null = null
let trayPanelWindow: BrowserWindow | null = null
let trayPanelWorkspaceId: string | null = null
let isDestroyingTrayWindows = false
let trayPanelHeight = 156

const MAC_TRAY_ICON_SIZE = 18
const TRAY_PANEL_WIDTH = 560
const TRAY_PANEL_BASE_HEIGHT = 156
const TRAY_PANEL_MAX_HEIGHT = 320
const TRAY_PANEL_MARGIN = 14
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function getTrayIconPaths(): string[] {
  const resourcesDir = join(__dirname, '../resources')
  const candidates = ['tray-icon.png', 'tray-icon.svg', 'icon.png']
  return candidates
    .map(candidate => join(resourcesDir, candidate))
    .filter(candidate => existsSync(candidate))
}

function createTrayIcon() {
  const trayIconPaths = getTrayIconPaths()
  if (trayIconPaths.length === 0) {
    mainLog.warn('[tray] No tray icon resource found')
    return null
  }

  for (const trayIconPath of trayIconPaths) {
    const image = nativeImage.createFromPath(trayIconPath)
    if (image.isEmpty()) {
      mainLog.warn('[tray] Tray icon failed to load from path:', trayIconPath)
      continue
    }

    const trayImage = process.platform === 'darwin'
      ? image.resize({ width: MAC_TRAY_ICON_SIZE, height: MAC_TRAY_ICON_SIZE, quality: 'best' })
      : image

    // Keep the brand colors instead of forcing macOS template tinting.
    trayImage.setTemplateImage(false)

    return trayImage
  }

  return null
}

function getDefaultWorkspaceId(): string {
  const workspaces = getWorkspaces()
  if (workspaces.length === 0) {
    return ''
  }

  const savedState = loadWindowState()
  const lastFocusedWorkspaceId = savedState?.lastFocusedWorkspaceId
  if (lastFocusedWorkspaceId && workspaces.some(workspace => workspace.id === lastFocusedWorkspaceId)) {
    return lastFocusedWorkspaceId
  }

  return workspaces[0].id
}

function getTrayPanelUrl(workspaceId: string): string {
  const query = new URLSearchParams({
    workspaceId,
    windowMode: 'tray',
  }).toString()

  return VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}?${query}`
    : query
}

function showOrCreateMainWindow(windowManager: WindowManager): void {
  const existingWindow = windowManager.getLastActiveWindow()
  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore()
    }
    existingWindow.show()
    existingWindow.focus()
    app.focus({ steal: true })
    return
  }

  windowManager.createWindow({ workspaceId: getDefaultWorkspaceId() })
}

function createWorkspaceWindow(windowManager: WindowManager): void {
  const existingWindow = windowManager.getLastActiveWindow()
  const workspaceId = existingWindow
    ? windowManager.getWorkspaceForWindow(existingWindow.webContents.id) ?? getDefaultWorkspaceId()
    : getDefaultWorkspaceId()

  windowManager.createWindow({ workspaceId })
}

function clampTrayPanelHeight(targetHeight: number, workAreaHeight?: number): number {
  const displayMaxHeight = workAreaHeight ? Math.max(TRAY_PANEL_BASE_HEIGHT, workAreaHeight - TRAY_PANEL_MARGIN * 2) : TRAY_PANEL_MAX_HEIGHT
  return Math.max(TRAY_PANEL_BASE_HEIGHT, Math.min(Math.round(targetHeight), Math.min(TRAY_PANEL_MAX_HEIGHT, displayMaxHeight)))
}

function positionTrayPanel(window: BrowserWindow, targetHeight = trayPanelHeight): void {
  if (!tray) return

  const trayBounds = tray.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  })
  const { x, y, width, height } = display.workArea
  const panelWidth = Math.min(TRAY_PANEL_WIDTH, width - TRAY_PANEL_MARGIN * 2)
  const panelHeight = clampTrayPanelHeight(targetHeight, height)
  trayPanelHeight = panelHeight

  const targetX = Math.round(x + (width - panelWidth) / 2)
  const targetY = Math.round(y + height - panelHeight - TRAY_PANEL_MARGIN)

  window.setBounds({
    x: targetX,
    y: targetY,
    width: panelWidth,
    height: panelHeight,
  }, false)
}

function hideTrayPanel(): void {
  if (!trayPanelWindow || trayPanelWindow.isDestroyed()) return
  trayPanelWindow.hide()
}

function createTrayPanelWindow(workspaceId: string): BrowserWindow {
  const window = new BrowserWindow({
    width: TRAY_PANEL_WIDTH,
    height: trayPanelHeight,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true,
    focusable: true,
    titleBarStyle: 'hidden',
    vibrancy: 'popover',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    roundedCorners: true,
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  trayPanelWorkspaceId = workspaceId
  positionTrayPanel(window)

  if (VITE_DEV_SERVER_URL) {
    window.loadURL(getTrayPanelUrl(workspaceId))
  } else {
    window.loadFile(join(__dirname, 'renderer/index.html'), {
      query: {
        workspaceId,
        windowMode: 'tray',
      },
    })
  }

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  window.on('blur', () => {
    if (isDestroyingTrayWindows) return
    hideTrayPanel()
  })

  window.on('close', (event) => {
    if (isDestroyingTrayWindows) return
    event.preventDefault()
    hideTrayPanel()
  })

  window.on('closed', () => {
    if (trayPanelWindow === window) {
      trayPanelWindow = null
      trayPanelWorkspaceId = null
    }
  })

  return window
}

function showTrayPanel(windowManager: WindowManager): void {
  const activeWindow = windowManager.getLastActiveWindow()
  const workspaceId = activeWindow
    ? windowManager.getWorkspaceForWindow(activeWindow.webContents.id) ?? getDefaultWorkspaceId()
    : getDefaultWorkspaceId()

  if (!workspaceId) {
    showOrCreateMainWindow(windowManager)
    return
  }

  if (!trayPanelWindow || trayPanelWindow.isDestroyed() || trayPanelWorkspaceId !== workspaceId) {
    if (trayPanelWindow && !trayPanelWindow.isDestroyed()) {
      isDestroyingTrayWindows = true
      trayPanelWindow.destroy()
      isDestroyingTrayWindows = false
    }
    trayPanelWindow = createTrayPanelWindow(workspaceId)
  }

  positionTrayPanel(trayPanelWindow)

  if (trayPanelWindow.isVisible()) {
    trayPanelWindow.hide()
    return
  }

  trayPanelWindow.show()
  trayPanelWindow.focus()
}

function buildTrayMenu(windowManager: WindowManager): Menu {
  const appName = app.getName()

  return Menu.buildFromTemplate([
    {
      label: `Show ${appName}`,
      click: () => showOrCreateMainWindow(windowManager),
    },
    {
      label: 'New Window',
      click: () => createWorkspaceWindow(windowManager),
    },
    { type: 'separator' },
    {
      label: `Quit ${appName}`,
      click: () => app.quit(),
    },
  ])
}

function startTrayAnimation(frames: Electron.NativeImage[]): void {
  if (!tray || frames.length <= 1) return

  let frameIndex = 0
  tray.setImage(frames[frameIndex])
  mainLog.info(`[tray] Starting blinking ghost tray icon (${frames.length} frames)`)

  trayAnimationTimer = setInterval(() => {
    if (!tray || tray.isDestroyed()) return
    frameIndex = (frameIndex + 1) % frames.length
    tray.setImage(frames[frameIndex])
  }, GHOST_TRAY_FRAME_INTERVAL_MS)
}

export function initTray(windowManager: WindowManager): void {
  if (process.platform !== 'darwin') return
  if (tray) return

  const animatedFrames = createGhostTrayFrames()
  const trayIcon = animatedFrames[0] ?? createTrayIcon()
  if (!trayIcon) return
  if (animatedFrames.length === 0) {
    mainLog.warn('[tray] Animated ghost frames unavailable, falling back to static tray icon')
  }

  tray = new Tray(trayIcon)
  tray.setToolTip(app.getName())
  tray.setContextMenu(buildTrayMenu(windowManager))
  startTrayAnimation(animatedFrames)

  tray.on('click', () => {
    if (!windowManager) return
    showTrayPanel(windowManager)
  })

  tray.on('right-click', () => {
    hideTrayPanel()
    tray?.popUpContextMenu()
  })

  mainLog.info('[tray] macOS menu bar icon initialized')
}

export function getTrayWindowMode(webContentsId: number): 'tray' | null {
  if (trayPanelWindow && !trayPanelWindow.isDestroyed() && trayPanelWindow.webContents.id === webContentsId) {
    return 'tray'
  }
  return null
}

export function getTrayPanelWorkspace(webContentsId: number): string | null {
  if (trayPanelWindow && !trayPanelWindow.isDestroyed() && trayPanelWindow.webContents.id === webContentsId) {
    return trayPanelWorkspaceId
  }
  return null
}

export function closeTrayPanel(webContentsId: number): boolean {
  if (!trayPanelWindow || trayPanelWindow.isDestroyed()) return false
  if (trayPanelWindow.webContents.id !== webContentsId) return false
  trayPanelWindow.close()
  return true
}

export function resizeTrayPanel(webContentsId: number, height: number): boolean {
  if (!trayPanelWindow || trayPanelWindow.isDestroyed()) return false
  if (trayPanelWindow.webContents.id !== webContentsId) return false
  positionTrayPanel(trayPanelWindow, height)
  return true
}

export function destroyTray(): void {
  if (trayAnimationTimer) {
    clearInterval(trayAnimationTimer)
    trayAnimationTimer = null
  }
  if (trayPanelWindow && !trayPanelWindow.isDestroyed()) {
    isDestroyingTrayWindows = true
    trayPanelWindow.destroy()
    isDestroyingTrayWindows = false
    trayPanelWindow = null
    trayPanelWorkspaceId = null
  }
  if (!tray) return
  tray.destroy()
  tray = null
}
