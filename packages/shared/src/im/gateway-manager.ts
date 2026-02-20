/**
 * IM Gateway Manager
 *
 * Unified orchestrator for all IM channel plugins.
 * Manages lifecycle (start/stop), message routing, status, and connectivity testing.
 *
 * Design:
 * - Plugin-based: channels register via ChannelPlugin interface
 * - Event-driven: emits statusChange, message, error events
 * - Delegates message processing to IMCoworkHandler (IM → Agent session adapter)
 */

import { EventEmitter } from 'events';
import type {
  IMPlatform,
  IMMessage,
  IMGatewayStatus,
  IMReplyFn,
  IMConnectivityCheck,
  IMConnectivityTestResult,
  IMConnectivityVerdict,
} from './types.ts';
import type { ChannelPlugin, ChannelConfig, ChannelHandlers } from './channel.ts';

// ============================================================
// Constants
// ============================================================

const CONNECTIVITY_TIMEOUT_MS = 10_000;
const INBOUND_ACTIVITY_WARN_AFTER_MS = 2 * 60 * 1000;

// ============================================================
// Types
// ============================================================

export interface GatewayManagerEvents {
  statusChange: (statuses: IMGatewayStatus[]) => void;
  message: (message: IMMessage) => void;
  error: (info: { platform: IMPlatform; error: Error }) => void;
}

export type MessageHandler = (message: IMMessage, replyFn: IMReplyFn) => Promise<void>;

// ============================================================
// Gateway Manager
// ============================================================

export class IMGatewayManager extends EventEmitter {
  private channels: Map<IMPlatform, ChannelPlugin> = new Map();
  private messageHandler: MessageHandler | null = null;

  constructor() {
    super();
  }

  // ---- Plugin Registration ----

  /**
   * Register a channel plugin
   */
  registerChannel(channel: ChannelPlugin): void {
    this.channels.set(channel.id, channel);
  }

  /**
   * Get a registered channel plugin
   */
  getChannel(platform: IMPlatform): ChannelPlugin | undefined {
    return this.channels.get(platform);
  }

  /**
   * Get all registered channel IDs
   */
  getRegisteredPlatforms(): IMPlatform[] {
    return Array.from(this.channels.keys());
  }

  // ---- Message Handler ----

  /**
   * Set the message handler (typically the IMCoworkHandler)
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // ---- Channel Lifecycle ----

  /**
   * Start a specific channel
   */
  async startChannel(platform: IMPlatform, config: ChannelConfig): Promise<void> {
    const channel = this.channels.get(platform);
    if (!channel) {
      throw new Error(`Channel not registered: ${platform}`);
    }

    const validatedConfig = channel.validateConfig(config);

    const handlers: ChannelHandlers = {
      onMessage: async (message: IMMessage, replyFn: IMReplyFn) => {
        this.emit('message', message);

        if (this.messageHandler) {
          try {
            await this.messageHandler(message, replyFn);
          } catch (error: any) {
            console.error(`[IMGatewayManager] Error processing ${platform} message:`, error.message);
            try {
              await replyFn(`处理消息时出错: ${error.message}`);
            } catch (replyError) {
              console.error(`[IMGatewayManager] Failed to send error reply:`, replyError);
            }
          }
        }
      },
      onError: (error: Error) => {
        this.emit('error', { platform, error });
        this.emit('statusChange', this.getAllStatus());
      },
      onStatusChange: () => {
        this.emit('statusChange', this.getAllStatus());
      },
    };

    await channel.start(validatedConfig, handlers);
    this.emit('statusChange', this.getAllStatus());
  }

  /**
   * Stop a specific channel
   */
  async stopChannel(platform: IMPlatform): Promise<void> {
    const channel = this.channels.get(platform);
    if (!channel) return;

    await channel.stop();
    this.emit('statusChange', this.getAllStatus());
  }

  /**
   * Start all channels that are enabled in their configs
   */
  async startAllEnabled(configs: Partial<Record<IMPlatform, ChannelConfig>>): Promise<void> {
    for (const [platform, config] of Object.entries(configs)) {
      if (!config?.enabled) continue;

      const channel = this.channels.get(platform as IMPlatform);
      if (!channel) continue;

      try {
        await this.startChannel(platform as IMPlatform, config);
      } catch (error: any) {
        console.error(`[IMGatewayManager] Failed to start ${platform}:`, error.message);
      }
    }
  }

  /**
   * Stop all running channels
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.channels.values()).map((channel) =>
      channel.stop().catch((err) => {
        console.error(`[IMGatewayManager] Error stopping ${channel.id}:`, err.message);
      })
    );
    await Promise.all(stopPromises);
    this.emit('statusChange', this.getAllStatus());
  }

  // ---- Status ----

  /**
   * Get status for a specific channel
   */
  getChannelStatus(platform: IMPlatform): IMGatewayStatus | null {
    const channel = this.channels.get(platform);
    if (!channel) return null;
    return channel.getStatus();
  }

  /**
   * Get status for all registered channels
   */
  getAllStatus(): IMGatewayStatus[] {
    return Array.from(this.channels.values()).map((ch) => ch.getStatus());
  }

  /**
   * Check if any channel is connected
   */
  isAnyConnected(): boolean {
    return Array.from(this.channels.values()).some((ch) => ch.getStatus().connected);
  }

  /**
   * Check if a specific channel is connected
   */
  isConnected(platform: IMPlatform): boolean {
    const channel = this.channels.get(platform);
    return channel ? channel.getStatus().connected : false;
  }

