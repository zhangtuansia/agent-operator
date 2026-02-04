import { BrowserWindow, shell, nativeTheme, Menu, app } from 'electron'
import { windowLog } from './logger'
import { join } from 'path'
import { existsSync } from 'fs'
import { release } from 'os'
import { IPC_CHANNELS } from '../shared/types'
import type { SavedWindow } from './window-state'

// Vite dev server URL for hot reload
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// ============================================================
// Window Size Constants
// ============================================================

/**
 * Window dimensions for different modes.
 * Focused mode: Smaller window for single session view (quick tasks)
 * Normal mode: Larger window for multi-session workspace view
 */
const WINDOW_SIZES = {
  focused: { width: 900, height: 700 },
  normal: { width: 1400, height: 900 },
  min: { width: 800, height: 600 },
} as const

/**
 * macOS traffic light (window controls) position.
 * Positioned with padding from the window edge for hiddenInset title bar.
 */
const TRAFFIC_LIGHT_POSITION = { x: 18, y: 18 } as const

/**
 * Windows build numbers for transparency feature detection.
 */
const WINDOWS_BUILD = {
  WIN11_MICA: 22000,      // Windows 11 - supports Mica effect
  WIN10_ACRYLIC: 17763,   // Windows 10 1809 - supports Acrylic effect
} as const

/**
 * Get the appropriate background material for Windows transparency effects
 * - Windows 11 (build 22000+): Mica effect
 * - Windows 10 1809+ (build 17763+): Acrylic effect
 * - Older versions: No transparency
 */
function getWindowsBackgroundMaterial(): 'mica' | 'acrylic' | undefined {
  if (process.platform !== 'win32') return undefined

  // os.release() returns "10.0.xxxxx" where xxxxx is the build number
  const buildNumber = parseInt(release().split('.')[2] || '0', 10)

  if (buildNumber >= WINDOWS_BUILD.WIN11_MICA) {
    windowLog.info('Windows 11 detected (build ' + buildNumber + '), using Mica')
    return 'mica'
  } else if (buildNumber >= WINDOWS_BUILD.WIN10_ACRYLIC) {
    windowLog.info('Windows 10 1809+ detected (build ' + buildNumber + '), using Acrylic')
    return 'acrylic'
  }

  windowLog.info('Older Windows detected (build ' + buildNumber + '), no transparency')
  return undefined
}


interface ManagedWindow {
  window: BrowserWindow
  workspaceId: string
}

export interface CreateWindowOptions {
  /** The workspace to open (empty string for onboarding) */
  workspaceId: string
  /** Whether to open in focused mode (smaller window, no sidebars) */
  focused?: boolean
  /** Deep link URL to navigate to after window loads (without ?window= param) */
  initialDeepLink?: string
  /** Full URL to restore from saved state (preserves route/query params) */
  restoreUrl?: string
}

export class WindowManager {
  private windows: Map<number, ManagedWindow> = new Map()  // webContents.id → ManagedWindow
  private focusedModeWindows: Set<number> = new Set()  // webContents.id of windows in focused mode
  private pendingDeepLinks: Map<number, { view?: string; action?: string; actionParams?: Record<string, string> }> = new Map()  // webContents.id → pending deep link

  /**
   * Create a new window for a workspace
   * @param options - Window creation options
   */
  createWindow(options: CreateWindowOptions): BrowserWindow {
    const { workspaceId, focused = false, initialDeepLink, restoreUrl } = options

    // Load platform-specific app icon
    const getIconPath = () => {
      const resourcesDir = join(__dirname, '../resources')
      if (process.platform === 'darwin') {
        return join(resourcesDir, 'icon.icns')
      } else if (process.platform === 'win32') {
        return join(resourcesDir, 'icon.ico')
      } else {
        return join(resourcesDir, 'icon.png')
      }
    }

    const iconPath = getIconPath()
    const iconExists = existsSync(iconPath)

    if (!iconExists) {
      windowLog.warn('App icon not found at:', iconPath)
    }

    // Use smaller window size for focused mode (single session view)
    const windowSize = focused ? WINDOW_SIZES.focused : WINDOW_SIZES.normal

    // Platform-specific window options
    const isMac = process.platform === 'darwin'
    const isWindows = process.platform === 'win32'
    const windowsBackgroundMaterial = getWindowsBackgroundMaterial()

    const window = new BrowserWindow({
      width: windowSize.width,
      height: windowSize.height,
      minWidth: WINDOW_SIZES.min.width,
      minHeight: WINDOW_SIZES.min.height,
      show: false, // Don't show until ready-to-show event (faster perceived startup)
      title: '',
      icon: iconExists ? iconPath : undefined,
      // macOS-specific: hidden title bar with inset traffic lights
      ...(isMac && {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: TRAFFIC_LIGHT_POSITION,
        vibrancy: 'under-window',
        visualEffectState: 'active',
      }),
      // Windows: use native frame with Mica/Acrylic transparency (Windows 10/11)
      ...(isWindows && {
        frame: true, // Keep native frame for better UX
        autoHideMenuBar: true, // Hide menu bar but accessible via Alt key
        // Note: Don't use transparent:true with backgroundMaterial - it hides the window frame
        ...(windowsBackgroundMaterial && {
          backgroundMaterial: windowsBackgroundMaterial,
        }),
      }),
      // Linux: use native frame
      ...(!isMac && !isWindows && {
        frame: true,
        autoHideMenuBar: true,
      }),
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // SECURITY: Sandbox enabled for full process isolation.
        // All system info (versions, fonts path) is now accessed via IPC handlers.
        sandbox: true,
        webviewTag: true // Enable webview for browser panel
      }
    })

