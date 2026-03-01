/**
 * AppSettingsPage
 *
 * Global app-level settings that apply across all workspaces.
 *
 * Settings:
 * - Language
 * - Notifications
 * - System Permissions (macOS)
 * - About
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { Spinner } from '@agent-operator/ui'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSegmentedControl,
  SystemPermissionsSection,
} from '@/components/settings'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES, type Language } from '@/i18n'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'app',
}

// ============================================
// Main Component
// ============================================

export default function AppSettingsPage() {
  const { language, setLanguage, t } = useLanguage()

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

            {/* System Permissions (macOS only) */}
            <SystemPermissionsSection />

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
                  <div className="flex flex-col items-end gap-1.5">
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
                    {updateChecker.updateInfo?.downloadState === 'error' && (
                      <p className="max-w-[24rem] text-right text-xs text-destructive/90 break-all">
                        {updateChecker.updateInfo.error || t('appSettings.downloadFailed')}
                      </p>
                    )}
                  </div>
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
