/**
 * Feishu Bot — Message Parsing & Policy
 *
 * Handles inbound message parsing, @mention detection,
 * content extraction (text/post), and access policy checks.
 * Adapted from LobsterAI feishuGateway.ts + OpenClaw bot.ts.
 */

import type { IMMessage, MediaMarker, IMMediaType } from '../../types.ts';
import type { FeishuConfig } from './config.ts';

// ============================================================
// Feishu Event Types
// ============================================================

export interface FeishuMessageEvent {
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    chat_id: string;
    chat_type: 'p2p' | 'group';
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: { open_id?: string; user_id?: string };
      name: string;
    }>;
  };
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
    };
    sender_type: string;
  };
}

export interface FeishuMessageContext {
  chatId: string;
  messageId: string;
  senderId: string;
  senderOpenId: string;
  chatType: 'p2p' | 'group';
  mentionedBot: boolean;
  rootId?: string;
  parentId?: string;
  content: string;
  contentType: string;
}

// ============================================================
// Content Parsing
// ============================================================

/**
 * Parse message content based on message type
 */
export function parseMessageContent(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);
    if (messageType === 'text') {
      return parsed.text || '';
    }
    if (messageType === 'post') {
      return parsePostContent(content);
    }
    return content;
  } catch {
    return content;
  }
}

/**
 * Parse post (rich text) content into plain text
 */
export function parsePostContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const title = parsed.title || '';
    const contentBlocks = parsed.content || [];
    let textContent = title ? `${title}\n\n` : '';

    for (const paragraph of contentBlocks) {
      if (Array.isArray(paragraph)) {
        for (const element of paragraph) {
          if (element.tag === 'text') {
            textContent += element.text || '';
          } else if (element.tag === 'a') {
            textContent += element.text || element.href || '';
          } else if (element.tag === 'at') {
            textContent += `@${element.user_name || element.user_id || ''}`;
          }
        }
        textContent += '\n';
      }
    }

    return textContent.trim() || '[富文本消息]';
  } catch {
    return '[富文本消息]';
  }
}

// ============================================================
// @Mention Detection
// ============================================================

/**
 * Check if the bot was mentioned in the message
 */
export function checkBotMentioned(
  event: FeishuMessageEvent,
  botOpenId: string | null
): boolean {
  const mentions = event.message.mentions ?? [];
  if (mentions.length === 0) return false;
  if (!botOpenId) return mentions.length > 0;
  return mentions.some((m) => m.id.open_id === botOpenId);
}

/**
 * Strip bot mention from text
 */
export function stripBotMention(
  text: string,
  mentions?: FeishuMessageEvent['message']['mentions']
): string {
  if (!mentions || mentions.length === 0) return text;
  let result = text;
  for (const mention of mentions) {
    result = result.replace(new RegExp(`@${mention.name}\\s*`, 'g'), '').trim();
    result = result.replace(new RegExp(mention.key, 'g'), '').trim();
  }
  return result;
}

// ============================================================
// Event Parsing
// ============================================================

/**
 * Parse a Feishu message event into a FeishuMessageContext
 */
export function parseMessageEvent(
  event: FeishuMessageEvent,
  botOpenId: string | null
): FeishuMessageContext {
  const rawContent = parseMessageContent(event.message.content, event.message.message_type);
  const mentionedBot = checkBotMentioned(event, botOpenId);
  const content = stripBotMention(rawContent, event.message.mentions);

  return {
    chatId: event.message.chat_id,
    messageId: event.message.message_id,
    senderId: event.sender.sender_id.user_id || event.sender.sender_id.open_id || '',
    senderOpenId: event.sender.sender_id.open_id || '',
    chatType: event.message.chat_type,
    mentionedBot,
    rootId: event.message.root_id,
    parentId: event.message.parent_id,
    content,
    contentType: event.message.message_type,
  };
}

/**
 * Convert FeishuMessageContext to a unified IMMessage
 */
export function contextToIMMessage(ctx: FeishuMessageContext): IMMessage {
  return {
    platform: 'feishu',
    messageId: ctx.messageId,
    conversationId: ctx.chatId,
    senderId: ctx.senderId,
    content: ctx.content,
    chatType: ctx.chatType === 'p2p' ? 'direct' : 'group',
    timestamp: Date.now(),
  };
}

// ============================================================
// Policy Checks
// ============================================================

/**
 * Check if a message should be processed based on config policy.
 * Returns null if allowed, or a reason string if rejected.
 */
export function checkMessagePolicy(
  ctx: FeishuMessageContext,
  config: FeishuConfig
): string | null {
  if (ctx.chatType === 'group') {
    // Group policy
    if (config.groupPolicy === 'disabled') {
      return 'Group messages are disabled';
    }

    if (config.requireMention && !ctx.mentionedBot) {
      return 'Bot not mentioned in group';
    }

    if (config.groupPolicy === 'allowlist' && config.groupAllowFrom) {
      const allowed = config.groupAllowFrom.some(
        (id) => id === ctx.chatId || id === ctx.senderId || id === ctx.senderOpenId
      );
      if (!allowed) {
        return 'Sender not in group allowlist';
      }
    }
  } else {
    // DM policy
    if (config.dmPolicy === 'allowlist' && config.allowFrom) {
      const allowed = config.allowFrom.some(
        (id) => id === ctx.senderId || id === ctx.senderOpenId
      );
      if (!allowed) {
        return 'Sender not in DM allowlist';
      }
    }
  }

  return null;
}

// ============================================================
// Media Marker Parsing
// ============================================================

/**
 * Parse media markers from response text.
 * Detects patterns like:
 *   ![image](/path/to/file.png)
 *   [filename](file:///path/to/file.pdf)
 *   📎 /path/to/file.txt
 */
export function parseMediaMarkers(text: string): MediaMarker[] {
  const markers: MediaMarker[] = [];

  // Markdown image: ![alt](/path)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imageRegex.exec(text)) !== null) {
    markers.push({
      type: detectMediaType(match[2]!),
      path: match[2]!,
      name: match[1] || undefined,
      originalMarker: match[0]!,
    });
  }

  // Markdown link to local file: [name](file:///path) or [name](/absolute/path)
  const linkRegex = /\[([^\]]+)\]\(((?:file:\/\/\/|\/)[^)]+)\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    // Skip if already captured as image
    if (markers.some((m) => m.originalMarker === match![0])) continue;
    markers.push({
      type: detectMediaType(match[2]!),
      path: match[2]!,
      name: match[1] || undefined,
      originalMarker: match[0]!,
    });
  }

  return markers;
}

/**
 * Detect media type from file path/extension
 */
function detectMediaType(filePath: string): IMMediaType {
  const ext = filePath.replace(/[?#].*$/, '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'amr'].includes(ext)) return 'audio';
  return 'file';
}
