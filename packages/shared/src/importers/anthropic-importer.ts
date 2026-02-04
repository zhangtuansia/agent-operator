/**
 * Anthropic (Claude) Importer
 *
 * Parses Claude's exported JSON format.
 * The format uses "human" and "assistant" roles with nested content arrays.
 *
 * Ported from Chorus's AnthropicImporter for more robust parsing.
 * Handles XML tags (antThinking, antArtifact, antml:function_calls) and converts
 * them to displayable content with proper formatting.
 *
 * Supported export format: conversations.json from Claude data export
 */

import type { ImportedMessage, ImportedConversation, ImportResult } from './types.ts'

/**
 * Claude export message content block
 */
interface AnthropicContentItem {
  type: 'text' | 'tool_use' | 'tool_result' | 'image'
  text?: string
  name?: string
  input?: unknown
  content?: string | AnthropicContentItem[]
}

/**
 * Claude export message structure
 */
interface AnthropicMessage {
  uuid: string
  sender: 'human' | 'assistant'
  created_at: string
  updated_at: string
  content: AnthropicContentItem[]
  text?: string // Some formats have text at top level
}

/**
 * Claude export conversation structure
 */
interface AnthropicConversation {
  uuid: string
  name: string
  created_at: string
  updated_at: string
  chat_messages: AnthropicMessage[]
}

/**
 * Parsed XML part
 */
interface XMLPart {
  type: 'text' | 'xml'
  content: string
  tagName?: string
}

/**
 * Known Anthropic XML tag patterns
 */
const XML_TAG_PATTERNS = [
  'antthinking',
  'antThinking',
  'antartifact',
  'antArtifact',
  'antml:thinking',
  'antml:function_calls',
  'antml:artifact',
]

/**
 * Get a prettier display name for XML tags
 */
function prettyXMLTagName(tagName: string): string {
  const lower = tagName.toLowerCase()
  if (lower === 'antartifact' || lower === 'antml:artifact') {
    return 'Artifact'
  } else if (lower === 'antml:function_calls') {
    return 'Function Calls'
  } else if (lower === 'antthinking' || lower === 'antml:thinking') {
    return 'Thinking'
  }
  return tagName
}

/**
 * Parse XML tags from text content and creates separate parts for each
 * Ported from Chorus's AnthropicImporter
 */
function parseXMLTags(text: string): XMLPart[] {
  const parts: XMLPart[] = []
  let remainingText = text

  while (remainingText.length > 0) {
    let foundMatch = false
    let earliestMatch: {
      index: number
      length: number
      tagName: string
      content: string
    } | null = null

    // Find the earliest occurring tag
    for (const tagName of XML_TAG_PATTERNS) {
      // Look for opening tag
      const openTag = `<${tagName}`
      const openIndex = remainingText.indexOf(openTag)

      if (openIndex !== -1) {
        // Find the closing tag
        const closeTag = `</${tagName}>`
        const closeIndex = remainingText.indexOf(closeTag, openIndex)

        if (closeIndex !== -1) {
          const fullMatch = remainingText.substring(openIndex, closeIndex + closeTag.length)

          if (!earliestMatch || openIndex < earliestMatch.index) {
            earliestMatch = {
              index: openIndex,
              length: fullMatch.length,
              tagName: tagName.toLowerCase(),
              content: fullMatch,
            }
          }
        }
      }
    }

    if (earliestMatch) {
      // Add any text before the XML tag
      if (earliestMatch.index > 0) {
        const textContent = remainingText.substring(0, earliestMatch.index).trim()
        if (textContent) {
          parts.push({ type: 'text', content: textContent })
        }
      }

      // Add the XML tag
      parts.push({
        type: 'xml',
        content: earliestMatch.content,
        tagName: earliestMatch.tagName,
      })

      // Move past this match
      remainingText = remainingText.substring(earliestMatch.index + earliestMatch.length)
      foundMatch = true
    }

    if (!foundMatch) {
      // No more XML tags found, add remaining text
      if (remainingText.trim()) {
        parts.push({ type: 'text', content: remainingText.trim() })
      }
      break
    }
  }

  // If no parts were created, return the original text
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text })
  }

  return parts
}

/**
 * Extract inner content from an XML tag
 */
function extractXMLInnerContent(xmlContent: string): string {
  const openTagEnd = xmlContent.indexOf('>')
  const closeTagStart = xmlContent.lastIndexOf('</')

  if (openTagEnd !== -1 && closeTagStart !== -1 && closeTagStart > openTagEnd) {
    return xmlContent.substring(openTagEnd + 1, closeTagStart).trim()
  }

  return xmlContent
}

/**
 * Process content items to extract formatted text
 * Handles text, XML tags (thinking, artifacts), and tool usage
 */