    // Show window when first paint is ready (faster perceived startup)
    window.once('ready-to-show', () => {
      window.show()
    })

    // Open external links in default browser
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Handle navigation in webviews to external URLs
    window.webContents.on('will-navigate', (event, url) => {
      // Allow navigation within the app (file:// in prod, localhost dev server)
      const isInternalUrl = url.startsWith('file://') ||
        (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL))

      if (!isInternalUrl) {
        event.preventDefault()
        shell.openExternal(url)
      }
    })

    // Enable right-click context menu in development
    if (!app.isPackaged) {
      window.webContents.on('context-menu', (_event, params) => {
        Menu.buildFromTemplate([
          { label: 'Inspect Element', click: () => window.webContents.inspectElement(params.x, params.y) },
          { type: 'separator' },
          { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
          { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
          { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        ]).popup()
      })
    }

    // Load the renderer - use restoreUrl if provided, otherwise build from options
    if (restoreUrl) {
      // Restore from saved URL - need to adapt for dev vs prod
      if (VITE_DEV_SERVER_URL) {
        // In dev mode, replace the base URL but keep the path and query
        try {
          const savedUrl = new URL(restoreUrl)
          const devUrl = new URL(VITE_DEV_SERVER_URL)
          // Preserve pathname and search from saved URL, use dev server host
          devUrl.pathname = savedUrl.pathname
          devUrl.search = savedUrl.search
          window.loadURL(devUrl.toString())
        } catch {
          // Fallback if URL parsing fails
          windowLog.warn('Failed to parse restoreUrl, using default:', restoreUrl)
          const params = new URLSearchParams({ workspaceId, ...(focused && { focused: 'true' }) }).toString()
          window.loadURL(`${VITE_DEV_SERVER_URL}?${params}`)
        }
      } else {
        // In prod, use file:// URL directly if it's a file URL, otherwise extract query
        if (restoreUrl.startsWith('file://')) {
          window.loadURL(restoreUrl)
        } else {
          // Extract query params and load file with them
          try {
            const savedUrl = new URL(restoreUrl)
            const query: Record<string, string> = {}
            savedUrl.searchParams.forEach((value, key) => { query[key] = value })
            window.loadFile(join(__dirname, 'renderer/index.html'), { query })
          } catch {
            window.loadFile(join(__dirname, 'renderer/index.html'), { query: { workspaceId } })
          }
        }
      }
    } else {
      // Build URL from options
      const query: Record<string, string> = { workspaceId }
      if (focused) {
        query.focused = 'true' // Open in focused mode (no sidebars)
      }

      if (VITE_DEV_SERVER_URL) {
        const params = new URLSearchParams(query).toString()
        window.loadURL(`${VITE_DEV_SERVER_URL}?${params}`)
      } else {
        window.loadFile(join(__dirname, 'renderer/index.html'), { query })
      }
    }

    // Store the window mapping first (before parsing deep link)
    const webContentsId = window.webContents.id
    this.windows.set(webContentsId, { window, workspaceId })

    // If an initial deep link was provided, store it for the renderer to pull when ready
    // This is more reliable than pushing after a timeout, as the renderer knows when it's ready
    if (initialDeepLink) {
      import('./deep-link').then(({ parseDeepLink }) => {
        const target = parseDeepLink(initialDeepLink)
        if (target && (target.view || target.action)) {
          windowLog.info('[WindowManager] Storing pending deep link for window:', target.action || target.view)
          this.pendingDeepLinks.set(webContentsId, {
            view: target.view,
            action: target.action,
            actionParams: target.actionParams,
          })
        }
      })
    }

    // Track focused mode state for persistence
    if (focused) {
      this.focusedModeWindows.add(webContentsId)
    }

    // Listen for system theme changes and notify this window's renderer
    const themeHandler = () => {
      // Check mainFrame - it becomes null when render frame is disposed
      if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.mainFrame) {
        window.webContents.send(IPC_CHANNELS.SYSTEM_THEME_CHANGED, nativeTheme.shouldUseDarkColors)
      }
    }
    nativeTheme.on('updated', themeHandler)

    // Handle focus/blur to broadcast window focus state
    window.on('focus', () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.mainFrame) {
        window.webContents.send(IPC_CHANNELS.WINDOW_FOCUS_STATE, true)
      }
    })
    window.on('blur', () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.mainFrame) {
        window.webContents.send(IPC_CHANNELS.WINDOW_FOCUS_STATE, false)
      }
    })

    // Handle window close request (X button, Cmd+W) - intercept to allow modal closing first
    // The renderer can respond via WINDOW_CONFIRM_CLOSE to actually close the window
    window.on('close', (event) => {
      // Check if renderer is ready (mainFrame exists) - if not, allow close directly
      if (!window.webContents.isDestroyed() && window.webContents.mainFrame) {
        event.preventDefault()
        // Send close request to renderer - it will either close a modal or confirm close
        window.webContents.send(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED)
      }
      // If renderer not ready, allow default close behavior
    })

    // Handle window closed - clean up theme listener and internal state
    window.on('closed', () => {
      nativeTheme.removeListener('updated', themeHandler)
      this.windows.delete(webContentsId)
      this.focusedModeWindows.delete(webContentsId)
      windowLog.info(`Window closed for workspace ${workspaceId}`)
    })

    windowLog.info(`Created window for workspace ${workspaceId} (focused: ${focused})`)
    return window
  }

  /**
   * Get window by workspace ID (returns first match - for backwards compatibility)
   */
  getWindowByWorkspace(workspaceId: string): BrowserWindow | null {
    for (const managed of this.windows.values()) {
      if (managed.workspaceId === workspaceId && !managed.window.isDestroyed()) {
        return managed.window
      }
    }
    return null
  }

  /**
   * Get ALL windows for a workspace (main window + tab content windows)
   * Used for broadcasting events to all windows showing the same workspace
   */
  getAllWindowsForWorkspace(workspaceId: string): BrowserWindow[] {
    const windows: BrowserWindow[] = []
    for (const managed of this.windows.values()) {
      if (managed.workspaceId === workspaceId && !managed.window.isDestroyed()) {
        windows.push(managed.window)
      }
    }
    // Debug: log registered workspaces when lookup fails
    if (windows.length === 0 && this.windows.size > 0) {
      const registered = Array.from(this.windows.values()).map(m => m.workspaceId)
      windowLog.warn(`No windows for workspace '${workspaceId}', have: [${registered.join(', ')}]`)
    }
    return windows
  }

  /**
   * Get workspace ID for a window (by webContents.id)
   */
  getWorkspaceForWindow(webContentsId: number): string | null {
    const managed = this.windows.get(webContentsId)
    return managed?.workspaceId ?? null
  }

  /**
   * Get and clear pending deep link for a window (by webContents.id)
   * Called by renderer when it's ready to handle deep links
   */
  getPendingDeepLink(webContentsId: number): { view?: string; action?: string; actionParams?: Record<string, string> } | null {
    const pending = this.pendingDeepLinks.get(webContentsId)
    if (pending) {
      windowLog.info('[WindowManager] Returning pending deep link for window:', pending.action || pending.view)
      this.pendingDeepLinks.delete(webContentsId)
      return pending
    }
    return null
  }

  /**
   * Close window by webContents.id (triggers close event which may be intercepted)
   */
  closeWindow(webContentsId: number): void {
    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      managed.window.close()
    }
  }

  /**
   * Force close window by webContents.id (bypasses close event interception).
   * Used when renderer confirms the close action (no modals to close).
   */
  forceCloseWindow(webContentsId: number): void {
    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      // Remove close listener temporarily to avoid infinite loop,
      // then destroy the window directly
      managed.window.destroy()
    }
  }

  /**
   * Close window for a specific workspace
   */
  closeWindowForWorkspace(workspaceId: string): void {
    const window = this.getWindowByWorkspace(workspaceId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  /**
   * Update the workspace ID for an existing window (for in-window switching)
   * @param webContentsId - The webContents.id of the window
   * @param workspaceId - The new workspace ID
   * @returns true if window was found and updated, false otherwise
   */
  updateWindowWorkspace(webContentsId: number, workspaceId: string): boolean {
    const managed = this.windows.get(webContentsId)
    if (managed) {
      const oldWorkspaceId = managed.workspaceId
      managed.workspaceId = workspaceId
      windowLog.info(`Updated window ${webContentsId} from workspace ${oldWorkspaceId} to ${workspaceId}`)
      return true
    }
    // Window not found - log for debugging
    windowLog.warn(`Cannot update workspace for unknown window ${webContentsId}, registered: [${Array.from(this.windows.keys()).join(', ')}]`)
    return false
  }

  /**
   * Register an existing window with a workspace ID
   * Used for re-registration when window mapping is lost (e.g., after refresh)
   * @param window - The BrowserWindow to register
   * @param workspaceId - The workspace ID to associate with
   */
  registerWindow(window: BrowserWindow, workspaceId: string): void {
    const webContentsId = window.webContents.id
    this.windows.set(webContentsId, { window, workspaceId })
    windowLog.info(`Registered window ${webContentsId} for workspace ${workspaceId}`)
  }

  /**
   * Get all managed windows
   */
  getAllWindows(): ManagedWindow[] {
    return Array.from(this.windows.values()).filter(m => !m.window.isDestroyed())
  }

  /**
   * Focus existing window for workspace or create new one
   */
  focusOrCreateWindow(workspaceId: string): BrowserWindow {
    const existing = this.getWindowByWorkspace(workspaceId)
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore()
      }
      existing.focus()
      return existing
    }
    return this.createWindow({ workspaceId })
  }

  /**
   * Get window states for persistence (includes bounds and focused mode)
   * Used by window-state.ts to save/restore windows
   */
  getWindowStates(): SavedWindow[] {
    return this.getAllWindows().map(managed => {
      const webContentsId = managed.window.webContents.id
      const isFocused = this.focusedModeWindows.has(webContentsId)
      const url = managed.window.webContents.getURL()
      return {
        type: 'main' as const,
        workspaceId: managed.workspaceId,
        bounds: managed.window.getBounds(),
        ...(isFocused && { focused: true }),
        ...(url && { url }),
      }
    })
  }

  /**
   * Check if any windows are open
   */
  hasWindows(): boolean {
    return this.getAllWindows().length > 0
  }

  /**
   * Get the currently focused window
   */
  getFocusedWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      return focused
    }
    return null
  }

  /**
   * Get the last active window (most recently used)
   * Falls back to any available window if none focused
   */
  getLastActiveWindow(): BrowserWindow | null {
    // First try focused window
    const focused = this.getFocusedWindow()
    if (focused) {
      return focused
    }

    // Fall back to any available window
    const allWindows = this.getAllWindows()
    if (allWindows.length > 0) {
      return allWindows[0].window
    }

    return null
  }

  /**
   * Send IPC message to all windows
   */
  broadcastToAll(channel: string, ...args: unknown[]): void {
    for (const managed of this.getAllWindows()) {
      // Check mainFrame - it becomes null when render frame is disposed
      if (!managed.window.isDestroyed() &&
          !managed.window.webContents.isDestroyed() &&
          managed.window.webContents.mainFrame) {
        managed.window.webContents.send(channel, ...args)
      }
    }
  }

  /**
   * Show or hide macOS traffic light buttons (close/minimize/maximize).
   * Used to hide them when fullscreen overlays are open to prevent accidental clicks.
   * No-op on non-macOS platforms.
   */
  setTrafficLightsVisible(webContentsId: number, visible: boolean): void {
    if (process.platform !== 'darwin') return

    const managed = this.windows.get(webContentsId)
    if (managed && !managed.window.isDestroyed()) {
      managed.window.setWindowButtonVisibility(visible)
      // Re-apply custom traffic light position after showing buttons
      // setWindowButtonVisibility can reset position to default, so we need
      // to restore the custom position using the modern setWindowButtonPosition API
      if (visible) {
        managed.window.setWindowButtonPosition({ x: 18, y: 18 })
      }
    }
  }
}
