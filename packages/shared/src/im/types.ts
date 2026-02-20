/**
 * IM Integration Type Definitions
 *
 * Unified types for IM platform integrations (Feishu, Telegram).
 * Adapted from LobsterAI's im/types.ts with OpenClaw's plugin patterns.
 */

// ============================================================
// Platform
// ============================================================

export type IMPlatform = 'feishu' | 'telegram';

// ============================================================
// Messages
// ============================================================

export type IMMediaType = 'image' | 'audio' | 'video' | 'file';

export interface IMMediaAttachment {
  type: IMMediaType;
  localPath: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface IMMessage {
  platform: IMPlatform;
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  content: string;
  chatType: 'direct' | 'group';
  timestamp: number;
  attachments?: IMMediaAttachment[];
  replyToMessageId?: string;
}

/** Reply function provided by channel gateway */
export type IMReplyFn = (text: string, mediaFiles?: string[]) => Promise<void>;

// ============================================================
// Session Mapping
// ============================================================

export interface IMSessionMapping {
  imConversationId: string;
  platform: IMPlatform;
  sessionId: string;
  workspaceId: string;
  createdAt: number;
  lastActiveAt: number;
}

// ============================================================
// Gateway Status
// ============================================================

export interface IMGatewayStatus {
  platform: IMPlatform;
  connected: boolean;
  enabled: boolean;
  error?: string | null;
  botName?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  startedAt?: number | null;
}

// ============================================================
// Configuration
// ============================================================

export interface IMConfigMap {
  feishu?: Record<string, unknown>;
  telegram?: Record<string, unknown>;
  settings?: IMSettings;
}

export interface IMSettings {
  /** Custom system prompt prepended to IM sessions */
  systemPrompt?: string;
  /** Whether to include skills in IM agent sessions */
  skillsEnabled: boolean;
  /** Default workspace ID for IM sessions */
  workspaceId?: string;
}

export const DEFAULT_IM_SETTINGS: IMSettings = {
  systemPrompt: '',
  skillsEnabled: true,
};

// ============================================================
// Connectivity Test
// ============================================================

export type IMConnectivityVerdict = 'pass' | 'warn' | 'fail';

export interface IMConnectivityCheck {
  code: string;
  level: 'pass' | 'info' | 'warn' | 'fail';
  message: string;
  suggestion?: string;
}

export interface IMConnectivityTestResult {
  platform: IMPlatform;
  testedAt: number;
  verdict: IMConnectivityVerdict;
  checks: IMConnectivityCheck[];
}

// ============================================================
// Media Markers (for parsing media in response text)
// ============================================================

export interface MediaMarker {
  type: IMMediaType;
  path: string;
  name?: string;
  originalMarker: string;
}
