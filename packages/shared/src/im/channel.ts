/**
 * Channel Plugin Interface
 *
 * Simplified plugin architecture inspired by OpenClaw's ChannelPlugin.
 * Each IM platform implements this interface to integrate with the gateway manager.
 */

import type { IMMessage, IMGatewayStatus, IMPlatform, IMReplyFn } from './types.ts';

// ============================================================
// Channel Config Base
// ============================================================

export interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}

// ============================================================
// Channel Handlers (provided by GatewayManager)
// ============================================================

export interface ChannelHandlers {
  /** Called when a message is received from the platform */
  onMessage: (message: IMMessage, replyFn: IMReplyFn) => Promise<void>;
  /** Called when an error occurs in the channel */
  onError: (error: Error) => void;
  /** Called when gateway status changes */
  onStatusChange: (status: IMGatewayStatus) => void;
}

// ============================================================
// Channel Plugin Interface
// ============================================================

export interface ChannelPlugin<TConfig extends ChannelConfig = ChannelConfig> {
  /** Unique platform identifier */
  id: IMPlatform;

  /** Display metadata */
  meta: {
    label: string;
    description: string;
  };

  /** Platform capabilities */
  capabilities: {
    chatTypes: Array<'direct' | 'group'>;
    media: boolean;
    cards: boolean;
    streaming: boolean;
  };

  // ---- Configuration ----

  /** Validate and parse raw config, throws on invalid */
  validateConfig(config: unknown): TConfig;

  /** Get default configuration for this channel */
  getDefaultConfig(): TConfig;

  // ---- Lifecycle ----

  /** Start the channel gateway (WebSocket, polling, etc.) */
  start(config: TConfig, handlers: ChannelHandlers): Promise<void>;

  /** Stop the channel gateway */
  stop(): Promise<void>;

  /** Probe connectivity (validate credentials without starting) */
  probe(config: TConfig): Promise<{ ok: boolean; botName?: string; error?: string }>;

  /** Get current gateway status */
  getStatus(): IMGatewayStatus;
}
