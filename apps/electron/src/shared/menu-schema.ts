/**
 * Shared Menu Schema
 *
 * Defines menu structure consumed by both:
 * - Main process: transforms to Electron MenuItemConstructorOptions
 * - Renderer: settings navigation list
 *
 * Single source of truth for menu labels and settings item ordering.
 */

import { SETTINGS_PAGES, type SettingsSubpage } from './settings-registry'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemAction {
  type: 'action'
  id: string
  label: string
  shortcut: string
  ipcChannel: string
}

export interface MenuItemRole {
  type: 'role'
  role: string
  label: string
}

export interface MenuItemSeparator {
  type: 'separator'
}

export type MenuItem = MenuItemAction | MenuItemRole | MenuItemSeparator

export interface MenuSection {
  id: string
  label: string
  items: MenuItem[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Menu Sections
// ─────────────────────────────────────────────────────────────────────────────

export const EDIT_MENU: MenuSection = {
  id: 'edit',
  label: 'Edit',
  items: [
    { type: 'role', role: 'undo', label: 'Undo' },
    { type: 'role', role: 'redo', label: 'Redo' },
    { type: 'separator' },
    { type: 'role', role: 'cut', label: 'Cut' },
    { type: 'role', role: 'copy', label: 'Copy' },
    { type: 'role', role: 'paste', label: 'Paste' },
    { type: 'separator' },
    { type: 'role', role: 'selectAll', label: 'Select All' },
  ],
}

export const VIEW_MENU: MenuSection = {
  id: 'view',
  label: 'View',
  items: [
    { type: 'role', role: 'zoomIn', label: 'Zoom In' },
    { type: 'role', role: 'zoomOut', label: 'Zoom Out' },
    { type: 'role', role: 'resetZoom', label: 'Reset Zoom' },
  ],
}

export const WINDOW_MENU: MenuSection = {
  id: 'window',
  label: 'Window',
  items: [
    { type: 'role', role: 'minimize', label: 'Minimize' },
    { type: 'role', role: 'zoom', label: 'Maximize' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Items (shared between settings navigator and app menu variants)
// ─────────────────────────────────────────────────────────────────────────────

export interface SettingsMenuItem {
  id: SettingsSubpage
  label: string
  description: string
}

export const SETTINGS_ITEMS: SettingsMenuItem[] = SETTINGS_PAGES.map((page) => ({
  id: page.id,
  label: page.label,
  description: page.description,
}))
