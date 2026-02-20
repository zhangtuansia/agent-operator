/**
 * Feishu Gateway
 *
 * Manages WebSocket connection to Feishu for receiving and sending messages.
 * Supports WebSocket mode (primary) via @larksuiteoapi/node-sdk.
 * Adapted from LobsterAI feishuGateway.ts + OpenClaw monitor.ts.
 */

import type { IMMessage, IMGatewayStatus, IMReplyFn } from '../../types.ts';
import type { ChannelHandlers } from '../../channel.ts';
import type { FeishuConfig } from './config.ts';
import {
  parseMessageEvent,
  contextToIMMessage,
  checkMessagePolicy,
  parseMediaMarkers,
  type FeishuMessageEvent,
} from './bot.ts';
import { sendWithMedia } from './send.ts';

// ============================================================
// Message Deduplication
// ============================================================

const processedMessages = new Map<string, number>();
const MESSAGE_DEDUP_TTL = 5 * 60 * 1000; // 5 minutes

function isMessageProcessed(messageId: string): boolean {
  // Cleanup expired entries
  const now = Date.now();
  for (const [id, ts] of processedMessages) {
    if (now - ts > MESSAGE_DEDUP_TTL) {
      processedMessages.delete(id);
    }
  }

  if (processedMessages.has(messageId)) {
    return true;
  }
  processedMessages.set(messageId, now);
  return false;
}

// ============================================================
// Feishu Gateway
// ============================================================

export class FeishuGateway {
  private wsClient: any = null;
  private restClient: any = null;
  private config: FeishuConfig | null = null;
  private handlers: ChannelHandlers | null = null;
  private botOpenId: string | null = null;
  private lastChatId: string | null = null;

  private status: IMGatewayStatus = {
    platform: 'feishu',
    connected: false,
    enabled: false,
    error: null,
    botName: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    startedAt: null,
  };

  private log: (...args: any[]) => void = () => {};

  // ---- Lifecycle ----

  /**
   * Start the Feishu gateway
   */
  async start(config: FeishuConfig, handlers: ChannelHandlers): Promise<void> {
    if (this.wsClient) {
      throw new Error('Feishu gateway already running');
    }

    if (!config.enabled) {
      console.log('[Feishu Gateway] Feishu is disabled in config');
      return;
    }

    if (!config.appId || !config.appSecret) {
      throw new Error('Feishu appId and appSecret are required');
    }

    this.config = config;
    this.handlers = handlers;
    this.log = config.debug ? console.log.bind(console) : () => {};

    this.log('[Feishu Gateway] Starting WebSocket gateway...');

    try {
      // Dynamically import @larksuiteoapi/node-sdk
      const Lark = await import('@larksuiteoapi/node-sdk');

      const domain = this.resolveDomain(config.domain, Lark);

      // Create REST client for sending messages
      this.restClient = new Lark.Client({
        appId: config.appId,
        appSecret: config.appSecret,
        appType: Lark.AppType.SelfBuild,
        domain,
      });

      // Probe bot info to get open_id
      const probeResult = await this.probeBot();
      if (!probeResult.ok) {
        throw new Error(`Failed to probe bot: ${probeResult.error}`);
      }

      this.botOpenId = probeResult.botOpenId || null;
      this.log(`[Feishu Gateway] Bot info: ${probeResult.botName} (${this.botOpenId})`);

      // Create WebSocket client
      this.wsClient = new Lark.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        domain,
        loggerLevel: config.debug ? Lark.LoggerLevel.debug : Lark.LoggerLevel.info,
      });

      // Create event dispatcher
      const eventDispatcher = new Lark.EventDispatcher({
        encryptKey: config.encryptKey,
        verificationToken: config.verificationToken,
      });

