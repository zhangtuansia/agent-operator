/**
 * Settings Page Components Registry
 *
 * Maps settings subpage IDs to their React components.
 * TypeScript enforces that all pages defined in settings-registry have a component here.
 */

import type { ComponentType } from 'react'
import type { SettingsSubpage } from '../../../shared/settings-registry'

import AppSettingsPage from './AppSettingsPage'
import WorkspaceSettingsPage from './WorkspaceSettingsPage'
import AiSettingsPage from './AiSettingsPage'
import InputSettingsPage from './InputSettingsPage'
import LabelsSettingsPage from './LabelsSettingsPage'
import PermissionsSettingsPage from './PermissionsSettingsPage'
import ShortcutsPage from './ShortcutsPage'
import PreferencesPage from './PreferencesPage'
import ImportSettingsPage from './ImportSettingsPage'
import IMSettingsPage from './IMSettingsPage'

export const SETTINGS_PAGE_COMPONENTS: Record<SettingsSubpage, ComponentType> = {
  app: AppSettingsPage,
  workspace: WorkspaceSettingsPage,
  api: AiSettingsPage,
  input: InputSettingsPage,
  labels: LabelsSettingsPage,
  permissions: PermissionsSettingsPage,
  shortcuts: ShortcutsPage,
  preferences: PreferencesPage,
  import: ImportSettingsPage,
  im: IMSettingsPage,
}

export function getSettingsPageComponent(subpage: SettingsSubpage): ComponentType {
  return SETTINGS_PAGE_COMPONENTS[subpage]
}
