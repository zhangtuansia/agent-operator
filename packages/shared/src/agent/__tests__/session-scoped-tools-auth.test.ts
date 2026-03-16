import { afterEach, describe, expect, it } from 'bun:test'
import {
  registerSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
  resolveSessionScopedAuthEnvVars,
} from '../session-scoped-tools.ts'

describe('resolveSessionScopedAuthEnvVars', () => {
  const sessionId = 'session-auth-env'

  afterEach(() => {
    unregisterSessionScopedToolCallbacks(sessionId)
  })

  it('prefers provider-aware auth env vars from the current session callbacks', async () => {
    registerSessionScopedToolCallbacks(sessionId, {
      getAuthEnvVars: async () => ({
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_REGION: 'us-west-2',
        ANTHROPIC_MODEL: 'arn:aws:bedrock:us-west-2:123:application-inference-profile/test',
      }),
    })

    await expect(resolveSessionScopedAuthEnvVars(sessionId)).resolves.toEqual({
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'us-west-2',
      ANTHROPIC_MODEL: 'arn:aws:bedrock:us-west-2:123:application-inference-profile/test',
    })
  })
})
