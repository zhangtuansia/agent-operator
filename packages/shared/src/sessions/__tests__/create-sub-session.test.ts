import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSession,
  createSubSession,
  loadSession,
  saveSession,
} from '../storage.ts';
import type { StoredMessage, SessionTokenUsage } from '../types.ts';

const EMPTY_USAGE: SessionTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  contextTokens: 0,
  costUsd: 0,
};

describe('createSubSession', () => {
  let workspaceRootPath = '';

  beforeEach(() => {
    workspaceRootPath = mkdtempSync(join(tmpdir(), 'create-sub-session-test-'));
  });

  afterEach(() => {
    if (workspaceRootPath) {
      rmSync(workspaceRootPath, { recursive: true, force: true });
    }
  });

  it('branches from the selected message and copies history up to that point', async () => {
    const parent = await createSession(workspaceRootPath, { name: 'Parent' });
    const storedParent = loadSession(workspaceRootPath, parent.id);
    expect(storedParent).not.toBeNull();
    if (!storedParent) return;

    const messages: StoredMessage[] = [
      { id: 'u1', type: 'user', content: 'Question', timestamp: 1 },
      { id: 'a1', type: 'assistant', content: 'Answer 1', timestamp: 2 },
      { id: 'a2', type: 'assistant', content: 'Answer 2', timestamp: 3 },
      { id: 'u2', type: 'user', content: 'Follow-up', timestamp: 4 },
    ];
    storedParent.messages = messages;
    storedParent.tokenUsage = EMPTY_USAGE;
    await saveSession(storedParent);

    const child = await createSubSession(workspaceRootPath, parent.id, {
      branchFromMessageId: 'a2',
    });
    const storedChild = loadSession(workspaceRootPath, child.id);
    expect(storedChild).not.toBeNull();
    if (!storedChild) return;

    expect(storedChild.parentSessionId).toBe(parent.id);
    expect(storedChild.messages.map((message) => message.id)).toEqual(['u1', 'a1', 'a2']);
    expect(storedChild.lastReadMessageId).toBe('a2');
    expect(storedChild.hasUnread).toBe(false);
  });

  it('keeps child session empty when no branch message is provided', async () => {
    const parent = await createSession(workspaceRootPath, { name: 'Parent' });
    const child = await createSubSession(workspaceRootPath, parent.id);
    const storedChild = loadSession(workspaceRootPath, child.id);

    expect(storedChild).not.toBeNull();
    if (!storedChild) return;
    expect(storedChild.parentSessionId).toBe(parent.id);
    expect(storedChild.messages).toHaveLength(0);
  });

  it('throws when branch message does not exist in parent session', async () => {
    const parent = await createSession(workspaceRootPath, { name: 'Parent' });
    await expect(
      createSubSession(workspaceRootPath, parent.id, { branchFromMessageId: 'missing-message' })
    ).rejects.toThrow('Branch message not found in parent session');
  });
});
