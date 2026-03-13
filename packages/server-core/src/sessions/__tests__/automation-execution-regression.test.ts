import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager, setSessionPlatform, setSessionRuntimeHooks } from '../SessionManager'
import { createHeadlessPlatform } from '../../runtime/platform-headless'

describe('SessionManager automation execution regression', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dazi-automation-exec-'))
    setSessionPlatform(createHeadlessPlatform())
    setSessionRuntimeHooks({
      updateBadgeCount: () => {},
      onSessionStarted: () => {},
      onSessionStopped: () => {},
      captureException: () => {},
    })

    mkdirSync(join(tempRoot, 'skills', 'youtube-feed'), { recursive: true })
    writeFileSync(
      join(tempRoot, 'skills', 'youtube-feed', 'SKILL.md'),
      `---
name: youtube-feed
description: Fetch channel updates
---

# youtube-feed
`,
    )
    writeFileSync(
      join(tempRoot, 'config.json'),
      JSON.stringify(
        {
          id: 'ws-automation',
          slug: 'automation-workspace',
          name: 'Automation Workspace',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        null,
        2,
      ),
    )
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('normalizes skill mentions before sending automation prompts', async () => {
    const manager = new SessionManager()
    const createSessionCalls: Array<Record<string, unknown>> = []
    const sendCalls: Array<Record<string, unknown>> = []

    ;(manager as unknown as {
      createSession: (workspaceId: string, options: Record<string, unknown>) => Promise<{ id: string }>
    }).createSession = async (workspaceId, options) => {
      createSessionCalls.push({ workspaceId, options })
      return { id: 'session-automation' }
    }

    ;(manager as unknown as {
      sendMessage: (
        sessionId: string,
        prompt: string,
        _attachments?: unknown,
        _metadata?: unknown,
        options?: Record<string, unknown>,
      ) => Promise<void>
    }).sendMessage = async (sessionId, prompt, _attachments, _metadata, options) => {
      sendCalls.push({ sessionId, prompt, options })
    }

    const result = await manager.executePromptAutomation(
      'ws-automation',
      tempRoot,
      '请使用 @youtube-feed 获取我关注频道的最新更新',
      undefined,
      'safe',
      ['youtube-feed'],
      undefined,
      undefined,
      'Automation: YouTube Feed',
    )

    expect(result).toEqual({ sessionId: 'session-automation' })
    expect(createSessionCalls).toHaveLength(1)
    expect(sendCalls).toHaveLength(1)
    expect(sendCalls[0]?.prompt).toBe('请使用 [skill:ws-automation:youtube-feed] 获取我关注频道的最新更新')
    expect(sendCalls[0]?.options).toMatchObject({
      skillSlugs: ['youtube-feed'],
      badges: [
        {
          type: 'skill',
          label: 'youtube-feed',
          rawText: '[skill:ws-automation:youtube-feed]',
        },
      ],
    })
  })
})
