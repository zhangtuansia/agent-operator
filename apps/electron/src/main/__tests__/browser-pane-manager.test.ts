import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROWSER_TOOLBAR_CHANNELS } from '../../shared/types'
import { resolveBrowserLiveFxBorder } from '../../shared/browser-live-fx'

const createdWindows: any[] = []
const createdViews: any[] = []
const mockShellOpenExternal = mock(async () => {})
const mockIpcMainHandle = mock(() => {})
const mockIpcMainRemoveHandler = mock(() => {})
const mockBrowserCdpInstances: any[] = []
let nextWebContentsId = 1
let clipboardText = ''
const webRequestListeners: Record<string, Function[]> = {
  beforeRequest: [],
  completed: [],
  errorOccurred: [],
}
const sessionListeners: Record<string, Function[]> = {
  willDownload: [],
}

function createMockWebContents() {
  const listeners: Record<string, Function[]> = {}
  let currentUrl = 'about:blank'
  let currentTitle = 'New Browser Window'
  let visible = false
  let loading = false
  let windowOpenHandler: ((details: { url: string }) => { action: 'allow' | 'deny' }) | null = null
  const id = nextWebContentsId++

  return {
    id,
    session: {},
    on: mock((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    }),
    once: mock((event: string, cb: Function) => {
      const wrapped = (...args: any[]) => {
        listeners[event] = (listeners[event] || []).filter((entry) => entry !== wrapped)
        cb(...args)
      }
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(wrapped)
    }),
    removeListener: mock((event: string, cb: Function) => {
      listeners[event] = (listeners[event] || []).filter((entry) => entry !== cb)
    }),
    loadURL: mock(async (url: string) => {
      loading = true
      currentUrl = url
      currentTitle = url.startsWith('data:text/html') ? 'New Browser Window' : 'Loaded Page'
      for (const cb of listeners['did-start-loading'] || []) cb()
      loading = false
      for (const cb of listeners['did-stop-loading'] || []) cb()
      for (const cb of listeners['did-navigate'] || []) cb({}, url)
      return undefined
    }),
    loadFile: mock(async (_path: string, _opts?: unknown) => {
      for (const cb of listeners['did-finish-load'] || []) cb()
      return undefined
    }),
    getURL: mock(() => currentUrl),
    getTitle: mock(() => currentTitle),
    canGoBack: mock(() => false),
    canGoForward: mock(() => false),
    isLoading: mock(() => loading),
    focus: mock(() => {
      visible = true
    }),
    sendInputEvent: mock((_event: Record<string, unknown>) => {}),
    capturePage: mock(async () => ({
      toPNG: () => Buffer.from('png-data'),
      toJPEG: (_quality: number) => Buffer.from('jpeg-data'),
    })),
    executeJavaScript: mock(async (expression: string) => {
      if (expression.includes('window.scrollBy')) {
        return { x: 0, y: 500, scrolled: false }
      }
      return null
    }),
    setWindowOpenHandler: mock((handler: (details: { url: string }) => { action: 'allow' | 'deny' }) => {
      windowOpenHandler = handler
    }),
    send: mock((_channel: string, _payload?: unknown) => {}),
    isDestroyed: mock(() => false),
    setBackgroundColor: mock((_color: string) => {}),
    _emit: (event: string, ...args: any[]) => {
      for (const cb of listeners[event] || []) cb(...args)
    },
    _triggerWindowOpen: (url: string) => windowOpenHandler?.({ url }),
  }
}

function createMockBrowserView() {
  const webContents = createMockWebContents()
  const view = {
    webContents,
    setBounds: mock(() => {}),
    setAutoResize: mock(() => {}),
  }
  createdViews.push(view)
  return view
}

