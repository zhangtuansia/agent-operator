/**
 * Build script for the pixel-agents-server.
 * Bundles server.ts into a single JS file with all dependencies.
 */

import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = resolve(__dirname, 'dist');
mkdirSync(distDir, { recursive: true });

// Bundle server
await build({
  entryPoints: [resolve(__dirname, 'server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(distDir, 'server.mjs'),
  external: [],
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
  },
  minify: false,
  sourcemap: false,
});

console.log('[build] Server bundled to dist/server.mjs');

// Copy the built UI into dist/ui/ so the server can find it
const uiDistDir = resolve(__dirname, '..', 'pixel-agents-ui', 'dist');
const targetUiDir = resolve(distDir, 'ui');

if (existsSync(uiDistDir)) {
  mkdirSync(targetUiDir, { recursive: true });
  cpSync(uiDistDir, targetUiDir, { recursive: true });
  console.log('[build] UI copied to dist/ui/');
} else {
  console.warn('[build] Warning: pixel-agents-ui/dist not found. Build the UI first.');
}

console.log('[build] Done!');
