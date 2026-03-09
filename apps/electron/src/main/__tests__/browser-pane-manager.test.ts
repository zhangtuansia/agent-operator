import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
        return { x: 0, y: 500 }
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
      this.clickElement = mock(async (ref: string) => this.getElementGeometry(ref))
      this.clickAtCoordinates = mock(async () => {})
      this.drag = mock(async () => {})
      this.fillElement = mock(async (ref: string) => this.getElementGeometry(ref))
      this.selectOption = mock(async (ref: string) => this.getElementGeometry(ref))
      this.typeText = mock(async () => {})
      this.pressKey = mock(async () => {})
      this.setFileInputFiles = mock(async (ref: string) => this.getElementGeometry(ref))
      this.renderTemporaryOverlay = mock(async () => {})
      this.clearTemporaryOverlay = mock(async () => {})
      mockBrowserCdpInstances.push(this)
    }

    detach: any
    getAccessibilitySnapshot: any
    getElementGeometry: any
    clickElement: any
    clickAtCoordinates: any
    drag: any
    fillElement: any
    selectOption: any
    typeText: any
    pressKey: any
    setFileInputFiles: any
    renderTemporaryOverlay: any
    clearTemporaryOverlay: any
  },
}))

const { BrowserPaneManager } = await import('../browser-pane-manager')

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
    expect(result.metadata).toEqual({ annotatedRefs: ['@e1'] })
    expect(cdp.renderTemporaryOverlay).toHaveBeenCalledTimes(1)
    expect(cdp.clearTemporaryOverlay).toHaveBeenCalledTimes(1)
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

      expect(await manager.getClipboard()).toBe('clipboard text')
      await manager.paste(id, 'paste text')

      expect(cdp.clickAtCoordinates).toHaveBeenCalledWith(100, 120)
      expect(cdp.drag).toHaveBeenCalledWith(10, 20, 30, 40)
      expect(cdp.typeText).toHaveBeenCalledWith('hello')
      expect(cdp.pressKey).toHaveBeenCalled()
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
