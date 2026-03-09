import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { shouldAllowToolInMode } from '../../agent/mode-manager.ts'
import { createBrowserTools, type BrowserPaneFns } from '../../agent/browser-tools.ts'

function createMockFns(): BrowserPaneFns {
  return {
    openPanel: mock(async () => ({ instanceId: 'browser-test-1' })),
    navigate: mock(async (url: string) => ({ url: `https://${url.replace(/^https?:\/\//, '')}`, title: 'Example Domain' })),
    snapshot: mock(async () => ({
      url: 'https://example.com',
      title: 'Example Domain',
      nodes: [
        { ref: '@e1', role: 'button', name: 'Continue' },
        { ref: '@e2', role: 'textbox', name: 'Email', focused: true },
      ],
    })),
    click: mock(async () => undefined),
    clickAt: mock(async () => undefined),
    drag: mock(async () => undefined),
    fill: mock(async () => undefined),
    upload: mock(async () => undefined),
    typeText: mock(async () => undefined),
    pressKey: mock(async () => undefined),
    select: mock(async () => undefined),
    screenshot: mock(async (args?: { annotate?: boolean; format?: 'png' | 'jpeg' }) => ({
      imageBuffer: Buffer.from(args?.annotate ? 'annotated' : 'raw'),
      imageFormat: args?.format ?? 'jpeg' as const,
      metadata: args?.annotate ? { annotatedRefs: ['@e1'] } : undefined,
    })),
    scroll: mock(async () => undefined),
    goBack: mock(async () => undefined),
    goForward: mock(async () => undefined),
    evaluate: mock(async (expression: string) => ({ expression, result: 'ok' })),
    wait: mock(async (args: { kind: 'selector' | 'text' | 'url' | 'network-idle'; value?: string; timeoutMs?: number }) => ({
      kind: args.kind,
      matched: args.value ? `matched: ${args.value}` : 'network idle',
      timeoutMs: args.timeoutMs ?? 10_000,
      elapsedMs: 123,
    })),
    getConsoleEntries: mock(async () => ([
      { level: 'warning' as const, message: 'warn message', timestamp: 1_700_000_000_000 },
      { level: 'error' as const, message: 'error message', timestamp: 1_700_000_001_000 },
    ])),
    getNetworkEntries: mock(async () => ([
      { id: 1, method: 'GET', url: 'https://example.com', status: 200, resourceType: 'document', state: 'completed' as const, timestamp: 1_700_000_000_000 },
      { id: 2, method: 'POST', url: 'https://example.com/api', status: 500, resourceType: 'xhr', state: 'failed' as const, errorText: 'Server Error', timestamp: 1_700_000_001_000 },
    ])),
    getDownloads: mock(async () => ([
      {
        id: 'dl-1',
        timestamp: 1_700_000_002_000,
        url: 'https://example.com/report.pdf',
        filename: 'report.pdf',
        state: 'completed' as const,
        bytesReceived: 2048,
        totalBytes: 2048,
        mimeType: 'application/pdf',
        savePath: '/tmp/downloads/report.pdf',
      },
    ])),
    setClipboard: mock(async () => undefined),
    getClipboard: mock(async () => 'clipboard content'),
    paste: mock(async () => undefined),
    focusWindow: mock(async (instanceId?: string) => ({
      instanceId: instanceId ?? 'browser-test-1',
      title: 'Example Domain',
      url: 'https://example.com',
    })),
    closeWindow: mock(async (instanceId?: string) => ({
      action: 'closed' as const,
      requestedInstanceId: instanceId,
      resolvedInstanceId: instanceId ?? 'browser-test-1',
      affectedIds: [instanceId ?? 'browser-test-1'],
    })),
    hideWindow: mock(async (instanceId?: string) => ({
      action: 'hidden' as const,
      requestedInstanceId: instanceId,
      resolvedInstanceId: instanceId ?? 'browser-test-1',
      affectedIds: [instanceId ?? 'browser-test-1'],
    })),
    releaseControl: mock(async (instanceId?: string) => ({
      action: 'released' as const,
      requestedInstanceId: instanceId,
      resolvedInstanceId: instanceId ?? 'browser-test-1',
      affectedIds: [instanceId ?? 'browser-test-1'],
    })),
    listWindows: mock(async () => ([
      {
        id: 'browser-test-1',
        title: 'Example Domain',
        url: 'https://example.com',
        isVisible: true,
        ownerType: 'session' as const,
        ownerSessionId: 'session-1',
        boundSessionId: 'session-1',
        agentControlActive: false,
      },
    ])),
  }
}

