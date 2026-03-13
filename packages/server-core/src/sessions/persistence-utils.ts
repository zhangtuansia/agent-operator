import type { Message } from '@agent-operator/core/types'

function getLastFinalAssistantMessage(messages: Message[]): Message | undefined {
  return [...messages].reverse().find(message => message.role === 'assistant' && !message.isIntermediate)
}

function getLastUserMessage(messages: Message[]): Message | undefined {
  return [...messages].reverse().find(message => message.role === 'user')
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
  if (!streamingText) {
    return messages
  }

  const streamingMessage: Message = {
    id: `streaming-${sessionId}-${timestamp}`,
    role: 'assistant',
    content: streamingText,
    timestamp,
    isIntermediate: false,
  }

  return [...messages, streamingMessage]
}
