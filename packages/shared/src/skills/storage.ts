/**
 * Skills Storage
 *
 * CRUD operations for workspace skills.
 * Skills are stored in {workspace}/skills/{slug}/ directories.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import type { LoadedSkill, SkillMetadata } from './types.ts';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';
import {
  validateIconValue,
  findIconFile,
  downloadIcon,
  needsIconDownload,
  isIconUrl,
} from '../utils/icon.ts';

// ============================================================
// Parsing
// ============================================================

/**
 * Parse SKILL.md content and extract frontmatter + body
 */
export function parseSkillFile(content: string): { metadata: SkillMetadata; body: string } | null {
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
 * Load a single skill from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 * @param slug - Skill directory name
 */
export function loadSkill(workspaceRoot: string, slug: string): LoadedSkill | null {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
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
  };
}

/**
 * Load all skills from a workspace
 * @param workspaceRoot - Absolute path to workspace root
 */
export function loadWorkspaceSkills(workspaceRoot: string): LoadedSkill[] {
  const skillsDir = getWorkspaceSkillsPath(workspaceRoot);

  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: LoadedSkill[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skill = loadSkill(workspaceRoot, entry.name);
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

// Re-export icon utilities for convenience
export { isIconUrl } from '../utils/icon.ts';

// ============================================================
// Import Operations
// ============================================================

export interface ImportSkillResult {
  success: boolean;
  skill?: LoadedSkill;
  error?: string;
}

/**
 * Generate a slug from a skill name
 * @param name - Skill name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Find a unique slug for a skill
 * @param workspaceRoot - Absolute path to workspace root
 * @param baseName - Base name to generate slug from
 */
function findUniqueSlug(workspaceRoot: string, baseName: string): string {
  const baseSlug = generateSlug(baseName);
  let slug = baseSlug;
  let counter = 1;

  while (skillExists(workspaceRoot, slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * Convert GitHub page URL to raw content URL
 * e.g., https://github.com/owner/repo/blob/main/path/SKILL.md
 *    -> https://raw.githubusercontent.com/owner/repo/main/path/SKILL.md
 */
function convertToRawUrl(url: string): string {
  // Match GitHub blob URLs: github.com/{owner}/{repo}/blob/{branch}/{path}
  const githubBlobPattern = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;
  const match = url.match(githubBlobPattern);

  if (match) {
    const [, owner, repo, rest] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`;
  }

  return url;
}

/**
 * Import a skill from a URL (GitHub raw file or any URL to a SKILL.md file)
 * @param workspaceRoot - Absolute path to workspace root
 * @param url - URL to the SKILL.md file
 * @param customSlug - Optional custom slug (will auto-generate if not provided)
 */
export async function importSkillFromUrl(
  workspaceRoot: string,
  url: string,
  customSlug?: string
): Promise<ImportSkillResult> {
  try {
    // Auto-convert GitHub page URLs to raw URLs
    const rawUrl = convertToRawUrl(url);

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, error: 'URL must use HTTP or HTTPS protocol' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    // Fetch the content
    let content: string;
    try {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Cowork-Skill-Importer/1.0',
          'Accept': 'text/plain, text/markdown, */*',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch: ${response.status} ${response.statusText}`
        };
      }

      content = await response.text();
    } catch (fetchError) {
      return {
        success: false,
        error: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
      };
    }

    // Parse the content
    const parsed = parseSkillFile(content);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid SKILL.md format: missing required fields (name, description)'
      };
    }

    // Determine slug
    const slug = customSlug
      ? generateSlug(customSlug)
      : findUniqueSlug(workspaceRoot, parsed.metadata.name);

    if (!slug) {
      return { success: false, error: 'Could not generate valid slug' };
    }

    // Create skill directory
    const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
    const skillDir = join(skillsDir, slug);

    try {
      mkdirSync(skillDir, { recursive: true });
    } catch {
      return { success: false, error: 'Failed to create skill directory' };
    }

    // Write SKILL.md
    const skillFile = join(skillDir, 'SKILL.md');
    try {
      writeFileSync(skillFile, content, 'utf-8');
    } catch {
      // Clean up directory on failure
      try { rmSync(skillDir, { recursive: true }); } catch { /* ignore */ }
      return { success: false, error: 'Failed to write skill file' };
    }

    // Download icon if specified as URL
    let iconPath: string | undefined;
    if (parsed.metadata.icon && isIconUrl(parsed.metadata.icon)) {
      try {
        const downloadedPath = await downloadIcon(skillDir, parsed.metadata.icon, 'Skills');
        if (downloadedPath) {
          iconPath = downloadedPath;
        }
      } catch {
        // Icon download failed, but skill is still valid
      }
    }

    // Load and return the skill
    const skill = loadSkill(workspaceRoot, slug);
    if (!skill) {
      return { success: false, error: 'Skill was created but failed to load' };
    }

    return { success: true, skill };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Import a skill from raw content (SKILL.md content as string)
 * @param workspaceRoot - Absolute path to workspace root
 * @param content - SKILL.md content with YAML frontmatter
 * @param customSlug - Optional custom slug (will auto-generate if not provided)
 */
export async function importSkillFromContent(
  workspaceRoot: string,
  content: string,
  customSlug?: string
): Promise<ImportSkillResult> {
  try {
    // Parse the content
    const parsed = parseSkillFile(content);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid SKILL.md format: missing required fields (name, description)'
      };
    }

    // Determine slug
    const slug = customSlug
      ? generateSlug(customSlug)
      : findUniqueSlug(workspaceRoot, parsed.metadata.name);

    if (!slug) {
      return { success: false, error: 'Could not generate valid slug' };
    }

    // Create skill directory
    const skillsDir = getWorkspaceSkillsPath(workspaceRoot);
    const skillDir = join(skillsDir, slug);

    try {
      mkdirSync(skillDir, { recursive: true });
    } catch {
      return { success: false, error: 'Failed to create skill directory' };
    }

    // Write SKILL.md
    const skillFile = join(skillDir, 'SKILL.md');
    try {
      writeFileSync(skillFile, content, 'utf-8');
    } catch {
      // Clean up directory on failure
      try { rmSync(skillDir, { recursive: true }); } catch { /* ignore */ }
      return { success: false, error: 'Failed to write skill file' };
    }

    // Download icon if specified as URL
    if (parsed.metadata.icon && isIconUrl(parsed.metadata.icon)) {
      try {
        await downloadIcon(skillDir, parsed.metadata.icon, 'Skills');
      } catch {
        // Icon download failed, but skill is still valid
      }
    }

    // Load and return the skill
    const skill = loadSkill(workspaceRoot, slug);
    if (!skill) {
      return { success: false, error: 'Skill was created but failed to load' };
    }

    return { success: true, skill };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