function processContentToText(content: AnthropicContentItem[]): string {
  const textParts: string[] = []

  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // Parse XML tags from the text
      const xmlParts = parseXMLTags(item.text)

      for (const xmlPart of xmlParts) {
        if (xmlPart.type === 'text') {
          if (xmlPart.content.trim()) {
            textParts.push(xmlPart.content.trim())
          }
        } else if (xmlPart.type === 'xml') {
          const tagName = xmlPart.tagName || ''
          const innerContent = extractXMLInnerContent(xmlPart.content)

          // Handle thinking tags specially - wrap in <think> for UI rendering
          if (tagName === 'antthinking' || tagName === 'antml:thinking') {
            if (innerContent.trim()) {
              textParts.push(`<think>\n${innerContent}\n</think>`)
            }
          } else if (tagName === 'antartifact' || tagName === 'antml:artifact') {
            // Extract artifact attributes if present
            const titleMatch = xmlPart.content.match(/title="([^"]*)"/)
            const title = titleMatch ? titleMatch[1] : 'Artifact'
            if (innerContent.trim()) {
              textParts.push(`**[${title}]**\n\n${innerContent}`)
            }
          } else if (tagName === 'antml:function_calls') {
            // Format function calls as code block
            if (innerContent.trim()) {
              textParts.push(`\`\`\`xml\n${innerContent}\n\`\`\``)
            }
          } else {
            // For other XML tags, include with a label
            const prettyName = prettyXMLTagName(tagName)
            if (innerContent.trim()) {
              textParts.push(`**[${prettyName}]**\n${innerContent}`)
            }
          }
        }
      }
    } else if (item.type === 'tool_use') {
      // Format tool usage
      const toolName = item.name || 'unknown'
      const input = item.input
      if (input) {
        textParts.push(`**[Tool: ${toolName}]**\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``)
      } else {
        textParts.push(`**[Tool: ${toolName}]**`)
      }
    } else if (item.type === 'tool_result') {
      // Format tool results
      const resultContent = typeof item.content === 'string'
        ? item.content
        : JSON.stringify(item.content, null, 2)
      if (resultContent) {
        textParts.push(`**[Tool Result]**\n${resultContent}`)
      }
    }
  }

  return textParts.join('\n\n').trim() || ''
}

/**
 * Extract plain text from content items (for user messages, we want clean text)
 */
function extractPlainText(content: AnthropicContentItem[]): string {
  const textParts: string[] = []

  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // For user messages, just extract the text without XML parsing
      textParts.push(item.text.trim())
    }
  }

  return textParts.join('\n\n').trim() || ''
}

/**
 * Parse a single Claude message
 */
function parseMessage(msg: AnthropicMessage, isUser: boolean): ImportedMessage | null {
  const role = msg.sender === 'human' ? 'user' : 'assistant'

  let content: string | null = null

  if (msg.text) {
    // Some formats have text at top level
    content = msg.text.trim()
  } else if (msg.content && Array.isArray(msg.content)) {
    // For user messages, extract plain text
    // For assistant messages, process with XML tag handling
    content = isUser
      ? extractPlainText(msg.content)
      : processContentToText(msg.content)
  }

  if (!content) return null

  // Parse timestamp
  let timestamp: number | undefined
  if (msg.created_at) {
    const parsed = Date.parse(msg.created_at)
    if (!isNaN(parsed)) {
      timestamp = parsed
    }
  }

  return {
    role,
    content,
    timestamp,
  }
}

/**
 * Parse a single Claude conversation
 */
function parseConversation(conv: AnthropicConversation): ImportedConversation | null {
  if (!conv.chat_messages || !Array.isArray(conv.chat_messages)) {
    return null
  }

  const messages: ImportedMessage[] = []

  for (const msg of conv.chat_messages) {
    const isUser = msg.sender === 'human'
    const parsed = parseMessage(msg, isUser)
    if (parsed) {
      messages.push(parsed)
    }
  }

  // Skip empty conversations
  if (messages.length === 0) {
    return null
  }

  // Parse timestamps
  let createdAt = Date.now()
  let updatedAt = Date.now()

  if (conv.created_at) {
    const parsed = Date.parse(conv.created_at)
    if (!isNaN(parsed)) createdAt = parsed
  }

  if (conv.updated_at) {
    const parsed = Date.parse(conv.updated_at)
    if (!isNaN(parsed)) updatedAt = parsed
  }

  return {
    id: conv.uuid,
    title: conv.name || 'Untitled',
    createdAt,
    updatedAt,
    messages,
  }
}

/**
 * Parse Claude export JSON
 * @param jsonContent - Raw JSON string from Claude export
 * @returns Import result with parsed conversations
 */
export function parseAnthropicExport(jsonContent: string): ImportResult {
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
    result.errors.push('Invalid Anthropic export format: expected an array of conversations')
    return result
  }

  const conversations = data as AnthropicConversation[]

  for (const conv of conversations) {
    try {
      if (!conv.uuid) {
        result.failed++
        result.errors.push(`Skipped conversation: missing uuid`)
        continue
      }

      const parsed = parseConversation(conv)
      if (parsed) {
        result.conversations.push(parsed)
        result.imported++
      } else {
        result.failed++
        result.errors.push(`Skipped conversation "${conv.name || conv.uuid}": no valid messages`)
      }
    } catch (error) {
      result.failed++
      result.errors.push(
        `Failed to parse conversation "${conv.name || conv.uuid}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return result
}
