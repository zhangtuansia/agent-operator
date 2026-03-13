import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import type { PlatformServices } from '../../../runtime/platform'
import type { RpcServer, HandlerFn } from '../../../transport/types'
import { registerSystemCoreHandlers } from '../system'
import type { HandlerDeps } from '../../handler-deps'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dazi-system-shell-'))
  tempDirs.push(dir)
  return dir
}

function makeRepoTempFile(name: string): string {
  const dir = join(process.cwd(), '.codex-tmp', 'system-shell-test')
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, name)
  writeFileSync(filePath, 'hello')
  return filePath
}

function createPlatform(overrides: Partial<PlatformServices> = {}): PlatformServices {
  return {
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
    ...overrides,
  }
}

function createDeps(platform: PlatformServices): HandlerDeps {
  return {
    sessionManager: {
      getWorkspaces() {
        return []
      },
    } as never,
    oauthFlowStore: {} as never,
    platform,
  }
}

class TestRpcServer implements RpcServer {
  handlers = new Map<string, HandlerFn>()
  handle(channel: string, handler: HandlerFn): void {
    this.handlers.set(channel, handler)
  }
  push(): void {}
  invokeClient = mock(async () => undefined)
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('registerSystemCoreHandlers shell operations', () => {
  it('uses platform.openExternal before client capability', async () => {
    const openExternal = mock(async () => {})
    const server = new TestRpcServer()
    registerSystemCoreHandlers(server, createDeps(createPlatform({ openExternal })))

    const handler = server.handlers.get(RPC_CHANNELS.shell.OPEN_URL)
    expect(handler).toBeDefined()

    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, 'https://example.com')

    expect(openExternal).toHaveBeenCalledWith('https://example.com')
    expect(server.invokeClient).not.toHaveBeenCalled()
  })

  it('uses platform.openPath before client capability', async () => {
    const filePath = makeRepoTempFile('note-open.txt')

    const openPath = mock(async () => {})
    const server = new TestRpcServer()
    registerSystemCoreHandlers(server, createDeps(createPlatform({ openPath })))

    const handler = server.handlers.get(RPC_CHANNELS.shell.OPEN_FILE)
    expect(handler).toBeDefined()

    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, filePath)

    expect(openPath).toHaveBeenCalledWith(filePath)
    expect(server.invokeClient).not.toHaveBeenCalled()
  })

  it('uses platform.showItemInFolder before client capability', async () => {
    const filePath = makeRepoTempFile('note-reveal.txt')

    const showItemInFolder = mock(() => {})
    const server = new TestRpcServer()
    registerSystemCoreHandlers(server, createDeps(createPlatform({ showItemInFolder })))

    const handler = server.handlers.get(RPC_CHANNELS.shell.SHOW_IN_FOLDER)
    expect(handler).toBeDefined()

    await handler!({ clientId: 'client-1', workspaceId: null, webContentsId: 1 }, filePath)

    expect(showItemInFolder).toHaveBeenCalledWith(filePath)
    expect(server.invokeClient).not.toHaveBeenCalled()
  })
})
