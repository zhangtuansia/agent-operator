import type { Message } from '@agent-operator/core/types'

function getLastFinalAssistantMessage(messages: Message[]): Message | undefined {
  return [...messages].reverse().find(message => message.role === 'assistant' && !message.isIntermediate)
}

function getLastUserMessage(messages: Message[]): Message | undefined {
  return [...messages].reverse().find(message => message.role === 'user')
}

function getLastAssistantMessageIndex(messages: Message[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return index
    }
  }
  return -1
}

export function shouldSynthesizeStreamingTextOnComplete(
  messages: Message[],
  streamingText: string,
): boolean {
  if (!streamingText) return false

  const lastAssistantMessage = getLastFinalAssistantMessage(messages)
  const lastUserMessage = getLastUserMessage(messages)

  if (!lastAssistantMessage) {
    return true
  }

  if (!lastUserMessage) {
    return false
  }

  return lastUserMessage.timestamp > lastAssistantMessage.timestamp
}

export function withStreamingSnapshotMessage(
  messages: Message[],
  streamingText: string,
  sessionId: string,
  timestamp: number,
): Message[] {
  if (streamingText) {
    const streamingMessage: Message = {
      id: `streaming-${sessionId}-${timestamp}`,
      role: 'assistant',
      content: streamingText,
      timestamp,
      isIntermediate: false,
    }

    return [...messages, streamingMessage]
  }

  const lastAssistantIndex = getLastAssistantMessageIndex(messages)
  if (lastAssistantIndex < 0) {
    return messages
  }

  const lastAssistantMessage = messages[lastAssistantIndex]
  if (!lastAssistantMessage?.isIntermediate) {
    return messages
  }

  const lastUserMessage = getLastUserMessage(messages)
  const lastFinalAssistantMessage = getLastFinalAssistantMessage(messages)

  if (
    lastUserMessage &&
    lastAssistantMessage.timestamp <= lastUserMessage.timestamp
  ) {
    return messages
  }

  if (
    lastFinalAssistantMessage &&
    lastFinalAssistantMessage.timestamp >= lastAssistantMessage.timestamp
  ) {
    return messages
  }

  const snapshotMessages = messages.slice()
  snapshotMessages[lastAssistantIndex] = {
    ...lastAssistantMessage,
    isIntermediate: false,
  }

  return snapshotMessages
}
