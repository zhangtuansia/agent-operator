import { describe, expect, it } from 'bun:test';

import { createApiServer } from '../../sources/api-tools.ts';
import {
  getPiApiSourceToolProxyDefs,
  getPiRegisteredApiSourceTool,
} from '../backend/pi/source-tool-defs.ts';

describe('Pi source tool proxy defs', () => {
  it('builds proxy defs from API source servers', () => {
    const apiServer = createApiServer(
      {
        name: 'github',
        baseUrl: 'https://api.github.com',
        auth: { type: 'none' },
        documentation: 'GitHub API docs',
      },
      '',
    );

    const defs = getPiApiSourceToolProxyDefs('github', apiServer);
    expect(defs.map((def) => def.name)).toEqual(['mcp__github__api_github']);
    expect(defs[0]?.inputSchema.$schema).toBeUndefined();
  });

  it('returns executable handlers for prefixed API tool names', () => {
    const apiServer = createApiServer(
      {
        name: 'github',
        baseUrl: 'https://api.github.com',
        auth: { type: 'none' },
        documentation: 'GitHub API docs',
      },
      '',
    );

    const tool = getPiRegisteredApiSourceTool(
      'github',
      apiServer,
      'mcp__github__api_github',
    );

    expect(tool).not.toBeNull();
    expect(typeof tool?.handler).toBe('function');
    expect(tool?.description).toContain('GitHub API docs');
  });
});
