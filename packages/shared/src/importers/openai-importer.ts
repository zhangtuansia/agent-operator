/**
 * OpenAI (ChatGPT) Importer
 *
 * Parses ChatGPT's exported JSON format.
 * The format uses a tree structure with a "mapping" object where each message
 * has a parent reference. We use BFS traversal to get messages in chronological order.
 *
 * Ported from Chorus's OpenAIImporter for more robust parsing.
 *
 * Supported export format: conversations.json from ChatGPT data export
 */

import type { ImportedMessage, ImportedConversation, ImportResult } from './types.ts'

/**
 * OpenAI message structure
 */
interface OpenAIMessage {
  id: string
  author: {
    role: 'system' | 'user' | 'assistant' | 'tool'
    name?: string | null
    metadata?: unknown
  }
  create_time: number | null
  update_time?: number | null
  content: {
    content_type: 'text' | 'code' | 'execution_output' | 'multimodal_text' | 'thoughts' | 'reasoning_recap'
    parts?: (string | Record<string, unknown>)[]
    text?: string
    language?: string
    result?: string
    thoughts?: string[]
    content?: string
    [key: string]: unknown
  }
  status: string
  metadata?: {
    is_visually_hidden_from_conversation?: boolean
    [key: string]: unknown
  }
  recipient?: string
  [key: string]: unknown
}

/**
 * OpenAI node in the mapping tree
 */
interface OpenAINode {
  id: string
  message: OpenAIMessage | null
  parent: string | null
  children: string[]
}

/**
 * OpenAI conversation structure
 */
interface OpenAIConversation {
  id?: string
  title: string
  create_time: number
  update_time: number
  mapping: Record<string, OpenAINode>
  [key: string]: unknown
}

/**
 * Cleans up Unicode characters that don't render well
 * Ported from Chorus
 */
function cleanUnicodeText(text: string): string {
  if (!text) return text

  // Replace common problematic Unicode characters
  text = text
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/\u2013/g, '-') // En dash
    .replace(/\u2014/g, '--') // Em dash
    .replace(/\u2026/g, '...') // Ellipsis
    .replace(/\u00A0/g, ' ') // Non-breaking space
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u00AD/g, '') // Soft hyphen
    .replace(/[\u2028\u2029]/g, '\n') // Line and paragraph separators

  // Remove OpenAI-specific escape sequences
  text = text
    .replace(/\ue200cite\ue202[^\ue201]*\ue201/g, '') // Citation references
    .replace(/\ue200[^\ue201]*\ue201/g, '') // Other OpenAI specific markers
    .replace(/\ue202/g, '') // Remaining separators
    .replace(/\u202f/g, ' ') // Narrow no-break space

  return text
}

/**
 * Extract text from an OpenAI message
 */
function extractTextFromMessage(message: OpenAIMessage): string {
  let text = ''

  if (message.content.parts && message.content.parts.length > 0) {
    const textParts = message.content.parts
      .filter((part): part is string => typeof part === 'string')
      .filter(part => part.trim().length > 0)
    text = textParts.join('\n').trim()
  } else if (message.content.text) {
    text = message.content.text.trim()
  }

  return cleanUnicodeText(text)
}

/**
 * Extract messages in chronological order from OpenAI's mapping structure
 * Uses BFS traversal starting from root's children
 */
function extractMessagesFromMapping(mapping: Record<string, OpenAINode>): OpenAIMessage[] {
  const messages: OpenAIMessage[] = []

  // Find the root node (node with null parent)
  const rootNode = Object.values(mapping).find(node => node.parent === null)
  if (!rootNode) return messages

  // BFS to get messages in order, starting from root's children
  const queue: string[] = rootNode.children || []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = mapping[nodeId]
    if (!node) continue

    // Add the message if it exists and is not system
    if (node.message && node.message.author.role !== 'system') {
      // Skip visually hidden messages
      if (!node.message.metadata?.is_visually_hidden_from_conversation) {
        messages.push(node.message)
      }
    }

    // Add children to queue
    if (node.children) {
      queue.push(...node.children)
    }
  }

  return messages
}

/**
 * Process response messages to extract combined text
 * Handles various content types: text, code, thoughts, reasoning_recap
 */
