/**
 * Update Checker Hook
 *
 * Auto-update is disabled on desktop builds without code signing.
 * This hook now routes update actions to the GitHub Releases download page.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { UpdateInfo } from '../../shared/types'
import { useLanguage } from '@/context/LanguageContext'
import { RELEASE_DOWNLOADS_URL } from '@agent-operator/shared/branding'

interface UseUpdateCheckerResult {
  /** Current update info */
  updateInfo: UpdateInfo | null
  /** Whether an update is available */
  updateAvailable: boolean
  /** Whether update is currently downloading */
  isDownloading: boolean
  /** Whether update is ready to install */
  isReadyToInstall: boolean
  /** Download progress (0-100) */
  downloadProgress: number
  /** Open releases download page */
  checkForUpdates: () => Promise<void>
  /** Open releases download page */
  installUpdate: () => Promise<void>
}

/**
 * Hook for update actions (manual download flow).
 */
export function useUpdateChecker(): UseUpdateCheckerResult {
  const { t } = useLanguage()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  const openReleaseDownloads = useCallback(async () => {
    try {
      await window.electronAPI.openUrl(RELEASE_DOWNLOADS_URL)
      toast.success(t('updates.openedReleasePage'))
    } catch (error) {
      console.error('[useUpdateChecker] Failed to open release downloads page:', error)
      toast.error(t('updates.openReleasePageFailed'), {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [t])

  // Load current version info once (for About section).
  useEffect(() => {
    window.electronAPI.getUpdateInfo().then(setUpdateInfo).catch((error) => {
      console.error('[useUpdateChecker] Failed to read update info:', error)
    })
  }, [])

  const checkForUpdates = useCallback(async () => {
    await openReleaseDownloads()
  }, [openReleaseDownloads])

  const installUpdate = useCallback(async () => {
    await openReleaseDownloads()
  }, [openReleaseDownloads])

  return {
    updateInfo,
    updateAvailable: false,
    isDownloading: false,
    isReadyToInstall: false,
    downloadProgress: 0,
    checkForUpdates,
    installUpdate,
  }
}
