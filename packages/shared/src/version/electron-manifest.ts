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
 * Parse version string into components for comparison.
 * Handles versions like "0.1.4", "0.1.4a", "0.1.4b".
 * Letter suffix is treated as a POST-release increment (0.1.4a > 0.1.4).
 */
function parseVersion(version: string): { base: string; suffix: string } | null {
  // Match versions like "0.1.4" or "0.1.4a"
  const match = version.match(/^(\d+\.\d+\.\d+)([a-z]*)$/i);
  if (match) {
    const base = match[1];
    if (!base) {
      return null;
    }
    const suffix = (match[2] ?? '').toLowerCase();
    return { base, suffix };
  }
  return null;
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
    const currentParsed = parseVersion(current);
    const latestParsed = parseVersion(latest);

    // If both can be parsed with our custom format
    if (currentParsed && latestParsed) {
      // First compare the base versions using semver
      const baseComparison = semver.compare(
        semver.coerce(currentParsed.base)!,
        semver.coerce(latestParsed.base)!
      );

      if (baseComparison !== 0) {
        // Base versions differ - latest is newer if its base is greater
        return baseComparison < 0;
      }

      // Base versions are equal, compare suffixes
      // Empty suffix < any letter (0.1.4 < 0.1.4a)
      // Letters compare alphabetically (0.1.4a < 0.1.4b)
      if (currentParsed.suffix === latestParsed.suffix) {
        return false; // Same version
      }
      if (currentParsed.suffix === '') {
        return latestParsed.suffix !== ''; // 0.1.4 < 0.1.4a
      }
      if (latestParsed.suffix === '') {
        return false; // 0.1.4a > 0.1.4, so latest (0.1.4) is NOT newer
      }
      return latestParsed.suffix > currentParsed.suffix;
    }

    // Fall back to standard semver comparison
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
