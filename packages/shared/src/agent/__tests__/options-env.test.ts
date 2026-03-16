import { afterEach, describe, expect, it } from 'bun:test'

import { getDefaultOptions, setAnthropicOptionsEnv } from '../options.ts'

describe('getDefaultOptions env overrides', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    setAnthropicOptionsEnv({})
  })

  it('applies envOverrides to the spawned sdk environment', () => {
    process.env.AWS_REGION = 'us-west-2'

    const options = getDefaultOptions({
      AWS_PROFILE: 'claude-profile',
      ANTHROPIC_MODEL: 'arn:aws:bedrock:us-west-2:123:application-inference-profile/test',
    })

    expect(options.env?.AWS_REGION).toBe('us-west-2')
    expect(options.env?.AWS_PROFILE).toBe('claude-profile')
    expect(options.env?.ANTHROPIC_MODEL).toBe('arn:aws:bedrock:us-west-2:123:application-inference-profile/test')
  })

  it('lets envOverrides win over ambient process env', () => {
    process.env.AWS_PROFILE = 'wrong-profile'

    const options = getDefaultOptions({
      AWS_PROFILE: 'right-profile',
    })

    expect(options.env?.AWS_PROFILE).toBe('right-profile')
  })

  it('applies globally configured SDK auth env when no per-call overrides are provided', () => {
    setAnthropicOptionsEnv({
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
      ANTHROPIC_MODEL: 'claude-sonnet-test',
    })

    const options = getDefaultOptions()

    expect(options.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token')
    expect(options.env?.ANTHROPIC_MODEL).toBe('claude-sonnet-test')
  })
})
