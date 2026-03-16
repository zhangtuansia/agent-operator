import { describe, expect, it } from 'bun:test'
import type { Message } from '@agent-operator/core/types'
import {
  shouldSynthesizeStreamingTextOnComplete,
  withStreamingSnapshotMessage,
} from '../persistence-utils'

describe('persistence-utils', () => {
  it('adds a synthetic assistant message when persisting active streaming text', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'hi',
        timestamp: 1000,
      },
    ]

    const result = withStreamingSnapshotMessage(messages, 'final answer', 'session-1', 2000)

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      role: 'assistant',
      content: 'final answer',
      timestamp: 2000,
      isIntermediate: false,
    })
    expect(result[1]?.id).toBe('streaming-session-1-2000')
  })

  it('does not add a synthetic message when there is no streaming text', () => {
    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'done',
        timestamp: 1000,
      },
    ]

    const result = withStreamingSnapshotMessage(messages, '', 'session-1', 2000)

    expect(result).toEqual(messages)
  })

  it('promotes the latest visible intermediate assistant message when streaming text is already empty', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'latest prompt',
        timestamp: 1000,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'visible reply',
        timestamp: 2000,
        isIntermediate: true,
      },
    ]

    const result = withStreamingSnapshotMessage(messages, '', 'session-1', 3000)

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'visible reply',
      timestamp: 2000,
      isIntermediate: false,
    })
    expect(messages[1]?.isIntermediate).toBe(true)
  })

  it('keeps older intermediate assistant messages untouched when a newer final answer already exists', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'latest prompt',
        timestamp: 1000,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'commentary',
        timestamp: 1500,
        isIntermediate: true,
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'final answer',
        timestamp: 2000,
        isIntermediate: false,
      },
    ]

    const result = withStreamingSnapshotMessage(messages, '', 'session-1', 3000)

    expect(result).toEqual(messages)
  })

  it('synthesizes a final assistant message on complete when the last user message has no final reply yet', () => {
    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'older reply',
        timestamp: 1000,
      },
      {
        id: 'user-1',
        role: 'user',
        content: 'latest prompt',
        timestamp: 2000,
      },
    ]

    expect(shouldSynthesizeStreamingTextOnComplete(messages, 'streamed answer')).toBe(true)
  })

  it('does not synthesize when the current turn already has a final assistant reply', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'latest prompt',
        timestamp: 1000,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'done',
        timestamp: 2000,
      },
    ]

    expect(shouldSynthesizeStreamingTextOnComplete(messages, 'streamed answer')).toBe(false)
  })
})
