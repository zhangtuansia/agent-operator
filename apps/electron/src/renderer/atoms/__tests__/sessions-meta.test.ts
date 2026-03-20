import { describe, expect, it } from 'bun:test'

import type { Session } from '../../../../shared/types'
import { extractSessionMeta } from '../sessions'

describe('extractSessionMeta', () => {
  it('preserves hasUnread for list filtering and counts', () => {
    const session = {
      id: 'session-1',
      workspaceId: 'workspace-1',
      messages: [],
      hasUnread: true,
      lastReadMessageId: undefined,
    } as Session

    const meta = extractSessionMeta(session)

    expect(meta.hasUnread).toBe(true)
  })
})
