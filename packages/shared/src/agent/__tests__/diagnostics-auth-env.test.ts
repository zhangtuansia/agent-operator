import { afterEach, beforeEach, describe, expect, it, jest, mock } from 'bun:test';

const anthropicModelsList = jest.fn().mockResolvedValue({ data: [] });

mock.module('../../network/interceptor.ts', () => ({
  getLastApiError: () => null,
}));

mock.module('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    models = {
      list: anthropicModelsList,
    };
  },
}));

import { runErrorDiagnostics } from '../diagnostics.ts';

describe('runErrorDiagnostics auth env handling', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    if (originalOAuthToken === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOAuthToken;
    }

    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 })) as unknown as typeof fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }

    if (originalOAuthToken === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOAuthToken;
    }

    globalThis.fetch = originalFetch;
  });

  it('treats missing API key as missing even if legacy storage still has one', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await runErrorDiagnostics({
      authType: 'api_key',
      rawError: 'process exited',
    });

    expect(result.code).toBe('invalid_credentials');
    expect(result.title).toBe('API Key Missing');
    expect(anthropicModelsList).not.toHaveBeenCalled();
  });

  it('treats missing OAuth token as missing even if legacy storage still has one', async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const result = await runErrorDiagnostics({
      authType: 'oauth_token',
      rawError: 'process exited',
    });

    expect(result.code).toBe('invalid_credentials');
    expect(result.title).toBe('OAuth Token Missing');
  });
});
