import { randomUUID } from 'crypto'
import { app, BrowserView, BrowserWindow, clipboard, ipcMain, nativeTheme, shell, session, type Session as ElectronSession } from 'electron'
import { existsSync, mkdirSync, realpathSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { isAbsolute, join, normalize as normalizePath, parse, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { mainLog } from './logger'
import { BrowserCDP } from './browser-cdp'
import { DEFAULT_THEME, loadAppTheme } from '@agent-operator/shared/config'
import {
  BROWSER_LIVE_FX_BORDER,
  getBrowserLiveFxCornerRadii,
  resolveBrowserLiveFxBorder,
} from '../shared/browser-live-fx'
import { findBundledResourcePath } from './resource-paths'
import {
  BROWSER_TOOLBAR_CHANNELS,
  type BrowserAccessibilitySnapshot,
  type BrowserConsoleEntry,
  type BrowserConsoleLevel,
  type BrowserClickOptions,
  type BrowserDownloadEntry,
  type BrowserDownloadOptions,
  type BrowserEmptyStateLaunchPayload,
  type BrowserEmptyStateLaunchResult,
  type BrowserElementGeometry,
  type BrowserInstanceInfo,
  type BrowserKeyOptions,
  type BrowserNetworkEntry,
  type BrowserNetworkState,
  type BrowserPaneCreateOptions,
  type BrowserScreenshotOptions,
  type BrowserScreenshotResult,
  type BrowserScrollOptions,
  type BrowserScrollResult,
  type BrowserWaitOptions,
  type BrowserWaitResult,
} from '../shared/types'
import type { IBrowserPaneManager } from '@agent-operator/server-core/handlers'

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
export const BROWSER_PANE_SESSION_PARTITION = 'persist:browser-pane'
const DEFAULT_WINDOW_SIZE = { width: 1240, height: 860 }
const DEFAULT_WINDOW_MIN_SIZE = { width: 920, height: 640 }
const TOOLBAR_HEIGHT = 48
const BROWSER_EMPTY_STATE_PAGE = 'browser-empty-state.html'
const BROWSER_EMPTY_STATE_LAUNCH_SCHEME = 'dazi-browser:'
const NETWORK_BUFFER_LIMIT = 200
const CONSOLE_BUFFER_LIMIT = 200
const DOWNLOAD_BUFFER_LIMIT = 100
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const DEFAULT_WAIT_POLL_MS = 100
const DEFAULT_NETWORK_IDLE_MS = 700
const SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS = 3
const SCREENSHOT_RETRY_DELAY_MS = 120
const SCREENSHOT_RESCUE_PAINT_DELAY_MS = 180
const TOOLBAR_LOAD_MAX_RETRIES = 2
const TOOLBAR_LOAD_RETRY_DELAY_MS = 150
const SENSITIVE_UPLOAD_PATTERNS = [
  /\.ssh\//i,
  /\.gnupg\//i,
  /\.aws\/credentials/i,
  /\.env(?:\.|$)/i,
  /credentials\.json$/i,
  /secrets?\./i,
  /\.pem$/i,
  /\.key$/i,
]
const THEME_COLOR_EXTRACTOR = String.raw`
(() => {
  const toHex = (r, g, b) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
  const parseColor = (value) => {
    if (!value) return null;
    const input = String(value).trim();
    const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(input);
    if (hexMatch) {
      const hex = hexMatch[1];
      let r; let g; let b;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length >= 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return null;
      }
      return toHex(r, g, b);
    }

    const rgbMatch = input.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (!rgbMatch) return null;
    return toHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  };

  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
  for (const meta of themeMetas) {
    const media = meta.getAttribute('media');
    if (media && !window.matchMedia(media).matches) continue;
    const color = parseColor(meta.content);
    if (color) return color;
  }

  const readBg = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    const bg = style.backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return null;
    return parseColor(bg);
  };

  return readBg(document.body) || readBg(document.documentElement) || null;
})()
`

type BrowserPaneListener<T> = (payload: T) => void

interface BrowserPaneRecord {
  id: string
  window: BrowserWindow
  toolbarView: BrowserView
  pageView: BrowserView
  nativeOverlayView: BrowserView
  cdp: BrowserCDP
  info: BrowserInstanceInfo
  startPageUrl: string
  toolbarReady: boolean
  showWhenReady: boolean
  pendingShowOnReady: boolean
  pendingShowToken: number
  toolbarMenuOpen: boolean
  toolbarMenuHeight: number
  toolbarMenuOverlayActive: boolean
  lastAction: {
    tool: string
    ref?: string
    status: 'succeeded' | 'failed'
    geometry?: BrowserElementGeometry
    timestamp: number
  } | null
  agentControl: {
    active: boolean
    sessionId: string
    displayName?: string
    intent?: string
  } | null
  lockState: {
    active: boolean
    previousResizable: boolean
  }
  nativeOverlayReady: boolean
  consoleEntries: BrowserConsoleEntry[]
  networkEntries: BrowserNetworkEntry[]
  downloads: BrowserDownloadEntry[]
  pendingRequestIds: Set<number>
  lastNetworkActivityAt: number
  lastLaunchToken: string | null
  keepAliveOnWindowClose: boolean
  explicitDestroyRequested: boolean
}

interface BrowserNetworkRequestDetails {
  id?: number
  webContentsId?: number
  method?: string
  url?: string
  resourceType?: string
  statusCode?: number
  error?: string
}

function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback
  return Math.max(1, Math.floor(value))
}

function trimArray<T>(items: T[], maxEntries: number): T[] {
  if (items.length <= maxEntries) return items
  return items.slice(items.length - maxEntries)
}

function normalizeConsoleLevel(level: number): BrowserConsoleLevel {
  switch (level) {
    case 1:
      return 'info'
    case 2:
      return 'warning'
    case 3:
      return 'error'
    case 4:
      return 'debug'
    default:
      return 'log'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBrowserIconPath(): string | undefined {
  const iconPath = process.platform === 'darwin'
    ? findBundledResourcePath('icon.icns')
    : process.platform === 'win32'
      ? findBundledResourcePath('icon.ico')
      : findBundledResourcePath('icon.png')

  return iconPath && existsSync(iconPath) ? iconPath : undefined
}

function isLocalhostTarget(input: string): boolean {
  return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(?:\/|$)/i.test(input)
}

function shouldOpenExternally(target: string): boolean {
  return /^(mailto|tel|sms):/i.test(target)
}

function normalizeNavigationTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed
  }

  if (isLocalhostTarget(trimmed)) {
    return `http://${trimmed}`
  }

  if (trimmed.includes(' ') || (!trimmed.includes('.') && !trimmed.includes('/'))) {
    return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
  }

  return `https://${trimmed}`
}

function buildStartPageUrl(): string {
  if (VITE_DEV_SERVER_URL) {
    return `${VITE_DEV_SERVER_URL}/${BROWSER_EMPTY_STATE_PAGE}`
  }

  return pathToFileURL(join(__dirname, 'renderer', BROWSER_EMPTY_STATE_PAGE)).toString()
}

export class BrowserPaneManager implements IBrowserPaneManager {
  private readonly instances = new Map<string, BrowserPaneRecord>()
  private readonly stateListeners = new Set<BrowserPaneListener<BrowserInstanceInfo>>()
  private readonly removedListeners = new Set<BrowserPaneListener<string>>()
  private readonly interactedListeners = new Set<BrowserPaneListener<string>>()
  private toolbarIpcRegistered = false
  private networkTrackingRegistered = false
  private downloadTrackingRegistered = false
  private sessionPathResolver: ((sessionId: string) => string | undefined) | null = null

  setSessionPathResolver(resolver: ((sessionId: string) => string | undefined) | null): void {
    this.sessionPathResolver = resolver
  }

  private getBoundInstanceId(sessionId: string): string | null {
    for (const [id, record] of this.instances) {
      if (record.info.boundSessionId === sessionId) return id
    }
    return null
  }

  private findReusableUnboundInstance(): BrowserPaneRecord | null {
    const unbound = Array.from(this.instances.values()).filter(
      (record) => record.info.boundSessionId === null && record.info.ownerType === 'manual',
    )
    if (unbound.length === 0) return null
    return unbound.find((record) => record.info.isVisible) ?? unbound[0]
  }

  createForSession(sessionId: string, options?: { show?: boolean }): string {
    const existingId = this.getBoundInstanceId(sessionId)
    if (existingId) {
      if (options?.show) {
        void this.focus(existingId)
      }
      return existingId
    }

    const reusable = this.findReusableUnboundInstance()
    if (reusable) {
      reusable.info.boundSessionId = sessionId
      reusable.info.ownerType = 'session'
      reusable.info.ownerSessionId = sessionId
      this.emitState(reusable)
      if (options?.show) {
        void this.focus(reusable.id)
      }
      mainLog.info(`[browser-pane] Reused unbound instance ${reusable.id} for session ${sessionId}`)
      return reusable.id
    }

    return this.createInstance({
      show: options?.show ?? false,
      ownerType: 'session',
      ownerSessionId: sessionId,
      bindToSessionId: sessionId,
    })
  }

  focusBoundForSession(sessionId: string): string {
    const id = this.createForSession(sessionId, { show: true })
    void this.focus(id)
    return id
  }

  getOrCreateForSession(sessionId: string): string {
    return this.createForSession(sessionId, { show: false })
  }

  destroyForSession(sessionId: string): void {
    for (const [id, record] of this.instances) {
      if (record.info.boundSessionId === sessionId) {
        this.destroyInstance(id)
      }
    }
  }

  async clearVisualsForSession(sessionId: string): Promise<void> {
    for (const record of this.instances.values()) {
      if (record.info.boundSessionId !== sessionId) continue
      record.agentControl = null
      this.applyAgentControlLock(record, false)
      this.updateNativeOverlayState(record)
      this.emitState(record)
    }
  }

  unbindAllForSession(sessionId: string): void {
    for (const record of this.instances.values()) {
      if (record.info.boundSessionId !== sessionId) continue
      record.info.boundSessionId = null
      record.info.ownerType = 'manual'
      record.info.ownerSessionId = record.info.ownerSessionId ?? sessionId
      this.emitState(record)
      mainLog.info(
        `[browser-pane] Unbound instance ${record.id} from session ${sessionId} (owner retained: ${record.info.ownerSessionId ?? 'none'})`,
      )
    }
  }

  createInstance(input?: string | BrowserPaneCreateOptions): string {
    const options = typeof input === 'string' ? { id: input } : (input ?? {})
    const id = options.id ?? randomUUID()
    const existing = this.instances.get(id)
    if (existing) {
      if (options.show !== false) {
        void this.focus(id)
      }
      return id
    }

    const sharedSession = session.fromPartition(BROWSER_PANE_SESSION_PARTITION)
    this.ensureNetworkTracking(sharedSession)

    const backgroundColor = nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f3ef'
    const startPageUrl = buildStartPageUrl()
    const shouldShow = options.show ?? true
    const ownerSessionId = options.ownerSessionId ?? options.bindToSessionId ?? null
    const ownerType = options.ownerType ?? (options.bindToSessionId ? 'session' : 'manual')

    const window = new BrowserWindow({
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
      minWidth: DEFAULT_WINDOW_MIN_SIZE.width,
      minHeight: DEFAULT_WINDOW_MIN_SIZE.height,
      show: false,
      frame: false,
      backgroundColor,
      icon: getBrowserIconPath(),
      autoHideMenuBar: true,
      webPreferences: {
        partition: BROWSER_PANE_SESSION_PARTITION,
        session: sharedSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const toolbarView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_SESSION_PARTITION,
        session: sharedSession,
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const pageView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_SESSION_PARTITION,
        session: sharedSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const nativeOverlayView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_SESSION_PARTITION,
        session: sharedSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const toolbarWebContents = toolbarView.webContents as typeof toolbarView.webContents & { setBackgroundColor?: (color: string) => void }
    toolbarWebContents.setBackgroundColor?.('#00000000')
    const pageWebContents = pageView.webContents as typeof pageView.webContents & { setBackgroundColor?: (color: string) => void }
    pageWebContents.setBackgroundColor?.(backgroundColor)
    const overlayWebContents = nativeOverlayView.webContents as typeof nativeOverlayView.webContents & { setBackgroundColor?: (color: string) => void }
    overlayWebContents.setBackgroundColor?.('#00000000')

    window.addBrowserView(pageView)
    window.addBrowserView(nativeOverlayView)
    window.addBrowserView(toolbarView)
    window.setTopBrowserView(toolbarView)

    const record: BrowserPaneRecord = {
      id,
      window,
      toolbarView,
      pageView,
      nativeOverlayView,
      cdp: new BrowserCDP(pageView.webContents),
      startPageUrl,
      toolbarReady: false,
      showWhenReady: shouldShow,
      pendingShowOnReady: false,
      pendingShowToken: 0,
      toolbarMenuOpen: false,
      toolbarMenuHeight: 0,
      toolbarMenuOverlayActive: false,
      lastAction: null,
      agentControl: null,
      lockState: {
        active: false,
        previousResizable: this.getWindowResizable(window),
      },
      nativeOverlayReady: false,
      consoleEntries: [],
      networkEntries: [],
      downloads: [],
      pendingRequestIds: new Set(),
      lastNetworkActivityAt: Date.now(),
      lastLaunchToken: null,
      keepAliveOnWindowClose: true,
      explicitDestroyRequested: false,
      info: {
        id,
        url: 'about:blank',
        title: 'New Browser Window',
        favicon: null,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        boundSessionId: options.bindToSessionId ?? null,
        ownerType,
        ownerSessionId,
        isVisible: false,
        agentControlActive: false,
        themeColor: null,
      },
    }

    this.instances.set(id, record)
    this.attachWindow(record)
    this.layoutViews(record)
    void this.loadNativeOverlayPage(record)
    void this.loadToolbarPage(record)

    const initialUrl = options.url ? normalizeNavigationTarget(options.url) : startPageUrl
    void pageView.webContents.loadURL(initialUrl).catch((error) => {
      mainLog.error(`[browser-pane] Failed to load initial URL for ${id}:`, error)
    })

    this.emitState(record)
    return id
  }

  listInstances(): BrowserInstanceInfo[] {
    return Array.from(this.instances.values()).map((record) => ({ ...record.info }))
  }

  getInstance(id: string): {
    ownerType: 'session' | 'manual'
    ownerSessionId: string | null
    isVisible: boolean
    title: string
    currentUrl: string
  } | undefined {
    const record = this.instances.get(id)
    if (!record) return undefined
    return {
      ownerType: record.info.ownerType,
      ownerSessionId: record.info.ownerSessionId,
      isVisible: record.info.isVisible,
      title: record.info.title,
      currentUrl: record.info.url,
    }
  }

  bindSession(id: string, sessionId: string): void {
    const record = this.instances.get(id)
    if (!record) return
    record.info.boundSessionId = sessionId
    record.info.ownerType = 'session'
    record.info.ownerSessionId = sessionId
    this.emitState(record)
  }

  clearAgentControlForInstance(instanceId: string, sessionId?: string): { released: boolean; reason?: string } {
    const record = this.instances.get(instanceId)
    if (!record) {
      return { released: false, reason: `Browser window "${instanceId}" not found.` }
    }

    if (sessionId) {
      if (record.info.boundSessionId && record.info.boundSessionId !== sessionId) {
        return { released: false, reason: `Browser window "${instanceId}" is locked to session ${record.info.boundSessionId}.` }
      }

      if (!record.info.boundSessionId && record.info.ownerSessionId && record.info.ownerSessionId !== sessionId) {
        return { released: false, reason: `Browser window "${instanceId}" is currently owned by session ${record.info.ownerSessionId}.` }
      }
    }

    if (!record.agentControl?.active) {
      return { released: false, reason: 'No active agent overlay on the target window.' }
    }

    record.agentControl = null
    this.applyAgentControlLock(record, false)
    this.updateNativeOverlayState(record)
    this.emitState(record)
    mainLog.info(`[browser-pane] agent control released instance=${instanceId}${sessionId ? ` session=${sessionId}` : ''}`)
    return { released: true }
  }

  async navigate(id: string, url: string): Promise<{ url: string; title: string }> {
    const record = this.requireRecord(id)
    const target = normalizeNavigationTarget(url)
    if (shouldOpenExternally(target)) {
      await shell.openExternal(target)
      return { url: record.info.url, title: record.info.title }
    }

    await record.pageView.webContents.loadURL(target)
    this.emitState(record)
    return { url: record.info.url, title: record.info.title }
  }

  async goBack(id: string): Promise<void> {
    const record = this.requireRecord(id)
    if (!record.pageView.webContents.canGoBack()) return
    record.pageView.webContents.goBack()
  }

  async goForward(id: string): Promise<void> {
    const record = this.requireRecord(id)
    if (!record.pageView.webContents.canGoForward()) return
    record.pageView.webContents.goForward()
  }

  async reload(id: string): Promise<void> {
    const record = this.requireRecord(id)
    record.pageView.webContents.reload()
  }

  async stop(id: string): Promise<void> {
    const record = this.requireRecord(id)
    record.pageView.webContents.stop()
  }

  async focus(id: string): Promise<void> {
    const record = this.requireRecord(id)

    if (record.window.isMinimized()) {
      record.window.restore()
    }

    if (!record.toolbarReady) {
      if (!record.pendingShowOnReady) {
        record.pendingShowOnReady = true
        record.pendingShowToken += 1
      }
      record.showWhenReady = true
      return
    }

    record.window.show()
    record.window.focus()
    record.pageView.webContents.focus()
    this.emitInteracted(id)
    this.emitState(record)
  }

  hide(id: string): void {
    const record = this.instances.get(id)
    if (!record) return
    if (record.pendingShowOnReady) {
      record.pendingShowOnReady = false
      record.pendingShowToken += 1
    }
    this.forceCloseToolbarMenu(record, 'window-hidden')
    record.window.hide()
    this.emitState(record)
  }

  destroyInstance(id: string): void {
    const record = this.instances.get(id)
    if (!record) return
    this.forceCloseToolbarMenu(record, 'window-destroyed')
    record.explicitDestroyRequested = true
    record.window.close()
  }

  setAgentControl(sessionId: string, meta: { displayName?: string; intent?: string }): void {
    for (const record of this.instances.values()) {
      if (record.info.boundSessionId !== sessionId) continue

      record.agentControl = {
        active: true,
        sessionId,
        displayName: meta.displayName,
        intent: meta.intent,
      }
      this.applyAgentControlLock(record, true)
      this.updateNativeOverlayState(record)
      this.emitState(record)
    }
  }

  clearAgentControl(sessionId: string): void {
    for (const record of this.instances.values()) {
      if (record.info.boundSessionId !== sessionId || !record.agentControl?.active) continue

      record.agentControl = null
      this.applyAgentControlLock(record, false)
      this.updateNativeOverlayState(record)
      this.emitState(record)
    }
  }

  async getAccessibilitySnapshot(id: string): Promise<BrowserAccessibilitySnapshot> {
    const record = this.requireRecord(id)
    return record.cdp.getAccessibilitySnapshot()
  }

  async clickElement(id: string, ref: string, options?: BrowserClickOptions): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      const geometry = await record.cdp.clickElement(ref)

      record.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }

      if (options?.waitFor === 'navigation') {
        await this.waitForNavigation(record, options.timeoutMs)
      } else if (options?.waitFor === 'network-idle') {
        await this.waitForNetworkIdle(record, options.timeoutMs)
      }

      return geometry
    } catch (error) {
      record.lastAction = {
        tool: 'browser_click',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async fillElement(id: string, ref: string, value: string): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      const geometry = await record.cdp.fillElement(ref, value)
      record.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
      return geometry
    } catch (error) {
      record.lastAction = {
        tool: 'browser_fill',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async selectOption(id: string, ref: string, value: string): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      const geometry = await record.cdp.selectOption(ref, value)
      record.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'succeeded',
        geometry,
        timestamp: Date.now(),
      }
      return geometry
    } catch (error) {
      record.lastAction = {
        tool: 'browser_select',
        ref,
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async screenshot(id: string, options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult> {
    const record = this.requireRecord(id)
    const format = options?.format === 'jpeg' ? 'jpeg' : 'png'
    let overlayApplied = false
    const mode = (options?.annotate || options?.mode === 'agent') ? 'agent' : 'raw'

    try {
      if (mode === 'agent') {
        const warnings: string[] = []
        let refs = options?.refs ?? []
        if (refs.length === 0) {
          try {
            const snapshot = await record.cdp.getAccessibilitySnapshot()
            refs = snapshot.nodes.slice(0, 60).map((node) => node.ref)
          } catch (error) {
            warnings.push(`Accessibility snapshot for annotation failed: ${error instanceof Error ? error.message : String(error)}`)
            refs = []
          }
        }

        const settled = await Promise.allSettled(refs.map((ref) => record.cdp.getElementGeometry(ref)))
        const geometries = settled
          .filter((result): result is PromiseFulfilledResult<BrowserElementGeometry> => result.status === 'fulfilled')
          .map((result) => result.value)

        if (options?.includeLastAction && record.lastAction?.geometry) {
          geometries.push(record.lastAction.geometry)
        }

        const metadataText = record.lastAction
          ? `${record.lastAction.tool} • ${record.lastAction.status} • ${new Date(record.lastAction.timestamp).toISOString()}`
          : `browser_screenshot • ${new Date().toISOString()}`

        let annotationPartial = false

        try {
          if (geometries.length > 0 || options?.includeMetadata) {
            await record.cdp.renderTemporaryOverlay({
              geometries,
              includeMetadata: !!options?.includeMetadata,
              metadataText,
              includeClickPoints: true,
            })
            overlayApplied = true
          }
        } catch (error) {
          annotationPartial = true
          warnings.push(`Annotation overlay failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        const viewport = await record.cdp.getViewportMetrics()
        const captured = await this.capturePageWithRecovery(record, {
          format,
          jpegQuality: Math.max(1, Math.min(100, options?.jpegQuality ?? 90)),
          dpr: viewport.dpr,
          mode,
          errorPrefix: 'screenshot',
        })

        return {
          dataUrl: `data:image/${captured.format};base64,${captured.buffer.toString('base64')}`,
          format: captured.format,
          imageBuffer: captured.buffer,
          imageFormat: captured.format,
          metadata: {
            mode,
            annotatedRefs: geometries.map((geometry) => geometry.ref),
            viewport,
            targets: geometries.map((geometry) => ({
              ref: geometry.ref,
              role: geometry.role,
              name: geometry.name,
              box: geometry.box,
              clickPoint: geometry.clickPoint,
            })),
            action: record.lastAction
              ? {
                tool: record.lastAction.tool,
                ref: record.lastAction.ref,
                status: record.lastAction.status,
                timestamp: record.lastAction.timestamp,
              }
              : undefined,
            annotationPartial,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        }
      }

      const captured = await this.capturePageWithRecovery(record, {
        format,
        jpegQuality: Math.max(1, Math.min(100, options?.jpegQuality ?? 90)),
        mode: 'raw',
        errorPrefix: 'screenshot',
      })

      return {
        dataUrl: `data:image/${captured.format};base64,${captured.buffer.toString('base64')}`,
        format: captured.format,
        imageBuffer: captured.buffer,
        imageFormat: captured.format,
        metadata: options?.includeMetadata ? { mode: 'raw' } : undefined,
      }
    } finally {
      if (overlayApplied) {
        await record.cdp.clearTemporaryOverlay().catch(() => {})
      }
    }
  }

  async screenshotRegion(
    id: string,
    target: {
      x?: number
      y?: number
      width?: number
      height?: number
      ref?: string
      selector?: string
      padding?: number
      format?: 'png' | 'jpeg'
      jpegQuality?: number
    },
  ): Promise<BrowserScreenshotResult> {
    const record = this.requireRecord(id)

    const hasCoords = [target.x, target.y, target.width, target.height].every((value) => typeof value === 'number')
    const hasRef = typeof target.ref === 'string' && target.ref.length > 0
    const hasSelector = typeof target.selector === 'string' && target.selector.length > 0
    const modeCount = [hasCoords, hasRef, hasSelector].filter(Boolean).length

    if (modeCount === 0) {
      throw new Error('Region screenshot requires either coordinates, ref, or selector')
    }
    if (modeCount > 1) {
      throw new Error('Region screenshot target is ambiguous. Provide only one of coordinates, ref, or selector')
    }

    let box: { x: number; y: number; width: number; height: number }
    if (hasRef) {
      const geometry = await record.cdp.getElementGeometry(String(target.ref))
      box = { ...geometry.box }
    } else if (hasSelector) {
      const selector = String(target.selector)
      const geometry = await record.pageView.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })()`,
        true,
      ) as { x: number; y: number; width: number; height: number } | null

      if (!geometry) {
        throw new Error(`Selector not found: ${selector}`)
      }
      box = geometry
    } else {
      box = {
        x: Number(target.x),
        y: Number(target.y),
        width: Number(target.width),
        height: Number(target.height),
      }
    }

    const padding = Math.max(0, Number(target.padding ?? 0))
    box = {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    }

    const viewport = await record.cdp.getViewportMetrics()
    const clippedX = Math.max(0, Math.floor(box.x))
    const clippedY = Math.max(0, Math.floor(box.y))
    const maxWidth = Math.max(0, Math.floor(viewport.width - clippedX))
    const maxHeight = Math.max(0, Math.floor(viewport.height - clippedY))
    const clippedWidth = Math.min(Math.max(1, Math.floor(box.width)), maxWidth)
    const clippedHeight = Math.min(Math.max(1, Math.floor(box.height)), maxHeight)

    if (maxWidth <= 0 || maxHeight <= 0 || clippedWidth <= 0 || clippedHeight <= 0) {
      throw new Error('Resolved screenshot region is outside the current viewport')
    }

    const image = await record.pageView.webContents.capturePage({
      x: clippedX,
      y: clippedY,
      width: clippedWidth,
      height: clippedHeight,
    })

    if (image.isEmpty()) {
      throw new Error('Failed to capture screenshot region: empty image buffer')
    }

    const format = target.format === 'jpeg' ? 'jpeg' : 'png'
    const imageBuffer = format === 'jpeg'
      ? image.toJPEG(Math.max(1, Math.min(100, target.jpegQuality ?? 90)))
      : image.toPNG()

    return {
      dataUrl: `data:image/${format};base64,${imageBuffer.toString('base64')}`,
      format,
      imageBuffer,
      imageFormat: format,
      metadata: {
        mode: 'raw',
        viewport,
        region: {
          x: clippedX,
          y: clippedY,
          width: clippedWidth,
          height: clippedHeight,
        },
      },
    }
  }

  async evaluate(id: string, expression: string): Promise<unknown> {
    const record = this.requireRecord(id)
    return record.pageView.webContents.executeJavaScript(expression, true)
  }

  async scroll(id: string, options?: BrowserScrollOptions): Promise<BrowserScrollResult>
  async scroll(id: string, direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>
  async scroll(
    id: string,
    optionsOrDirection?: BrowserScrollOptions | 'up' | 'down' | 'left' | 'right',
    amount?: number,
  ): Promise<BrowserScrollResult | void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    const options = typeof optionsOrDirection === 'string'
      ? { direction: optionsOrDirection, amount }
      : (optionsOrDirection ?? {})
    const scrollAmount = options.amount ?? 500
    const deltaX = options.deltaX ?? (
      options.direction === 'left' ? -scrollAmount
        : options.direction === 'right' ? scrollAmount
          : 0
    )
    const deltaY = options.deltaY ?? (
      options.direction === 'up' ? -scrollAmount
        : options.direction === 'down' ? scrollAmount
          : 0
    )

    const result = await record.pageView.webContents.executeJavaScript(
      `(() => {
        const dx = ${deltaX};
        const dy = ${deltaY};
        const canScrollAxis = (el, axis) => {
          if (!(el instanceof Element)) return false;
          const style = getComputedStyle(el);
          const overflow = axis === 'x' ? style.overflowX : style.overflowY;
          const scrollSize = axis === 'x' ? el.scrollWidth : el.scrollHeight;
          const clientSize = axis === 'x' ? el.clientWidth : el.clientHeight;
          return /(auto|scroll|overlay)/.test(overflow) && scrollSize > clientSize + 1;
        };

        const tryScrollElement = (el) => {
          if (!(el instanceof Element)) return false;
          const beforeLeft = el.scrollLeft;
          const beforeTop = el.scrollTop;
          if (dx) el.scrollLeft += dx;
          if (dy) el.scrollTop += dy;
          return el.scrollLeft !== beforeLeft || el.scrollTop !== beforeTop;
        };

        const candidates = [];
        if (document.activeElement instanceof Element) candidates.push(document.activeElement);
        const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        if (center instanceof Element) candidates.push(center);
        if (document.scrollingElement instanceof Element) candidates.push(document.scrollingElement);
        if (document.documentElement instanceof Element) candidates.push(document.documentElement);
        if (document.body instanceof Element) candidates.push(document.body);

        let scrolled = false;
        for (const start of candidates) {
          let el = start;
          while (el && el instanceof Element) {
            if ((dx && canScrollAxis(el, 'x')) || (dy && canScrollAxis(el, 'y'))) {
              if (tryScrollElement(el)) {
                scrolled = true;
                break;
              }
            }
            el = el.parentElement;
          }
          if (scrolled) break;
        }

        const root = document.scrollingElement || document.documentElement || document.body;
        if (!scrolled && root) {
          const beforeX = window.scrollX || root.scrollLeft || 0;
          const beforeY = window.scrollY || root.scrollTop || 0;
          window.scrollBy(dx, dy);
          const afterX = window.scrollX || root.scrollLeft || 0;
          const afterY = window.scrollY || root.scrollTop || 0;
          scrolled = afterX !== beforeX || afterY !== beforeY;
        }

        return {
          x: window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
          y: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
          scrolled,
        };
      })()`,
      true,
    ) as (BrowserScrollResult & { scrolled?: boolean })

    if (!result.scrolled) {
      const [contentWidth, contentHeight] = record.window.getContentSize()
      const viewportHeight = Math.max(100, contentHeight - TOOLBAR_HEIGHT)
      const wheelX = Math.round(contentWidth / 2)
      const wheelY = Math.round(viewportHeight / 2)

      try {
        await record.cdp.dispatchMouseWheel(wheelX, wheelY, deltaX, deltaY)
      } catch (error) {
        mainLog.warn(
          `[browser-pane] CDP mouseWheel failed for ${id}, falling back to native sendInputEvent: ${error instanceof Error ? error.message : String(error)}`,
        )
        const webContents = record.pageView.webContents as typeof record.pageView.webContents & {
          sendInputEvent?: (event: Record<string, unknown>) => void
        }
        webContents.sendInputEvent?.({
          type: 'mouseWheel',
          x: wheelX,
          y: wheelY,
          deltaX,
          deltaY,
          canScroll: true,
        })
      }
    }

    if (typeof optionsOrDirection === 'string') {
      return
    }

    return { x: result.x, y: result.y }
  }

  async clickAt(id: string, x: number, y: number): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      await record.cdp.clickAtCoordinates(x, y)
      record.lastAction = {
        tool: 'browser_click_at',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      record.lastAction = {
        tool: 'browser_click_at',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async clickAtCoordinates(id: string, x: number, y: number): Promise<void> {
    return this.clickAt(id, x, y)
  }

  async drag(id: string, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      await record.cdp.drag(x1, y1, x2, y2)
      record.lastAction = {
        tool: 'browser_drag',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      record.lastAction = {
        tool: 'browser_drag',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async uploadFiles(id: string, ref: string, filePaths: string[]): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    const safePaths = filePaths.map((filePath) => this.validateUploadFilePath(filePath))
    return record.cdp.setFileInputFiles(ref, safePaths)
  }

  async uploadFile(id: string, ref: string, filePaths: string[]): Promise<BrowserElementGeometry> {
    return this.uploadFiles(id, ref, filePaths)
  }

  async typeText(id: string, text: string): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    try {
      await record.cdp.typeText(text)
      record.lastAction = {
        tool: 'browser_type',
        status: 'succeeded',
        timestamp: Date.now(),
      }
    } catch (error) {
      record.lastAction = {
        tool: 'browser_type',
        status: 'failed',
        timestamp: Date.now(),
      }
      throw error
    }
  }

  async pressKey(id: string, key: string, options?: BrowserKeyOptions): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.pressKey(key, options)
  }

  async sendKey(
    id: string,
    args: { key: string; modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'> },
  ): Promise<void> {
    return this.pressKey(id, args.key, { modifiers: args.modifiers })
  }

  async waitFor(id: string, options: BrowserWaitOptions): Promise<BrowserWaitResult> {
    const record = this.requireRecord(id)
    const timeoutMs = clampPositiveInt(options.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS)
    const started = Date.now()

    const until = async (predicate: () => Promise<boolean>, matched: string): Promise<BrowserWaitResult> => {
      while (Date.now() - started <= timeoutMs) {
        if (await predicate()) {
          return {
            kind: options.kind,
            matched,
            timeoutMs,
            elapsedMs: Date.now() - started,
          }
        }
        await sleep(DEFAULT_WAIT_POLL_MS)
      }

      throw new Error(`Wait timed out after ${timeoutMs}ms (${options.kind})`)
    }

    if (options.kind === 'selector') {
      const selector = options.value?.trim()
      if (!selector) throw new Error('wait selector requires a CSS selector value')
      return until(async () => {
        const exists = await record.pageView.webContents.executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
          true,
        )
        return Boolean(exists)
      }, `selector matched: ${selector}`)
    }

    if (options.kind === 'text') {
      const text = options.value?.trim()
      if (!text) throw new Error('wait text requires a text value')
      return until(async () => {
        const exists = await record.pageView.webContents.executeJavaScript(
          `Boolean(document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)}))`,
          true,
        )
        return Boolean(exists)
      }, `text found: ${text}`)
    }

    if (options.kind === 'url') {
      const needle = options.value?.trim()
      if (!needle) throw new Error('wait url requires a value')
      return until(
        async () => record.pageView.webContents.getURL().includes(needle),
        `url matched: ${needle}`,
      )
    }

    if (options.kind === 'network-idle') {
      return until(
        async () => !record.pageView.webContents.isLoading()
          && record.pendingRequestIds.size === 0
          && Date.now() - record.lastNetworkActivityAt >= DEFAULT_NETWORK_IDLE_MS,
        `network idle for ${DEFAULT_NETWORK_IDLE_MS}ms`,
      )
    }

    throw new Error(`Unknown wait kind: ${options.kind}`)
  }

  getConsoleEntries(id: string, limit?: number, level: BrowserConsoleLevel | 'all' = 'all'): BrowserConsoleEntry[] {
    const record = this.requireRecord(id)
    const maxEntries = clampPositiveInt(limit, 50)
    const filtered = level === 'all'
      ? record.consoleEntries
      : record.consoleEntries.filter((entry) => entry.level === level)
    return filtered.slice(-maxEntries)
  }

  getConsoleLogs(
    id: string,
    options?: { level?: 'all' | 'log' | 'info' | 'warn' | 'error'; limit?: number },
  ): BrowserConsoleEntry[] {
    const level = options?.level === 'warn' ? 'warning' : (options?.level ?? 'all')
    return this.getConsoleEntries(id, options?.limit, level as BrowserConsoleLevel | 'all')
  }

  getNetworkEntries(id: string, limit?: number, state: BrowserNetworkState | 'all' = 'all'): BrowserNetworkEntry[] {
    const record = this.requireRecord(id)
    const maxEntries = clampPositiveInt(limit, 50)
    const filtered = state === 'all'
      ? record.networkEntries
      : record.networkEntries.filter((entry) => entry.state === state)
    return filtered.slice(-maxEntries)
  }

  getNetworkLogs(
    id: string,
    options?: { limit?: number; status?: 'all' | 'failed' | '2xx' | '3xx' | '4xx' | '5xx'; method?: string; resourceType?: string },
  ): BrowserNetworkEntry[] {
    const record = this.requireRecord(id)
    const maxEntries = Math.max(1, Math.min(500, Number(options?.limit ?? 50)))
    const method = options?.method?.toUpperCase()
    const resourceType = options?.resourceType?.toLowerCase()
    const statusFilter = options?.status ?? 'all'

    const filtered = record.networkEntries.filter((entry) => {
      if (method && entry.method !== method) return false
      if (resourceType && (entry.resourceType ?? '').toLowerCase() !== resourceType) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'failed') return !entry.status || entry.state === 'failed'
      if (statusFilter === '2xx') return typeof entry.status === 'number' && entry.status >= 200 && entry.status < 300
      if (statusFilter === '3xx') return typeof entry.status === 'number' && entry.status >= 300 && entry.status < 400
      if (statusFilter === '4xx') return typeof entry.status === 'number' && entry.status >= 400 && entry.status < 500
      if (statusFilter === '5xx') return typeof entry.status === 'number' && entry.status >= 500 && entry.status < 600
      return true
    })

    return filtered.slice(-maxEntries)
  }

  async getDownloads(id: string, options?: BrowserDownloadOptions): Promise<BrowserDownloadEntry[]> {
    const record = this.requireRecord(id)
    const action = options?.action ?? 'list'
    const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 20)))

    if (action === 'wait') {
      const timeoutMs = Math.max(100, Number(options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS))
      const started = Date.now()
      while (Date.now() - started <= timeoutMs) {
        const hasTerminal = record.downloads.some((entry) =>
          entry.state === 'completed' || entry.state === 'interrupted' || entry.state === 'cancelled',
        )
        if (hasTerminal) break
        await sleep(100)
      }
    }

    return record.downloads.slice(-limit)
  }

  setClipboard(text: string): void
  setClipboard(id: string, text: string): Promise<void>
  setClipboard(targetOrText: string, maybeText?: string): void | Promise<void> {
    clipboard.writeText(maybeText ?? targetOrText)
    if (maybeText !== undefined) {
      return Promise.resolve()
    }
  }

  getClipboard(): string
  getClipboard(id: string): Promise<string>
  getClipboard(_id?: string): string | Promise<string> {
    const text = clipboard.readText()
    if (_id !== undefined) {
      return Promise.resolve(text)
    }
    return text
  }

  async paste(id: string, text: string): Promise<void> {
    this.setClipboard(text)
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.pressKey('v', {
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    })
  }

  windowResize(id: string, width: number, height: number): { width: number; height: number } {
    const record = this.requireRecord(id)
    const requestedWidth = Math.max(320, Math.floor(width))
    const requestedHeight = Math.max(240, Math.floor(height))
    record.window.setContentSize(requestedWidth, requestedHeight + TOOLBAR_HEIGHT)
    this.layoutViews(record)
    const [appliedWidth, appliedHeight] = record.window.getContentSize()
    return {
      width: Math.max(0, Math.floor(appliedWidth)),
      height: Math.max(0, Math.floor(appliedHeight - TOOLBAR_HEIGHT)),
    }
  }

  async detectSecurityChallenge(id: string): Promise<{ detected: boolean; provider: string; signals: string[] }> {
    const record = this.instances.get(id)
    if (!record) return { detected: false, provider: 'none', signals: [] }

    const signals: string[] = []
    const title = record.info.title || ''
    const url = record.info.url || ''

    if (/^Just a moment/i.test(title)) {
      signals.push('title:just-a-moment')
    }
    if (url.includes('/cdn-cgi/challenge-platform/')) {
      signals.push('url:cdn-cgi-challenge')
    }

    try {
      const domSignals = await record.pageView.webContents.executeJavaScript(`(() => {
        const signals = [];
        const bodyText = (document.body?.innerText || '').slice(0, 2000);
        if (/Verify you are human/i.test(bodyText)) signals.push('text:verify-human');
        if (/Checking (if the site connection is secure|your browser)/i.test(bodyText)) signals.push('text:checking-browser');
        if (/Performing security verification/i.test(bodyText)) signals.push('text:security-verification');
        if (document.querySelector('#challenge-form')) signals.push('dom:challenge-form');
        if (document.querySelector('#turnstile-wrapper')) signals.push('dom:turnstile-wrapper');
        if (document.querySelector('.cf-turnstile')) signals.push('dom:cf-turnstile');
        if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) signals.push('dom:cf-challenge-iframe');
        return signals;
      })()`) as string[]

      if (Array.isArray(domSignals)) {
        signals.push(...domSignals)
      }
    } catch {
      // Ignore DOM probe failures on transient states.
    }

    try {
      const snapshot = await record.cdp.getAccessibilitySnapshot()
      const actionableRoles = new Set([
        'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
        'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'slider', 'spinbutton', 'listbox',
      ])
      const actionableCount = snapshot.nodes.filter((node) => {
        const role = (node.role || '').toLowerCase()
        return actionableRoles.has(role) && !node.disabled
      }).length

      if (snapshot.nodes.length > 0 && actionableCount <= 2) {
        signals.push(`ax:near-empty(${actionableCount}/${snapshot.nodes.length})`)
      }
    } catch {
      // Ignore AX probe failures on transient states.
    }

    const detected = signals.length > 0
    const isCloudflare = signals.some((signal) =>
      signal.includes('cf-') || signal.includes('challenge') || signal.includes('turnstile') || signal === 'title:just-a-moment',
    )
    const provider = detected ? (isCloudflare ? 'cloudflare' : 'unknown') : 'none'

    if (detected) {
      mainLog.info(`[browser-pane] security challenge detected id=${id} provider=${provider} signals=[${signals.join(', ')}]`)
    }

    return { detected, provider, signals }
  }

  onStateChange(listener: BrowserPaneListener<BrowserInstanceInfo>): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onRemoved(listener: BrowserPaneListener<string>): () => void {
    this.removedListeners.add(listener)
    return () => this.removedListeners.delete(listener)
  }

  onInteracted(listener: BrowserPaneListener<string>): () => void {
    this.interactedListeners.add(listener)
    return () => this.interactedListeners.delete(listener)
  }

  registerToolbarIpc(): void {
    if (this.toolbarIpcRegistered) return
    this.toolbarIpcRegistered = true

    const findRecord = (instanceId: string): BrowserPaneRecord | undefined => {
      return this.instances.get(instanceId)
    }

    const register = (channel: string, handler: (...args: any[]) => Promise<unknown>) => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, handler)
    }

    register(BROWSER_TOOLBAR_CHANNELS.NAVIGATE, async (_event, instanceId: string, url: string) => {
      const record = findRecord(instanceId)
      if (record) {
        await this.navigate(record.id, url)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.GO_BACK, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        await this.goBack(record.id)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.GO_FORWARD, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        await this.goForward(record.id)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.RELOAD, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        await this.reload(record.id)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.STOP, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        await this.stop(record.id)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY, async (_event, instanceId: string, open: boolean, height?: number) => {
      const record = findRecord(instanceId)
      if (!record) return undefined

      if (!open) {
        this.forceCloseToolbarMenu(record, 'renderer-close')
        return undefined
      }

      const normalizedHeight = Math.max(0, Math.ceil(height ?? 0))
      const changed = !record.toolbarMenuOpen
        || record.toolbarMenuHeight !== normalizedHeight
        || !record.toolbarMenuOverlayActive
      record.toolbarMenuOpen = true
      record.toolbarMenuHeight = normalizedHeight
      record.toolbarMenuOverlayActive = true

      if (changed) {
        this.layoutViews(record)
      }

      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.HIDE, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        this.hide(record.id)
      }
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.DESTROY, async (_event, instanceId: string) => {
      const record = findRecord(instanceId)
      if (record) {
        this.destroyInstance(record.id)
      }
      return undefined
    })
  }

  private requireRecord(id: string): BrowserPaneRecord {
    const record = this.instances.get(id)
    if (!record) {
      throw new Error(`Browser window not found: ${id}`)
    }
    return record
  }

  private getRecordByWebContentsId(webContentsId: number): BrowserPaneRecord | null {
    for (const record of this.instances.values()) {
      if (record.pageView.webContents.id === webContentsId) {
        return record
      }
    }
    return null
  }

  private pushConsoleEntry(record: BrowserPaneRecord, entry: BrowserConsoleEntry): void {
    record.consoleEntries = trimArray([...record.consoleEntries, entry], CONSOLE_BUFFER_LIMIT)
  }

  private pushNetworkEntry(record: BrowserPaneRecord, entry: BrowserNetworkEntry): void {
    const nextEntries = [...record.networkEntries]
    const index = nextEntries.findIndex((existing) => existing.id === entry.id)
    if (index >= 0) {
      nextEntries[index] = { ...nextEntries[index], ...entry }
    } else {
      nextEntries.push(entry)
    }
    record.networkEntries = trimArray(nextEntries, NETWORK_BUFFER_LIMIT)
  }

  private pushDownloadEntry(record: BrowserPaneRecord, entry: BrowserDownloadEntry): void {
    const nextEntries = [...record.downloads]
    const index = nextEntries.findIndex((existing) => existing.id === entry.id)
    if (index >= 0) {
      nextEntries[index] = { ...nextEntries[index], ...entry }
    } else {
      nextEntries.push(entry)
    }
    record.downloads = trimArray(nextEntries, DOWNLOAD_BUFFER_LIMIT)
  }

  private recordNetworkEvent(webContentsId: number, details: BrowserNetworkRequestDetails, state: BrowserNetworkState): void {
    const record = this.getRecordByWebContentsId(webContentsId)
    if (!record) return

    const requestId = details.id ?? `${details.method ?? 'GET'}:${details.url ?? 'unknown'}`
    if (typeof details.id === 'number') {
      if (state === 'pending') {
        record.pendingRequestIds.add(details.id)
      } else {
        record.pendingRequestIds.delete(details.id)
      }
    }

    record.lastNetworkActivityAt = Date.now()
    this.pushNetworkEntry(record, {
      id: requestId,
      method: details.method ?? 'GET',
      url: details.url ?? record.pageView.webContents.getURL() ?? 'about:blank',
      status: details.statusCode,
      resourceType: details.resourceType,
      errorText: details.error,
      state,
      timestamp: Date.now(),
    })
  }

  private ensureNetworkTracking(browserSession: ElectronSession): void {
    const webRequest = (browserSession as ElectronSession & {
      webRequest?: {
        onBeforeRequest?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }, callback: (response: Record<string, never>) => void) => void) => void
        onCompleted?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }) => void) => void
        onErrorOccurred?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }) => void) => void
      }
    }).webRequest

    if (!this.networkTrackingRegistered && webRequest?.onBeforeRequest && webRequest.onCompleted && webRequest.onErrorOccurred) {
      this.networkTrackingRegistered = true

      webRequest.onBeforeRequest((details, callback) => {
        if (typeof details.webContentsId === 'number' && details.webContentsId > 0) {
          this.recordNetworkEvent(details.webContentsId, details, 'pending')
        }
        callback({})
      })

      webRequest.onCompleted((details) => {
        if (typeof details.webContentsId === 'number' && details.webContentsId > 0) {
          this.recordNetworkEvent(details.webContentsId, details, 'completed')
        }
      })

      webRequest.onErrorOccurred((details) => {
        if (typeof details.webContentsId === 'number' && details.webContentsId > 0) {
          this.recordNetworkEvent(details.webContentsId, details, 'failed')
        }
      })
    }

    if (!this.downloadTrackingRegistered) {
      this.downloadTrackingRegistered = true
      browserSession.on('will-download', (_event, item, webContents) => {
        const wcId = webContents?.id
        if (typeof wcId !== 'number') return
        const record = this.getRecordByWebContentsId(wcId)
        if (!record) return

        const downloadsDir = this.resolveDownloadsDir(record)
        const filename = this.uniqueFilename(downloadsDir, item.getFilename())
        const savePath = join(downloadsDir, filename)
        item.setSavePath(savePath)

        const downloadId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        this.pushDownloadEntry(record, {
          id: downloadId,
          timestamp: Date.now(),
          url: item.getURL(),
          filename,
          state: 'started',
          bytesReceived: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          mimeType: item.getMimeType() || 'application/octet-stream',
          savePath,
        })

        const onUpdated = (_evt: Electron.Event, state: string) => {
          this.pushDownloadEntry(record, {
            id: downloadId,
            timestamp: Date.now(),
            url: item.getURL(),
            filename,
            state: state === 'interrupted' ? 'interrupted' : 'started',
            bytesReceived: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            mimeType: item.getMimeType() || 'application/octet-stream',
            savePath,
          })
        }

        item.on('updated', onUpdated)
        item.once('done', (_evt, state) => {
          item.removeListener('updated', onUpdated)
          this.pushDownloadEntry(record, {
            id: downloadId,
            timestamp: Date.now(),
            url: item.getURL(),
            filename,
            state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted',
            bytesReceived: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            mimeType: item.getMimeType() || 'application/octet-stream',
            savePath: item.getSavePath() || savePath,
          })
        })
      })
    }
  }

  private resolveDownloadsDir(record: BrowserPaneRecord): string {
    const sessionId = record.info.boundSessionId ?? record.info.ownerSessionId
    const sessionPath = sessionId ? this.sessionPathResolver?.(sessionId) : undefined
    if (sessionPath) {
      const dir = join(sessionPath, 'downloads')
      mkdirSync(dir, { recursive: true })
      return dir
    }
    return app.getPath('downloads')
  }

  private uniqueFilename(dir: string, filename: string): string {
    if (!existsSync(join(dir, filename))) return filename
    const { name, ext } = parse(filename)
    let counter = 1
    while (existsSync(join(dir, `${name}_${counter}${ext}`))) {
      counter += 1
    }
    return `${name}_${counter}${ext}`
  }

  private async waitForToolbarReady(record: BrowserPaneRecord, timeoutMs = 2_000): Promise<void> {
    if (record.toolbarReady) return

    const started = Date.now()
    while (!record.toolbarReady && Date.now() - started <= timeoutMs) {
      await sleep(25)
    }

    if (!record.toolbarReady) {
      throw new Error(`Browser toolbar did not become ready after ${timeoutMs}ms`)
    }
  }

  private async prepareInput(record: BrowserPaneRecord): Promise<void> {
    await this.waitForToolbarReady(record).catch(() => {})

    if (record.window.isMinimized()) {
      record.window.restore()
    }

    if (!record.window.isVisible()) {
      record.window.show()
    }

    record.window.focus()
    record.pageView.webContents.focus()
    this.emitInteracted(record.id)
    this.emitState(record)
  }

  private async waitForScreenshotReadiness(record: BrowserPaneRecord): Promise<void> {
    try {
      await this.waitFor(record.id, {
        kind: 'network-idle',
        timeoutMs: 1_000,
      })
    } catch {
      // Ignore readiness timeout and proceed after a bounded delay.
    }
    await sleep(SCREENSHOT_RETRY_DELAY_MS)
  }

  private isDisplaySurfaceUnavailableError(error: unknown): boolean {
    return error instanceof Error && error.message.toLowerCase().includes('current display surface not available for capture')
  }

  private async capturePageImage(
    record: BrowserPaneRecord,
    options: {
      format: 'png' | 'jpeg'
      jpegQuality: number
      useHiddenCaptureOptions: boolean
    },
  ): Promise<{ buffer: Buffer; format: 'png' | 'jpeg' } | null> {
    const capturePage = record.pageView.webContents.capturePage as any
    const captureOptions = options.useHiddenCaptureOptions
      ? { stayHidden: true, stayAwake: true }
      : undefined

    let image: any
    if (captureOptions) {
      image = await capturePage.call(record.pageView.webContents, undefined, captureOptions)
    } else {
      image = await capturePage.call(record.pageView.webContents)
    }

    if (!image) return null
    if (typeof image.isEmpty === 'function' && image.isEmpty()) {
      return null
    }

    const buffer = options.format === 'jpeg'
      ? image.toJPEG(options.jpegQuality)
      : image.toPNG()

    if (!buffer || buffer.length === 0) {
      return null
    }

    return { buffer, format: options.format }
  }

  private async capturePageWithRecovery(
    record: BrowserPaneRecord,
    options: {
      format: 'png' | 'jpeg'
      jpegQuality: number
    },
  ): Promise<{ buffer: Buffer; format: 'png' | 'jpeg' }> {
    let sawDisplaySurfaceUnavailable = false

    for (let attempt = 1; attempt <= SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS; attempt += 1) {
      try {
        const captured = await this.capturePageImage(record, {
          ...options,
          useHiddenCaptureOptions: true,
        })
        if (captured) return captured
      } catch (error) {
        if (this.isDisplaySurfaceUnavailableError(error)) {
          sawDisplaySurfaceUnavailable = true
          mainLog.warn(`[browser-pane] screenshot display surface unavailable id=${record.id} attempt=${attempt}/${SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS}`)
        } else {
          throw error
        }
      }

      if (attempt < SCREENSHOT_HIDDEN_CAPTURE_ATTEMPTS) {
        await this.waitForScreenshotReadiness(record)
      }
    }

    const wasVisible = record.window.isVisible()
    try {
      if (!wasVisible && !record.window.isDestroyed()) {
        if (record.window.isMinimized()) {
          record.window.restore()
        }
        ;(record.window as BrowserWindow & { showInactive?: () => void }).showInactive?.() ?? record.window.show()
        await sleep(SCREENSHOT_RESCUE_PAINT_DELAY_MS)
        await this.waitForScreenshotReadiness(record)
      }

      const rescue = await this.capturePageImage(record, {
        ...options,
        useHiddenCaptureOptions: false,
      })
      if (rescue) return rescue
    } catch (error) {
      if (this.isDisplaySurfaceUnavailableError(error)) {
        sawDisplaySurfaceUnavailable = true
      } else {
        throw error
      }
    } finally {
      if (!wasVisible && !record.window.isDestroyed()) {
        record.window.hide()
      }
    }

    if (sawDisplaySurfaceUnavailable) {
      throw new Error(`Failed to capture screenshot: current display surface is unavailable. Try focusing the browser window and retry.`)
    }

    throw new Error('Failed to capture screenshot: empty image buffer')
  }

  private validateUploadFilePath(filePath: string): string {
    let normalizedPath = filePath.trim()
    if (!normalizedPath) {
      throw new Error('Upload path cannot be empty')
    }

    if (normalizedPath.startsWith('~')) {
      normalizedPath = join(homedir(), normalizedPath.slice(1))
    }

    if (!isAbsolute(normalizedPath)) {
      throw new Error(`Upload path must be absolute: ${filePath}`)
    }

    const resolvedPath = existsSync(normalizedPath)
      ? realpathSync(normalizedPath)
      : resolve(normalizedPath)
    const safePath = normalizePath(resolvedPath)
    const allowedRoots = [homedir(), tmpdir()].flatMap((dir) => {
      const normalized = normalizePath(dir)
      const resolvedRoot = existsSync(dir) ? normalizePath(realpathSync(dir)) : normalized
      return resolvedRoot === normalized ? [normalized] : [normalized, resolvedRoot]
    })
    const isAllowed = allowedRoots.some((root) => safePath === root || safePath.startsWith(`${root}${sep}`))
    if (!isAllowed) {
      throw new Error(`Access denied for upload path (outside allowed directories): ${filePath}`)
    }

    if (SENSITIVE_UPLOAD_PATTERNS.some((pattern) => pattern.test(safePath))) {
      throw new Error(`Access denied for upload path (sensitive file): ${filePath}`)
    }

    if (!existsSync(safePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    return safePath
  }

  private attachWindow(record: BrowserPaneRecord): void {
    const { id, window, toolbarView, pageView, nativeOverlayView } = record
    const emitState = () => this.emitState(record)

    window.on('close', (event) => {
      if (!record.explicitDestroyRequested && record.keepAliveOnWindowClose) {
        event.preventDefault()
        this.hide(id)
      }
    })
    window.on('show', emitState)
    window.on('hide', emitState)
    window.on('focus', () => {
      emitState()
      this.emitInteracted(id)
    })
    window.on('resize', () => this.layoutViews(record))
    window.on('hide', () => this.forceCloseToolbarMenu(record, 'window-hide-event'))
    window.on('enter-full-screen', () => this.layoutViews(record))
    window.on('leave-full-screen', () => this.layoutViews(record))
    window.on('closed', () => {
      record.explicitDestroyRequested = false
      this.applyAgentControlLock(record, false)
      record.cdp.detach()
      if (!this.instances.delete(id)) return
      this.emitRemoved(id)
    })

    toolbarView.webContents.on('did-finish-load', () => {
      this.markToolbarReady(record, 'toolbar-load-finalized')
    })

    pageView.webContents.on('did-start-loading', emitState)
    pageView.webContents.on('will-navigate', (event, url) => {
      if (this.isEmptyStateBridgeUrl(url)) {
        event.preventDefault()
        void this.maybeHandleEmptyStateBridgeNavigation(record, url)
        return
      }
      this.emitInteracted(id)
    })
    pageView.webContents.on('did-stop-loading', () => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
    })
    pageView.webContents.on('did-navigate', (_event, url) => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
      void this.maybeHandleEmptyStateLaunch(record, url)
    })
    pageView.webContents.on('did-navigate-in-page', (_event, url) => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
      void this.maybeHandleEmptyStateLaunch(record, url)
    })
    pageView.webContents.on('page-title-updated', (event) => {
      event.preventDefault()
      emitState()
    })
    pageView.webContents.on('page-favicon-updated', (_event, favicons) => {
      record.info.favicon = favicons[0] ?? null
      emitState()
    })
    pageView.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      this.pushConsoleEntry(record, {
        level: normalizeConsoleLevel(level),
        message,
        sourceId,
        line,
        timestamp: Date.now(),
      })
    })
    pageView.webContents.on('before-input-event', (event) => {
      if (record.lockState.active) {
        event.preventDefault()
        return
      }
      this.emitInteracted(id)
    })
    toolbarView.webContents.on('before-input-event', (event) => {
      if (record.lockState.active) {
        event.preventDefault()
      }
    })
    nativeOverlayView.webContents.on('before-input-event', (event, input) => {
      if (!record.toolbarMenuOverlayActive) return
      const inputType = input.type || ''
      if (inputType === 'mouseDown' || inputType === 'touchStart' || inputType === 'pointerDown') {
        event.preventDefault()
        this.forceCloseToolbarMenu(record, 'overlay-tap')
      }
    })
    pageView.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      mainLog.warn(`[browser-pane] Failed to load ${validatedUrl} for ${id}: ${errorDescription}`)
      emitState()
    })
    pageView.webContents.setWindowOpenHandler(({ url }) => {
      if (shouldOpenExternally(url)) {
        void shell.openExternal(url)
      } else {
        const childId = this.createInstance({ show: true, url })
        void this.focus(childId)
      }
      return { action: 'deny' }
    })
  }

  private layoutViews(record: BrowserPaneRecord): void {
    const [width, height] = record.window.getContentSize()
    const toolbarHeight = this.getToolbarEffectiveHeight(record, height)
    record.toolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
    record.toolbarView.setAutoResize({ width: true, height: false })
    record.pageView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(100, height - TOOLBAR_HEIGHT) })
    record.pageView.setAutoResize({ width: true, height: true })
    this.updateNativeOverlayState(record)
    if (!record.window.isDestroyed()) {
      record.window.setTopBrowserView(record.toolbarView)
    }
  }

  private getToolbarEffectiveHeight(record: BrowserPaneRecord, contentHeight?: number): number {
    if (!record.toolbarMenuOpen) return TOOLBAR_HEIGHT
    return Math.max(TOOLBAR_HEIGHT, contentHeight ?? record.window.getContentSize()[1])
  }

  private forceCloseToolbarMenu(record: BrowserPaneRecord, reason: string): void {
    if (!record.toolbarMenuOpen && record.toolbarMenuHeight === 0 && !record.toolbarMenuOverlayActive) return

    record.toolbarMenuOpen = false
    record.toolbarMenuHeight = 0
    record.toolbarMenuOverlayActive = false
    this.layoutViews(record)

    if (!record.window.isDestroyed() && !record.toolbarView.webContents.isDestroyed()) {
      record.toolbarView.webContents.send(BROWSER_TOOLBAR_CHANNELS.FORCE_CLOSE_MENU, { reason })
    }
  }

  private async loadToolbarPage(record: BrowserPaneRecord): Promise<void> {
    const query = `instanceId=${encodeURIComponent(record.id)}`
    let lastError: unknown = null

    for (let attempt = 0; attempt <= TOOLBAR_LOAD_MAX_RETRIES; attempt += 1) {
      try {
        if (VITE_DEV_SERVER_URL) {
          await record.toolbarView.webContents.loadURL(`${VITE_DEV_SERVER_URL}/browser-toolbar.html?${query}`)
        } else {
          await record.toolbarView.webContents.loadFile(
            join(__dirname, 'renderer/browser-toolbar.html'),
            { query: { instanceId: record.id } },
          )
        }

        if (attempt > 0) {
          mainLog.info(`[browser-pane] toolbar load recovered id=${record.id} attempt=${attempt + 1}`)
        }
        return
      } catch (error) {
        lastError = error
        const retrying = attempt < TOOLBAR_LOAD_MAX_RETRIES
        mainLog.warn(
          `[browser-pane] toolbar load failed id=${record.id} attempt=${attempt + 1}/${TOOLBAR_LOAD_MAX_RETRIES + 1}: ${error instanceof Error ? error.message : String(error)}${retrying ? ' (retrying)' : ''}`,
        )
        if (retrying) {
          await sleep(TOOLBAR_LOAD_RETRY_DELAY_MS)
        }
      }
    }

    const safeReason = String(lastError instanceof Error ? lastError.message : lastError ?? 'unknown error').replace(/[<>&]/g, (character) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
    }[character] || character))

    await record.toolbarView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Toolbar Error</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafb; color: #1f2937; }
      @media (prefers-color-scheme: dark) { html, body { background: #2b292e; color: #e5e7eb; } }
      .wrap { height: 100%; display: flex; align-items: center; justify-content: center; }
      .card { max-width: 640px; margin: 0 20px; padding: 14px 16px; border-radius: 10px; background: rgba(127,127,127,0.12); font-size: 12px; line-height: 1.45; }
      .title { font-weight: 600; margin-bottom: 6px; }
      .muted { opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="title">Browser toolbar failed to load</div>
        <div class="muted">The page area still works, but toolbar UI is unavailable. Try reopening the browser window.</div>
        <div class="muted" style="margin-top: 8px; word-break: break-word;">Reason: ${safeReason}</div>
      </div>
    </div>
  </body>
</html>`)}`)
  }

  private markToolbarReady(record: BrowserPaneRecord, reason: string): void {
    if (record.toolbarReady || record.window.isDestroyed()) return

    record.toolbarReady = true
    this.pushToolbarState(record)
    mainLog.info(`[browser-pane] toolbar ready id=${record.id} reason=${reason}`)

    if (!record.showWhenReady && !record.pendingShowOnReady) return

    record.showWhenReady = false
    record.pendingShowOnReady = false
    record.window.show()
    record.window.focus()
    record.pageView.webContents.focus()
    this.emitState(record)
  }

  private getResolvedAccentColor(): string {
    const isDark = nativeTheme.shouldUseDarkColors
    const userTheme = loadAppTheme()
    return isDark
      ? (userTheme?.dark?.accent ?? userTheme?.accent ?? DEFAULT_THEME.dark?.accent ?? DEFAULT_THEME.accent ?? '#7c3aed')
      : (userTheme?.accent ?? DEFAULT_THEME.accent ?? '#7c3aed')
  }

  private getAgentControlLabel(control: Pick<NonNullable<BrowserPaneRecord['agentControl']>, 'displayName' | 'intent'> | null | undefined): string {
    if (control?.intent) {
      return `${control.displayName ?? 'Agent'} - ${control.intent}`
    }
    return control?.displayName ?? 'Agent is working...'
  }

  private async loadNativeOverlayPage(record: BrowserPaneRecord): Promise<void> {
    const liveFxPlatform: Parameters<typeof getBrowserLiveFxCornerRadii>[0] =
      process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
        ? process.platform
        : 'other'
    const cornerRadii = getBrowserLiveFxCornerRadii(liveFxPlatform)

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #overlay {
        position: fixed;
        inset: 0;
        border: ${BROWSER_LIVE_FX_BORDER.width} ${BROWSER_LIVE_FX_BORDER.style} transparent;
        border-top-left-radius: ${cornerRadii.topLeft};
        border-top-right-radius: ${cornerRadii.topRight};
        border-bottom-left-radius: ${cornerRadii.bottomLeft};
        border-bottom-right-radius: ${cornerRadii.bottomRight};
        box-sizing: border-box;
        pointer-events: none;
        transition:
          border-color 180ms ease,
          box-shadow 220ms ease;
      }
      #chip {
        position: fixed;
        top: 8px;
        right: 8px;
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 7px;
        background: rgba(2, 6, 23, 0.82);
        color: rgba(236, 254, 255, 0.95);
        font-size: 11px;
        line-height: 1.2;
        backdrop-filter: blur(4px);
        max-width: calc(100vw - 16px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px) scale(0.98);
        transition:
          opacity 140ms ease,
          transform 180ms ease,
          visibility 0ms linear 180ms;
      }
      #shield {
        position: fixed;
        inset: 0;
        pointer-events: none;
        cursor: default;
        background: rgba(0, 0, 0, 0);
        transition: background 160ms ease;
      }
    </style>
  </head>
  <body>
    <div id="overlay">
      <div id="shield"></div>
      <div id="chip">Agent is working...</div>
    </div>
  </body>
