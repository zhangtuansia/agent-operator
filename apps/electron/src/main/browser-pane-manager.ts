import { randomUUID } from 'crypto'
import { BrowserView, BrowserWindow, clipboard, ipcMain, nativeTheme, shell, session, type Session as ElectronSession } from 'electron'
import { existsSync, realpathSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { isAbsolute, join, normalize as normalizePath, resolve, sep } from 'path'
import { mainLog } from './logger'
import { BrowserCDP } from './browser-cdp'
import { DEFAULT_THEME, loadAppTheme } from '@agent-operator/shared/config'
import { getBrowserLiveFxCornerRadii } from '../shared/browser-live-fx'
import {
  BROWSER_TOOLBAR_CHANNELS,
  type BrowserAccessibilitySnapshot,
  type BrowserConsoleEntry,
  type BrowserConsoleLevel,
  type BrowserClickOptions,
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

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const BROWSER_PANE_PARTITION = 'persist:browser-pane'
const DEFAULT_WINDOW_SIZE = { width: 1240, height: 860 }
const DEFAULT_WINDOW_MIN_SIZE = { width: 920, height: 640 }
const TOOLBAR_HEIGHT = 48
const START_PAGE_SENTINEL = 'dazi-browser-start-page'
const NETWORK_BUFFER_LIMIT = 200
const CONSOLE_BUFFER_LIMIT = 200
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const DEFAULT_WAIT_POLL_MS = 100
const DEFAULT_NETWORK_IDLE_MS = 700
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
  toolbarMenuOpen: boolean
  toolbarMenuHeight: number
  toolbarMenuOverlayActive: boolean
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
  pendingRequestIds: Set<number>
  lastNetworkActivityAt: number
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
  const resourcesDir = join(__dirname, '../resources')
  const iconPath = process.platform === 'darwin'
    ? join(resourcesDir, 'icon.icns')
    : process.platform === 'win32'
      ? join(resourcesDir, 'icon.ico')
      : join(resourcesDir, 'icon.png')

  return existsSync(iconPath) ? iconPath : undefined
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
  const html = `<!doctype html>
<html lang="zh-CN" data-page="${START_PAGE_SENTINEL}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>新建浏览器窗口</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f3ef;
        color: #171717;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          background: #161616;
          color: #f5f5f5;
        }
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(117, 142, 255, 0.18), transparent 34%),
          radial-gradient(circle at bottom, rgba(255, 183, 120, 0.14), transparent 30%),
          var(--page-bg, transparent);
      }
      .shell {
        width: min(720px, calc(100vw - 48px));
        border-radius: 28px;
        padding: 28px;
        background: rgba(255, 255, 255, 0.84);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.12);
        backdrop-filter: blur(18px);
      }
      @media (prefers-color-scheme: dark) {
        .shell {
          background: rgba(32, 32, 32, 0.86);
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 28px 72px rgba(0, 0, 0, 0.36);
        }
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.04);
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 10px;
        font-size: clamp(30px, 5vw, 46px);
        line-height: 1.02;
      }
      p {
        margin: 0 0 22px;
        font-size: 15px;
        line-height: 1.55;
        color: rgba(0, 0, 0, 0.68);
      }
      @media (prefers-color-scheme: dark) {
        p {
          color: rgba(255, 255, 255, 0.7);
        }
      }
      form {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }
      input {
        flex: 1;
        height: 50px;
        border-radius: 16px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        padding: 0 16px;
        font-size: 15px;
        background: rgba(255, 255, 255, 0.92);
        color: inherit;
      }
      button {
        height: 50px;
        border: 0;
        border-radius: 16px;
        padding: 0 18px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        background: #18181b;
        color: white;
      }
      @media (prefers-color-scheme: dark) {
        input {
          background: rgba(20, 20, 20, 0.92);
          border-color: rgba(255, 255, 255, 0.08);
        }
        button {
          background: #fafafa;
          color: #111;
        }
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .chip {
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: transparent;
        color: inherit;
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 13px;
        cursor: pointer;
      }
      @media (prefers-color-scheme: dark) {
        .chip {
          border-color: rgba(255, 255, 255, 0.12);
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="eyebrow">Browser Workspace</div>
      <h1>打开一个受应用管理的浏览器窗口。</h1>
      <p>这里可以直接输入网址、搜索词，或者跳到常用站点。窗口会出现在顶部浏览器条里，后续也能接浏览器自动化动作。</p>
      <form id="browser-form">
        <input id="browser-target" autofocus placeholder="输入网址或搜索内容" />
        <button type="submit">打开</button>
      </form>
      <div class="chips">
        <button class="chip" data-target="https://www.github.com" type="button">GitHub</button>
        <button class="chip" data-target="https://www.notion.so" type="button">Notion</button>
        <button class="chip" data-target="https://news.ycombinator.com" type="button">Hacker News</button>
        <button class="chip" data-target="https://www.google.com" type="button">Google</button>
      </div>
    </main>
    <script>
      const normalizeTarget = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return 'about:blank';
        if (/^[a-zA-Z][a-zA-Z\\d+.-]*:/.test(trimmed)) return trimmed;
        if (/^(localhost|127(?:\\.\\d{1,3}){3}|0\\.0\\.0\\.0|\\d{1,3}(?:\\.\\d{1,3}){3})(:\\d+)?(?:\\/|$)/i.test(trimmed)) {
          return 'http://' + trimmed;
        }
        if (trimmed.includes(' ') || (!trimmed.includes('.') && !trimmed.includes('/'))) {
          return 'https://www.bing.com/search?q=' + encodeURIComponent(trimmed);
        }
        return 'https://' + trimmed;
      };

      const openTarget = (value) => {
        window.location.href = normalizeTarget(value);
      };

      const form = document.getElementById('browser-form');
      const input = document.getElementById('browser-target');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        openTarget(input.value);
      });

      for (const button of document.querySelectorAll('[data-target]')) {
        button.addEventListener('click', () => openTarget(button.getAttribute('data-target')));
      }
    </script>
  </body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export class BrowserPaneManager {
  private readonly instances = new Map<string, BrowserPaneRecord>()
  private readonly stateListeners = new Set<BrowserPaneListener<BrowserInstanceInfo>>()
  private readonly removedListeners = new Set<BrowserPaneListener<string>>()
  private readonly interactedListeners = new Set<BrowserPaneListener<string>>()
  private toolbarIpcRegistered = false
  private networkTrackingRegistered = false

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

    const sharedSession = session.fromPartition(BROWSER_PANE_PARTITION)
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
        partition: BROWSER_PANE_PARTITION,
        session: sharedSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const toolbarView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_PARTITION,
        session: sharedSession,
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const pageView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_PARTITION,
        session: sharedSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    const nativeOverlayView = new BrowserView({
      webPreferences: {
        partition: BROWSER_PANE_PARTITION,
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
      toolbarMenuOpen: false,
      toolbarMenuHeight: 0,
      toolbarMenuOverlayActive: false,
      agentControl: null,
      lockState: {
        active: false,
        previousResizable: this.getWindowResizable(window),
      },
      nativeOverlayReady: false,
      consoleEntries: [],
      networkEntries: [],
      pendingRequestIds: new Set(),
      lastNetworkActivityAt: Date.now(),
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
    this.forceCloseToolbarMenu(record, 'window-hidden')
    record.window.hide()
    this.emitState(record)
  }

  destroyInstance(id: string): void {
    const record = this.instances.get(id)
    if (!record) return
    this.forceCloseToolbarMenu(record, 'window-destroyed')
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
    const geometry = await record.cdp.clickElement(ref)

    if (options?.waitFor === 'navigation') {
      await this.waitForNavigation(record, options.timeoutMs)
    } else if (options?.waitFor === 'network-idle') {
      await this.waitForNetworkIdle(record, options.timeoutMs)
    }

    return geometry
  }

  async fillElement(id: string, ref: string, value: string): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    return record.cdp.fillElement(ref, value)
  }

  async selectOption(id: string, ref: string, value: string): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    return record.cdp.selectOption(ref, value)
  }

  async screenshot(id: string, options?: BrowserScreenshotOptions): Promise<BrowserScreenshotResult> {
    const record = this.requireRecord(id)
    const format = options?.format === 'jpeg' ? 'jpeg' : 'png'
    let annotatedRefs: string[] = []
    let overlayApplied = false

    try {
      if (options?.annotate || (options?.refs && options.refs.length > 0)) {
        let refs = options?.refs ?? []
        if (refs.length === 0) {
          const snapshot = await record.cdp.getAccessibilitySnapshot()
          refs = snapshot.nodes.slice(0, 60).map((node) => node.ref)
        }

        const settled = await Promise.allSettled(refs.map((ref) => record.cdp.getElementGeometry(ref)))
        const geometries = settled
          .filter((result): result is PromiseFulfilledResult<BrowserElementGeometry> => result.status === 'fulfilled')
          .map((result) => result.value)

        if (geometries.length > 0) {
          annotatedRefs = geometries.map((geometry) => geometry.ref)
          await record.cdp.renderTemporaryOverlay(geometries)
          overlayApplied = true
        }
      }

      const image = await record.pageView.webContents.capturePage()
      const buffer = format === 'jpeg'
        ? image.toJPEG(Math.max(1, Math.min(100, options?.jpegQuality ?? 90)))
        : image.toPNG()

      return {
        dataUrl: `data:image/${format};base64,${buffer.toString('base64')}`,
        format,
        metadata: annotatedRefs.length > 0 ? { annotatedRefs } : undefined,
      }
    } finally {
      if (overlayApplied) {
        await record.cdp.clearTemporaryOverlay().catch(() => {})
      }
    }
  }

  async evaluate(id: string, expression: string): Promise<unknown> {
    const record = this.requireRecord(id)
    return record.pageView.webContents.executeJavaScript(expression, true)
  }

  async scroll(id: string, options?: BrowserScrollOptions): Promise<BrowserScrollResult> {
    const record = this.requireRecord(id)
    const amount = options?.amount ?? 500
    const deltaX = options?.deltaX ?? (
      options?.direction === 'left' ? -amount
        : options?.direction === 'right' ? amount
          : 0
    )
    const deltaY = options?.deltaY ?? (
      options?.direction === 'up' ? -amount
        : options?.direction === 'down' ? amount
          : 0
    )

    return record.pageView.webContents.executeJavaScript(
      `(() => { window.scrollBy(${deltaX}, ${deltaY}); return { x: window.scrollX || 0, y: window.scrollY || 0 }; })()`,
      true,
    ) as Promise<BrowserScrollResult>
  }

  async clickAt(id: string, x: number, y: number): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.clickAtCoordinates(x, y)
  }

  async drag(id: string, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.drag(x1, y1, x2, y2)
  }

  async uploadFiles(id: string, ref: string, filePaths: string[]): Promise<BrowserElementGeometry> {
    const record = this.requireRecord(id)
    const safePaths = filePaths.map((filePath) => this.validateUploadFilePath(filePath))
    return record.cdp.setFileInputFiles(ref, safePaths)
  }

  async typeText(id: string, text: string): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.typeText(text)
  }

  async pressKey(id: string, key: string, options?: BrowserKeyOptions): Promise<void> {
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.pressKey(key, options)
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

  getNetworkEntries(id: string, limit?: number, state: BrowserNetworkState | 'all' = 'all'): BrowserNetworkEntry[] {
    const record = this.requireRecord(id)
    const maxEntries = clampPositiveInt(limit, 50)
    const filtered = state === 'all'
      ? record.networkEntries
      : record.networkEntries.filter((entry) => entry.state === state)
    return filtered.slice(-maxEntries)
  }

  setClipboard(text: string): void {
    clipboard.writeText(text)
  }

  getClipboard(): string {
    return clipboard.readText()
  }

  async paste(id: string, text: string): Promise<void> {
    this.setClipboard(text)
    const record = this.requireRecord(id)
    await this.prepareInput(record)
    await record.cdp.pressKey('v', {
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    })
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

    const register = (channel: string, handler: (...args: any[]) => Promise<unknown>) => {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, handler)
    }

    register(BROWSER_TOOLBAR_CHANNELS.NAVIGATE, async (_event, instanceId: string, url: string) => {
      await this.navigate(instanceId, url)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.GO_BACK, async (_event, instanceId: string) => {
      await this.goBack(instanceId)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.GO_FORWARD, async (_event, instanceId: string) => {
      await this.goForward(instanceId)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.RELOAD, async (_event, instanceId: string) => {
      await this.reload(instanceId)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.STOP, async (_event, instanceId: string) => {
      await this.stop(instanceId)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY, async (_event, instanceId: string, open: boolean, height?: number) => {
      const record = this.requireRecord(instanceId)

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
      this.hide(instanceId)
      return undefined
    })
    register(BROWSER_TOOLBAR_CHANNELS.DESTROY, async (_event, instanceId: string) => {
      this.destroyInstance(instanceId)
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
    if (this.networkTrackingRegistered) return

    const webRequest = (browserSession as ElectronSession & {
      webRequest?: {
        onBeforeRequest?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }, callback: (response: Record<string, never>) => void) => void) => void
        onCompleted?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }) => void) => void
        onErrorOccurred?: (listener: (details: BrowserNetworkRequestDetails & { webContentsId?: number }) => void) => void
      }
    }).webRequest

    if (!webRequest?.onBeforeRequest || !webRequest.onCompleted || !webRequest.onErrorOccurred) {
      return
    }

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
      this.applyAgentControlLock(record, false)
      record.cdp.detach()
      if (!this.instances.delete(id)) return
      this.emitRemoved(id)
    })

    toolbarView.webContents.on('did-finish-load', () => {
      record.toolbarReady = true
      this.pushToolbarState(record)
      if (!record.showWhenReady) return
      record.showWhenReady = false
      record.window.show()
      record.window.focus()
      record.pageView.webContents.focus()
      emitState()
    })

    pageView.webContents.on('did-start-loading', emitState)
    pageView.webContents.on('did-stop-loading', () => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
    })
    pageView.webContents.on('did-navigate', () => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
    })
    pageView.webContents.on('did-navigate-in-page', () => {
      record.pendingRequestIds.clear()
      record.lastNetworkActivityAt = Date.now()
      emitState()
      void this.updateThemeColor(record)
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
    try {
      if (VITE_DEV_SERVER_URL) {
        await record.toolbarView.webContents.loadURL(`${VITE_DEV_SERVER_URL}/browser-toolbar.html?instanceId=${encodeURIComponent(record.id)}`)
      } else {
        await record.toolbarView.webContents.loadFile(
          join(__dirname, 'renderer/browser-toolbar.html'),
          { query: { instanceId: record.id } },
        )
      }
    } catch (error) {
      mainLog.warn(`[browser-pane] Browser toolbar failed to load for ${record.id}: ${error instanceof Error ? error.message : String(error)}`)
      const safeReason = String(error instanceof Error ? error.message : error).replace(/[<>&]/g, (character) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
      }[character] || character))

      await record.toolbarView.webContents.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
<html>
  <body style="margin:0;font:12px -apple-system, BlinkMacSystemFont, sans-serif;background:${nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f3ef'};color:${nativeTheme.shouldUseDarkColors ? '#f5f5f5' : '#171717'};display:flex;align-items:center;justify-content:center;min-height:${TOOLBAR_HEIGHT}px;">
    <div>Browser toolbar failed to load: ${safeReason}</div>
  </body>
</html>`)}`)
    }
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
        border: 2px solid transparent;
        border-top-left-radius: ${cornerRadii.topLeft};
        border-top-right-radius: ${cornerRadii.topRight};
        border-bottom-left-radius: ${cornerRadii.bottomLeft};
        border-bottom-right-radius: ${cornerRadii.bottomRight};
        box-sizing: border-box;
        pointer-events: none;
      }
      #chip {
        position: fixed;
        top: 8px;
        right: 8px;
        display: none;
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
      }
      #shield {
        position: fixed;
        inset: 0;
        pointer-events: none;
        cursor: default;
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
      void record.nativeOverlayView.webContents.executeJavaScript(`(() => {
        const overlay = document.getElementById('overlay');
        const chip = document.getElementById('chip');
        const shield = document.getElementById('shield');
        if (!overlay || !chip || !shield) return;

        overlay.style.borderColor = ${JSON.stringify(accent)};
        overlay.style.boxShadow = 'inset 0 0 0 1px color-mix(in oklab, ' + ${JSON.stringify(accent)} + ' 45%, transparent), inset 0 0 24px color-mix(in oklab, ' + ${JSON.stringify(accent)} + ' 28%, transparent)';
        chip.textContent = ${JSON.stringify(label)};
        chip.style.display = 'inline-flex';
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
      chip.style.display = 'none';
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
    const isStartPage = currentUrl === record.startPageUrl || currentUrl.includes(START_PAGE_SENTINEL)
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
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.includes(START_PAGE_SENTINEL)) {
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

  private async waitForNetworkIdle(record: BrowserPaneRecord, timeoutMs = 8_000): Promise<void> {
    await this.waitFor(record.id, {
      kind: 'network-idle',
      timeoutMs,
    })
  }
}
