import { describe, expect, it } from 'bun:test'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import type { Session } from '@agent-operator/shared/protocol'
import { buildOfficeBulkSyncSessions } from '../office-session-sync'

function createSession(overrides: Partial<Session>): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    name: 'Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    permissionMode: 'ask',
    messages: [],
    messageCount: 0,
    messageHistory: [],
    isProcessing: false,
    isArchived: false,
    hidden: false,
    status: 'active',
    lastReadMessageId: undefined,
    hasUnread: false,
    labels: [],
    attachments: [],
    ...overrides,
  } as Session
}

describe('buildOfficeBulkSyncSessions', () => {
  it('waits for session manager initialization before reading sessions', async () => {
    const calls: string[] = []
    const sessionManager = {
      waitForInit: async () => {
        calls.push('waitForInit')
      },
      getSessions: () => {
        calls.push('getSessions')
        return [createSession({ id: 's-1', name: 'Visible session', isProcessing: true })]
      },
    } as unknown as ISessionManager

    const sessions = await buildOfficeBulkSyncSessions(sessionManager)

    expect(calls).toEqual(['waitForInit', 'getSessions'])
    expect(sessions).toEqual([
      {
        sessionId: 's-1',
        sessionName: 'Visible session',
        isActive: true,
      },
    ])
  })

  it('filters archived and hidden sessions', async () => {
    const sessionManager = {
      waitForInit: async () => {},
      getSessions: () => [
        createSession({ id: 'visible', name: 'Visible', isProcessing: false }),
        createSession({ id: 'archived', name: 'Archived', isArchived: true }),
        createSession({ id: 'hidden', name: 'Hidden', hidden: true }),
      ],
    } as unknown as ISessionManager

    const sessions = await buildOfficeBulkSyncSessions(sessionManager)

    expect(sessions).toEqual([
      {
        sessionId: 'visible',
        sessionName: 'Visible',
        isActive: false,
      },
    ])
  })
})
