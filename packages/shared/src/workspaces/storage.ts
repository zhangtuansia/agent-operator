/**
 * Workspace Storage
 *
 * CRUD operations for workspaces.
 * Workspaces can be stored anywhere on disk via rootPath.
 * Default location: ~/.cowork/workspaces/
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/paths.ts';
import { randomUUID } from 'crypto';
import { expandPath, toPortablePath } from '../utils/paths.ts';
import { getDefaultStatusConfig, saveStatusConfig, ensureDefaultIconFiles } from '../statuses/storage.ts';
import { loadConfigDefaults } from '../config/storage.ts';
import { DEFAULT_MODEL } from '../config/models.ts';
import { normalizeThinkingLevel } from '../agent/thinking-levels.ts';
import { normalizePermissionMode as parsePermissionMode, PERMISSION_MODE_ORDER } from '../agent/mode-types.ts';
import type {
  WorkspaceConfig,
  CreateWorkspaceInput,
  LoadedWorkspace,
  WorkspaceSummary,
} from './types.ts';

const DEFAULT_WORKSPACES_DIR = join(CONFIG_DIR, 'workspaces');
const PLUGIN_NAME_PREFIX = 'dazi-workspace-';
const LEGACY_PLUGIN_NAME_PREFIX = 'craft-workspace-';

function normalizeWorkspaceRootPath(rootPath: string): string {
  return expandPath(rootPath);
}

// ============================================================
// Path Utilities
// ============================================================

/**
 * Get the default workspaces directory (~/.cowork/workspaces/)
 */
export function getDefaultWorkspacesDir(): string {
  return DEFAULT_WORKSPACES_DIR;
}

/**
 * Ensure default workspaces directory exists
 */
export function ensureDefaultWorkspacesDir(): void {
  if (!existsSync(DEFAULT_WORKSPACES_DIR)) {
    mkdirSync(DEFAULT_WORKSPACES_DIR, { recursive: true });
  }
}

/**
 * Get workspace root path from ID
 * @param workspaceId - Workspace ID
 * @returns Absolute path to workspace root in default location
 */
export function getWorkspacePath(workspaceId: string): string {
  return join(DEFAULT_WORKSPACES_DIR, workspaceId);
}

/**
 * Get path to workspace sources directory
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSourcesPath(rootPath: string): string {
  return join(normalizeWorkspaceRootPath(rootPath), 'sources');
}

/**
 * Get path to workspace sessions directory
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSessionsPath(rootPath: string): string {
  return join(normalizeWorkspaceRootPath(rootPath), 'sessions');
}

/**
 * Get path to workspace skills directory
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSkillsPath(rootPath: string): string {
  return join(normalizeWorkspaceRootPath(rootPath), 'skills');
}

// ============================================================
// Config Operations
// ============================================================

/**
 * Load workspace config.json from a workspace folder
 * @param rootPath - Absolute path to workspace root folder
 */
