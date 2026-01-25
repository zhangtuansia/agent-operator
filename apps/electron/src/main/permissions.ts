/**
 * macOS Permission Utilities
 *
 * Handles checking and requesting macOS system permissions like Full Disk Access.
 * Full Disk Access is required for operations on protected directories like ~/.Trash
 */

import { shell, dialog, systemPreferences } from 'electron'
import { existsSync, accessSync, constants } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { mainLog } from './logger'

/**
 * Check if the app has Full Disk Access permission on macOS.
 *
 * We test this by attempting to read a protected directory that requires FDA.
 * Common test paths: ~/Library/Safari, ~/.Trash
 */
export function hasFullDiskAccess(): boolean {
  if (process.platform !== 'darwin') {
    return true // Not applicable on non-macOS
  }

  // Test paths that require Full Disk Access (in order of reliability)
  const testPaths = [
    join(homedir(), 'Library', 'Safari'),
    join(homedir(), '.Trash'),
  ]

  for (const testPath of testPaths) {
    // Skip if path doesn't exist
    if (!existsSync(testPath)) {
      continue
    }

    try {
      // Try to access the directory - this requires FDA for protected paths
      accessSync(testPath, constants.R_OK)
      return true
    } catch {
      // Access denied - we don't have FDA
      return false
    }
  }

  // If none of the protected paths exist (unusual), assume we have access
  return true
}

/**
 * Open System Preferences to the Full Disk Access pane.
 * This allows the user to grant FDA to the app.
 */
export function openFullDiskAccessSettings(): void {
  if (process.platform !== 'darwin') {
    return
  }

  // Open System Preferences/Settings to Privacy & Security > Full Disk Access
  // macOS 13+: x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles
  // macOS 12 and earlier: Uses different URL
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  mainLog.info('Opened Full Disk Access settings')
}

/**
 * Show a dialog prompting the user to grant Full Disk Access.
 * Returns true if the user chose to open settings.
 */
export async function promptForFullDiskAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Full Disk Access Required',
    message: 'Cowork needs Full Disk Access',
    detail: 'Some operations (like accessing Trash or protected folders) require Full Disk Access permission.\n\nWould you like to open System Settings to grant this permission?',
    buttons: ['Open Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })

  if (result.response === 0) {
    openFullDiskAccessSettings()
    return true
  }

  return false
}

/**
 * Check FDA and prompt user if not granted.
 * Call this when an operation fails due to permission issues.
 */
export async function checkAndPromptFullDiskAccess(): Promise<boolean> {
  if (hasFullDiskAccess()) {
    return true
  }

  mainLog.warn('Full Disk Access not granted')
  await promptForFullDiskAccess()
  return false
}

/**
 * Get accessibility permission status (for automation features)
 */
export function hasAccessibilityAccess(): boolean {
  if (process.platform !== 'darwin') {
    return true
  }
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/**
 * Request accessibility permission (shows system prompt)
 */
export function requestAccessibilityAccess(): boolean {
  if (process.platform !== 'darwin') {
    return true
  }
  return systemPreferences.isTrustedAccessibilityClient(true)
}

/**
 * Open System Preferences to the Accessibility pane.
 */
export function openAccessibilitySettings(): void {
  if (process.platform !== 'darwin') {
    return
  }
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  mainLog.info('Opened Accessibility settings')
}

/**
 * Get all permissions status
 */
export function getAllPermissionsStatus(): { fullDiskAccess: boolean; accessibility: boolean } {
  return {
    fullDiskAccess: hasFullDiskAccess(),
    accessibility: hasAccessibilityAccess(),
  }
}
