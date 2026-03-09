import { beforeEach, describe, expect, it, mock } from 'bun:test'

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

const { BrowserCDP } = await import('../browser-cdp')

function createMockWebContents(sendCommandImpl?: (method: string, params?: any) => Promise<any>) {
  const listeners: Record<string, Function[]> = {}
  const inputEvents: Array<Record<string, unknown>> = []

  return {
    debugger: {
      attach: mock((_version: string) => {}),
      detach: mock(() => {}),
      sendCommand: mock(sendCommandImpl ?? (async () => ({ nodes: [] }))),
      on: mock((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(cb)
      }),
    },
    getURL: mock(() => 'https://example.com'),
    getTitle: mock(() => 'Example Page'),
    sendInputEvent: mock((event: Record<string, unknown>) => {
      inputEvents.push(event)
    }),
    inputEvents,
    _emitDetach: () => {
      for (const cb of listeners.detach || []) cb()
    },
  }
}

describe('BrowserCDP', () => {
  beforeEach(() => {
    mock.restore()
  })

  it('attaches the debugger lazily and only once', async () => {
    const webContents = createMockWebContents()
    const cdp = new BrowserCDP(webContents as any)

    await cdp.getAccessibilitySnapshot()
    await cdp.getAccessibilitySnapshot()

    expect(webContents.debugger.attach).toHaveBeenCalledTimes(1)
    expect(webContents.debugger.attach).toHaveBeenCalledWith('1.3')
  })

  it('builds stable refs from accessibility snapshots', async () => {
    let snapshotCall = 0
    const webContents = createMockWebContents(async (method) => {
      if (method === 'Accessibility.getFullAXTree') {
        snapshotCall += 1
        if (snapshotCall === 1) {
          return {
            nodes: [
              { role: { value: 'button' }, name: { value: 'Submit' }, backendDOMNodeId: 101 },
              { role: { value: 'textbox' }, name: { value: 'Email' }, value: { value: 'hello@example.com' }, backendDOMNodeId: 102 },
            ],
          }
        }

        return {
          nodes: [
            { role: { value: 'textbox' }, name: { value: 'Email' }, value: { value: 'changed@example.com' }, backendDOMNodeId: 102 },
            { role: { value: 'button' }, name: { value: 'Submit' }, backendDOMNodeId: 101 },
          ],
        }
      }

      return {}
    })

    const cdp = new BrowserCDP(webContents as any)
    const first = await cdp.getAccessibilitySnapshot()
    const second = await cdp.getAccessibilitySnapshot()

    expect(first.nodes.map((node) => node.ref)).toEqual(['@e1', '@e2'])
    expect(second.nodes.find((node) => node.name === 'Submit')?.ref).toBe('@e1')
    expect(second.nodes.find((node) => node.name === 'Email')?.ref).toBe('@e2')
  })

  it('supports click, fill, and select after snapshotting refs', async () => {
    const webContents = createMockWebContents(async (method, params) => {
      if (method === 'Accessibility.getFullAXTree') {
        return {
          nodes: [
            { role: { value: 'button' }, name: { value: 'Continue' }, backendDOMNodeId: 201 },
            { role: { value: 'textbox' }, name: { value: 'Email' }, backendDOMNodeId: 202 },
            { role: { value: 'combobox' }, name: { value: 'Workspace' }, backendDOMNodeId: 203 },
          ],
        }
      }

      if (method === 'DOM.getBoxModel') {
        const x = Number(params?.backendDOMNodeId ?? 0)
        return {
          model: {
            content: [x, 10, x + 100, 10, x + 100, 50, x, 50],
          },
        }
      }

      if (method === 'DOM.resolveNode') {
        return { object: { objectId: `node-${String(params?.backendDOMNodeId ?? '0')}` } }
      }

      if (method === 'Runtime.callFunctionOn' && params?.returnByValue) {
        return { result: { value: { ok: true } } }
      }

      return {}
    })

    const cdp = new BrowserCDP(webContents as any)
    await cdp.getAccessibilitySnapshot()

    const clickGeometry = await cdp.clickElement('@e1')
    const fillGeometry = await cdp.fillElement('@e2', 'user@example.com')
    const selectGeometry = await cdp.selectOption('@e3', 'work')

    expect(clickGeometry.ref).toBe('@e1')
    expect(fillGeometry.ref).toBe('@e2')
    expect(selectGeometry.ref).toBe('@e3')
    expect(webContents.debugger.sendCommand).toHaveBeenCalled()
  })

  it('supports click-at, drag, type, key, and upload helpers', async () => {
    const webContents = createMockWebContents(async (method, params) => {
      if (method === 'Accessibility.getFullAXTree') {
        return {
          nodes: [
            { role: { value: 'textbox' }, name: { value: 'Upload' }, backendDOMNodeId: 301 },
          ],
        }
      }

      if (method === 'DOM.getBoxModel') {
        return {
          model: {
            content: [10, 10, 110, 10, 110, 50, 10, 50],
          },
        }
      }

      if (method === 'DOM.resolveNode') {
        return { object: { objectId: `node-${String(params?.backendDOMNodeId ?? '0')}` } }
      }

      return {}
    })

    const cdp = new BrowserCDP(webContents as any)
    await cdp.getAccessibilitySnapshot()
    await cdp.clickAtCoordinates(40, 50)
    await cdp.drag(10, 20, 110, 20)
    await cdp.typeText('hello')
    await cdp.pressKey('Enter')
    const uploadGeometry = await cdp.setFileInputFiles('@e1', ['/tmp/demo.txt'])

    expect(uploadGeometry.ref).toBe('@e1')
    expect((webContents.sendInputEvent as any).mock.calls.length).toBeGreaterThan(0)
    expect((webContents.debugger.sendCommand as any).mock.calls.some(([method]: [string]) => method === 'Input.insertText')).toBe(true)
    expect((webContents.debugger.sendCommand as any).mock.calls.some(([method]: [string]) => method === 'DOM.setFileInputFiles')).toBe(true)
  })
})
