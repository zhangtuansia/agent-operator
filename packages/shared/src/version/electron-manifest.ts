/**
 * Electron-specific manifest fetching
 *
 * Uses the /electron/ path prefix for Electron app updates.
 * Endpoints:
 * - https://download.aicowork.chat/electron/latest
 * - https://download.aicowork.chat/electron/{version}/manifest.json
 */

import semver from 'semver';
import { debug } from '../utils/debug';
import type { VersionManifest } from './manifest';

const ELECTRON_VERSIONS_URL = 'https://download.aicowork.chat/electron';

/** Default timeout for network requests (10 seconds) */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout to prevent hanging on slow/unresponsive servers
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch the latest Electron app version from the server
 */
export async function getElectronLatestVersion(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${ELECTRON_VERSIONS_URL}/latest`);
    if (!response.ok) {
      debug(`[electron-manifest] Failed to fetch latest version: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const version = (data as { version?: string }).version;
    if (typeof version !== 'string') {
      debug('[electron-manifest] Latest version is not a valid string');
      return null;
    }
    return version;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      debug('[electron-manifest] Fetch latest version timed out');
    } else {
      debug(`[electron-manifest] Failed to get latest version: ${error}`);
    }
    return null;
  }
}

/**
 * Fetch the manifest for a specific Electron app version
 */
export async function getElectronManifest(version: string): Promise<VersionManifest | null> {
  try {
    const url = `${ELECTRON_VERSIONS_URL}/${version}/manifest.json`;
    debug(`[electron-manifest] Getting manifest for version: ${url}`);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      debug(`[electron-manifest] Failed to fetch manifest: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data as VersionManifest;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      debug('[electron-manifest] Fetch manifest timed out');
    } else {
      debug(`[electron-manifest] Failed to get manifest: ${error}`);
    }
    return null;
  }
}

/**
 * Parse custom post-release versions into base + letter suffix.
 * Handles versions like "0.1.4a", "0.1.4b" (without a hyphen).
 * Letter suffix is treated as a POST-release increment (0.1.4a > 0.1.4).
 */
interface PostReleaseVersion {
  base: semver.SemVer;
  suffix: string;
}

function parsePostReleaseVersion(version: string): PostReleaseVersion | null {
  // Match versions like "0.1.4a" (optionally with v prefix)
  const match = version.trim().match(/^v?(\d+\.\d+\.\d+)([a-z]+)$/i);
  if (match) {
    const base = semver.parse(match[1]);
    if (!base) {
      return null;
    }
    const suffix = (match[2] ?? '').toLowerCase();
    return { base, suffix };
  }
  return null;
}

/**
 * Parse strict semver (supports prerelease/build metadata).
 */
function parseStrictSemver(version: string): semver.SemVer | null {
  return semver.parse(version.trim(), { loose: true }) ?? null;
}

/**
 * Compare two semver version strings
 * Returns true if `latest` is newer than `current`
 *
 * Custom comparison that treats letter suffixes as POST-release increments:
 * - 0.1.4a > 0.1.4 (letter suffix means newer)
 * - 0.1.4b > 0.1.4a
 * - 0.1.5 > 0.1.4z
 */
export function isNewerVersion(current: string, latest: string): boolean {
  try {
    const currentPost = parsePostReleaseVersion(current);
    const latestPost = parsePostReleaseVersion(latest);

    // Both are custom post-release versions (e.g. 0.1.5a, 0.1.5b)
    if (currentPost && latestPost) {
      const baseComparison = semver.compare(currentPost.base, latestPost.base);

      if (baseComparison !== 0) {
        // Base versions differ - latest is newer if its base is greater
        return baseComparison < 0;
      }

      // Base versions are equal, compare suffixes
      // Empty suffix < any letter (0.1.4 < 0.1.4a)
      // Letters compare alphabetically (0.1.4a < 0.1.4b)
      if (currentPost.suffix === latestPost.suffix) {
        return false; // Same version
      }
      return latestPost.suffix > currentPost.suffix;
    }

    const currentSemver = parseStrictSemver(current);
    const latestSemver = parseStrictSemver(latest);

    // Custom post-release vs strict semver
    if (currentPost && latestSemver) {
      const baseComparison = semver.compare(currentPost.base, latestSemver);
      if (baseComparison !== 0) {
        return baseComparison < 0;
      }
      // Same numeric base: post-release > release/prerelease
      return false;
    }

    if (currentSemver && latestPost) {
      const baseComparison = semver.compare(currentSemver, latestPost.base);
      if (baseComparison !== 0) {
        return baseComparison < 0;
      }
      // Same numeric base: post-release > release/prerelease
      return true;
    }

    // Standard semver comparison (supports prerelease/build metadata)
    if (currentSemver && latestSemver) {
      return semver.gt(latestSemver, currentSemver);
    }

    // Final fallback for partial/non-strict versions (e.g. "1.0", "1")
    const currentCoerced = semver.coerce(current);
    const latestCoerced = semver.coerce(latest);

    if (!currentCoerced || !latestCoerced) {
      debug(`[electron-manifest] Could not parse versions: current=${current}, latest=${latest}. Skipping update.`);
      return false;
    }

    return semver.gt(latestCoerced, currentCoerced);
  } catch (error) {
    debug(`[electron-manifest] Version comparison failed: ${error}. Skipping update.`);
    return false;
  }
}

/**
 * Get the platform key for the current system (darwin-arm64, darwin-x64, etc.)
 */
export function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  return `${platform}-${arch}`;
}
