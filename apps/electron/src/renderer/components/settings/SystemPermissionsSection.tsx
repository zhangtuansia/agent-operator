/**
 * SystemPermissionsSection
 *
 * Displays macOS system permissions status with authorization buttons.
 * Shows Full Disk Access and Accessibility permissions.
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { SettingsSection, SettingsCard, SettingsRow } from '@/components/settings'

export interface SystemPermissionsSectionProps {
  /** Optional callback when permissions change */
  onPermissionsChange?: (permissions: { fullDiskAccess: boolean; accessibility: boolean }) => void
}

export function SystemPermissionsSection({ onPermissionsChange }: SystemPermissionsSectionProps) {
  const { t } = useLanguage()
  const [permissions, setPermissions] = useState<{
    fullDiskAccess: boolean
    accessibility: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)

  // Check permissions on mount and when window gains focus
  const checkPermissions = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const status = await window.electronAPI.getAllPermissions()
      setPermissions(status)
      onPermissionsChange?.(status)
    } catch (error) {
      console.error('Failed to check permissions:', error)
    } finally {
      setLoading(false)
    }
  }, [onPermissionsChange])

  useEffect(() => {
    checkPermissions()

    // Re-check when window gains focus (user may have changed settings)
    const handleFocus = () => {
      checkPermissions()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [checkPermissions])

  const handleOpenFullDiskAccess = useCallback(async () => {
    await window.electronAPI.openFullDiskAccessSettings()
  }, [])

  const handleOpenAccessibility = useCallback(async () => {
    await window.electronAPI.openAccessibilitySettings()
  }, [])

  // Only show on macOS
  if (typeof navigator !== 'undefined' && !navigator.userAgent.includes('Mac')) {
    return null
  }

  if (loading) {
    return null
  }

  return (
    <SettingsSection
      title={t('appSettings.systemPermissions')}
      description={t('appSettings.systemPermissionsDesc')}
    >
      <SettingsCard>
        {/* Full Disk Access */}
        <SettingsRow
          label={t('appSettings.fullDiskAccess')}
          description={t('appSettings.fullDiskAccessDesc')}
        >
          {permissions?.fullDiskAccess ? (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm">{t('appSettings.permissionGranted')}</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenFullDiskAccess}
              className="gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('appSettings.authorize')}
            </Button>
          )}
        </SettingsRow>

        {/* Accessibility */}
        <SettingsRow
          label={t('appSettings.accessibility')}
          description={t('appSettings.accessibilityDesc')}
        >
          {permissions?.accessibility ? (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm">{t('appSettings.permissionGranted')}</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAccessibility}
              className="gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('appSettings.authorize')}
            </Button>
          )}
        </SettingsRow>
      </SettingsCard>

      {/* Warning if any permission is missing */}
      {permissions && (!permissions.fullDiskAccess || !permissions.accessibility) && (
        <div className="flex items-start gap-2 px-3 py-2 mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            {t('appSettings.permissionWarning')}
          </p>
        </div>
      )}
    </SettingsSection>
  )
}
