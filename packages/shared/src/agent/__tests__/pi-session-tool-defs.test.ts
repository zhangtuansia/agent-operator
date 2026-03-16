import { describe, expect, it } from 'bun:test';

import {
  getPiRegisteredSessionTool,
  getPiSessionToolProxyDefs,
} from '../backend/pi/session-tool-defs.ts';

describe('Pi session tool proxy defs', () => {
  const sessionId = 'pi-test-session';
  const workspaceRootPath = '/tmp/pi-test-workspace';

  it('builds proxy defs from the existing session-scoped tools registry', () => {
    const defs = getPiSessionToolProxyDefs(sessionId, workspaceRootPath);
    const names = defs.map(def => def.name);

    expect(names).toContain('mcp__session__SubmitPlan');
    expect(names).toContain('mcp__session__config_validate');
    expect(names).toContain('mcp__session__browser_tool');
    expect(names).toContain('mcp__session__call_llm');
    expect(names).toContain('mcp__session__spawn_session');
    expect(defs.every((def) => def.inputSchema.$schema === undefined)).toBe(true);
  });

  it('returns executable registered tools for prefixed names', () => {
    const tool = getPiRegisteredSessionTool(
      sessionId,
      workspaceRootPath,
      'mcp__session__config_validate',
    );

    expect(tool).not.toBeNull();
    expect(typeof tool?.handler).toBe('function');
    expect(tool?.description).toContain('Validate Dazi configuration files');
  });
});
