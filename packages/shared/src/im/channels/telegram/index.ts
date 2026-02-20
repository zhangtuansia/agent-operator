/**
 * Telegram Channel Plugin
 *
 * Implements the ChannelPlugin interface for Telegram bot integration.
 * Uses grammY for long polling with Markdown message support.
 */

import type { IMGatewayStatus } from '../../types.ts';
import type { ChannelPlugin, ChannelHandlers } from '../../channel.ts';
import { TelegramConfigSchema, DEFAULT_TELEGRAM_CONFIG, type TelegramConfig } from './config.ts';
import { TelegramGateway } from './gateway.ts';

// ============================================================
// Telegram Channel Plugin
// ============================================================

class TelegramChannelPlugin implements ChannelPlugin<TelegramConfig> {
  readonly id = 'telegram' as const;

  readonly meta = {
    label: 'Telegram',
    description: 'Telegram Bot 即时通讯平台集成',
  };

  readonly capabilities = {
    chatTypes: ['direct', 'group'] as Array<'direct' | 'group'>,
    media: true,
    cards: false,
    streaming: false,
  };

  private gateway = new TelegramGateway();

  // ---- Configuration ----

  validateConfig(config: unknown): TelegramConfig {
    return TelegramConfigSchema.parse(config) as TelegramConfig;
  }

  getDefaultConfig(): TelegramConfig {
    return { ...DEFAULT_TELEGRAM_CONFIG };
  }

  // ---- Lifecycle ----

  async start(config: TelegramConfig, handlers: ChannelHandlers): Promise<void> {
    await this.gateway.start(config, handlers);
  }

  async stop(): Promise<void> {
    await this.gateway.stop();
  }

  async probe(config: TelegramConfig): Promise<{ ok: boolean; botName?: string; error?: string }> {
    return this.gateway.probe(config);
  }

  getStatus(): IMGatewayStatus {
    return this.gateway.getStatus();
  }

  // ---- Accessors ----

  getGateway(): TelegramGateway {
    return this.gateway;
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const telegramChannel = new TelegramChannelPlugin();

// Re-export types
export type { TelegramConfig } from './config.ts';
export { TelegramConfigSchema, DEFAULT_TELEGRAM_CONFIG } from './config.ts';
export { TelegramGateway } from './gateway.ts';
