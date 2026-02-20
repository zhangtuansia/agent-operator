/**
 * Feishu Channel Config
 *
 * Zod schema for Feishu configuration.
 * Simplified from OpenClaw's multi-account config — single-account for now.
 */

import { z } from 'zod';
import type { ChannelConfig } from '../../channel.ts';

// ============================================================
// Schema
// ============================================================

export const FeishuConfigSchema = z.object({
  enabled: z.boolean().default(false),

  // Credentials
  appId: z.string().min(1, 'appId is required'),
  appSecret: z.string().min(1, 'appSecret is required'),

  // Domain: feishu (飞书), lark (international), or custom HTTPS URL
  domain: z.enum(['feishu', 'lark']).default('feishu'),

  // Connection mode
  connectionMode: z.enum(['websocket', 'webhook']).default('websocket'),

  // Webhook settings (only for webhook mode)
  webhookPort: z.number().int().positive().optional(),
  webhookPath: z.string().optional().default('/feishu/events'),
  encryptKey: z.string().optional(),
  verificationToken: z.string().optional(),

  // Rendering
  renderMode: z.enum(['text', 'card']).default('card'),

  // DM policy
  dmPolicy: z.enum(['open', 'allowlist']).default('open'),
  allowFrom: z.array(z.string()).optional(),

  // Group policy
  groupPolicy: z.enum(['open', 'allowlist', 'disabled']).default('open'),
  groupAllowFrom: z.array(z.string()).optional(),
  requireMention: z.boolean().default(true),

  // Debug logging
  debug: z.boolean().default(false),
});

export type FeishuConfig = z.infer<typeof FeishuConfigSchema> & ChannelConfig;

// ============================================================
// Defaults
// ============================================================

export const DEFAULT_FEISHU_CONFIG: FeishuConfig = {
  enabled: false,
  appId: '',
  appSecret: '',
  domain: 'feishu',
  connectionMode: 'websocket',
  webhookPath: '/feishu/events',
  renderMode: 'card',
  dmPolicy: 'open',
  groupPolicy: 'open',
  requireMention: true,
  debug: false,
};
