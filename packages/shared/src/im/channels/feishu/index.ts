/**
 * Feishu Channel Plugin
 *
 * Implements the ChannelPlugin interface for Feishu/Lark integration.
 * Provides WebSocket-based real-time messaging with card rendering support.
 */

import type { IMGatewayStatus } from '../../types.ts';
import type { ChannelPlugin, ChannelHandlers } from '../../channel.ts';
import { FeishuConfigSchema, DEFAULT_FEISHU_CONFIG, type FeishuConfig } from './config.ts';
import { FeishuGateway } from './gateway.ts';

// ============================================================
// Feishu Channel Plugin
// ============================================================

class FeishuChannelPlugin implements ChannelPlugin<FeishuConfig> {
  readonly id = 'feishu' as const;

  readonly meta = {
    label: 'Feishu',
    description: '飞书/Lark 即时通讯平台集成',
  };

  readonly capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group'>,
    media: true,
    cards: true,
    streaming: false,
  };

  private gateway = new FeishuGateway();

  // ---- Configuration ----

  validateConfig(config: unknown): FeishuConfig {
    return FeishuConfigSchema.parse(config) as FeishuConfig;
  }

  getDefaultConfig(): FeishuConfig {
    return { ...DEFAULT_FEISHU_CONFIG };
  }

  // ---- Lifecycle ----

  async start(config: FeishuConfig, handlers: ChannelHandlers): Promise<void> {
    await this.gateway.start(config, handlers);
  }

  async stop(): Promise<void> {
    await this.gateway.stop();
  }

  async probe(config: FeishuConfig): Promise<{ ok: boolean; botName?: string; error?: string }> {
    return this.gateway.probe(config);
  }

  getStatus(): IMGatewayStatus {
    return this.gateway.getStatus();
  }

  // ---- Accessors ----

  /**
   * Get the underlying gateway instance (for direct access to REST client, etc.)
   */
  getGateway(): FeishuGateway {
    return this.gateway;
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const feishuChannel = new FeishuChannelPlugin();

// Re-export types and utilities
export type { FeishuConfig } from './config.ts';
export { FeishuConfigSchema, DEFAULT_FEISHU_CONFIG } from './config.ts';
export { FeishuGateway } from './gateway.ts';
export {
  parseMessageEvent,
  parseMessageContent,
  checkMessagePolicy,
  parseMediaMarkers,
  type FeishuMessageEvent,
  type FeishuMessageContext,
} from './bot.ts';
export {
  sendMessage,
  sendTextMessage,
  sendCardMessage,
  sendWithMedia,
  uploadAndSendMedia,
} from './send.ts';
export {
  uploadImageToFeishu,
  uploadFileToFeishu,
  detectFeishuFileType,
  isImagePath,
  isAudioPath,
  resolveMediaPath,
} from './media.ts';
