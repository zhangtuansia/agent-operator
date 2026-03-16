import { afterEach, describe, expect, it } from 'bun:test'

import { PiAgent } from '../pi-agent.ts'

describe('PiAgent subprocess env', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('maps CLAUDE_CODE_AWS_PROFILE to AWS_PROFILE for bedrock subprocesses', () => {
    delete process.env.AWS_PROFILE
    process.env.CLAUDE_CODE_AWS_PROFILE = 'claude-profile'
    process.env.AWS_REGION = 'us-west-2'

    const agent = new PiAgent({
      provider: 'pi',
      providerType: 'bedrock',
      authType: 'environment',
      workspace: {
        id: 'workspace-id',
        name: 'Workspace',
        rootPath: '/tmp/workspace',
        createdAt: Date.now(),
      },
      session: {
        id: 'session-id',
        workspaceRootPath: '/tmp/workspace',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      },
      model: 'pi/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      isHeadless: true,
    })

    const env = (agent as any).buildSubprocessEnv('/tmp/workspace/sessions/session-id') as NodeJS.ProcessEnv

    expect(env.AWS_PROFILE).toBe('claude-profile')
    expect(env.AWS_REGION).toBe('us-west-2')
    expect(env.COWORK_SESSION_DIR).toBe('/tmp/workspace/sessions/session-id')
  })

  it('merges backend env overrides into the subprocess environment', () => {
    delete process.env.AWS_PROFILE

    const agent = new PiAgent({
      provider: 'pi',
      providerType: 'bedrock',
      authType: 'environment',
      workspace: {
        id: 'workspace-id',
        name: 'Workspace',
        rootPath: '/tmp/workspace',
        createdAt: Date.now(),
      },
      session: {
        id: 'session-id',
        workspaceRootPath: '/tmp/workspace',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      },
      model: 'pi/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      envOverrides: {
        AWS_PROFILE: 'override-profile',
        AWS_REGION: 'eu-central-1',
      },
      isHeadless: true,
    })

    const env = (agent as any).buildSubprocessEnv() as NodeJS.ProcessEnv

    expect(env.AWS_PROFILE).toBe('override-profile')
    expect(env.AWS_REGION).toBe('eu-central-1')
  })
})
