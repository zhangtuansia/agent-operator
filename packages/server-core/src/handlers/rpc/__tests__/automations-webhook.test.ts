import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import type { HandlerDeps } from '../../handler-deps'
import type { RpcServer, HandlerFn } from '../../../transport/types'

let currentWorkspace: { id: string; name: string; rootPath: string } | null = null
let tempWorkspaceRoot = ''
const originalFetch = globalThis.fetch

mock.module('@agent-operator/shared/config', () => ({
  getWorkspaceByNameOrId: (nameOrId: string) => {
    if (!currentWorkspace) return null
    return nameOrId === currentWorkspace.id || nameOrId === currentWorkspace.name ? currentWorkspace : null
  },
}))

import { registerAutomationsHandlers } from '../automations'

class TestRpcServer implements RpcServer {
  handlers = new Map<string, HandlerFn>()

  handle(channel: string, handler: HandlerFn): void {
    this.handlers.set(channel, handler)
  }

  push(): void {}

  async invokeClient(): Promise<undefined> {
    return undefined
  }
}

function createDeps(): HandlerDeps {
  return {
    sessionManager: {
      executePromptAutomation: async () => ({ sessionId: 'session-1' }),
    } as never,
    oauthFlowStore: {} as never,
    platform: {
      appRootPath: '/app',
      resourcesPath: '/resources',
      isPackaged: false,
      appVersion: '0.0.0',
      imageProcessor: {
        async getMetadata() {
          return null
        },
        async process() {
          return Buffer.alloc(0)
        },
      },
      logger: {
        info() {},
        warn() {},
        error() {},
        debug() {},
      },
      isDebugMode: false,
    },
  }
}

async function waitForFile(path: string): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      await Bun.sleep(10)
    }
  }
  throw new Error(`Timed out waiting for file: ${path}`)
}

describe('registerAutomationsHandlers webhook rpc', () => {
  beforeEach(async () => {
    tempWorkspaceRoot = await mkdtemp(join(tmpdir(), 'automations-rpc-'))
    currentWorkspace = {
      id: 'ws-1',
      name: 'Workspace One',
      rootPath: tempWorkspaceRoot,
    }
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    if (tempWorkspaceRoot) {
      await rm(tempWorkspaceRoot, { recursive: true, force: true })
    }
    currentWorkspace = null
    tempWorkspaceRoot = ''
  })

  it('executes webhook actions through TEST and records webhook history', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/hooks/test')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Test': '1' })
      expect(init?.body).toBe('{"hello":"world"}')
      return new Response('{"ok":true}', { status: 202 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const server = new TestRpcServer()
    registerAutomationsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.automations.TEST)
    expect(handler).toBeDefined()

    const result = await handler!(
      { clientId: 'client-1', workspaceId: 'ws-1', webContentsId: 1 },
      {
        workspaceId: 'ws-1',
        automationId: 'auto-webhook',
        automationName: 'Webhook Smoke',
        actions: [
          {
            type: 'webhook',
            url: 'https://example.com/hooks/test',
            method: 'POST',
            headers: { 'X-Test': '1' },
            bodyFormat: 'json',
            body: { hello: 'world' },
            captureResponse: true,
          },
        ],
      },
    )

    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]).toMatchObject({
      type: 'webhook',
      success: true,
      statusCode: 202,
      responseBody: '{"ok":true}',
      url: 'https://example.com/hooks/test',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const history = await waitForFile(join(tempWorkspaceRoot, 'automations-history.jsonl'))
    const entry = JSON.parse(history.trim())
    expect(entry).toMatchObject({
      id: 'auto-webhook',
      ok: true,
      webhook: {
        method: 'POST',
        statusCode: 202,
      },
    })
  })

  it('replays webhook actions from automations.json and appends replay history', async () => {
    const configPath = join(tempWorkspaceRoot, 'automations.json')
    await writeFile(
      configPath,
      `${JSON.stringify({
        automations: {
          SchedulerTick: [
            {
              id: 'auto-replay',
              name: 'Replay Test',
              actions: [
                {
                  type: 'webhook',
                  url: 'https://example.com/hooks/replay',
                  method: 'GET',
                },
              ],
            },
          ],
        },
      }, null, 2)}\n`,
      'utf8',
    )

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/hooks/replay')
      expect(init?.method).toBe('GET')
      return new Response('', { status: 204 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const server = new TestRpcServer()
    registerAutomationsHandlers(server, createDeps())
    const handler = server.handlers.get(RPC_CHANNELS.automations.REPLAY)
    expect(handler).toBeDefined()

    const result = await handler!(
      { clientId: 'client-1', workspaceId: 'ws-1', webContentsId: 1 },
      'ws-1',
      'auto-replay',
      'SchedulerTick',
    )

    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      type: 'webhook',
      success: true,
      statusCode: 204,
      url: 'https://example.com/hooks/replay',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const history = await waitForFile(join(tempWorkspaceRoot, 'automations-history.jsonl'))
    const entry = JSON.parse(history.trim())
    expect(entry).toMatchObject({
      id: 'auto-replay',
      ok: true,
      webhook: {
        method: 'GET',
        statusCode: 204,
      },
    })
  })
})
