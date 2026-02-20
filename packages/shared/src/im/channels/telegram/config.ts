/**
 * Telegram Channel Config
 *
 * Zod schema for Telegram bot configuration.
 */

import { z } from 'zod';
import type { ChannelConfig } from '../../channel.ts';

// ============================================================
// Schema
// ============================================================

export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),

  // Bot token from @BotFather
  botToken: z.string().min(1, 'botToken is required'),

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

export type TelegramConfig = z.infer<typeof TelegramConfigSchema> & ChannelConfig;

// ============================================================
// Defaults
// ============================================================

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  dmPolicy: 'open',
  groupPolicy: 'open',
  requireMention: true,
  debug: false,
};
