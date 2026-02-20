/**
 * Cross-platform asset copy script.
 *
 * Copies the resources/ directory to dist/resources/.
 * All bundled assets (docs, themes, permissions, tool-icons) now live in resources/
 * which electron-builder handles natively via directories.buildResources.
 *
 * At Electron startup, setBundledAssetsRoot(__dirname) is called, and then
 * getBundledAssetsDir('docs') resolves to <__dirname>/resources/docs/, etc.
 *
 * Run: bun scripts/copy-assets.ts
 */

import { cpSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Copy all resources (icons, themes, docs, permissions, tool-icons, etc.)
cpSync('resources', 'dist/resources', { recursive: true });

console.log('[copy-assets] Copied resources/ -> dist/resources/');

type McpServerName = 'bridge-mcp-server' | 'session-mcp-server';

function syncMcpServer(server: McpServerName): void {
  const preferredBuiltPath = join('..', '..', '..', 'packages', server, 'dist', 'index.js');
  const fallbackResourcePath = join('resources', server, 'index.js');
  const sourcePath = existsSync(preferredBuiltPath)
    ? preferredBuiltPath
    : existsSync(fallbackResourcePath)
      ? fallbackResourcePath
      : null;

  if (!sourcePath) {
    throw new Error(
      `[copy-assets] Missing ${server}/index.js. Checked:\n- ${preferredBuiltPath}\n- ${fallbackResourcePath}`
    );
  }

  mkdirSync(join('dist', 'resources', server), { recursive: true });
  const targetPath = join('dist', 'resources', server, 'index.js');
  copyFileSync(sourcePath, targetPath);
  console.log(`[copy-assets] Synced ${server}/index.js from ${sourcePath}`);
}

syncMcpServer('bridge-mcp-server');
syncMcpServer('session-mcp-server');

// Copy PowerShell parser script (for Windows command validation in Explore mode)
// Source: packages/shared/src/agent/powershell-parser.ps1
// Destination: dist/resources/powershell-parser.ps1
const psParserSrc = join('..', '..', 'packages', 'shared', 'src', 'agent', 'powershell-parser.ps1');
const psParserDest = join('dist', 'resources', 'powershell-parser.ps1');
try {
  copyFileSync(psParserSrc, psParserDest);
  console.log('[copy-assets] Copied powershell-parser.ps1 -> dist/resources/');
} catch (err) {
  // Only warn - PowerShell validation is optional on non-Windows platforms
  console.log('[copy-assets] powershell-parser.ps1 copy skipped (not critical on non-Windows)');
}