function createMockWindow(opts?: { width?: number; height?: number; minWidth?: number; minHeight?: number }) {
  const listeners: Record<string, Function[]> = {}
  let contentWidth = opts?.width ?? 1240
  let contentHeight = opts?.height ?? 860
  let visible = false
  let resizable = true
  let destroyed = false

  const win = {
    on: mock((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    }),
    isDestroyed: mock(() => destroyed),
    isMinimized: mock(() => false),
    restore: mock(() => {}),
    show: mock(() => {
      visible = true
      for (const cb of listeners.show || []) cb()
    }),
    showInactive: mock(() => {
      visible = true
      for (const cb of listeners.show || []) cb()
    }),
    hide: mock(() => {
      visible = false
      for (const cb of listeners.hide || []) cb()
    }),
    focus: mock(() => {
      visible = true
      for (const cb of listeners.focus || []) cb()
    }),
    close: mock(() => {
      let prevented = false
      const event = {
        preventDefault: () => {
          prevented = true
        },
      }
      for (const cb of listeners.close || []) cb(event)
      if (prevented) return
      destroyed = true
      for (const cb of listeners.closed || []) cb()
    }),
    addBrowserView: mock((_view: any) => {}),
    setTopBrowserView: mock((_view: any) => {}),
    getContentSize: mock(() => [contentWidth, contentHeight]),
    setContentSize: mock((width: number, height: number) => {
      contentWidth = width
      contentHeight = height
    }),
    isResizable: mock(() => resizable),
    setResizable: mock((next: boolean) => {
      resizable = next
    }),
    setTitle: mock((_title: string) => {}),
    isVisible: mock(() => visible),
  }
  createdWindows.push(win)
  return win
}

mock.module('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    constructor(opts?: any) {
      Object.assign(this, createMockWindow(opts))
    }
  },
  BrowserView: class MockBrowserView {
    constructor(_opts?: any) {
      Object.assign(this, createMockBrowserView())
    }
  },
  ipcMain: {
    handle: mockIpcMainHandle,
    removeHandler: mockIpcMainRemoveHandler,
  },
  nativeTheme: {
    shouldUseDarkColors: false,
  },
  shell: {
    openExternal: mockShellOpenExternal,
  },
  app: {
    getPath: mock((name: string) => (name === 'downloads' ? join(tmpdir(), 'downloads') : tmpdir())),
  },
  clipboard: {
    writeText: mock((text: string) => {
      clipboardText = text
    }),
    readText: mock(() => clipboardText),
  },
  session: {
    fromPartition: mock(() => ({
      webRequest: {
        onBeforeRequest: mock((listener: Function) => {
          webRequestListeners.beforeRequest.push(listener)
        }),
        onCompleted: mock((listener: Function) => {
          webRequestListeners.completed.push(listener)
        }),
        onErrorOccurred: mock((listener: Function) => {
          webRequestListeners.errorOccurred.push(listener)
        }),
      },
      on: mock((event: string, listener: Function) => {
        if (event === 'will-download') {
          sessionListeners.willDownload.push(listener)
        }
      }),
    })),
  },
}))

mock.module('../logger', () => {
  const stubLog = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
  return {
    mainLog: stubLog,
    sessionLog: stubLog,
    handlerLog: stubLog,
    windowLog: stubLog,
    agentLog: stubLog,
    searchLog: stubLog,
    isDebugMode: false,
    getLogFilePath: () => '/tmp/main.log',
  }
})

mock.module('../browser-cdp', () => ({
  BrowserCDP: class MockBrowserCDP {
    constructor() {
      this.detach = mock(() => {})
      this.getAccessibilitySnapshot = mock(async () => ({
        url: 'https://example.com',
        title: 'Example Page',
        nodes: [{ ref: '@e1', role: 'button', name: 'Continue' }],
      }))
      this.getElementGeometry = mock(async (ref: string) => ({
        ref,
        role: 'button',
        name: 'Continue',
        box: { x: 10, y: 20, width: 100, height: 40 },
        clickPoint: { x: 60, y: 40 },
      }))
      this.getViewportMetrics = mock(async () => ({
        width: 1280,
        height: 720,
        dpr: 2,
        scrollX: 0,
        scrollY: 0,
      }))
      this.clickElement = mock(async (ref: string) => this.getElementGeometry(ref))
      this.clickAtCoordinates = mock(async () => {})
      this.drag = mock(async () => {})
      this.fillElement = mock(async (ref: string) => this.getElementGeometry(ref))
      this.selectOption = mock(async (ref: string) => this.getElementGeometry(ref))
      this.typeText = mock(async () => {})
      this.dispatchMouseWheel = mock(async () => {})
      this.pressKey = mock(async () => {})
      this.setFileInputFiles = mock(async (ref: string) => this.getElementGeometry(ref))
      this.renderTemporaryOverlay = mock(async () => {})
      this.clearTemporaryOverlay = mock(async () => {})
      mockBrowserCdpInstances.push(this)
    }

    detach: any
    getAccessibilitySnapshot: any
    getElementGeometry: any
    getViewportMetrics: any
    clickElement: any
    clickAtCoordinates: any
    drag: any
    fillElement: any
    selectOption: any
    typeText: any
    dispatchMouseWheel: any
    pressKey: any
    setFileInputFiles: any
    renderTemporaryOverlay: any
    clearTemporaryOverlay: any
  },
}))

