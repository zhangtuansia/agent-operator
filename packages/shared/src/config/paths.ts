/**
 * Centralized path configuration for Cowork.
 *
 * Supports multi-instance development via COWORK_CONFIG_DIR environment variable.
 * When running from a numbered folder, multiple instances can run simultaneously
 * with separate configurations.
 *
 * Default: ~/.cowork/
 * Instance 1 (-1 suffix): ~/.cowork-1/
 * Instance 2 (-2 suffix): ~/.cowork-2/
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, renameSync } from 'fs';

const DEFAULT_CONFIG_DIR = join(homedir(), '.cowork');
const LEGACY_CONFIG_DIR = join(homedir(), '.agent-operator');

// Allow override via environment variable for multi-instance dev
// Falls back to default ~/.cowork/ for production
const envConfigDir =
  process.env.COWORK_CONFIG_DIR ||
  process.env.OPERATOR_CONFIG_DIR ||
  process.env.AGENT_OPERATOR_CONFIG_DIR;

let resolvedConfigDir = envConfigDir || DEFAULT_CONFIG_DIR;

// Best-effort migration from legacy config dir to new Cowork dir
if (!envConfigDir && !existsSync(DEFAULT_CONFIG_DIR) && existsSync(LEGACY_CONFIG_DIR)) {
  try {
    renameSync(LEGACY_CONFIG_DIR, DEFAULT_CONFIG_DIR);
    resolvedConfigDir = DEFAULT_CONFIG_DIR;
  } catch {
    // If migration fails, fall back to legacy dir for backward compatibility
    resolvedConfigDir = LEGACY_CONFIG_DIR;
  }
}

export const CONFIG_DIR = resolvedConfigDir;
export { LEGACY_CONFIG_DIR };
