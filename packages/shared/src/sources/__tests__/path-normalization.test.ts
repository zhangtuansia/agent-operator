import { describe, expect, test } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { getSourcePath } from '../storage.ts';
import {
  getWorkspacePermissionsPath,
  getSourcePermissionsPath,
} from '../../agent/permissions-config.ts';

describe('source storage path normalization', () => {
  test('expands tilde workspace roots before resolving source paths', () => {
    expect(getSourcePath('~/workspace-under-test', 'youtube-feed')).toBe(
      join(homedir(), 'workspace-under-test', 'sources', 'youtube-feed'),
    );
  });

  test('expands tilde workspace roots for permissions paths', () => {
    expect(getWorkspacePermissionsPath('~/workspace-under-test')).toBe(
      join(homedir(), 'workspace-under-test', 'permissions.json'),
    );
    expect(getSourcePermissionsPath('~/workspace-under-test', 'youtube-feed')).toBe(
      join(homedir(), 'workspace-under-test', 'sources', 'youtube-feed', 'permissions.json'),
    );
  });
});