function findTool(tools: ReturnType<typeof createBrowserTools>, name: string) {
  return tools.find((toolDef: any) => toolDef.name === name)
}

async function executeTool(tools: ReturnType<typeof createBrowserTools>, name: string, args: Record<string, unknown>) {
  const toolDef = findTool(tools, name) as any
  if (!toolDef) throw new Error(`Tool "${name}" not found`)
  return toolDef.handler(args)
}

describe('browser_tool', () => {
  let fns: BrowserPaneFns
  let tools: ReturnType<typeof createBrowserTools>

  beforeEach(() => {
    fns = createMockFns()
    tools = createBrowserTools({
      sessionId: 'session-1',
      getBrowserPaneFns: () => fns,
    })
  })

  it('exposes a single browser_tool', () => {
    expect(tools.map((toolDef: any) => toolDef.name)).toEqual(['browser_tool'])
  })

  it('returns help text', async () => {
    const result = await executeTool(tools, 'browser_tool', { command: '--help' })
    expect(result.content[0]?.type).toBe('text')
    expect((result.content[0] as any).text).toContain('browser_tool command help')
    expect((result.content[0] as any).text).toContain('search <query>')
    expect((result.content[0] as any).text).toContain('navigate <url|search terms>')
  })

  it('navigates via CLI-style command', async () => {
    const result = await executeTool(tools, 'browser_tool', { command: 'navigate example.com' })
    expect((result.content[0] as any).text).toContain('Navigated to: https://example.com')
    expect((fns.navigate as any).mock.calls).toHaveLength(1)
  })

  it('supports explicit search via CLI-style command', async () => {
    const result = await executeTool(tools, 'browser_tool', { command: 'search latest React 19 docs' })
    expect((result.content[0] as any).text).toContain('Searched for: latest React 19 docs')
    expect((fns.navigate as any).mock.calls[0]?.[0]).toBe('https://www.bing.com/search?q=latest%20React%2019%20docs')
  })

  it('supports snapshot and find', async () => {
    const snapshot = await executeTool(tools, 'browser_tool', { command: 'snapshot' })
    expect((snapshot.content[0] as any).text).toContain('@e1 [button] "Continue"')

    const find = await executeTool(tools, 'browser_tool', { command: 'find continue' })
    expect((find.content[0] as any).text).toContain('Found 1 element(s)')
  })

  it('supports click, fill, type, select, scroll, and evaluate', async () => {
    await executeTool(tools, 'browser_tool', { command: 'click @e1 network-idle 5000' })
    await executeTool(tools, 'browser_tool', { command: 'fill @e2 hello@example.com' })
    await executeTool(tools, 'browser_tool', { command: 'type hello world' })
    await executeTool(tools, 'browser_tool', { command: 'select @e2 work' })
    await executeTool(tools, 'browser_tool', { command: 'scroll down 600' })
    const evaluate = await executeTool(tools, 'browser_tool', { command: 'evaluate document.title' })

    expect((fns.click as any).mock.calls[0]?.[1]).toEqual({ waitFor: 'network-idle', timeoutMs: 5000 })
    expect((fns.fill as any).mock.calls[0]).toEqual(['@e2', 'hello@example.com'])
    expect((fns.typeText as any).mock.calls[0]).toEqual(['hello world'])
    expect((fns.select as any).mock.calls[0]).toEqual(['@e2', 'work'])
    expect((fns.scroll as any).mock.calls[0]).toEqual(['down', 600])
    expect((evaluate.content[0] as any).text).toContain('Evaluate result')
  })

  it('supports click-at, drag, upload, wait, console, network, key, and clipboard commands', async () => {
    await executeTool(tools, 'browser_tool', { command: 'click-at 320 180' })
    await executeTool(tools, 'browser_tool', { command: 'drag 10 20 30 40' })
    await executeTool(tools, 'browser_tool', { command: 'upload @e2 /tmp/demo.txt /tmp/demo-2.txt' })
    const wait = await executeTool(tools, 'browser_tool', { command: 'wait selector button 5000' })
    const consoleResult = await executeTool(tools, 'browser_tool', { command: 'console 10 warn' })
    const networkResult = await executeTool(tools, 'browser_tool', { command: 'network 10 failed' })
    await executeTool(tools, 'browser_tool', { command: 'key k meta+shift' })
    await executeTool(tools, 'browser_tool', { command: 'set-clipboard hello' })
    const clipboard = await executeTool(tools, 'browser_tool', { command: 'get-clipboard' })
    await executeTool(tools, 'browser_tool', { command: 'paste hello world' })

    expect((fns.clickAt as any).mock.calls[0]).toEqual([320, 180])
    expect((fns.drag as any).mock.calls[0]).toEqual([10, 20, 30, 40])
    expect((fns.upload as any).mock.calls[0]).toEqual(['@e2', ['/tmp/demo.txt', '/tmp/demo-2.txt']])
    expect((fns.wait as any).mock.calls[0]?.[0]).toEqual({ kind: 'selector', value: 'button', timeoutMs: 5000 })
    expect((fns.getConsoleEntries as any).mock.calls[0]).toEqual([10, 'warning'])
    expect((fns.getNetworkEntries as any).mock.calls[0]).toEqual([undefined, 'all'])
    expect((fns.pressKey as any).mock.calls[0]).toEqual(['k', { modifiers: ['meta', 'shift'] }])
    expect((fns.setClipboard as any).mock.calls[0]).toEqual(['hello'])
    expect((fns.paste as any).mock.calls[0]).toEqual(['hello world'])
    expect((wait.content[0] as any).text).toContain('Wait succeeded (selector)')
    expect((consoleResult.content[0] as any).text).toContain('Console entries')
    expect((networkResult.content[0] as any).text).toContain('Network entries')
    expect((clipboard.content[0] as any).text).toContain('clipboard content')
  })

  it('supports downloads list and wait commands', async () => {
    const listResult = await executeTool(tools, 'browser_tool', { command: 'downloads list 10' })
    const waitResult = await executeTool(tools, 'browser_tool', { command: 'downloads wait 15000' })

    expect((fns.getDownloads as any).mock.calls[0]?.[0]).toEqual({ action: 'list', limit: 10, timeoutMs: undefined })
    expect((fns.getDownloads as any).mock.calls[1]?.[0]).toEqual({ action: 'wait', limit: undefined, timeoutMs: 15000 })
    expect((listResult.content[0] as any).text).toContain('Downloads (1) action=list')
    expect((listResult.content[0] as any).text).toContain('-> /tmp/downloads/report.pdf')
    expect((waitResult.content[0] as any).text).toContain('Downloads (1) action=wait')
  })

  it('returns image content for screenshots', async () => {
    const result = await executeTool(tools, 'browser_tool', { command: 'screenshot --annotated --png' })
    expect(result.content[0]?.type).toBe('text')
    expect(result.content[1]?.type).toBe('image')
    expect((result.content[1] as any).mimeType).toBe('image/png')
  })

  it('is allowed in safe mode', () => {
    const result = shouldAllowToolInMode('mcp__session__browser_tool', { command: 'snapshot' }, 'safe')
    expect(result.allowed).toBe(true)
  })
})
