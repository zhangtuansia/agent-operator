/**
 * IM Integration Module
 *
 * Plugin-based IM platform integration for Feishu and Telegram.
 * Re-exports all public types, interfaces, and implementations.
 */

// Types
export type {
  IMPlatform,
  IMMediaType,
  IMMediaAttachment,
  IMMessage,
  IMReplyFn,
  IMSessionMapping,
  IMGatewayStatus,
  IMConfigMap,
  IMSettings,
  IMConnectivityVerdict,
  IMConnectivityCheck,
  IMConnectivityTestResult,
  MediaMarker,
} from './types.ts';
export { DEFAULT_IM_SETTINGS } from './types.ts';

// Channel Plugin Interface
export type { ChannelConfig, ChannelHandlers, ChannelPlugin } from './channel.ts';

// Storage
export {
  getIMConfig,
  saveIMConfig,
  getChannelConfig,
  saveChannelConfig,
  getIMSettings,
  saveIMSettings,
  getSessionMapping,
  createSessionMapping,
  updateSessionLastActive,
  deleteSessionMapping,
  listSessionMappings,
  isIMConfigured,
  getIMStoragePath,
} from './storage.ts';

// Gateway Manager
export { IMGatewayManager } from './gateway-manager.ts';
export type { MessageHandler, GatewayManagerEvents } from './gateway-manager.ts';

// Cowork Handler
export { IMCoworkHandler } from './cowork-handler.ts';
export type { IMSessionManager, PermissionResponse } from './cowork-handler.ts';

// Channel Implementations — Feishu
export { feishuChannel } from './channels/feishu/index.ts';
export type { FeishuConfig } from './channels/feishu/index.ts';
export { FeishuConfigSchema, DEFAULT_FEISHU_CONFIG } from './channels/feishu/index.ts';

// Channel Implementations — Telegram
export { telegramChannel } from './channels/telegram/index.ts';
export type { TelegramConfig } from './channels/telegram/index.ts';
export { TelegramConfigSchema, DEFAULT_TELEGRAM_CONFIG } from './channels/telegram/index.ts';
