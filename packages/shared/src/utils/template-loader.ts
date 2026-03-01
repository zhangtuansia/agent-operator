/**
 * Template Loader
 *
 * Discovers and loads HTML templates from source directories.
 * Parses self-describing header comments for metadata and validation.
 */

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { debug } from './debug.ts';

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  required: string[];
  optional: string[];
}

export interface LoadedTemplate {
  meta: TemplateMeta;
  content: string;
  filePath: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

/**
 * Parse the HTML header comment to extract template metadata.
 */
export function parseTemplateHeader(content: string): TemplateMeta | null {
  const commentMatch = content.match(/^\s*<!--([\s\S]*?)-->/);
  if (!commentMatch) return null;

  const comment = commentMatch[1] ?? '';

  const getTag = (tag: string): string => {
    const match = comment.match(new RegExp(`@${tag}\\s+(.+?)\\s*$`, 'm'));
    return match?.[1]?.trim() ?? '';
  };

  const getTagList = (tag: string): string[] => {
    const value = getTag(tag);
    if (!value) return [];
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  };

  const id = getTag('template');
  if (!id) return null;

  return {
    id,
    name: getTag('name') || id,
    description: getTag('description') || '',
    required: getTagList('required'),
    optional: getTagList('optional'),
  };
}

/**
 * Load one template from <source>/templates/<templateId>.html
 */
export function loadTemplate(sourcePath: string, templateId: string): LoadedTemplate | null {
  const templatesDir = join(sourcePath, 'templates');
  const filePath = join(templatesDir, `${templateId}.html`);

  if (!existsSync(filePath)) {
    debug(`[templates] Template file not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const meta = parseTemplateHeader(content);

    if (!meta) {
      debug(`[templates] No valid header in template: ${filePath}`);
      return {
        meta: {
          id: templateId,
          name: templateId,
          description: '',
          required: [],
          optional: [],
        },
        content,
        filePath,
      };
    }

    return { meta, content, filePath };
  } catch (error) {
    debug(`[templates] Failed to read template ${filePath}`, error);
    return null;
  }
}

/**
 * List all templates from <source>/templates
 */
export function listTemplates(sourcePath: string): TemplateMeta[] {
  const templatesDir = join(sourcePath, 'templates');
  if (!existsSync(templatesDir)) return [];

  const templates: TemplateMeta[] = [];

  try {
    const files = readdirSync(templatesDir).filter((file) => file.endsWith('.html'));

    for (const file of files) {
      const filePath = join(templatesDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const meta = parseTemplateHeader(content);
        if (meta) {
          templates.push(meta);
          continue;
        }

        const id = file.replace(/\.html$/, '');
        templates.push({
          id,
          name: id,
          description: '',
          required: [],
          optional: [],
        });
      } catch {
        // skip unreadable template files
      }
    }
  } catch {
    // templates dir not readable
  }

  return templates;
}

/**
 * Soft validation against template @required fields.
 */
export function validateTemplateData(meta: TemplateMeta, data: Record<string, unknown>): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const field of meta.required) {
    if (!(field in data) || data[field] == null) {
      warnings.push({
        field,
        message: `Missing required field: "${field}"`,
      });
    }
  }

  return warnings;
}
