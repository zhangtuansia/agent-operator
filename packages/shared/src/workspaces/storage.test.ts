import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensurePluginManifest, generatePluginManifestName } from './storage.ts';

describe('workspace plugin manifest', () => {
  it('generates dazi plugin names', () => {
    expect(generatePluginManifestName('My Workspace')).toBe('dazi-workspace-my-workspace');
    expect(generatePluginManifestName('@@@')).toBe('dazi-workspace-workspace');
  });

  it('creates a dazi plugin manifest for new workspaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-plugin-'));

    try {
      ensurePluginManifest(root, 'My Workspace');

      const manifestPath = join(root, '.claude-plugin', 'plugin.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name: string; version: string };
      expect(manifest.name).toBe('dazi-workspace-my-workspace');
      expect(manifest.version).toBe('1.0.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('migrates legacy craft plugin manifests to dazi names', () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-plugin-legacy-'));

    try {
      const pluginDir = join(root, '.claude-plugin');
      mkdirSync(pluginDir, { recursive: true });
      const manifestPath = join(pluginDir, 'plugin.json');
      writeFileSync(manifestPath, JSON.stringify({
        name: 'craft-workspace-my-workspace',
        version: '2.3.4',
      }, null, 2));

      ensurePluginManifest(root, 'My Workspace');

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name: string; version: string };
      expect(manifest.name).toBe('dazi-workspace-my-workspace');
      expect(manifest.version).toBe('2.3.4');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite custom plugin manifest names', () => {
    const root = mkdtempSync(join(tmpdir(), 'workspace-plugin-custom-'));

    try {
      const pluginDir = join(root, '.claude-plugin');
      mkdirSync(pluginDir, { recursive: true });
      const manifestPath = join(pluginDir, 'plugin.json');
      writeFileSync(manifestPath, JSON.stringify({
        name: 'custom-plugin-name',
        version: '9.9.9',
      }, null, 2));

      ensurePluginManifest(root, 'My Workspace');

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name: string; version: string };
      expect(manifest.name).toBe('custom-plugin-name');
      expect(manifest.version).toBe('9.9.9');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