      // Register event handlers
      eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          try {
            const event = data as FeishuMessageEvent;
            if (isMessageProcessed(event.message.message_id)) {
              this.log(`[Feishu Gateway] Duplicate message ignored: ${event.message.message_id}`);
              return;
            }
            await this.handleInboundMessage(event);
          } catch (err: any) {
            console.error(`[Feishu Gateway] Error handling message: ${err.message}`);
            this.handlers?.onError(err instanceof Error ? err : new Error(err.message));
          }
        },
        'im.message.message_read_v1': async () => {
          // Ignore read receipts
        },
        'im.chat.member.bot.added_v1': async (data: any) => {
          this.log(`[Feishu Gateway] Bot added to chat ${data.chat_id}`);
        },
        'im.chat.member.bot.deleted_v1': async (data: any) => {
          this.log(`[Feishu Gateway] Bot removed from chat ${data.chat_id}`);
        },
      });

      // Start WebSocket client
      this.wsClient.start({ eventDispatcher });

      this.status = {
        platform: 'feishu',
        connected: true,
        enabled: true,
        error: null,
        botName: probeResult.botName || null,
        lastInboundAt: null,
        lastOutboundAt: null,
        startedAt: Date.now(),
      };

      this.log('[Feishu Gateway] WebSocket gateway started successfully');
      handlers.onStatusChange(this.status);
    } catch (error: any) {
      this.wsClient = null;
      this.restClient = null;
      this.status = {
        platform: 'feishu',
        connected: false,
        enabled: config.enabled,
        error: error.message,
        botName: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        startedAt: null,
      };
      handlers.onError(error);
      throw error;
    }
  }

  /**
   * Stop the Feishu gateway
   */
  async stop(): Promise<void> {
    if (!this.wsClient) return;

    this.log('[Feishu Gateway] Stopping WebSocket gateway...');

    this.wsClient = null;
    this.restClient = null;
    this.config = null;

    this.status = {
      platform: 'feishu',
      connected: false,
      enabled: false,
      error: null,
      botName: this.status.botName,
      lastInboundAt: null,
      lastOutboundAt: null,
      startedAt: null,
    };

    this.handlers?.onStatusChange(this.status);
    this.handlers = null;

    this.log('[Feishu Gateway] Gateway stopped');
  }

  /**
   * Probe bot info (validate credentials without starting full gateway)
   */
  async probe(config: FeishuConfig): Promise<{ ok: boolean; botName?: string; error?: string }> {
    const Lark = await import('@larksuiteoapi/node-sdk');
    const domain = this.resolveDomain(config.domain, Lark);

    const client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      appType: Lark.AppType.SelfBuild,
      domain,
    });

    try {
      const response: any = await client.request({
        method: 'GET',
        url: '/open-apis/bot/v3/info',
      });

      if (response.code !== 0) {
        return { ok: false, error: response.msg || `code ${response.code}` };
      }

      const botName = response.data?.app_name ?? response.data?.bot?.app_name ?? 'unknown';
      return { ok: true, botName };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get current status
   */
  getStatus(): IMGatewayStatus {
    return { ...this.status };
  }

  /**
   * Get the REST client (for external use like media uploads)
   */
  getRestClient(): any {
    return this.restClient;
  }

  // ---- Internal ----

  private resolveDomain(domain: string, Lark: any): any {
    if (domain === 'lark') return Lark.Domain.Lark;
    if (domain === 'feishu') return Lark.Domain.Feishu;
    return domain.replace(/\/+$/, '');
  }

  private async probeBot(): Promise<{
    ok: boolean;
    error?: string;
    botName?: string;
    botOpenId?: string;
  }> {
    try {
      const response: any = await this.restClient.request({
        method: 'GET',
        url: '/open-apis/bot/v3/info',
      });

      if (response.code !== 0) {
        return { ok: false, error: response.msg };
      }

      return {
        ok: true,
        botName: response.data?.app_name ?? response.data?.bot?.app_name,
        botOpenId: response.data?.open_id ?? response.data?.bot?.open_id,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  private async handleInboundMessage(event: FeishuMessageEvent): Promise<void> {
    const ctx = parseMessageEvent(event, this.botOpenId);

    // Policy check
    if (this.config) {
      const rejection = checkMessagePolicy(ctx, this.config);
      if (rejection) {
        this.log(`[Feishu Gateway] Message rejected: ${rejection}`);
        return;
      }
    }

    const message = contextToIMMessage(ctx);
    this.status.lastInboundAt = Date.now();

    this.log(`[Feishu] 收到消息:`, JSON.stringify({
      sender: ctx.senderOpenId,
      chatId: ctx.chatId,
      chatType: ctx.chatType,
      messageId: ctx.messageId,
      content: ctx.content,
      mentionedBot: ctx.mentionedBot,
    }));

    // Create reply function with media support
    const replyFn: IMReplyFn = async (text: string, mediaFiles?: string[]) => {
      if (!this.restClient || !this.config) return;

      this.log(`[Feishu] 发送回复:`, JSON.stringify({
        chatId: ctx.chatId,
        replyToMessageId: ctx.messageId,
        replyLength: text.length,
      }));

      const markers = parseMediaMarkers(text);
      await sendWithMedia(
        this.restClient,
        ctx.chatId,
        text,
        markers,
        this.config.renderMode,
        ctx.messageId
      );
      this.status.lastOutboundAt = Date.now();
    };

    this.lastChatId = ctx.chatId;

    // Invoke handler
    if (this.handlers) {
      await this.handlers.onMessage(message, replyFn);
    }
  }
}
