import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

import { getSessionFilePath, getSessionPath } from '../storage.ts';

describe('session path normalization', () => {
  it('expands tilde workspace roots when resolving session paths', () => {
    const portableWorkspaceRoot = '~/workspace-under-test';
    const sessionId = '260313-azure-meadow';

    expect(getSessionPath(portableWorkspaceRoot, sessionId)).toEndWith(
      join('workspace-under-test', 'sessions', sessionId),
    );
    expect(getSessionPath(portableWorkspaceRoot, sessionId)).not.toContain('~/');
    expect(getSessionFilePath(portableWorkspaceRoot, sessionId)).toEndWith(
      join('workspace-under-test', 'sessions', sessionId, 'session.jsonl'),
    );
    expect(getSessionFilePath(portableWorkspaceRoot, sessionId)).not.toContain('~/');
  });
});