  // ---- Connectivity Testing ----

  /**
   * Test connectivity for a specific platform
   */
  async testChannel(
    platform: IMPlatform,
    config: ChannelConfig
  ): Promise<IMConnectivityTestResult> {
    const channel = this.channels.get(platform);
    const testedAt = Date.now();
    const checks: IMConnectivityCheck[] = [];

    if (!channel) {
      checks.push({
        code: 'channel_not_registered',
        level: 'fail',
        message: `渠道未注册: ${platform}`,
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // 1. Validate config
    let validatedConfig: ChannelConfig;
    try {
      validatedConfig = channel.validateConfig(config);
    } catch (error: any) {
      checks.push({
        code: 'config_invalid',
        level: 'fail',
        message: `配置校验失败: ${error.message}`,
        suggestion: '请检查配置项是否完整且格式正确。',
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // 2. Auth probe
    try {
      const probeResult = await this.withTimeout(
        channel.probe(validatedConfig),
        CONNECTIVITY_TIMEOUT_MS,
        '鉴权探测超时'
      );

      if (probeResult.ok) {
        const botInfo = probeResult.botName ? ` (Bot: ${probeResult.botName})` : '';
        checks.push({
          code: 'auth_check',
          level: 'pass',
          message: `${platform} 鉴权通过${botInfo}。`,
        });
      } else {
        checks.push({
          code: 'auth_check',
          level: 'fail',
          message: `鉴权失败: ${probeResult.error || 'unknown'}`,
          suggestion: '请检查凭据是否正确，且机器人权限已开通。',
        });
        return { platform, testedAt, verdict: 'fail', checks };
      }
    } catch (error: any) {
      checks.push({
        code: 'auth_check',
        level: 'fail',
        message: `鉴权失败: ${error.message}`,
        suggestion: '请检查凭据是否正确，且机器人权限已开通。',
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // 3. Gateway status
    const status = channel.getStatus();
    if (status.connected) {
      checks.push({
        code: 'gateway_running',
        level: 'pass',
        message: 'IM 渠道已启用且运行正常。',
      });
    } else if (status.enabled) {
      checks.push({
        code: 'gateway_running',
        level: 'warn',
        message: 'IM 渠道已启用但当前未连接。',
        suggestion: '请检查网络、机器人配置和平台侧事件开关。',
      });
    } else {
      checks.push({
        code: 'gateway_running',
        level: 'info',
        message: 'IM 渠道当前未启用。',
        suggestion: '请启用该渠道以开始接收消息。',
      });
    }

    // 4. Inbound activity
    if (status.connected && status.startedAt) {
      const uptime = testedAt - status.startedAt;
      if (uptime >= INBOUND_ACTIVITY_WARN_AFTER_MS) {
        if (!status.lastInboundAt) {
          checks.push({
            code: 'inbound_activity',
            level: 'warn',
            message: '已连接超过 2 分钟，但尚未收到任何入站消息。',
            suggestion: '请确认机器人已在目标会话中，或按平台规则 @机器人 触发消息。',
          });
        } else {
          checks.push({
            code: 'inbound_activity',
            level: 'pass',
            message: '已检测到入站消息。',
          });
        }
      } else {
        checks.push({
          code: 'inbound_activity',
          level: 'info',
          message: '网关刚启动，入站活动检查将在 2 分钟后更准确。',
        });
      }
    }

    // 5. Outbound activity
    if (status.connected && status.lastInboundAt) {
      if (!status.lastOutboundAt) {
        checks.push({
          code: 'outbound_activity',
          level: 'warn',
          message: '已收到消息，但尚未观察到成功回发。',
          suggestion: '请检查消息发送权限、机器人可见范围和会话回包权限。',
        });
      } else {
        checks.push({
          code: 'outbound_activity',
          level: 'pass',
          message: '已检测到成功回发消息。',
        });
      }
    }

    // 6. Platform-specific hints
    if (platform === 'feishu') {
      checks.push({
        code: 'feishu_group_requires_mention',
        level: 'info',
        message: '飞书群聊中仅响应 @机器人的消息。',
        suggestion: '请在群聊中使用 @机器人 + 内容触发对话。',
      });
      checks.push({
        code: 'feishu_event_subscription',
        level: 'info',
        message: '飞书需要开启消息事件订阅（im.message.receive_v1）才能收消息。',
        suggestion: '请在飞书开发者后台确认事件订阅、权限和发布状态。',
      });
    } else if (platform === 'telegram') {
      checks.push({
        code: 'telegram_privacy_mode',
        level: 'info',
        message: 'Telegram 可能受 Bot Privacy Mode 影响。',
        suggestion: '若群聊中不响应，请在 @BotFather 检查 Privacy Mode 配置。',
      });
    }

    // 7. Last error
    if (status.error) {
      checks.push({
        code: 'platform_last_error',
        level: status.connected ? 'warn' : 'fail',
        message: `最近错误: ${status.error}`,
        suggestion: status.connected
          ? '当前已连接，但建议修复该错误避免后续中断。'
          : '该错误可能阻断对话，请优先修复后重试。',
      });
    }

    return {
      platform,
      testedAt,
      verdict: this.calculateVerdict(checks),
      checks,
    };
  }

  // ---- Helpers ----

  private calculateVerdict(checks: IMConnectivityCheck[]): IMConnectivityVerdict {
    if (checks.some((c) => c.level === 'fail')) return 'fail';
    if (checks.some((c) => c.level === 'warn')) return 'warn';
    return 'pass';
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }
}
