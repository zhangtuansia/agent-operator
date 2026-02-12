/**
 * Unit tests for TokenRefreshManager and isOAuthSource helper.
 *
 * Tests the proactive token refresh functionality that includes both:
 * - MCP OAuth sources (Linear, Notion, etc.)
 * - API OAuth sources (Google, Slack, Microsoft)
 */

import { describe, test, expect } from 'bun:test';
import { isOAuthSource, type LoadedSource, type FolderSourceConfig } from '../types.ts';

/**
 * Helper to create a mock LoadedSource for testing
 */
function createMockSource(overrides: Partial<FolderSourceConfig>): LoadedSource {
  const config: FolderSourceConfig = {
    id: 'test-id',
    name: 'Test Source',
    slug: 'test-source',
    enabled: true,
    provider: 'test',
    type: 'api',
    isAuthenticated: true,
    ...overrides,
  };

  return {
    config,
    guide: null,
    folderPath: '/mock/path',
    workspaceRootPath: '/mock/workspace',
    workspaceId: 'mock-workspace',
  };
}

describe('isOAuthSource', () => {
  describe('MCP OAuth sources', () => {
    test('returns true for MCP source with oauth authType', () => {
      const source = createMockSource({
        type: 'mcp',
        provider: 'linear',
        mcp: {
          url: 'https://linear.mcp.example.com',
          authType: 'oauth',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(true);
    });

    test('returns false for MCP source with bearer authType', () => {
      const source = createMockSource({
        type: 'mcp',
        provider: 'custom',
        mcp: {
          url: 'https://custom.mcp.example.com',
          authType: 'bearer',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });

    test('returns false for MCP source with none authType', () => {
      const source = createMockSource({
        type: 'mcp',
        provider: 'public',
        mcp: {
          url: 'https://public.mcp.example.com',
          authType: 'none',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });

    test('returns false for stdio MCP source (no authType)', () => {
      const source = createMockSource({
        type: 'mcp',
        provider: 'local-tool',
        mcp: {
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });
  });

  describe('API OAuth sources', () => {
    test('returns true for Google provider (Gmail)', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'google',
        api: {
          baseUrl: 'https://gmail.googleapis.com/gmail/v1',
          authType: 'bearer',
          googleService: 'gmail',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(true);
    });

    test('returns true for Slack provider', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'slack',
        api: {
          baseUrl: 'https://slack.com/api',
          authType: 'bearer',
          slackService: 'full',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(true);
    });

    test('returns true for Microsoft provider', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'microsoft',
        api: {
          baseUrl: 'https://graph.microsoft.com/v1.0',
          authType: 'bearer',
          microsoftService: 'outlook',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(true);
    });

    test('returns false for non-OAuth API provider', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'custom-api',
        api: {
          baseUrl: 'https://api.example.com',
          authType: 'bearer',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });

    test('returns false for API source with header auth', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'custom-api',
        api: {
          baseUrl: 'https://api.example.com',
          authType: 'header',
          headerName: 'X-API-Key',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });
  });

  describe('Authentication state', () => {
    test('returns false if source is not authenticated (MCP OAuth)', () => {
      const source = createMockSource({
        type: 'mcp',
        provider: 'linear',
        mcp: {
          url: 'https://linear.mcp.example.com',
          authType: 'oauth',
        },
        isAuthenticated: false,
      });

      expect(isOAuthSource(source)).toBe(false);
    });

    test('returns false if source is not authenticated (Google)', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'google',
        api: {
          baseUrl: 'https://gmail.googleapis.com/gmail/v1',
          authType: 'bearer',
        },
        isAuthenticated: false,
      });

      expect(isOAuthSource(source)).toBe(false);
    });

    test('returns false if isAuthenticated is undefined', () => {
      const source = createMockSource({
        type: 'api',
        provider: 'google',
        api: {
          baseUrl: 'https://gmail.googleapis.com/gmail/v1',
          authType: 'bearer',
        },
      });
      // Remove isAuthenticated to simulate undefined
      delete (source.config as Partial<FolderSourceConfig>).isAuthenticated;

      expect(isOAuthSource(source)).toBe(false);
    });
  });

  describe('Local sources', () => {
    test('returns false for local filesystem source', () => {
      const source = createMockSource({
        type: 'local',
        provider: 'filesystem',
        local: {
          path: '/Users/test/documents',
        },
        isAuthenticated: true,
      });

      expect(isOAuthSource(source)).toBe(false);
    });
  });
});

describe('OAuth source filtering', () => {
  test('filters mixed sources to only OAuth sources', () => {
    const sources: LoadedSource[] = [
      // MCP OAuth - should be included
      createMockSource({
        slug: 'linear',
        type: 'mcp',
        provider: 'linear',
        mcp: { url: 'https://linear.example.com', authType: 'oauth' },
        isAuthenticated: true,
      }),
      // Google API - should be included
      createMockSource({
        slug: 'gmail',
        type: 'api',
        provider: 'google',
        api: { baseUrl: 'https://gmail.googleapis.com', authType: 'bearer' },
        isAuthenticated: true,
      }),
      // Non-OAuth API - should NOT be included
      createMockSource({
        slug: 'custom-api',
        type: 'api',
        provider: 'custom',
        api: { baseUrl: 'https://api.custom.com', authType: 'bearer' },
        isAuthenticated: true,
      }),
      // MCP bearer - should NOT be included
      createMockSource({
        slug: 'mcp-bearer',
        type: 'mcp',
        provider: 'custom',
        mcp: { url: 'https://custom.mcp.com', authType: 'bearer' },
        isAuthenticated: true,
      }),
      // Slack - should be included
      createMockSource({
        slug: 'slack',
        type: 'api',
        provider: 'slack',
        api: { baseUrl: 'https://slack.com/api', authType: 'bearer' },
        isAuthenticated: true,
      }),
      // Unauthenticated Google - should NOT be included
      createMockSource({
        slug: 'google-calendar',
        type: 'api',
        provider: 'google',
        api: { baseUrl: 'https://calendar.googleapis.com', authType: 'bearer' },
        isAuthenticated: false,
      }),
    ];

    const oauthSources = sources.filter(isOAuthSource);

    expect(oauthSources.length).toBe(3);
    expect(oauthSources.map(s => s.config.slug)).toEqual(['linear', 'gmail', 'slack']);
  });
});
