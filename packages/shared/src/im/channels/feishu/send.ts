/**
 * Feishu Message Sending
 *
 * Send text, card, image, file, and audio messages to Feishu.
 * Handles media markers in response text for automatic upload.
 * Adapted from LobsterAI feishuGateway.ts send methods.
 */

import { existsSync, statSync } from 'fs';
import { basename, extname } from 'path';
import type { MediaMarker } from '../../types.ts';
import {
  uploadImageToFeishu,
  uploadFileToFeishu,
  detectFeishuFileType,
  isImagePath,
  isAudioPath,
  resolveMediaPath,
} from './media.ts';

// ============================================================
// JSON Encoding (handle CJK characters)
// ============================================================

function stringifyAsciiJson(obj: unknown): string {
  return JSON.stringify(obj);
}

// ============================================================
// receive_id_type Resolution
// ============================================================

function resolveReceiveIdType(target: string): 'open_id' | 'user_id' | 'chat_id' {
  if (target.startsWith('ou_')) return 'open_id';
  if (target.startsWith('oc_')) return 'chat_id';
  return 'chat_id';
}

// ============================================================
// Send Functions
// ============================================================

/**
 * Send a text message
 */
export async function sendTextMessage(
  client: any,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<void> {
  const receiveIdType = resolveReceiveIdType(to);
  const content = stringifyAsciiJson({ text });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: 'text' },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return;
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: 'text' },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Build a markdown card structure
 */
function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    elements: [{ tag: 'markdown', content: text }],
  };
}

/**
 * Send a card (interactive) message with markdown content
 */
export async function sendCardMessage(
  client: any,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<void> {
  const receiveIdType = resolveReceiveIdType(to);
  const card = buildMarkdownCard(text);
  const content = stringifyAsciiJson(card);

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: 'interactive' },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return;
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: 'interactive' },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Send an image message
 */
export async function sendImageMessage(
  client: any,
  to: string,
  imageKey: string,
  replyToMessageId?: string
): Promise<void> {
  const receiveIdType = resolveReceiveIdType(to);
  const content = stringifyAsciiJson({ image_key: imageKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: 'image' },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu image reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return;
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: 'image' },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu image send failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Send a file message
 */
export async function sendFileMessage(
  client: any,
  to: string,
  fileKey: string,
  replyToMessageId?: string
): Promise<void> {
  const receiveIdType = resolveReceiveIdType(to);
  const content = stringifyAsciiJson({ file_key: fileKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: 'file' },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu file reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return;
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: 'file' },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu file send failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Send an audio message
 */
export async function sendAudioMessage(
  client: any,
  to: string,
  fileKey: string,
  duration?: number,
  replyToMessageId?: string
): Promise<void> {
  const receiveIdType = resolveReceiveIdType(to);
  const content = stringifyAsciiJson({
    file_key: fileKey,
    ...(duration !== undefined && { duration: Math.floor(duration).toString() }),
  });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: 'audio' },
    });
    if (response.code !== 0) {
      throw new Error(`Feishu audio reply failed: ${response.msg || `code ${response.code}`}`);
    }
    return;
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: { receive_id: to, content, msg_type: 'audio' },
  });
  if (response.code !== 0) {
    throw new Error(`Feishu audio send failed: ${response.msg || `code ${response.code}`}`);
  }
}

// ============================================================
// Composite Send Functions
// ============================================================

/**
 * Send a message using the configured render mode
 */
export async function sendMessage(
  client: any,
  to: string,
  text: string,
  renderMode: 'text' | 'card' = 'card',
  replyToMessageId?: string
): Promise<void> {
  if (renderMode === 'card') {
    await sendCardMessage(client, to, text, replyToMessageId);
  } else {
    await sendTextMessage(client, to, text, replyToMessageId);
  }
}

/**
 * Upload and send a media file
 */
export async function uploadAndSendMedia(
  client: any,
  to: string,
  filePath: string,
  mediaType: 'image' | 'video' | 'audio' | 'file',
  replyToMessageId?: string,
  customFileName?: string
): Promise<void> {
  const absPath = resolveMediaPath(filePath);

  if (!existsSync(absPath)) {
    console.warn(`[Feishu Send] File not found: ${absPath}`);
    return;
  }

  const originalFileName = basename(absPath);
  const ext = extname(absPath);
  const fileName = customFileName ? `${customFileName}${ext}` : originalFileName;

  if (mediaType === 'image' || isImagePath(absPath)) {
    const result = await uploadImageToFeishu(client, absPath);
    if (!result.success || !result.imageKey) {
      console.warn(`[Feishu Send] Image upload failed: ${result.error}`);
      return;
    }
    await sendImageMessage(client, to, result.imageKey, replyToMessageId);
  } else if (mediaType === 'audio' || isAudioPath(absPath)) {
    const result = await uploadFileToFeishu(client, absPath, fileName, 'opus');
    if (!result.success || !result.fileKey) {
      console.warn(`[Feishu Send] Audio upload failed: ${result.error}`);
      return;
    }
    await sendAudioMessage(client, to, result.fileKey, undefined, replyToMessageId);
  } else {
    const fileType = detectFeishuFileType(fileName);
    const result = await uploadFileToFeishu(client, absPath, fileName, fileType);
    if (!result.success || !result.fileKey) {
      console.warn(`[Feishu Send] File upload failed: ${result.error}`);
      return;
    }
    await sendFileMessage(client, to, result.fileKey, replyToMessageId);
  }
}

/**
 * Send message with media support — detects media markers in text and uploads them
 */
export async function sendWithMedia(
  client: any,
  to: string,
  text: string,
  markers: MediaMarker[],
  renderMode: 'text' | 'card' = 'card',
  replyToMessageId?: string
): Promise<void> {
  if (markers.length === 0) {
    await sendMessage(client, to, text, renderMode, replyToMessageId);
    return;
  }

  // Upload and send each media file
  for (const marker of markers) {
    try {
      await uploadAndSendMedia(client, to, marker.path, marker.type, replyToMessageId, marker.name);
    } catch (error: any) {
      console.error(`[Feishu Send] Failed to send media: ${error.message}`);
    }
  }

  // Send the text message (keep full text for context)
  await sendMessage(client, to, text, renderMode, replyToMessageId);
}
