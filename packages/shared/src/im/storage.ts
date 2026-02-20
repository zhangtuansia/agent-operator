/**
 * IM Storage
 *
 * JSON file-based storage for IM configuration and session mappings.
 * Follows agent-operator patterns (no SQLite dependency).
 *
 * Storage layout:
 *   ~/.cowork/im/config.json      — per-platform config (credentials via CredentialManager)
 *   ~/.cowork/im/sessions.json    — IM conversation → Agent session mappings
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/paths.ts';
import type {
  IMPlatform,
  IMConfigMap,
  IMSettings,
  IMSessionMapping,
} from './types.ts';
import { DEFAULT_IM_SETTINGS } from './types.ts';
import type { ChannelConfig } from './channel.ts';

// ============================================================
// Paths
// ============================================================

const IM_DIR = join(CONFIG_DIR, 'im');
const CONFIG_FILE = join(IM_DIR, 'config.json');
const SESSIONS_FILE = join(IM_DIR, 'sessions.json');

function ensureImDir(): void {
  if (!existsSync(IM_DIR)) {
    mkdirSync(IM_DIR, { recursive: true });
  }
}

// ============================================================
// JSON helpers
// ============================================================

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureImDir();
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================
// Config Operations
// ============================================================

/**
 * Load full IM config map
 */
export function getIMConfig(): IMConfigMap {
  return readJson<IMConfigMap>(CONFIG_FILE, {});
}

/**
 * Save full IM config map
 */
export function saveIMConfig(config: IMConfigMap): void {
  writeJson(CONFIG_FILE, config);
}

/**
 * Get channel config for a specific platform.
 * Returns null if platform has no config.
 */
export function getChannelConfig<T extends ChannelConfig>(platform: IMPlatform): T | null {
  const config = getIMConfig();
  const raw = config[platform];
  return (raw as T | undefined) ?? null;
}

/**
 * Save channel config for a specific platform
 */
export function saveChannelConfig(platform: IMPlatform, channelConfig: ChannelConfig): void {
  const config = getIMConfig();
  (config as Record<string, unknown>)[platform] = channelConfig;
  saveIMConfig(config);
}

/**
 * Get IM settings (system prompt, skills toggle, etc.)
 */
export function getIMSettings(): IMSettings {
  const config = getIMConfig();
  return { ...DEFAULT_IM_SETTINGS, ...config.settings };
}

/**
 * Save IM settings
 */
export function saveIMSettings(settings: Partial<IMSettings>): void {
  const config = getIMConfig();
  config.settings = { ...getIMSettings(), ...settings };
  saveIMConfig(config);
}

// ============================================================
// Session Mapping Operations
// ============================================================

function loadMappings(): IMSessionMapping[] {
  return readJson<IMSessionMapping[]>(SESSIONS_FILE, []);
}

function saveMappings(mappings: IMSessionMapping[]): void {
  writeJson(SESSIONS_FILE, mappings);
}

/**
 * Get session mapping by IM conversation ID and platform
 */
export function getSessionMapping(
  conversationId: string,
  platform: IMPlatform
): IMSessionMapping | null {
  const mappings = loadMappings();
  return (
    mappings.find(
      (m) => m.imConversationId === conversationId && m.platform === platform
    ) ?? null
  );
}

/**
 * Create a new session mapping
 */
export function createSessionMapping(
  imConversationId: string,
  platform: IMPlatform,
  sessionId: string,
  workspaceId: string
): IMSessionMapping {
  const now = Date.now();
  const mapping: IMSessionMapping = {
    imConversationId,
    platform,
    sessionId,
    workspaceId,
    createdAt: now,
    lastActiveAt: now,
  };

  const mappings = loadMappings();
  // Remove any existing mapping for same conversation+platform
  const filtered = mappings.filter(
    (m) => !(m.imConversationId === imConversationId && m.platform === platform)
  );
  filtered.push(mapping);
  saveMappings(filtered);

  return mapping;
}

/**
 * Update last active time for a session mapping
 */
export function updateSessionLastActive(
  conversationId: string,
  platform: IMPlatform
): void {
  const mappings = loadMappings();
  const mapping = mappings.find(
    (m) => m.imConversationId === conversationId && m.platform === platform
  );
  if (mapping) {
    mapping.lastActiveAt = Date.now();
    saveMappings(mappings);
  }
}

/**
 * Delete a session mapping
 */
export function deleteSessionMapping(
  conversationId: string,
  platform: IMPlatform
): void {
  const mappings = loadMappings();
  const filtered = mappings.filter(
    (m) => !(m.imConversationId === conversationId && m.platform === platform)
  );
  if (filtered.length !== mappings.length) {
    saveMappings(filtered);
  }
}

/**
 * List all session mappings, optionally filtered by platform
 */
export function listSessionMappings(platform?: IMPlatform): IMSessionMapping[] {
  const mappings = loadMappings();
  if (platform) {
    return mappings.filter((m) => m.platform === platform);
  }
  return mappings;
}

/**
 * Check if IM is configured (at least one platform has credentials)
 */
export function isIMConfigured(): boolean {
  const config = getIMConfig();
  const hasFeishu = !!(config.feishu as Record<string, unknown> | undefined)?.appId;
  const hasTelegram = !!(config.telegram as Record<string, unknown> | undefined)?.botToken;
  return hasFeishu || hasTelegram;
}

/**
 * Get the IM storage directory path
 */
export function getIMStoragePath(): string {
  return IM_DIR;
}
