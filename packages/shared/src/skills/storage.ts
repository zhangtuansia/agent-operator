/**
 * Skills Storage
 *
 * CRUD operations for workspace skills.
 * Skills are stored in {workspace}/skills/{slug}/ directories.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import matter from 'gray-matter';
import type { LoadedSkill, SkillMetadata, SkillSource } from './types.ts';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';
import {
  validateIconValue,
  findIconFile,
  downloadIcon,
  needsIconDownload,
  isIconUrl,
} from '../utils/icon.ts';

// ============================================================
// Agent Skills Paths (Issue #171)
// ============================================================

/** Global agent skills directory: ~/.agents/skills/ */
const GLOBAL_AGENT_SKILLS_DIR = join(homedir(), '.agents', 'skills');

/** Project-level agent skills directory name */
const PROJECT_AGENT_SKILLS_DIR = '.agents/skills';

// ============================================================
// Parsing
// ============================================================

/**
 * Parse SKILL.md content and extract frontmatter + body
 */
function parseSkillFile(content: string): { metadata: SkillMetadata; body: string } | null {
  try {
    const parsed = matter(content);

    // Validate required fields
    if (!parsed.data.name || !parsed.data.description) {
      return null;
    }

    // Validate and extract optional icon field
    // Only accepts emoji or URL - rejects inline SVG and relative paths
    const icon = validateIconValue(parsed.data.icon, 'Skills');

    return {
      metadata: {
        name: parsed.data.name as string,
        description: parsed.data.description as string,
        globs: parsed.data.globs as string[] | undefined,
        alwaysAllow: parsed.data.alwaysAllow as string[] | undefined,
        triggers: parsed.data.triggers as string[] | undefined,
        icon,
      },
      body: parsed.content,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Load a single skill from a directory
 * @param skillsDir - Absolute path to skills directory
 * @param slug - Skill directory name
 * @param source - Where this skill is loaded from
 */
function loadSkillFromDir(skillsDir: string, slug: string, source: SkillSource): LoadedSkill | null {
  const skillDir = join(skillsDir, slug);
  const skillFile = join(skillDir, 'SKILL.md');

  // Check directory exists
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    return null;
  }

  // Check SKILL.md exists
  if (!existsSync(skillFile)) {
    return null;
  }

  // Read and parse SKILL.md
  let content: string;
  try {
    content = readFileSync(skillFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseSkillFile(content);
  if (!parsed) {
    return null;
  }

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    iconPath: findIconFile(skillDir),
    path: skillDir,
    source,
  };
}

/**
 * Load all skills from a directory
 * @param skillsDir - Absolute path to skills directory
 * @param source - Where these skills are loaded from
 */
function loadSkillsFromDir(skillsDir: string, source: SkillSource): LoadedSkill[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: LoadedSkill[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skill = loadSkillFromDir(skillsDir, entry.name, source);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch {
    // Ignore errors reading skills directory
  }

  return skills;
}

/**
 * Load a single skill by slug, searching all sources (highest priority wins).
 * Search order: project > workspace > global > bundled
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 * @param projectRoot - Optional project root for project-level skills
 */
export function loadSkill(workspaceRoot: string, slug: string, projectRoot?: string): LoadedSkill | null {
  // Search in priority order (highest first) — return the first match

  // 1. Project skills: {projectRoot}/.agents/skills/
  if (projectRoot) {
    const projectSkillsDir = join(projectRoot, PROJECT_AGENT_SKILLS_DIR);
    const skill = loadSkillFromDir(projectSkillsDir, slug, 'project');
    if (skill) return skill;
  }

  // 2. Workspace skills
  const workspaceSkillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const wsSkill = loadSkillFromDir(workspaceSkillsDir, slug, 'workspace');
  if (wsSkill) return wsSkill;

  // 3. Global skills: ~/.agents/skills/
  const globalSkill = loadSkillFromDir(GLOBAL_AGENT_SKILLS_DIR, slug, 'global');
  if (globalSkill) return globalSkill;

  // 4. Bundled skills: $SKILLS_ROOT
  const bundledSkillsRoot = process.env.SKILLS_ROOT;
  if (bundledSkillsRoot) {
    const bundledSkill = loadSkillFromDir(bundledSkillsRoot, slug, 'global');
    if (bundledSkill) return bundledSkill;
  }

  return null;
}

/**
 * Load all skills from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 */
export function loadWorkspaceSkills(workspaceRoot: string): LoadedSkill[] {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  return loadSkillsFromDir(skillsDir, 'workspace');
}

/**
 * Load all skills from all sources (bundled, global, workspace, project)
 * Skills with the same slug are overridden by higher-priority sources.
 * Priority: bundled (lowest) < global < workspace < project (highest)
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @param projectRoot - Optional project root (working directory) for project-level skills
 */
export function loadAllSkills(workspaceRoot: string, projectRoot?: string): LoadedSkill[] {
  const skillsBySlug = new Map<string, LoadedSkill>();

  // 0. Bundled skills (lowest priority): $SKILLS_ROOT (web-search, playwright, etc.)
  const bundledSkillsRoot = process.env.SKILLS_ROOT;
  if (bundledSkillsRoot) {
    for (const skill of loadSkillsFromDir(bundledSkillsRoot, 'global')) {
      skillsBySlug.set(skill.slug, skill);
    }
  }

  // 1. Global skills: ~/.agents/skills/
  for (const skill of loadSkillsFromDir(GLOBAL_AGENT_SKILLS_DIR, 'global')) {
    skillsBySlug.set(skill.slug, skill);
  }

  // 2. Workspace skills (medium priority)
  for (const skill of loadWorkspaceSkills(workspaceRoot)) {
    skillsBySlug.set(skill.slug, skill);
  }

  // 3. Project skills (highest priority): {projectRoot}/.agents/skills/
  if (projectRoot) {
    const projectSkillsDir = join(projectRoot, PROJECT_AGENT_SKILLS_DIR);
    for (const skill of loadSkillsFromDir(projectSkillsDir, 'project')) {
      skillsBySlug.set(skill.slug, skill);
    }
  }

  return Array.from(skillsBySlug.values());
}

/**
 * Get icon path for a skill
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function getSkillIconPath(workspaceRoot: string, slug: string): string | null {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);

  if (!existsSync(skillDir)) {
    return null;
  }

  return findIconFile(skillDir) || null;
}

// ============================================================
// Delete Operations
// ============================================================

/**
 * Delete a skill from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function deleteSkill(workspaceRoot: string, slug: string): boolean {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);

  if (!existsSync(skillDir)) {
    return false;
  }

  try {
    rmSync(skillDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if a skill exists in a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function skillExists(workspaceRoot: string, slug: string): boolean {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
  const skillDir = join(skillsDir, slug);
  const skillFile = join(skillDir, 'SKILL.md');

  return existsSync(skillDir) && existsSync(skillFile);
}

/**
 * List skill slugs in a workspace
 * @param workspaceRoot - Absolute path to workspace root
 */
export function listSkillSlugs(workspaceRoot: string): string[] {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);

  if (!existsSync(skillsDir)) {
    return [];
  }

  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        const skillFile = join(skillsDir, entry.name, 'SKILL.md');
        return existsSync(skillFile);
      })
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

// ============================================================
// Icon Download (uses shared utilities)
// ============================================================

/**
 * Download an icon from a URL and save it to the skill directory.
 * Returns the path to the downloaded icon, or null on failure.
 */
export async function downloadSkillIcon(
  skillDir: string,
  iconUrl: string
): Promise<string | null> {
  return downloadIcon(skillDir, iconUrl, 'Skills');
}

/**
 * Check if a skill needs its icon downloaded.
 * Returns true if metadata has a URL icon and no local icon file exists.
 */
export function skillNeedsIconDownload(skill: LoadedSkill): boolean {
  return needsIconDownload(skill.metadata.icon, skill.iconPath);
}

// ============================================================
// Import Operations
// ============================================================

/**
 * Import a skill from a URL (fetches SKILL.md content from the URL).
 * Saves to workspace skills directory.
 */
export async function importSkillFromUrl(
  workspaceRoot: string,
  url: string,
  customSlug?: string
): Promise<import('./types.ts').ImportSkillResult> {
  try {
    // Basic SSRF protection: only allow http(s) URLs
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: `Unsupported protocol: ${parsed.protocol}` };
    }
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch URL: ${response.status} ${response.statusText}` };
    }
    const content = await response.text();
    return importSkillFromContent(workspaceRoot, content, customSlug);
  } catch (error) {
    return { success: false, error: `Failed to fetch skill from URL: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Import a skill from raw SKILL.md content.
 * Parses the content, generates a slug, and saves to workspace skills directory.
 */
export async function importSkillFromContent(
  workspaceRoot: string,
  content: string,
  customSlug?: string
): Promise<import('./types.ts').ImportSkillResult> {
  try {
    const parsed = parseSkillFile(content);
    if (!parsed) {
      return { success: false, error: 'Invalid SKILL.md content: missing required name or description in frontmatter' };
    }

    // Generate slug from custom slug or skill name
    // Sanitize customSlug to prevent path traversal (e.g., "../../.ssh/keys")
    const rawSlug = customSlug
      ? customSlug.replace(/[^a-z0-9\-]/gi, '-').replace(/^-|-$/g, '').toLowerCase()
      : parsed.metadata.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const slug = rawSlug;

    if (!slug) {
      return { success: false, error: 'Could not generate a valid slug from skill name' };
    }

    const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
    const skillDir = join(skillsDir, slug);

    // Create skill directory
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md
    writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8');

    // Download icon if it's a URL
    if (parsed.metadata.icon && isIconUrl(parsed.metadata.icon)) {
      await downloadSkillIcon(skillDir, parsed.metadata.icon);
    }

    // Load and return the saved skill
    const skill = loadSkillFromDir(skillsDir, slug, 'workspace');
    if (!skill) {
      return { success: false, error: 'Skill was saved but failed to load back' };
    }

    return { success: true, skill };
  } catch (error) {
    return { success: false, error: `Failed to import skill: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Re-export icon utilities for convenience
export { isIconUrl } from '../utils/icon.ts';
