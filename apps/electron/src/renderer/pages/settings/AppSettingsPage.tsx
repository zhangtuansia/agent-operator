/**
 * AppSettingsPage
 *
 * Global app-level settings that apply across all workspaces.
 *
 * Settings:
 * - Appearance (Theme, Font)
 * - Language
 * - Notifications
 * - About
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { useTheme } from '@/context/ThemeContext'
import { routes } from '@/lib/navigate'
import { Monitor, Sun, Moon } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSegmentedControl,
  SettingsMenuSelect,
} from '@/components/settings'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES, type Language } from '@/i18n'
import type { PresetTheme } from '@config/theme'
import { FONTS, getFontLabel, SYSTEM_FONT } from '@/config/fonts'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'app',
}

export default function AppSettingsPage() {
  const { mode, setMode, colorTheme, setColorTheme, setPreviewColorTheme, font, setFont } = useTheme()
  const { language, setLanguage, t } = useLanguage()

  // Get workspace ID from context for loading preset themes
  const { activeWorkspaceId } = useAppShellContext()

  // Preset themes state
  const [presetThemes, setPresetThemes] = useState<PresetTheme[]>([])

  // Notifications state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Auto-update state
  const updateChecker = useUpdateChecker()
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingForUpdates(true)
    try {
      await updateChecker.checkForUpdates()
    } finally {
      setIsCheckingForUpdates(false)
    }
  }, [updateChecker])

  // Load notifications setting on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return
      try {
        const notificationsOn = await window.electronAPI.getNotificationsEnabled()
        setNotificationsEnabled(notificationsOn)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    loadSettings()
  }, [])

  // Load preset themes when workspace changes (themes are workspace-scoped)
  // Load preset themes (app-level, no workspace dependency)
  useEffect(() => {
    const loadThemes = async () => {
      if (!window.electronAPI) {
        setPresetThemes([])
        return
      }
      try {
        const themes = await window.electronAPI.loadPresetThemes()
        setPresetThemes(themes)
      } catch (error) {
        console.error('Failed to load preset themes:', error)
        setPresetThemes([])
      }
    }
    loadThemes()
  }, [])

  const handleNotificationsEnabledChange = useCallback(async (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    await window.electronAPI.setNotificationsEnabled(enabled)
  }, [])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('appSettings.title')} actions={<HeaderMenu route={routes.view.settings('app')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
          <div className="space-y-6">
            {/* Appearance */}
            <SettingsSection title={t('appSettings.appearance')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.mode')}>
                  <SettingsSegmentedControl
                    value={mode}
                    onValueChange={setMode}
                    options={[
                      { value: 'system', label: t('appSettings.modeSystem'), icon: <Monitor className="w-4 h-4" /> },
                      { value: 'light', label: t('appSettings.modeLight'), icon: <Sun className="w-4 h-4" /> },
                      { value: 'dark', label: t('appSettings.modeDark'), icon: <Moon className="w-4 h-4" /> },
                    ]}
                  />
                </SettingsRow>
                <SettingsRow label={t('appSettings.colorTheme')}>
                  <SettingsMenuSelect
                    value={colorTheme}
                    onValueChange={setColorTheme}
                    options={[
                      { value: 'default', label: t('appSettings.colorThemeDefault') },
                      ...presetThemes
                        .filter(theme => theme.id !== 'default')
                        .map(theme => ({
                          value: theme.id,
                          label: theme.theme.name || theme.id,
                        })),
                    ]}
                  />
                </SettingsRow>
                <SettingsRow label={t('appSettings.font')}>
                  <SettingsMenuSelect
                    value={font}
                    onValueChange={setFont}
                    options={[
                      { value: SYSTEM_FONT.id, label: t('appSettings.modeSystem') },
                      ...FONTS.map(f => ({
                        value: f.id,
                        label: getFontLabel(f),
                      })),
                    ]}
                  />
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>

            {/* Language */}
            <SettingsSection title={t('appSettings.language')} description={t('appSettings.languageDescription')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.language')}>
                  <SettingsSegmentedControl
                    value={language}
                    onValueChange={(v) => setLanguage(v as Language)}
                    options={LANGUAGES.map(lang => ({
                      value: lang.value,
                      label: lang.nativeLabel,
                    }))}
                  />
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>

            {/* Notifications */}
            <SettingsSection title={t('appSettings.notifications')}>
              <SettingsCard>
                <SettingsToggle
                  label={t('appSettings.desktopNotifications')}
                  description={t('appSettings.desktopNotificationsDesc')}
                  checked={notificationsEnabled}
                  onCheckedChange={handleNotificationsEnabledChange}
                />
              </SettingsCard>
            </SettingsSection>

            {/* About */}
            <SettingsSection title={t('appSettings.about')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.version')}>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {updateChecker.updateInfo?.currentVersion ?? t('common.loading')}
                    </span>
                    {/* Show download progress next to version when downloading */}
                    {updateChecker.isDownloading && (
                      <span className="text-xs text-primary">
                        {t('appSettings.downloadProgress').replace('{progress}', String(updateChecker.downloadProgress))}
                      </span>
                    )}
                    {/* Show new version badge when ready */}
                    {updateChecker.isReadyToInstall && updateChecker.updateInfo?.latestVersion && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        → {updateChecker.updateInfo.latestVersion}
                      </span>
                    )}
                  </div>
                </SettingsRow>
                <SettingsRow label={t('appSettings.checkForUpdates')}>
                  {/* Ready to install */}
                  {updateChecker.isReadyToInstall ? (
                    <Button
                      size="sm"
                      onClick={updateChecker.installUpdate}
                    >
                      {t('appSettings.restartToUpdate')}
                    </Button>
                  ) : /* Downloading */ updateChecker.isDownloading ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                    >
                      <Spinner className="mr-1.5" />
                      {t('appSettings.downloadProgress').replace('{progress}', String(updateChecker.downloadProgress))}
                    </Button>
                  ) : /* Download error */ updateChecker.updateInfo?.downloadState === 'error' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckForUpdates}
                    >
                      {t('appSettings.retryDownload')}
                    </Button>
                  ) : /* Checking */ isCheckingForUpdates ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                    >
                      <Spinner className="mr-1.5" />
                      {t('appSettings.checking')}
                    </Button>
                  ) : /* Default: Check Now */ (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckForUpdates}
                    >
                      {t('appSettings.checkNow')}
                    </Button>
                  )}
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>
          </div>
        </div>
        </ScrollArea>
      </div>
    </div>
  )
}