export function loadWorkspaceConfig(rootPath: string): WorkspaceConfig | null {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  const configPath = join(normalizedRootPath, 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as WorkspaceConfig;

    // Expand path variables in defaults for portability
    if (config.defaults?.workingDirectory) {
      config.defaults.workingDirectory = expandPath(config.defaults.workingDirectory);
    }

    // Compatibility: accept canonical or legacy permission mode names on read
    if (config.defaults?.permissionMode && typeof config.defaults.permissionMode === 'string') {
      const parsed = parsePermissionMode(config.defaults.permissionMode);
      config.defaults.permissionMode = parsed ?? undefined;
    }

    if (Array.isArray(config.defaults?.cyclablePermissionModes)) {
      const normalized = config.defaults.cyclablePermissionModes
        .map(mode => (typeof mode === 'string' ? parsePermissionMode(mode) : null))
        .filter((mode): mode is NonNullable<typeof mode> => !!mode)
        .filter((mode, index, arr) => arr.indexOf(mode) === index);

      config.defaults.cyclablePermissionModes = normalized.length >= 2
        ? normalized
        : [...PERMISSION_MODE_ORDER];
    }

    // Normalize thinking level (handles legacy 'think' -> 'medium' migration)
    if (config.defaults && 'thinkingLevel' in config.defaults) {
      config.defaults.thinkingLevel = normalizeThinkingLevel(config.defaults.thinkingLevel);
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save workspace config.json to a workspace folder
 * @param rootPath - Absolute path to workspace root folder
 */
export function saveWorkspaceConfig(rootPath: string, config: WorkspaceConfig): void {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  if (!existsSync(normalizedRootPath)) {
    mkdirSync(normalizedRootPath, { recursive: true });
  }

  // Convert paths to portable form for cross-machine compatibility
  const storageConfig: WorkspaceConfig = {
    ...config,
    updatedAt: Date.now(),
  };

  if (storageConfig.defaults?.workingDirectory) {
    storageConfig.defaults = {
      ...storageConfig.defaults,
      workingDirectory: toPortablePath(storageConfig.defaults.workingDirectory),
    };
  }

  writeFileSync(join(normalizedRootPath, 'config.json'), JSON.stringify(storageConfig, null, 2));
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Count subdirectories in a path
 */
function countSubdirs(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * List subdirectory names in a path
 */
function listSubdirNames(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Load workspace with summary info from a rootPath
 * @param rootPath - Absolute path to workspace root folder
 */
export function loadWorkspace(rootPath: string): LoadedWorkspace | null {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return null;

  // Ensure plugin manifest exists (migration for existing workspaces)
  ensurePluginManifest(rootPath, config.name);

  // Ensure skills directory exists (migration for existing workspaces)
  const skillsPath = getWorkspaceSkillsPath(rootPath);
  if (!existsSync(skillsPath)) {
    mkdirSync(skillsPath, { recursive: true });
  }

  return {
    config,
    sourceSlugs: listSubdirNames(getWorkspaceSourcesPath(rootPath)),
    sessionCount: countSubdirs(getWorkspaceSessionsPath(rootPath)),
  };
}

/**
 * Get workspace summary from a rootPath
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSummary(rootPath: string): WorkspaceSummary | null {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return null;

  return {
    slug: config.slug,
    name: config.name,
    sourceCount: countSubdirs(getWorkspaceSourcesPath(rootPath)),
    sessionCount: countSubdirs(getWorkspaceSessionsPath(rootPath)),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ============================================================
// Create/Delete Operations
// ============================================================

/**
 * Generate URL-safe slug from name
 */
export function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  if (!slug) {
    slug = 'workspace';
  }

  return slug;
}

/**
 * Generate a unique workspace folder path by appending a numeric suffix if needed.
 *
 * @param name - Display name to derive the slug from
 * @param baseDir - Parent directory where workspace folders live (e.g., ~/.cowork/workspaces/)
 * @returns Full path to a unique, non-existing folder
 */
export function generateUniqueWorkspacePath(name: string, baseDir: string): string {
  const slug = generateSlug(name);
  let candidate = join(baseDir, slug);

  if (!existsSync(candidate)) {
    return candidate;
  }

  // Append numeric suffix until we find a non-existing path
  let counter = 2;
  while (existsSync(join(baseDir, `${slug}-${counter}`))) {
    counter++;
  }

  return join(baseDir, `${slug}-${counter}`);
}

/**
 * Create workspace folder structure at a given path
 * @param rootPath - Absolute path where workspace folder will be created
 * @param name - Display name for the workspace
 * @param defaults - Optional default settings for new sessions
 * @returns The created WorkspaceConfig
 */
export function createWorkspaceAtPath(
  rootPath: string,
  name: string,
  defaults?: WorkspaceConfig['defaults']
): WorkspaceConfig {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  const now = Date.now();
  const slug = generateSlug(name);

  // Load global defaults from config-defaults.json
  const globalDefaults = loadConfigDefaults();

  // Merge global defaults with provided defaults
  const workspaceDefaults: WorkspaceConfig['defaults'] = {
    model: DEFAULT_MODEL,
    permissionMode: globalDefaults.workspaceDefaults.permissionMode,
    cyclablePermissionModes: globalDefaults.workspaceDefaults.cyclablePermissionModes,
    thinkingLevel: globalDefaults.workspaceDefaults.thinkingLevel,
    enabledSourceSlugs: [],
    workingDirectory: normalizedRootPath,
    ...defaults, // User-provided defaults override global defaults
  };

  const config: WorkspaceConfig = {
    id: `ws_${randomUUID().slice(0, 8)}`,
    name,
    slug,
    defaults: workspaceDefaults,
    localMcpServers: globalDefaults.workspaceDefaults.localMcpServers,
    createdAt: now,
    updatedAt: now,
  };

  // Create workspace directory structure
  mkdirSync(normalizedRootPath, { recursive: true });
  mkdirSync(getWorkspaceSourcesPath(normalizedRootPath), { recursive: true });
  mkdirSync(getWorkspaceSessionsPath(normalizedRootPath), { recursive: true });
  mkdirSync(getWorkspaceSkillsPath(normalizedRootPath), { recursive: true });

  // Save config
  saveWorkspaceConfig(normalizedRootPath, config);

  // Initialize status configuration with defaults
  saveStatusConfig(normalizedRootPath, getDefaultStatusConfig());
  ensureDefaultIconFiles(normalizedRootPath);

  // Initialize plugin manifest for SDK integration (enables skills, commands, agents)
  ensurePluginManifest(normalizedRootPath, name);

  return config;
}

/**
 * Delete a workspace folder and all its contents
 * @param rootPath - Absolute path to workspace root folder
 */
export function deleteWorkspaceFolder(rootPath: string): boolean {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  if (!existsSync(normalizedRootPath)) return false;

  try {
    rmSync(normalizedRootPath, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a valid workspace exists at a path
 * @param rootPath - Absolute path to check
 */
export function isValidWorkspace(rootPath: string): boolean {
  return existsSync(join(normalizeWorkspaceRootPath(rootPath), 'config.json'));
}

/**
 * Rename a workspace (updates config.json in the workspace folder)
 * @param rootPath - Absolute path to workspace root folder
 * @param newName - New display name
 */
export function renameWorkspaceFolder(rootPath: string, newName: string): boolean {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  const config = loadWorkspaceConfig(normalizedRootPath);
  if (!config) return false;

  config.name = newName.trim();
  saveWorkspaceConfig(normalizedRootPath, config);
  ensurePluginManifest(normalizedRootPath, config.name);
  return true;
}

// ============================================================
// Auto-Discovery (for default workspace location)
// ============================================================

/**
 * Discover workspace folders in the default location that have valid config.json
 * Returns paths to valid workspaces found in ~/.cowork/workspaces/
 */
export function discoverWorkspacesInDefaultLocation(): string[] {
  const discovered: string[] = [];

  if (!existsSync(DEFAULT_WORKSPACES_DIR)) {
    return discovered;
  }

  try {
    const entries = readdirSync(DEFAULT_WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const rootPath = join(DEFAULT_WORKSPACES_DIR, entry.name);
      if (isValidWorkspace(rootPath)) {
        discovered.push(rootPath);
      }
    }
  } catch {
    // Ignore errors scanning directory
  }

  return discovered;
}

// ============================================================
// Workspace Color Theme
// ============================================================

/**
 * Get the color theme setting for a workspace.
 * Returns undefined if workspace uses the app default.
 *
 * @param rootPath - Absolute path to workspace root folder
 * @returns Theme ID or undefined (inherit from app default)
 */
export function getWorkspaceColorTheme(rootPath: string): string | undefined {
  const config = loadWorkspaceConfig(normalizeWorkspaceRootPath(rootPath));
  return config?.defaults?.colorTheme;
}

/**
 * Set the color theme for a workspace.
 * Pass undefined to clear and use app default.
 *
 * @param rootPath - Absolute path to workspace root folder
 * @param themeId - Preset theme ID or undefined to inherit
 */
export function setWorkspaceColorTheme(rootPath: string, themeId: string | undefined): void {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  const config = loadWorkspaceConfig(normalizedRootPath);
  if (!config) return;

  // Only allow safe theme IDs
  if (themeId && themeId !== 'default') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(themeId)) {
      console.warn(`[workspace-storage] Invalid theme ID rejected: ${themeId}`);
      return;
    }
  }

  if (!config.defaults) {
    config.defaults = {};
  }

  if (themeId) {
    config.defaults.colorTheme = themeId;
  } else {
    delete config.defaults.colorTheme;
  }

  saveWorkspaceConfig(normalizedRootPath, config);
}

// ============================================================
// Local MCP Configuration
// ============================================================

/**
 * Check if local (stdio) MCP servers are enabled for a workspace.
 * Resolution order: ENV (COWORK_LOCAL_MCP_ENABLED) > workspace config > default (true)
 *
 * @param rootPath - Absolute path to workspace root folder
 * @returns true if local MCP servers should be enabled
 */
export function isLocalMcpEnabled(rootPath: string): boolean {
  // 1. Environment variable override (highest priority)
  const envValue = process.env.COWORK_LOCAL_MCP_ENABLED;
  if (envValue !== undefined) {
    return envValue.toLowerCase() === 'true';
  }

  // 2. Workspace config
  const config = loadWorkspaceConfig(normalizeWorkspaceRootPath(rootPath));
  if (config?.localMcpServers?.enabled !== undefined) {
    return config.localMcpServers.enabled;
  }

  // 3. Default: enabled
  return true;
}

// ============================================================
// Exports
// ============================================================

// ============================================================
// Plugin Manifest (for SDK plugin integration)
// ============================================================

/**
 * Ensure workspace has a .claude-plugin/plugin.json manifest.
 * This allows the workspace to be loaded as an SDK plugin,
 * enabling skills, commands, and agents from the workspace.
 *
 * @param rootPath - Absolute path to workspace root folder
 * @param workspaceName - Display name for the workspace (used in plugin name)
 */
export function ensurePluginManifest(rootPath: string, workspaceName: string): void {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  const pluginDir = join(normalizedRootPath, '.claude-plugin');
  const manifestPath = join(pluginDir, 'plugin.json');
  const desiredName = generatePluginManifestName(workspaceName);

  // Create .claude-plugin directory
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true });
  }

  if (existsSync(manifestPath)) {
    try {
      const current = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
      const currentName = typeof current.name === 'string' ? current.name : '';
      const shouldUpdateName = !currentName
        || currentName.startsWith(LEGACY_PLUGIN_NAME_PREFIX)
        || currentName.startsWith(PLUGIN_NAME_PREFIX);

      if (!shouldUpdateName || currentName === desiredName) {
        return;
      }

      writeFileSync(
        manifestPath,
        JSON.stringify({
          ...current,
          name: desiredName,
          version: typeof current.version === 'string' ? current.version : '1.0.0',
        }, null, 2),
      );
      return;
    } catch {
      // Fall through and rewrite a minimal valid manifest.
    }
  }

  // Create minimal plugin manifest
  writeFileSync(manifestPath, JSON.stringify({
    name: desiredName,
    version: '1.0.0',
  }, null, 2));
}

export function generatePluginManifestName(workspaceName: string): string {
  return `${PLUGIN_NAME_PREFIX}${workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}`;
}

export { CONFIG_DIR, DEFAULT_WORKSPACES_DIR };
