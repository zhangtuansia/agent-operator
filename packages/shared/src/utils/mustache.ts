/**
 * Minimal Mustache Template Renderer
 *
 * Supports:
 * - {{var}} variable interpolation (escaped)
 * - {{{var}}} variable interpolation (unescaped)
 * - {{#section}}...{{/section}} sections (conditionals + loops)
 * - {{^section}}...{{/section}} inverted sections
 * - dot notation keys like {{issue.title}}
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolve(key: string, contextStack: unknown[]): unknown {
  if (key === '.') {
    return contextStack[contextStack.length - 1];
  }

  const parts = key.split('.');

  for (let i = contextStack.length - 1; i >= 0; i--) {
    const ctx = contextStack[i];
    if (ctx == null || typeof ctx !== 'object') continue;

    let value: unknown = ctx;
    let found = true;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') {
        found = false;
        break;
      }
      value = (value as Record<string, unknown>)[part];
      if (value === undefined) {
        found = false;
        break;
      }
    }
    if (found) return value;
  }

  return undefined;
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

export function renderMustache(template: string, data: Record<string, unknown>): string {
  return renderWithStack(template, [data]);
}

function renderWithStack(template: string, contextStack: unknown[]): string {
  let result = '';
  let pos = 0;

  while (pos < template.length) {
    const openIdx = template.indexOf('{{', pos);
    if (openIdx === -1) {
      result += template.slice(pos);
      break;
    }

    result += template.slice(pos, openIdx);

    if (template[openIdx + 2] === '{') {
      const closeIdx = template.indexOf('}}}', openIdx + 3);
      if (closeIdx === -1) {
        result += '{{{';
        pos = openIdx + 3;
        continue;
      }

      const key = template.slice(openIdx + 3, closeIdx).trim();
      const value = resolve(key, contextStack);
      result += value != null ? String(value) : '';
      pos = closeIdx + 3;
      continue;
    }

    const closeIdx = template.indexOf('}}', openIdx + 2);
    if (closeIdx === -1) {
      result += '{{';
      pos = openIdx + 2;
      continue;
    }

    const tag = template.slice(openIdx + 2, closeIdx).trim();
    pos = closeIdx + 2;

    if (tag.startsWith('#')) {
      const key = tag.slice(1).trim();
      const endTag = `{{/${key}}}`;
      const endIdx = findMatchingEnd(template, pos, key);
      if (endIdx === -1) {
        continue;
      }

      const innerTemplate = template.slice(pos, endIdx);
      pos = endIdx + endTag.length;

      const value = resolve(key, contextStack);
      if (Array.isArray(value)) {
        for (const item of value) {
          result += renderWithStack(innerTemplate, [...contextStack, item]);
        }
      } else if (isTruthy(value)) {
        if (typeof value === 'object' && value !== null) {
          result += renderWithStack(innerTemplate, [...contextStack, value]);
        } else {
          result += renderWithStack(innerTemplate, contextStack);
        }
      }
    } else if (tag.startsWith('^')) {
      const key = tag.slice(1).trim();
      const endTag = `{{/${key}}}`;
      const endIdx = findMatchingEnd(template, pos, key);
      if (endIdx === -1) {
        continue;
      }

      const innerTemplate = template.slice(pos, endIdx);
      pos = endIdx + endTag.length;

      const value = resolve(key, contextStack);
      if (!isTruthy(value)) {
        result += renderWithStack(innerTemplate, contextStack);
      }
    } else if (tag.startsWith('/')) {
      continue;
    } else if (tag.startsWith('!')) {
      continue;
    } else {
      const value = resolve(tag, contextStack);
      if (value != null) {
        result += escapeHtml(String(value));
      }
    }
  }

  return result;
}

function findMatchingEnd(template: string, startPos: number, key: string): number {
  const openPattern = `{{#${key}}}`;
  const closePattern = `{{/${key}}}`;
  let depth = 1;
  let pos = startPos;

  while (pos < template.length && depth > 0) {
    const nextOpen = template.indexOf(openPattern, pos);
    const nextClose = template.indexOf(closePattern, pos);

    if (nextClose === -1) {
      return -1;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openPattern.length;
    } else {
      depth--;
      if (depth === 0) {
        return nextClose;
      }
      pos = nextClose + closePattern.length;
    }
  }

  return -1;
}