const { BrowserPaneManager } = await import('../browser-pane-manager')

function getToolbarHandler(channel: string): ((...args: any[]) => Promise<unknown>) | undefined {
  return (mockIpcMainHandle as any).mock.calls.find((call: any[]) => call[0] === channel)?.[1]
}

describe('BrowserPaneManager', () => {
  let manager: InstanceType<typeof BrowserPaneManager>

  beforeEach(() => {
    createdWindows.length = 0
    createdViews.length = 0
    mockBrowserCdpInstances.length = 0
    nextWebContentsId = 1
    clipboardText = ''
    webRequestListeners.beforeRequest.length = 0
    webRequestListeners.completed.length = 0
    webRequestListeners.errorOccurred.length = 0
    sessionListeners.willDownload.length = 0
    mockShellOpenExternal.mockClear()
    mockIpcMainHandle.mockClear()
    mockIpcMainRemoveHandler.mockClear()
    manager = new BrowserPaneManager()
  })

  it('creates, reuses, and lists managed browser windows', () => {
    const first = manager.createInstance({ id: 'pane-1', bindToSessionId: 'session-1', ownerType: 'session' })
    const second = manager.createInstance('pane-1')
    const list = manager.listInstances()

    expect(first).toBe('pane-1')
    expect(second).toBe('pane-1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'pane-1',
      boundSessionId: 'session-1',
      ownerType: 'session',
      ownerSessionId: 'session-1',
    })
  })

  it('navigates in-app for normal URLs and uses the OS for external schemes', async () => {
    const id = manager.createInstance({ id: 'pane-nav' })

    await manager.navigate(id, 'example.com')
    expect(manager.listInstances()[0]?.url).toBe('https://example.com')

    await manager.navigate(id, 'mailto:test@example.com')
    expect(mockShellOpenExternal).toHaveBeenCalledWith('mailto:test@example.com')
  })

  it('captures annotated screenshots through BrowserCDP overlay helpers', async () => {
    const id = manager.createInstance({ id: 'pane-shot' })
    const cdp = mockBrowserCdpInstances[0]

    const result = await manager.screenshot(id, { annotate: true, format: 'png' })

    expect(result.format).toBe('png')
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.metadata).toMatchObject({
      mode: 'agent',
      annotatedRefs: ['@e1'],
      viewport: { width: 1280, height: 720, dpr: 2, scrollX: 0, scrollY: 0 },
      targets: [
        {
          ref: '@e1',
          role: 'button',
          name: 'Continue',
        },
      ],
    })
    expect(cdp.renderTemporaryOverlay).toHaveBeenCalledTimes(1)
    expect(cdp.clearTemporaryOverlay).toHaveBeenCalledTimes(1)
  })

  it('includes last action geometry in annotated screenshots when requested', async () => {
    const id = manager.createInstance({ id: 'pane-last-action' })
    const record = (manager as any).instances.get(id)
    record.lastAction = {
      tool: 'browser_click',
      ref: '@e-last',
      status: 'succeeded',
      timestamp: Date.now(),
      geometry: {
        ref: '@e-last',
        role: 'button',
        name: 'Last Action',
        box: { x: 40, y: 60, width: 90, height: 32 },
        clickPoint: { x: 85, y: 76 },
      },
    }

    const result = await manager.screenshot(id, { annotate: true, includeLastAction: true, includeMetadata: true })

    expect(result.metadata?.annotatedRefs).toEqual(['@e1', '@e-last'])
    expect((record.cdp.renderTemporaryOverlay as any).mock.calls[0]?.[0]).toMatchObject({
      includeMetadata: true,
      includeClickPoints: true,
    })
  })

  it('records failed lastAction on browser interactions', async () => {
    manager.createInstance({ id: 'pane-last-action-fail' })
    const record = (manager as any).instances.get('pane-last-action-fail')
    record.cdp.clickElement = mock(async () => { throw new Error('click failed') })
    record.cdp.fillElement = mock(async () => { throw new Error('fill failed') })
    record.cdp.selectOption = mock(async () => { throw new Error('select failed') })

    await expect(manager.clickElement('pane-last-action-fail', '@e1')).rejects.toThrow('click failed')
    expect(record.lastAction).toMatchObject({ tool: 'browser_click', ref: '@e1', status: 'failed' })

    await expect(manager.fillElement('pane-last-action-fail', '@e2', 'hello')).rejects.toThrow('fill failed')
    expect(record.lastAction).toMatchObject({ tool: 'browser_fill', ref: '@e2', status: 'failed' })

    await expect(manager.selectOption('pane-last-action-fail', '@e3', 'opt-1')).rejects.toThrow('select failed')
    expect(record.lastAction).toMatchObject({ tool: 'browser_select', ref: '@e3', status: 'failed' })
  })

  it('registers toolbar IPC handlers once', () => {
    manager.registerToolbarIpc()
    manager.registerToolbarIpc()

    expect(mockIpcMainHandle).toHaveBeenCalledTimes(8)
    expect(mockIpcMainRemoveHandler).toHaveBeenCalledTimes(8)
  })

  it('activates native overlay and lock state while browser tools are running', () => {
    const id = manager.createInstance({ id: 'pane-overlay', bindToSessionId: 'session-overlay', ownerType: 'session' })
    const record = (manager as any).instances.get(id)

    expect(createdViews).toHaveLength(3)
    record.nativeOverlayReady = true

    manager.setAgentControl('session-overlay', { displayName: 'Browser', intent: 'Click Continue' })

    expect(manager.listInstances()[0]?.agentControlActive).toBe(true)
    expect(record.lockState.active).toBe(true)
    expect(record.nativeOverlayView.setBounds).toHaveBeenCalled()

    manager.clearAgentControl('session-overlay')

    expect(manager.listInstances()[0]?.agentControlActive).toBe(false)
    expect(record.lockState.active).toBe(false)
  })

  it('applies shared live FX border styling to the native overlay', async () => {
    const id = manager.createInstance({ id: 'pane-overlay-style', bindToSessionId: 'session-overlay-style', ownerType: 'session' })
    const record = (manager as any).instances.get(id)
    record.nativeOverlayReady = true

    manager.setAgentControl('session-overlay-style', { displayName: 'Browser', intent: 'Click Continue' })
    await Promise.resolve()

    const calls = record.nativeOverlayView.webContents.executeJavaScript.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const script = String(calls[calls.length - 1][0])
    const expectedBorder = resolveBrowserLiveFxBorder((manager as any).getResolvedAccentColor())
    expect(script).toContain(expectedBorder.color)
    expect(script).toContain(expectedBorder.boxShadow)
    expect(script).toContain("shield.style.cursor = 'not-allowed'")
  })

  it('resets native overlay styling back to idle when menu overlay stays active after agent control clears', async () => {
    const id = manager.createInstance({ id: 'pane-overlay-reset', bindToSessionId: 'session-overlay-reset', ownerType: 'session' })
    const record = (manager as any).instances.get(id)
    record.nativeOverlayReady = true
    manager.registerToolbarIpc()

    const menuGeometryHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY)
    await menuGeometryHandler?.({}, id, true, 120)

    manager.setAgentControl('session-overlay-reset', { displayName: 'Browser', intent: 'Click Continue' })
    manager.clearAgentControl('session-overlay-reset')
    await Promise.resolve()

    const calls = record.nativeOverlayView.webContents.executeJavaScript.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const script = String(calls[calls.length - 1][0])
    expect(script).toContain("overlay.style.borderColor = 'transparent'")
    expect(script).toContain("overlay.style.boxShadow = 'none'")
    expect(script).toContain("shield.style.cursor = 'default'")
  })

  it('expands toolbar menu overlay and hides it through toolbar IPC', async () => {
    const id = manager.createInstance({ id: 'pane-toolbar-menu' })
    const record = (manager as any).instances.get(id)
    manager.registerToolbarIpc()

    const menuGeometryHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY)
    const hideHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.HIDE)

    expect(menuGeometryHandler).toBeDefined()
    expect(hideHandler).toBeDefined()

    await menuGeometryHandler?.({}, id, true, 120)

    expect(record.toolbarMenuOpen).toBe(true)
    expect(record.toolbarMenuOverlayActive).toBe(true)
    expect(record.toolbarView.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1240, height: 860 })

    await hideHandler?.({}, id)

    expect(record.toolbarMenuOpen).toBe(false)
    expect(record.toolbarMenuOverlayActive).toBe(false)
    expect(record.toolbarView.webContents.send).toHaveBeenCalledWith(
      BROWSER_TOOLBAR_CHANNELS.FORCE_CLOSE_MENU,
      { reason: 'window-hidden' },
    )
  })

  it('ignores toolbar IPC after the browser instance is destroyed', async () => {
    const id = manager.createInstance({ id: 'pane-toolbar-destroyed' })
    manager.registerToolbarIpc()

    const menuGeometryHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY)
    const hideHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.HIDE)
    const destroyHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.DESTROY)

    manager.destroyInstance(id)

    await expect(menuGeometryHandler?.({}, id, true, 120)).resolves.toBeUndefined()
    await expect(hideHandler?.({}, id)).resolves.toBeUndefined()
    await expect(destroyHandler?.({}, id)).resolves.toBeUndefined()
  })

  it('closes the toolbar menu when the native overlay is tapped', async () => {
    const id = manager.createInstance({ id: 'pane-overlay-tap' })
    const record = (manager as any).instances.get(id)
    manager.registerToolbarIpc()

    const menuGeometryHandler = getToolbarHandler(BROWSER_TOOLBAR_CHANNELS.MENU_GEOMETRY)
    await menuGeometryHandler?.({}, id, true, 120)

    const preventDefault = mock(() => {})
    record.nativeOverlayView.webContents._emit('before-input-event', { preventDefault }, { type: 'mouseDown' })

    expect(preventDefault).toHaveBeenCalled()
    expect(record.toolbarMenuOpen).toBe(false)
    expect(record.toolbarMenuOverlayActive).toBe(false)
    expect(record.toolbarView.webContents.send).toHaveBeenCalledWith(
      BROWSER_TOOLBAR_CHANNELS.FORCE_CLOSE_MENU,
      { reason: 'overlay-tap' },
    )
  })

  it('pushes toolbar theme color updates when page theme changes', async () => {
    const id = manager.createInstance({ id: 'pane-theme-color' })
    const record = (manager as any).instances.get(id)
    record.toolbarReady = true
    record.pageView.webContents.getURL = mock(() => 'https://example.com/app')
    record.pageView.webContents.executeJavaScript = mock(async () => '#112233')

    await (manager as any).updateThemeColor(record)

    expect(record.info.themeColor).toBe('#112233')
    expect(record.toolbarView.webContents.send).toHaveBeenCalledWith(
      BROWSER_TOOLBAR_CHANNELS.THEME_COLOR,
      '#112233',
    )
    expect(record.toolbarView.webContents.send).toHaveBeenCalledWith(
      BROWSER_TOOLBAR_CHANNELS.STATE_UPDATE,
      expect.objectContaining({ themeColor: '#112233' }),
    )
  })

  it('supports advanced input actions, wait, clipboard, console, and network logs', async () => {
    const id = manager.createInstance({ id: 'pane-advanced' })
    const cdp = mockBrowserCdpInstances[0]
    const record = (manager as any).instances.get('pane-advanced')
    record.toolbarReady = true
    const tempDir = mkdtempSync(join(tmpdir(), 'browser-pane-manager-test-'))
    const uploadPath = join(tempDir, 'demo.txt')
    writeFileSync(uploadPath, 'demo')

    try {
      await manager.clickAt(id, 100, 120)
      await manager.drag(id, 10, 20, 30, 40)
      await manager.typeText(id, 'hello')
      await manager.pressKey(id, 'Enter')
      await manager.uploadFiles(id, '@e1', [uploadPath])
      manager.setClipboard('clipboard text')
      await manager.scroll(id, 'down', 500)

      expect(await manager.getClipboard()).toBe('clipboard text')
      await manager.paste(id, 'paste text')

      expect(cdp.clickAtCoordinates).toHaveBeenCalledWith(100, 120)
      expect(cdp.drag).toHaveBeenCalledWith(10, 20, 30, 40)
      expect(cdp.typeText).toHaveBeenCalledWith('hello')
      expect(cdp.pressKey).toHaveBeenCalled()
      expect(record.window.show).toHaveBeenCalled()
      expect(record.window.focus).toHaveBeenCalled()
      expect(record.pageView.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('document.elementFromPoint'),
        true,
      )
      expect(cdp.dispatchMouseWheel).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 0, 500)
      expect((cdp.setFileInputFiles as any).mock.calls[0]?.[0]).toBe('@e1')
      expect((cdp.setFileInputFiles as any).mock.calls[0]?.[1]?.[0]).toContain('/browser-pane-manager-test-')
      expect((cdp.setFileInputFiles as any).mock.calls[0]?.[1]?.[0]).toContain('/demo.txt')

      record.pageView.webContents._emit('console-message', {}, 2, 'warn message', 12, 'https://example.com/app.js')
      const consoleEntries = manager.getConsoleEntries(id, 10, 'warning')
      expect(consoleEntries).toHaveLength(1)
      expect(consoleEntries[0]?.message).toBe('warn message')

      for (const listener of webRequestListeners.beforeRequest) {
        listener({ id: 1, webContentsId: record.pageView.webContents.id, method: 'GET', url: 'https://example.com', resourceType: 'mainFrame' }, () => {})
      }
      for (const listener of webRequestListeners.completed) {
        listener({ id: 1, webContentsId: record.pageView.webContents.id, method: 'GET', url: 'https://example.com', resourceType: 'mainFrame', statusCode: 200 })
      }
      for (const listener of webRequestListeners.beforeRequest) {
        listener({ id: 2, webContentsId: record.pageView.webContents.id, method: 'POST', url: 'https://example.com/api', resourceType: 'xhr' }, () => {})
      }
      for (const listener of webRequestListeners.errorOccurred) {
        listener({ id: 2, webContentsId: record.pageView.webContents.id, method: 'POST', url: 'https://example.com/api', resourceType: 'xhr', error: 'Connection reset' })
      }

      const networkEntries = manager.getNetworkEntries(id, 10, 'all')
      expect(networkEntries.map((entry) => entry.state)).toEqual(['completed', 'failed'])

      record.lastNetworkActivityAt = Date.now() - 800
      const waitResult = await manager.waitFor(id, { kind: 'network-idle', timeoutMs: 1_000 })
      expect(waitResult.kind).toBe('network-idle')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps browser windows alive on close and only destroys on explicit destroy', () => {
    const id = manager.createInstance({ id: 'pane-keepalive' })
    const window = createdWindows[0]

    window.close()
    expect(manager.listInstances().some((entry) => entry.id === id)).toBe(true)
    expect(window.hide).toHaveBeenCalled()

    manager.destroyInstance(id)
    expect(manager.listInstances().some((entry) => entry.id === id)).toBe(false)
  })

  it('tracks browser downloads and stores them in the session downloads folder when bound', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'browser-pane-downloads-'))
    manager.setSessionPathResolver(() => tempDir)
    const id = manager.createInstance({ id: 'pane-downloads', bindToSessionId: 'session-downloads', ownerType: 'session' })
    const record = (manager as any).instances.get(id)

    let receivedBytes = 0
    let savePath = ''
    const itemListeners: Record<string, Function[]> = { updated: [], done: [] }
    const item = {
      getFilename: () => 'report.pdf',
      setSavePath: (value: string) => { savePath = value },
      getURL: () => 'https://example.com/report.pdf',
      getReceivedBytes: () => receivedBytes,
      getTotalBytes: () => 2048,
      getMimeType: () => 'application/pdf',
      getSavePath: () => savePath,
      on: (event: string, listener: Function) => {
        if (!itemListeners[event]) itemListeners[event] = []
        itemListeners[event].push(listener)
      },
      once: (event: string, listener: Function) => {
        if (!itemListeners[event]) itemListeners[event] = []
        itemListeners[event].push(listener)
      },
      removeListener: (event: string, listener: Function) => {
        itemListeners[event] = (itemListeners[event] || []).filter((entry) => entry !== listener)
      },
    }

    try {
      for (const listener of sessionListeners.willDownload) {
        listener({}, item, record.pageView.webContents)
      }

      receivedBytes = 1024
      for (const listener of itemListeners.updated || []) {
        listener({}, 'progressing')
      }

      receivedBytes = 2048
      for (const listener of itemListeners.done || []) {
        listener({}, 'completed')
      }

      const downloads = await manager.getDownloads(id, { action: 'list', limit: 10 })
      expect(downloads).toHaveLength(1)
      expect(downloads[0]).toMatchObject({
        filename: 'report.pdf',
        state: 'completed',
        savePath: join(tempDir, 'downloads', 'report.pdf'),
      })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('handles browser empty-state launch through the dedicated bridge without exposing preload APIs', async () => {
    const id = manager.createInstance({ id: 'pane-empty-state' })
    const record = (manager as any).instances.get(id)
    const preventDefault = mock(() => {})

    record.pageView.webContents._emit(
      'will-navigate',
      { preventDefault },
      'dazi-browser://launch?route=allChats%2Fnew%3Finput%3Dhello&ts=bridge-1',
    )

    await Promise.resolve()

    expect(preventDefault).toHaveBeenCalled()
    expect(mockShellOpenExternal).toHaveBeenCalledWith('agentoperator://allChats/new?input=hello')

    record.pageView.webContents._emit(
      'will-navigate',
      { preventDefault },
      'dazi-browser://launch?route=allChats%2Fnew%3Finput%3Dhello&ts=bridge-1',
    )

    await Promise.resolve()

    expect(mockShellOpenExternal).toHaveBeenCalledTimes(1)
  })

  it('handles browser empty-state launch through the IPC bridge', async () => {
    const id = manager.createInstance({ id: 'pane-empty-state-ipc' })
    const record = (manager as any).instances.get(id)

    const first = await manager.handleEmptyStateLaunchFromRenderer(record.pageView.webContents.id, {
      route: 'allChats/new?input=hello',
      token: 'ipc-1',
    })

    expect(first).toEqual({ ok: true, handled: true, reason: undefined })
    expect(mockShellOpenExternal).toHaveBeenCalledWith('agentoperator://allChats/new?input=hello')

    const second = await manager.handleEmptyStateLaunchFromRenderer(record.pageView.webContents.id, {
      route: 'allChats/new?input=hello',
      token: 'ipc-1',
    })

    expect(second).toEqual({ ok: true, handled: false, reason: 'duplicate' })
    expect(mockShellOpenExternal).toHaveBeenCalledTimes(1)
  })

  it('recovers screenshots after hidden empty captures by briefly revealing the window', async () => {
    const id = manager.createInstance({ id: 'pane-recovery', show: false })
    const record = (manager as any).instances.get(id)
    const capturePageMock = record.pageView.webContents.capturePage
    let attempts = 0

    capturePageMock.mockImplementation(async () => {
      attempts += 1
      if (attempts < 4) {
        return {
          isEmpty: () => true,
        }
      }
      return {
        isEmpty: () => false,
        toPNG: () => Buffer.from('png-data'),
        toJPEG: () => Buffer.from('jpeg-data'),
      }
    })

    const result = await manager.screenshot(id, { format: 'png' })

    expect(result.format).toBe('png')
    expect(attempts).toBe(4)
    expect(record.window.showInactive).toHaveBeenCalled()
    expect(record.window.hide).toHaveBeenCalled()
  })
})