function processResponseMessages(messages: OpenAIMessage[]): string {
  const textParts: string[] = []

  for (const [i, message] of messages.entries()) {
    if (!message) continue

    // Handle tool messages or messages not meant for "all" recipients
    if (message.author.role === 'tool' || (message.recipient && message.recipient !== 'all')) {
      // For tool messages, we can optionally include a summary
      // Skip for now to keep imports clean
      continue
    }

    // Handle thoughts content type
    if (message.content.content_type === 'thoughts') {
      const thoughts = message.content.thoughts
      if (thoughts && Array.isArray(thoughts) && thoughts.length > 0) {
        textParts.push(`<thinking>\n${thoughts.join('\n\n')}\n</thinking>`)
      }
      continue
    }

    // Handle reasoning recap
    if (message.content.content_type === 'reasoning_recap') {
      const content = message.content.content
      if (content && content !== '' && content !== 'Thought for 0 seconds') {
        textParts.push(`<reasoning>\n${content}\n</reasoning>`)
      }
      continue
    }

    // Handle text content
    if (message.content.content_type === 'text') {
      const text = extractTextFromMessage(message)
      if (text && message.author.role === 'assistant' && (!message.recipient || message.recipient === 'all')) {
        textParts.push(text)
      }
    } else if (message.content.content_type === 'code') {
      const codeText = message.content.text || ''
      const language = message.content.language || ''

      // Skip the first code block if it's just echoing the user's query
      if (i <= 1 && codeText.startsWith('search(') && codeText.includes(')')) {
        continue
      }

      if (codeText.trim()) {
        textParts.push(`\`\`\`${language}\n${codeText}\n\`\`\``)
      }
    } else if (message.content.content_type === 'execution_output') {
      const result = message.content.result || message.content.text
      if (result && typeof result === 'string' && result.trim()) {
        textParts.push(`Output:\n${result}`)
      }
    }
  }

  return textParts.join('\n\n').trim() || ''
}

/**
 * Parse a single OpenAI conversation
 */
function parseConversation(conversation: OpenAIConversation): ImportedConversation | null {
  if (!conversation.mapping || typeof conversation.mapping !== 'object') {
    return null
  }

  const allMessages = extractMessagesFromMapping(conversation.mapping)
  const importedMessages: ImportedMessage[] = []

  let i = 0
  while (i < allMessages.length) {
    const userMessage = allMessages[i]
    if (!userMessage) {
      i++
      continue
    }

    // Skip if not a user message
    if (userMessage.author.role !== 'user') {
      i++
      continue
    }

    // Extract user message text
    const userText = extractTextFromMessage(userMessage)
    if (userText) {
      importedMessages.push({
        role: 'user',
        content: userText,
        timestamp: userMessage.create_time ? Math.floor(userMessage.create_time * 1000) : undefined,
      })
    }

    // Look for the corresponding assistant/tool message(s)
    const responseMessages: OpenAIMessage[] = []
    let j = i + 1
    while (j < allMessages.length) {
      const candidate = allMessages[j]
      if (!candidate) break
      if (candidate.author.role !== 'assistant' && candidate.author.role !== 'tool') break
      responseMessages.push(candidate)
      j++
    }

    // Process response messages
    if (responseMessages.length > 0) {
      const assistantText = processResponseMessages(responseMessages)
      if (assistantText) {
        // Get timestamp from first response message
        const firstResponse = responseMessages[0]
        if (!firstResponse) {
          i = j
          continue
        }
        importedMessages.push({
          role: 'assistant',
          content: assistantText,
          timestamp: firstResponse.create_time ? Math.floor(firstResponse.create_time * 1000) : undefined,
        })
      }
      i = j // Move past all processed messages
    } else {
      i++
    }
  }

  // Skip empty conversations
  if (importedMessages.length === 0) {
    return null
  }

  return {
    id: conversation.id || String(Date.now()),
    title: conversation.title || 'Untitled',
    createdAt: conversation.create_time ? Math.floor(conversation.create_time * 1000) : Date.now(),
    updatedAt: conversation.update_time ? Math.floor(conversation.update_time * 1000) : Date.now(),
    messages: importedMessages,
  }
}

/**
 * Parse ChatGPT export JSON
 * @param jsonContent - Raw JSON string from ChatGPT export
 * @returns Import result with parsed conversations
 */
export function parseOpenAIExport(jsonContent: string): ImportResult {
  const result: ImportResult = {
    conversations: [],
    imported: 0,
    failed: 0,
    errors: [],
  }

  let data: unknown
  try {
    data = JSON.parse(jsonContent)
  } catch (error) {
    result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return result
  }

  // Validate the data structure - expect an array
  if (!Array.isArray(data)) {
    result.errors.push('Invalid OpenAI export format: expected an array of conversations')
    return result
  }

  const conversations = data as OpenAIConversation[]

  for (const conv of conversations) {
    try {
      if (!conv.mapping) {
        result.failed++
        result.errors.push(`Skipped conversation: missing mapping`)
        continue
      }

      const parsed = parseConversation(conv)
      if (parsed) {
        result.conversations.push(parsed)
        result.imported++
      } else {
        result.failed++
        result.errors.push(`Skipped conversation "${conv.title || 'Unknown'}": no valid messages`)
      }
    } catch (error) {
      result.failed++
      result.errors.push(
        `Failed to parse conversation "${conv.title || 'Unknown'}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return result
}
