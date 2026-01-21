/**
 * Centralized path configuration for Agent Operator.
 *
 * Supports multi-instance development via AGENT_OPERATOR_CONFIG_DIR environment variable.
 * When running from a numbered folder, multiple instances can run simultaneously
 * with separate configurations.
 *
 * Default: ~/.agent-operator/
 * Instance 1 (-1 suffix): ~/.agent-operator-1/
 * Instance 2 (-2 suffix): ~/.agent-operator-2/
 */

import { homedir } from 'os';
import { join } from 'path';

// Allow override via environment variable for multi-instance dev
// Falls back to default ~/.agent-operator/ for production
export const CONFIG_DIR = process.env.AGENT_OPERATOR_CONFIG_DIR || process.env.CRAFT_CONFIG_DIR || join(homedir(), '.agent-operator');
