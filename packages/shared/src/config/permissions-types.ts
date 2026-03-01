/**
 * System Permissions Types
 *
 * Type definitions for macOS system permissions.
 */

/**
 * Permission types that can be checked/requested
 */
export type PermissionType = 'fullDiskAccess' | 'accessibility';

/**
 * Permission status
 */
export type PermissionStatus = 'granted' | 'denied' | 'unknown';

/**
 * Permission info with metadata
 */
export interface PermissionInfo {
  type: PermissionType;
  status: PermissionStatus;
  /** Human-readable name */
  name: string;
  /** Description of what this permission enables */
  description: string;
  /** macOS system preferences URL scheme */
  settingsUrl: string;
}

/**
 * All permissions state
 */
export interface PermissionsState {
  fullDiskAccess: PermissionStatus;
  accessibility: PermissionStatus;
}

/**
 * System preferences URL schemes for each permission type
 */
export const PERMISSION_SETTINGS_URLS: Record<PermissionType, string> = {
  fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};
