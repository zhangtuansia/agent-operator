import { getLatestVersion } from "./manifest";
import { APP_VERSION } from "./app-version";

const ENV_VERSION =
  process.env.COWORK_APP_VERSION ||
  process.env.COWORK_AGENT_CLI_VERSION;

export function getCurrentVersion(): string {
  return ENV_VERSION ?? APP_VERSION;
}

export async function isUpToDate(): Promise<boolean> {
  const currentVersion = getCurrentVersion();
  const latestVersion = await getLatestVersion();
  if (latestVersion == null) {
    return true; // When latest version is not available, we assume the app is up to date to avoid updating to an unknown version
  }
  return currentVersion === latestVersion;
}

/**
 * Returns the latest version or null if the app is up to date
 */
export async function getUpdateToVersion(): Promise<string | null> {
  if (await isUpToDate()) {
    return null;
  }
  const version = await getLatestVersion();
  if (version == null) {
    return null;
  }
  return version;
}