</html>`

    try {
      await record.nativeOverlayView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
      record.nativeOverlayReady = true
      this.updateNativeOverlayState(record)
    } catch (error) {
      record.nativeOverlayReady = false
      mainLog.warn(`[browser-pane] Native overlay failed to load for ${record.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private updateNativeOverlayState(record: BrowserPaneRecord): void {
    const agentActive = !!record.agentControl?.active
    const menuActive = !!record.toolbarMenuOverlayActive
    const shouldShow = agentActive || menuActive

    if (!shouldShow || !record.nativeOverlayReady || record.window.isDestroyed()) {
      record.nativeOverlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      if (!record.window.isDestroyed()) {
        record.window.setTopBrowserView(record.toolbarView)
      }
      return
    }

    const [width, height] = record.window.getContentSize()
    const overlayHeight = Math.max(100, height - TOOLBAR_HEIGHT)
    record.nativeOverlayView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: overlayHeight })
    record.nativeOverlayView.setAutoResize({ width: true, height: true })
    record.window.setTopBrowserView(record.toolbarView)

    if (agentActive) {
      const label = this.getAgentControlLabel(record.agentControl)
      const accent = this.getResolvedAccentColor()
      const borderFx = resolveBrowserLiveFxBorder(accent)
      void record.nativeOverlayView.webContents.executeJavaScript(`(() => {
        const overlay = document.getElementById('overlay');
        const chip = document.getElementById('chip');
        const shield = document.getElementById('shield');
        if (!overlay || !chip || !shield) return;

        overlay.style.borderColor = ${JSON.stringify(borderFx.color)};
        overlay.style.boxShadow = ${JSON.stringify(borderFx.boxShadow)};
        chip.textContent = ${JSON.stringify(label)};
        chip.style.opacity = '1';
        chip.style.visibility = 'visible';
        chip.style.transform = 'translateY(0) scale(1)';
        chip.style.transitionDelay = '0ms, 0ms, 0ms';
        shield.style.pointerEvents = 'auto';
        shield.style.cursor = 'not-allowed';
        shield.style.background = 'rgba(2, 6, 23, 0.03)';
      })()`).catch(() => {})
      return
    }

    void record.nativeOverlayView.webContents.executeJavaScript(`(() => {
      const overlay = document.getElementById('overlay');
      const chip = document.getElementById('chip');
      const shield = document.getElementById('shield');
      if (!overlay || !chip || !shield) return;

      overlay.style.borderColor = 'transparent';
      overlay.style.boxShadow = 'none';
      chip.style.opacity = '0';
      chip.style.visibility = 'hidden';
      chip.style.transform = 'translateY(-4px) scale(0.98)';
      chip.style.transitionDelay = '0ms, 0ms, 180ms';
      shield.style.pointerEvents = 'auto';
      shield.style.cursor = 'default';
      shield.style.background = 'rgba(0, 0, 0, 0.001)';
    })()`).catch(() => {})
  }

  private getWindowResizable(window: BrowserWindow): boolean {
    return typeof (window as BrowserWindow & { isResizable?: () => boolean }).isResizable === 'function'
      ? (window as BrowserWindow & { isResizable: () => boolean }).isResizable()
      : true
  }

  private setWindowResizable(window: BrowserWindow, value: boolean): void {
    if (typeof (window as BrowserWindow & { setResizable?: (next: boolean) => void }).setResizable === 'function') {
      ;(window as BrowserWindow & { setResizable: (next: boolean) => void }).setResizable(value)
    }
  }

  private applyAgentControlLock(record: BrowserPaneRecord, active: boolean): void {
    const wantsLock = active && !!record.agentControl?.active

    if (wantsLock && !record.lockState.active) {
      record.lockState.previousResizable = this.getWindowResizable(record.window)
      this.setWindowResizable(record.window, false)
      record.lockState.active = true
      return
    }

    if (!wantsLock && record.lockState.active) {
      this.setWindowResizable(record.window, record.lockState.previousResizable)
      record.lockState.active = false
    }
  }

  private syncInfo(record: BrowserPaneRecord): void {
    const currentUrl = record.pageView.webContents.getURL()
    const isStartPage = currentUrl === record.startPageUrl || this.isBrowserEmptyStateUrl(currentUrl)
    const title = record.pageView.webContents.getTitle().trim()

    record.info.url = isStartPage ? 'about:blank' : (currentUrl || 'about:blank')
    record.info.title = title || (isStartPage ? 'New Browser Window' : record.info.url)
    record.info.favicon = isStartPage ? null : record.info.favicon
    record.info.isLoading = record.pageView.webContents.isLoading()
    record.info.canGoBack = record.pageView.webContents.canGoBack()
    record.info.canGoForward = record.pageView.webContents.canGoForward()
    record.info.isVisible = record.window.isVisible()
    record.info.agentControlActive = !!record.agentControl?.active
    record.window.setTitle(record.info.title)
  }

  private pushToolbarState(record: BrowserPaneRecord): void {
    if (!record.toolbarReady || record.window.isDestroyed() || record.toolbarView.webContents.isDestroyed()) return

    record.toolbarView.webContents.send(BROWSER_TOOLBAR_CHANNELS.STATE_UPDATE, {
      url: record.info.url,
      title: record.info.title,
      isLoading: record.info.isLoading,
      canGoBack: record.info.canGoBack,
      canGoForward: record.info.canGoForward,
      themeColor: record.info.themeColor,
    })
  }

  private emitState(record: BrowserPaneRecord): void {
    this.syncInfo(record)
    const snapshot = { ...record.info }
    this.pushToolbarState(record)
    for (const listener of this.stateListeners) {
      listener(snapshot)
    }
  }

  private emitRemoved(id: string): void {
    for (const listener of this.removedListeners) {
      listener(id)
    }
  }

  private emitInteracted(id: string): void {
    for (const listener of this.interactedListeners) {
      listener(id)
    }
  }

  private async updateThemeColor(record: BrowserPaneRecord): Promise<void> {
    try {
      const currentUrl = record.pageView.webContents.getURL()
      if (!currentUrl || currentUrl === 'about:blank' || this.isBrowserEmptyStateUrl(currentUrl)) {
        if (record.info.themeColor !== null) {
          record.info.themeColor = null
          this.pushToolbarState(record)
        }
        return
      }

      const color = await record.pageView.webContents.executeJavaScript(THEME_COLOR_EXTRACTOR, true) as string | null
      const normalized = typeof color === 'string' && color.trim() ? color : null
      if (record.info.themeColor === normalized) return
      record.info.themeColor = normalized
      if (record.toolbarReady && !record.toolbarView.webContents.isDestroyed()) {
        record.toolbarView.webContents.send(BROWSER_TOOLBAR_CHANNELS.THEME_COLOR, normalized)
      }
      this.emitState(record)
    } catch (error) {
      mainLog.debug?.(`[browser-pane] Theme color extraction failed for ${record.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private waitForNavigation(record: BrowserPaneRecord, timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Navigation wait timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const onNavigate = () => {
        cleanup()
        resolve()
      }

      const cleanup = () => {
        clearTimeout(timer)
        record.pageView.webContents.removeListener('did-navigate', onNavigate)
        record.pageView.webContents.removeListener('did-navigate-in-page', onNavigate)
      }

      record.pageView.webContents.once('did-navigate', onNavigate)
      record.pageView.webContents.once('did-navigate-in-page', onNavigate)
    })
  }

  private isBrowserEmptyStateUrl(url: string): boolean {
    if (!url) return false
    return url.includes(`/${BROWSER_EMPTY_STATE_PAGE}`) || url.includes(`\\${BROWSER_EMPTY_STATE_PAGE}`)
  }

  private findInstanceByPageWebContentsId(senderWebContentsId: number): BrowserPaneRecord | undefined {
    for (const record of this.instances.values()) {
      if (record.pageView.webContents.id === senderWebContentsId) {
        return record
      }
    }
    return undefined
  }

  async handleEmptyStateLaunchFromRenderer(
    senderWebContentsId: number,
    payload: BrowserEmptyStateLaunchPayload,
  ): Promise<BrowserEmptyStateLaunchResult> {
    const record = this.findInstanceByPageWebContentsId(senderWebContentsId)
    if (!record) {
      mainLog.warn(`[browser-pane] empty-state launch ignored: sender not mapped senderWebContentsId=${senderWebContentsId}`)
      return { ok: false, handled: false, reason: 'instance_not_found' }
    }

    const route = payload.route?.trim()
    if (!route) {
      mainLog.warn(`[browser-pane] empty-state launch missing route id=${record.id}`)
      return { ok: false, handled: false, reason: 'missing_route' }
    }

    const token = payload.token ?? null
    const handled = await this.triggerEmptyStateRouteLaunch(record, route, token, 'ipc')
    return {
      ok: true,
      handled,
      reason: handled ? undefined : 'duplicate',
    }
  }

  private buildDeepLinkFromRoute(route: string): string {
    return `agentoperator://${route.replace(/^\/+/, '')}`
  }

  private async triggerEmptyStateRouteLaunch(
    record: BrowserPaneRecord,
    route: string,
    token: string | null,
    source: 'hash' | 'bridge' | 'ipc',
  ): Promise<boolean> {
    const dedupeToken = token ?? route
    if (dedupeToken && record.lastLaunchToken === dedupeToken) {
      mainLog.info(`[browser-pane] ignoring duplicate empty-state launch id=${record.id} source=${source} token=${dedupeToken}`)
      return false
    }
    record.lastLaunchToken = dedupeToken

    if (source === 'hash') {
      void record.pageView.webContents.executeJavaScript(
        "if (window.location.hash.includes('launch=')) history.replaceState(null, '', window.location.pathname + window.location.search);",
        true,
      ).catch(() => {})
    }

    mainLog.info(`[browser-pane] handling empty-state launch id=${record.id} source=${source} route=${route}`)
    await shell.openExternal(this.buildDeepLinkFromRoute(route))
    return true
  }

  private isEmptyStateBridgeUrl(url: string): boolean {
    return url.startsWith(`${BROWSER_EMPTY_STATE_LAUNCH_SCHEME}//launch?`)
  }

  private async maybeHandleEmptyStateBridgeNavigation(record: BrowserPaneRecord, url: string): Promise<boolean> {
    if (!this.isEmptyStateBridgeUrl(url)) {
      return false
    }

    const currentUrl = record.pageView.webContents.getURL()
    if (!this.isBrowserEmptyStateUrl(currentUrl)) {
      mainLog.warn(`[browser-pane] ignoring empty-state bridge launch outside browser empty state id=${record.id} currentUrl=${currentUrl}`)
      return true
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return true
    }

    const route = parsed.searchParams.get('route')?.trim()
    const token = parsed.searchParams.get('ts')?.trim() || route || null
    if (!route) {
      return true
    }

    await this.triggerEmptyStateRouteLaunch(record, route, token, 'bridge')
    return true
  }

  private async maybeHandleEmptyStateLaunch(record: BrowserPaneRecord, url: string): Promise<void> {
    if (!this.isBrowserEmptyStateUrl(url) || !url.includes('#launch=')) {
      return
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }

    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    const launchPayload = hash.startsWith('launch=') ? hash.slice('launch='.length) : hash
    const launchParams = new URLSearchParams(launchPayload)
    const route = launchParams.get('route')?.trim()
    const token = launchParams.get('ts')?.trim() || route || null
    if (!route) return

    await this.triggerEmptyStateRouteLaunch(record, route, token, 'hash')
  }

  private async waitForNetworkIdle(record: BrowserPaneRecord, timeoutMs = 8_000): Promise<void> {
    await this.waitFor(record.id, {
      kind: 'network-idle',
      timeoutMs,
    })
  }
}
