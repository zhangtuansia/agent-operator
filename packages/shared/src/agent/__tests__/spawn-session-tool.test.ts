import { describe, expect, it, mock } from 'bun:test'
import { createSpawnSessionTool } from '../spawn-session-tool.ts'

function findTool(name: string) {
  const toolDef = createSpawnSessionTool({
    sessionId: 'session-1',
    getSpawnSessionFn: () => undefined,
  }) as any
  expect(toolDef.name).toBe(name)
  return toolDef
}

describe('spawn_session tool', () => {
  it('returns an error when the callback is unavailable', async () => {
    const toolDef = findTool('spawn_session')
    const result = await toolDef.handler({ prompt: 'delegate this task' })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('spawn_session is not available')
  })

  it('delegates help mode to the registered callback', async () => {
    const spawnFn = mock(async () => ({
      connections: [{ slug: 'bedrock', name: 'Bedrock', isDefault: true, providerType: 'bedrock', models: ['claude'], defaultModel: 'claude' }],
      sources: [{ slug: 'docs', name: 'Docs', type: 'folder', enabled: true }],
      defaults: { defaultConnection: 'bedrock', permissionMode: 'ask' },
    }))

    const toolDef = createSpawnSessionTool({
      sessionId: 'session-1',
      getSpawnSessionFn: () => spawnFn,
    }) as any

    const result = await toolDef.handler({ help: true })

    expect(spawnFn).toHaveBeenCalledTimes(1)
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('"defaultConnection": "bedrock"')
  })

  it('delegates spawn requests and returns the spawned session payload', async () => {
    const spawnFn = mock(async () => ({
      sessionId: 'child-1',
      name: 'Research child',
      status: 'started' as const,
      connection: 'bedrock',
      model: 'claude',
    }))

    const toolDef = createSpawnSessionTool({
      sessionId: 'session-1',
      getSpawnSessionFn: () => spawnFn,
    }) as any

    const result = await toolDef.handler({
      prompt: 'Research the topic',
      llmConnection: 'bedrock',
      enabledSourceSlugs: ['docs'],
    })

    expect(spawnFn).toHaveBeenCalledTimes(1)
    expect((spawnFn.mock.calls as any[])[0]?.[0]).toMatchObject({
      prompt: 'Research the topic',
      llmConnection: 'bedrock',
      enabledSourceSlugs: ['docs'],
    })
    expect(result.content[0]?.text).toContain('"sessionId": "child-1"')
  })
})
