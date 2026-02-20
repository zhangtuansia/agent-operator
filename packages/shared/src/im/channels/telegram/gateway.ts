/**
 * Telegram Gateway
 *
 * Manages Telegram bot using grammY long polling.
 * Supports text messages, media attachments, and long message splitting.
 * Adapted from LobsterAI telegramGateway.ts.
 */

import type { IMMessage, IMGatewayStatus, IMReplyFn, IMMediaType } from '../../types.ts';
import type { ChannelHandlers } from '../../channel.ts';
import type { TelegramConfig } from './config.ts';

// ============================================================
// Constants
// ============================================================

const TELEGRAM_MAX_MESSAGE_LENGTH = 4000; // Telegram limit is 4096, leave margin

// ============================================================
// Telegram Gateway
// ============================================================

export class TelegramGateway {
  private bot: any = null;
  private runner: any = null;
  private config: TelegramConfig | null = null;
  private handlers: ChannelHandlers | null = null;
  private lastChatId: number | null = null;

  private status: IMGatewayStatus = {
    platform: 'telegram',
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

  async start(config: TelegramConfig, handlers: ChannelHandlers): Promise<void> {
    if (this.bot) {
      await this.stop();
    }

    if (!config.enabled) {
      console.log('[Telegram Gateway] Telegram is disabled in config');
      return;
    }

    if (!config.botToken) {
      throw new Error('Telegram bot token is required');
    }

    this.config = config;
    this.handlers = handlers;
    this.log = config.debug ? console.log.bind(console) : () => {};

    this.log('[Telegram Gateway] Starting...');

    try {
      // Dynamically import grammy
      const { Bot } = await import('grammy');
      const { run } = await import('@grammyjs/runner');

      this.bot = new Bot(config.botToken);

      // Register error handler
      this.bot.catch((err: any) => {
        console.error(`[Telegram Gateway] Bot error: ${err.message}`);
        this.status.error = err.message;
        handlers.onError(err instanceof Error ? err : new Error(err.message));
      });

      // Register message handler
      this.bot.on('message', async (ctx: any) => {
        await this.handleMessage(ctx);
      });

      // Get bot info
      const botInfo = await this.bot.api.getMe();
      this.log(`[Telegram Gateway] Bot info: @${botInfo.username}`);

      // Start polling
      this.runner = run(this.bot, {
        runner: {
          fetch: { timeout: 30 },
          silent: true,
          retryInterval: 'exponential',
        },
      });

      this.status = {
        platform: 'telegram',
        connected: true,
        enabled: true,
        error: null,
        botName: botInfo.username ? `@${botInfo.username}` : null,
        lastInboundAt: null,
        lastOutboundAt: null,
        startedAt: Date.now(),
      };

      this.log(`[Telegram Gateway] Connected as @${botInfo.username}`);
      handlers.onStatusChange(this.status);
    } catch (error: any) {
      this.bot = null;
      this.runner = null;
      this.status = {
        platform: 'telegram',
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

  async stop(): Promise<void> {
    if (!this.bot && !this.runner) return;

    this.log('[Telegram Gateway] Stopping...');

    if (this.runner) {
      try {
        await this.runner.stop();
      } catch {
        // Ignore stop errors
      }
      this.runner = null;
    }

    this.bot = null;
    this.config = null;

    this.status = {
      platform: 'telegram',
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
    this.log('[Telegram Gateway] Stopped');
  }

  /**
   * Probe connectivity (validate bot token)
   */
  async probe(config: TelegramConfig): Promise<{ ok: boolean; botName?: string; error?: string }> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/getMe`
      );
      const data = (await response.json()) as any;

      if (!data?.ok) {
        return { ok: false, error: data?.description || 'Unknown error' };
      }

      const username = data?.result?.username ? `@${data.result.username}` : 'unknown';
      return { ok: true, botName: username };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  getStatus(): IMGatewayStatus {
    return { ...this.status };
  }

  // ---- Message Handling ----

  private async handleMessage(ctx: any): Promise<void> {
    try {
      const message = ctx.message;
      if (!message) return;
      if (message.from?.is_bot) return;

      const chatType = message.chat.type;
      const isGroup = chatType === 'group' || chatType === 'supergroup';

      // Build sender info
      const senderName = message.from
        ? [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim() || message.from.username
        : 'Unknown';
      const senderId = message.from?.id?.toString() || 'unknown';

      // Extract text content
      const textContent = message.text || message.caption || '';

      // Skip empty messages
      if (!textContent) return;

      // Policy check
      if (this.config) {
        const rejection = this.checkPolicy(
          isGroup ? 'group' : 'direct',
          senderId,
          message.chat.id.toString()
        );
        if (rejection) {
          this.log(`[Telegram Gateway] Message rejected: ${rejection}`);
          return;
        }

        // Group mention check
        if (isGroup && this.config.requireMention) {
          const botUsername = this.status.botName?.replace('@', '');
          if (botUsername && !textContent.includes(`@${botUsername}`)) {
            return;
          }
        }
      }

      this.log(`[Telegram] 收到消息:`, JSON.stringify({
        sender: senderName,
        chatId: message.chat.id,
        chatType: isGroup ? 'group' : 'direct',
        content: textContent,
      }));

      const imMessage: IMMessage = {
        platform: 'telegram',
        messageId: message.message_id.toString(),
        conversationId: message.chat.id.toString(),
        senderId,
        senderName,
        content: textContent,
        chatType: isGroup ? 'group' : 'direct',
        timestamp: message.date * 1000,
      };

      this.status.lastInboundAt = Date.now();
      this.lastChatId = message.chat.id;

      // Create reply function
      const replyFn: IMReplyFn = async (text: string) => {
        await this.sendReply(ctx, text);
        this.status.lastOutboundAt = Date.now();
      };

      if (this.handlers) {
        await this.handlers.onMessage(imMessage, replyFn);
      }
    } catch (error: any) {
      console.error(`[Telegram Gateway] Error handling message: ${error.message}`);
      this.handlers?.onError(error instanceof Error ? error : new Error(error.message));
    }
  }

  // ---- Reply ----

  private async sendReply(ctx: any, text: string): Promise<void> {
    try {
      if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
        try {
          await ctx.reply(text, { parse_mode: 'Markdown' });
        } catch {
          // Fallback to plain text
          await ctx.reply(text);
        }
      } else {
        // Split long messages
        const chunks = this.splitMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH);
        for (const chunk of chunks) {
          try {
            await ctx.reply(chunk, { parse_mode: 'Markdown' });
          } catch {
            await ctx.reply(chunk);
          }
        }
      }
    } catch (error: any) {
      console.error(`[Telegram Gateway] Failed to send reply: ${error.message}`);
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trim();
    }

    return chunks;
  }

  // ---- Policy ----

  private checkPolicy(
    chatType: 'direct' | 'group',
    senderId: string,
    chatId: string
  ): string | null {
    if (!this.config) return null;

    if (chatType === 'group') {
      if (this.config.groupPolicy === 'disabled') return 'Group messages disabled';
      if (this.config.groupPolicy === 'allowlist' && this.config.groupAllowFrom) {
        const allowed = this.config.groupAllowFrom.some(
          (id) => id === chatId || id === senderId
        );
        if (!allowed) return 'Not in group allowlist';
      }
    } else {
      if (this.config.dmPolicy === 'allowlist' && this.config.allowFrom) {
        const allowed = this.config.allowFrom.some((id) => id === senderId);
        if (!allowed) return 'Not in DM allowlist';
      }
    }

    return null;
  }
}
