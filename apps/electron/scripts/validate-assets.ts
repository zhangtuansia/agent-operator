/**
 * Build Validation Script
 *
 * Runs after all build steps to validate the output:
 * 1. All expected output files exist
 * 2. No missing critical assets
 * 3. Bundle sizes don't exceed thresholds
 *
 * Run: bun scripts/validate-assets.ts
 */

import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================
// Configuration
// ============================================================

/** Expected output files that must exist after build */
const REQUIRED_FILES = [
  'dist/main.cjs',
  'dist/preload.cjs',
  'dist/renderer/index.html',
  'dist/resources',
];

/** Expected resource directories */
const REQUIRED_RESOURCE_DIRS = [
  'dist/resources/docs',
  'dist/resources/release-notes',
];

/** MCP server bundles that must be present */
const REQUIRED_MCP_SERVERS = [
  'dist/resources/bridge-mcp-server/index.js',
  'dist/resources/session-mcp-server/index.js',
];

/**
 * Bundle size thresholds (in MB).
 * Build fails if any file exceeds its threshold.
 * Adjust these as the app grows.
 */
const SIZE_THRESHOLDS: Record<string, number> = {
  'dist/main.cjs': 15,        // Main process bundle
  'dist/preload.cjs': 2,      // Preload script
};

/** Maximum total dist size (MB) */
const MAX_TOTAL_DIST_SIZE_MB = 200;

// ============================================================
// Helpers
// ============================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      } else {
        try {
          total += statSync(fullPath).size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return total;
}

// ============================================================
// Validation
// ============================================================

let errors: string[] = [];
let warnings: string[] = [];

// 1. Check required output files
console.log('[validate] Checking required output files...');
for (const file of REQUIRED_FILES) {
  if (!existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  }
}

// 2. Check required resource directories
console.log('[validate] Checking resource directories...');
for (const dir of REQUIRED_RESOURCE_DIRS) {
  if (!existsSync(dir)) {
    warnings.push(`Missing resource directory: ${dir}`);
  }
}

// 3. Check MCP server bundles
console.log('[validate] Checking MCP server bundles...');
for (const server of REQUIRED_MCP_SERVERS) {
  if (!existsSync(server)) {
    errors.push(`Missing MCP server bundle: ${server}`);
  }
}

// 4. Check bundle sizes against thresholds
console.log('[validate] Checking bundle sizes...');
for (const [file, maxMB] of Object.entries(SIZE_THRESHOLDS)) {
  if (!existsSync(file)) continue; // Already reported as missing

  const stats = statSync(file);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB > maxMB) {
    errors.push(
      `Bundle too large: ${file} is ${formatSize(stats.size)} (max: ${maxMB} MB)`
    );
  } else {
    console.log(`  ${file}: ${formatSize(stats.size)} (limit: ${maxMB} MB)`);
  }
}

// 5. Check renderer output
console.log('[validate] Checking renderer build...');
if (existsSync('dist/renderer')) {
  const rendererFiles = readdirSync('dist/renderer');
  const hasHtml = rendererFiles.some(f => f.endsWith('.html'));
  const hasAssets = existsSync('dist/renderer/assets');

  if (!hasHtml) {
    errors.push('Renderer build missing: no HTML files in dist/renderer/');
  }
  if (!hasAssets) {
    warnings.push('Renderer build may be incomplete: no assets/ directory in dist/renderer/');
  }
} else {
  errors.push('Renderer build directory missing: dist/renderer/');
}

// 6. Check total dist size
console.log('[validate] Checking total dist size...');
const totalSize = getDirSize('dist');
const totalMB = totalSize / (1024 * 1024);
console.log(`  Total dist size: ${formatSize(totalSize)}`);

if (totalMB > MAX_TOTAL_DIST_SIZE_MB) {
  warnings.push(
    `Total dist size (${formatSize(totalSize)}) exceeds advisory limit of ${MAX_TOTAL_DIST_SIZE_MB} MB`
  );
}

// ============================================================
// Report
// ============================================================

console.log('');

if (warnings.length > 0) {
  console.log(`[validate] ${warnings.length} warning(s):`);
  for (const w of warnings) {
    console.log(`  ! ${w}`);
  }
  console.log('');
}

if (errors.length > 0) {
  console.error(`[validate] ${errors.length} error(s):`);
  for (const e of errors) {
    console.error(`  x ${e}`);
  }
  console.error('');
  console.error('[validate] Build validation FAILED');
  process.exit(1);
} else {
  console.log('[validate] Build validation PASSED');
}
