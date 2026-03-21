import { describe, expect, test } from 'bun:test';
import { SERVER_BUILD_ERRORS, SourceServerBuilder } from '../server-builder.ts';
import type { FolderSourceConfig, LoadedSource } from '../types.ts';

function createMockMcpSource(overrides: Partial<FolderSourceConfig> = {}): LoadedSource {
  return {
    config: {
      id: 'test-mcp-source',
      slug: 'github',
      name: 'GitHub',
      type: 'mcp',
      enabled: true,
      provider: 'github',
      connectionStatus: 'needs_auth',
      mcp: {
        transport: 'http',
        url: 'https://example.com/mcp',
        authType: 'oauth',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    } as FolderSourceConfig,
    guide: null,
    folderPath: '/tmp/test/sources/github',
    workspaceRootPath: '/tmp/test',
    workspaceId: 'test-workspace',
  };
}

describe('SourceServerBuilder MCP auth handling', () => {
  const builder = new SourceServerBuilder();

  test('does not build an authenticated MCP source when token is missing', () => {
    const source = createMockMcpSource();

    const config = builder.buildMcpServer(source, null);

    expect(config).toBeNull();
  });

  test('reports auth required for authenticated MCP sources without a token', async () => {
    const source = createMockMcpSource({
      isAuthenticated: true,
      connectionStatus: 'connected',
    });

    const result = await builder.buildAll([{ source, token: null }]);

    expect(result.mcpServers).toEqual({});
    expect(result.errors).toEqual([
      {
        sourceSlug: 'github',
        error: SERVER_BUILD_ERRORS.AUTH_REQUIRED,
      },
    ]);
  });

  test('builds MCP headers when an auth token is available', () => {
    const source = createMockMcpSource();

    const config = builder.buildMcpServer(source, 'token-123');

    expect(config).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: {
        Authorization: 'Bearer token-123',
      },
    });
  });

  test('still builds public MCP sources without authentication', () => {
    const source = createMockMcpSource({
      slug: 'public-docs',
      connectionStatus: 'connected',
      mcp: {
        transport: 'http',
        url: 'https://example.com/public',
        authType: 'none',
      },
    });

    const config = builder.buildMcpServer(source, null);

    expect(config).toEqual({
      type: 'http',
      url: 'https://example.com/public/mcp',
    });
  });
});
