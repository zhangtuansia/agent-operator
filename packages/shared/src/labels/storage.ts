/**
 * Label Storage
 *
 * Filesystem-based storage for workspace label configurations.
 * Labels are stored at {workspaceRootPath}/labels/config.json
 *
 * Hierarchy: Labels form a nested JSON tree. IDs are simple slugs.
 * New workspaces are seeded with default labels (Development + Content groups).
 * Labels are visual by color only (colored circles in the UI).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { WorkspaceLabelConfig, LabelConfig } from './types.ts';
import { flattenLabels, findLabelById } from './tree.ts';
import { migrateLabelColors } from '../colors/migrate.ts';
import { debug } from '../utils/debug.ts';

const LABEL_CONFIG_DIR = 'labels';
const LABEL_CONFIG_FILE = 'labels/config.json';

/** Label name translations per locale */
const LABEL_NAMES: Record<string, Record<string, string>> = {
  zh: {
    development: '开发',
    code: '代码',
    bug: '缺陷',
    automation: '自动化',
    content: '内容',
    writing: '写作',
    research: '研究',
    design: '设计',
    priority: '优先级',
    project: '项目',
  },
};

/**
 * Get default label configuration.
 * Provides a starter set of labels organized into two complementary color families:
 * - Development (blue family): Code, Bug, Automation
 * - Content (purple family): Writing, Research, Design
 * Plus flat valued labels: Priority (number), Project (string)
 *
 * Children use hue-shifted shades of their parent color to show visual hierarchy.
 * Label names are localized based on the provided locale.
 */
export function getDefaultLabelConfig(locale?: string): WorkspaceLabelConfig {
  const names = (locale && LABEL_NAMES[locale]) || {};
  const n = (id: string, fallback: string) => names[id] || fallback;

  return {
    version: 1,
    labels: [
      {
        id: 'development',
        name: n('development', 'Development'),
        color: { light: '#3B82F6', dark: '#60A5FA' },
        children: [
          {
            id: 'code',
            name: n('code', 'Code'),
            color: { light: '#4F46E5', dark: '#818CF8' }, // indigo shift
          },
          {
            id: 'bug',
            name: n('bug', 'Bug'),
            color: { light: '#0EA5E9', dark: '#38BDF8' }, // sky shift
          },
          {
            id: 'automation',
            name: n('automation', 'Automation'),
            color: { light: '#06B6D4', dark: '#22D3EE' }, // cyan shift
          },
        ],
      },
      {
        id: 'content',
        name: n('content', 'Content'),
        color: { light: '#8B5CF6', dark: '#A78BFA' },
        children: [
          {
            id: 'writing',
            name: n('writing', 'Writing'),
            color: { light: '#7C3AED', dark: '#C4B5FD' }, // deeper violet
          },
          {
            id: 'research',
            name: n('research', 'Research'),
            color: { light: '#A855F7', dark: '#C084FC' }, // lighter purple
          },
          {
            id: 'design',
            name: n('design', 'Design'),
            color: { light: '#D946EF', dark: '#E879F9' }, // fuchsia shift
          },
        ],
      },
      {
        id: 'priority',
        name: n('priority', 'Priority'),
        color: { light: '#F59E0B', dark: '#FBBF24' },
        valueType: 'number',
      },
      {
        id: 'project',
        name: n('project', 'Project'),
        color: 'foreground/50',
        valueType: 'string',
      },
    ],
  };
}

/**
 * Load workspace label configuration.
 * Returns empty config if no file exists or parsing fails.
 * Auto-migrates old Tailwind color format to EntityColor on first load.
 * @param locale - Optional locale for seeding default labels with localized names
 */
export function loadLabelConfig(workspaceRootPath: string, locale?: string): WorkspaceLabelConfig {
  const configPath = join(workspaceRootPath, LABEL_CONFIG_FILE);

  // If no config file exists, seed with defaults and persist to disk.
  // This ensures existing workspaces (created before default labels existed) get populated.
  if (!existsSync(configPath)) {
    const defaults = getDefaultLabelConfig(locale);
    debug('[loadLabelConfig] No config found, seeding with default labels');
    saveLabelConfig(workspaceRootPath, defaults);
    return defaults;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as WorkspaceLabelConfig;

    // Auto-migrate old Tailwind class colors (e.g., "text-accent") to new EntityColor format.
    // If migration occurs, write the updated config back to disk.
    const migrated = migrateLabelColors(config);
    if (migrated) {
      debug('[loadLabelConfig] Migrated old color format, writing back');
      saveLabelConfig(workspaceRootPath, config);
    }

    return config;
  } catch (error) {
    debug('[loadLabelConfig] Failed to parse config:', error);
    return getDefaultLabelConfig();
  }
}

/**
 * Save workspace label configuration to disk.
 * Creates the labels directory if missing.
 */
export function saveLabelConfig(
  workspaceRootPath: string,
  config: WorkspaceLabelConfig
): void {
  const labelDir = join(workspaceRootPath, LABEL_CONFIG_DIR);
  const configPath = join(workspaceRootPath, LABEL_CONFIG_FILE);

  if (!existsSync(labelDir)) {
    mkdirSync(labelDir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    debug('[saveLabelConfig] Failed to save config:', error);
    throw error;
  }
}

/**
 * Get the label tree (root-level labels with nested children).
 * Primary accessor for the UI — returns the tree structure as-is from config.
 */
export function listLabels(workspaceRootPath: string, locale?: string): LabelConfig[] {
  const config = loadLabelConfig(workspaceRootPath, locale);
  return config.labels;
}

/**
 * Get all labels as a flat list (tree flattened depth-first).
 * Useful for lookups, session label validation, and non-hierarchical display.
 */
export function listLabelsFlat(workspaceRootPath: string): LabelConfig[] {
  const config = loadLabelConfig(workspaceRootPath);
  return flattenLabels(config.labels);
}

/**
 * Get a single label by ID (searches the entire tree).
 * Returns null if not found.
 */
export function getLabel(
  workspaceRootPath: string,
  labelId: string
): LabelConfig | null {
  const config = loadLabelConfig(workspaceRootPath);
  return findLabelById(config.labels, labelId) || null;
}

/**
 * Check if a label ID exists in this workspace (searches entire tree)
 */
export function isValidLabelId(
  workspaceRootPath: string,
  labelId: string
): boolean {
  const config = loadLabelConfig(workspaceRootPath);
  return !!findLabelById(config.labels, labelId);
}

/**
 * Validate label ID format.
 * Simple slug: lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 * Examples: "bug", "frontend", "my-label"
 */
export function isValidLabelIdFormat(labelId: string): boolean {
  if (!labelId) return false;
  const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return SLUG_PATTERN.test(labelId);
}


