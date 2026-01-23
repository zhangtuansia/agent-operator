/**
 * macOS Permission Utilities
 *
 * Handles checking and requesting macOS system permissions like Full Disk Access.
 * Full Disk Access is required for operations on protected directories like ~/.Trash
 */

import { app, shell, dialog, systemPreferences } from 'electron'
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

  // Test paths that require Full Disk Access
  const testPaths = [
    join(homedir(), 'Library', 'Safari'),
    join(homedir(), '.Trash'),
  ]

  for (const testPath of testPaths) {
    try {
      // Try to access the directory
      accessSync(testPath, constants.R_OK)
      // If we can access a protected path, we have FDA
      return true
    } catch {
      // Access denied - continue checking other paths
    }
  }

  // If we couldn't access any protected path, we likely don't have FDA
  // However, some paths might not exist, so do a more specific check
  const trashPath = join(homedir(), '.Trash')
  if (existsSync(trashPath)) {
    try {
      accessSync(trashPath, constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  // If .Trash doesn't exist (unusual), assume we have access
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
