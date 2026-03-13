import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Workspace } from '@agent-operator/core/types'
import { loadSession } from '@agent-operator/shared/sessions'
import { SessionManager, setSessionPlatform, setSessionRuntimeHooks } from '../SessionManager'
import { createHeadlessPlatform } from '../../runtime/platform-headless'

describe('SessionManager sharing regression', () => {
  const originalFetch = globalThis.fetch
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dazi-share-regression-'))
    setSessionPlatform(createHeadlessPlatform())
    setSessionRuntimeHooks({
      updateBadgeCount: () => {},
      onSessionStarted: () => {},
      onSessionStopped: () => {},
      captureException: () => {},
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('flushes streaming assistant text before share upload', async () => {
    const manager = new SessionManager()
    manager.setEventSink(() => {})

    const workspace: Workspace = {
      id: 'ws-share',
      name: 'Share Workspace',
      rootPath: tempRoot,
      createdAt: Date.now(),
    }

    const managed = {
      id: 'session-share',
      workspace,
      agent: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'hi',
          timestamp: 1,
          isIntermediate: false,
        },
      ],
      isProcessing: false,
      lastMessageAt: 1,
      streamingText: 'latest assistant reply',
      processingGeneration: 0,
      isFlagged: false,
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: true,
      tokenRefreshManager: {} as never,
    }

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    let uploadedBody: Record<string, unknown> | null = null
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      uploadedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'share-1', url: 'https://viewer.test/share-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await manager.shareToViewer(managed.id)

    expect(result).toEqual({ success: true, url: 'https://viewer.test/share-1' })
    expect(Array.isArray(uploadedBody?.messages)).toBe(true)
    expect((uploadedBody?.messages as Array<{ content?: string }>).at(-1)?.content).toBe('latest assistant reply')

    const stored = loadSession(workspace.rootPath, managed.id)
    expect(stored?.messages.at(-1)?.content).toBe('latest assistant reply')
  })

  it('flushes streaming assistant text before share update upload', async () => {
    const manager = new SessionManager()
    manager.setEventSink(() => {})

    const workspace: Workspace = {
      id: 'ws-update',
      name: 'Update Workspace',
      rootPath: tempRoot,
      createdAt: Date.now(),
    }

    const managed = {
      id: 'session-update',
      workspace,
      agent: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'update me',
          timestamp: 1,
          isIntermediate: false,
        },
      ],
      isProcessing: false,
      lastMessageAt: 1,
      streamingText: 'updated assistant reply',
      processingGeneration: 0,
      isFlagged: false,
      sharedId: 'share-existing',
      sharedUrl: 'https://viewer.test/share-existing',
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: true,
      tokenRefreshManager: {} as never,
    }

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    let uploadedBody: Record<string, unknown> | null = null
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      uploadedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await manager.updateShare(managed.id)

    expect(result).toEqual({ success: true, url: 'https://viewer.test/share-existing' })
    expect(Array.isArray(uploadedBody?.messages)).toBe(true)
    expect((uploadedBody?.messages as Array<{ content?: string }>).at(-1)?.content).toBe('updated assistant reply')

    const stored = loadSession(workspace.rootPath, managed.id)
    expect(stored?.messages.at(-1)?.content).toBe('updated assistant reply')
  })

  it('reconstructs the share URL during update when only sharedId is persisted', async () => {
    const manager = new SessionManager()
    manager.setEventSink(() => {})

    const workspace: Workspace = {
      id: 'ws-reconstruct',
      name: 'Reconstruct Workspace',
      rootPath: tempRoot,
      createdAt: Date.now(),
    }

    const managed = {
      id: 'session-reconstruct',
      workspace,
      agent: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'keep share alive',
          timestamp: 1,
          isIntermediate: false,
        },
      ],
      isProcessing: false,
      lastMessageAt: 1,
      streamingText: '',
      processingGeneration: 0,
      isFlagged: false,
      sharedId: 'share-reconstruct',
      sharedUrl: undefined,
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: true,
      tokenRefreshManager: {} as never,
    }

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    globalThis.fetch = (async () => {
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await manager.updateShare(managed.id)

    expect(result).toEqual({ success: true, url: 'https://share.aicowork.chat/s/share-reconstruct' })
    expect(managed.sharedUrl).toBe('https://share.aicowork.chat/s/share-reconstruct')

    const stored = loadSession(workspace.rootPath, managed.id)
    expect(stored?.sharedUrl).toBe('https://share.aicowork.chat/s/share-reconstruct')
    expect(stored?.sharedId).toBe('share-reconstruct')
  })

  it('shares the latest visible assistant text even while persistence is still catching up', async () => {
    const manager = new SessionManager()
    manager.setEventSink(() => {})

    const workspace: Workspace = {
      id: 'ws-live-share',
      name: 'Live Share Workspace',
      rootPath: tempRoot,
      createdAt: Date.now(),
    }

    const managed = {
      id: 'session-live-share',
      workspace,
      agent: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'share current answer',
          timestamp: 1,
          isIntermediate: false,
        },
      ],
      isProcessing: true,
      lastMessageAt: 1,
      streamingText: 'answer visible in UI but not finalized yet',
      processingGeneration: 0,
      isFlagged: false,
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: true,
      tokenRefreshManager: {} as never,
    }

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    let uploadedBody: Record<string, unknown> | null = null
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      uploadedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'share-live', url: 'https://viewer.test/share-live' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await manager.shareToViewer(managed.id)

    expect(result).toEqual({ success: true, url: 'https://viewer.test/share-live' })
    expect(Array.isArray(uploadedBody?.messages)).toBe(true)
    expect((uploadedBody?.messages as Array<{ content?: string }>).at(-1)?.content).toBe(
      'answer visible in UI but not finalized yet',
    )
  })

  it('shares the latest visible assistant text even when messages are still lazy-loaded', async () => {
    const manager = new SessionManager()
    manager.setEventSink(() => {})

    const workspace: Workspace = {
      id: 'ws-lazy-share',
      name: 'Lazy Share Workspace',
      rootPath: tempRoot,
      createdAt: Date.now(),
    }

    const managed = {
      id: 'session-lazy-share',
      workspace,
      agent: null,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'share visible reply',
          timestamp: 1,
          isIntermediate: false,
        },
      ],
      isProcessing: false,
      lastMessageAt: 1,
      streamingText: 'answer visible but session messages not fully loaded',
      processingGeneration: 0,
      isFlagged: false,
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: false,
      tokenRefreshManager: {} as never,
    }

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    let uploadedBody: Record<string, unknown> | null = null
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      uploadedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'share-lazy', url: 'https://viewer.test/share-lazy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await manager.shareToViewer(managed.id)

    expect(result).toEqual({ success: true, url: 'https://viewer.test/share-lazy' })
    expect(Array.isArray(uploadedBody?.messages)).toBe(true)
    expect((uploadedBody?.messages as Array<{ content?: string }>).at(-1)?.content).toBe(
      'answer visible but session messages not fully loaded',
    )
  })
})
