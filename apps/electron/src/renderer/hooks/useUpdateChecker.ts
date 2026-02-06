/**
 * Update Checker Hook
 *
 * Provides update checking functionality:
 * - Listens for update availability broadcasts from main process
 * - Tracks download progress
 * - Provides methods to check for updates and install
 * - Shows toast notification when update is ready
 * - Persistent dismissal across app restarts (per version)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { UpdateInfo } from '../../shared/types'
import { useLanguage } from '@/context/LanguageContext'

const UPDATE_TOAST_ID = 'update-available'

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
  /** Check for updates manually */
  checkForUpdates: () => Promise<void>
  /** Install the downloaded update and restart */
  installUpdate: () => Promise<void>
}

/**
 * Hook for managing app updates
 */
export function useUpdateChecker(): UseUpdateCheckerResult {
  const { t } = useLanguage()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  // Track if we've shown the toast for this version to avoid duplicates
  const shownToastVersionRef = useRef<string | null>(null)
  // Track surfaced error signatures so repeated update broadcasts don't spam.
  const shownErrorSignatureRef = useRef<string | null>(null)

  // Show toast notification when update is ready
  const showUpdateToast = useCallback((version: string, onInstall: () => void) => {
    // Don't show if already shown for this version in this session
    if (shownToastVersionRef.current === version) {
      return
    }
    shownToastVersionRef.current = version

    toast.info(t('updates.updateReady').replace('{version}', version), {
      id: UPDATE_TOAST_ID,
      description: t('updates.restartToApply'),
      duration: 10000, // 10 seconds, then auto-dismiss
      action: {
        label: t('updates.restart'),
        onClick: onInstall,
      },
      onDismiss: () => {
        // Persist dismissal so we don't show again after app restart
        window.electronAPI.dismissUpdate(version)
      },
    })
  }, [t])

  // Install the update
  const installUpdate = useCallback(async () => {
    try {
      // Dismiss the update toast first
      toast.dismiss(UPDATE_TOAST_ID)
      toast.info(t('toasts.installingUpdate'), {
        description: t('updates.appWillRestart'),
        duration: 3000,
      })
      await window.electronAPI.installUpdate()
    } catch (error) {
      console.error('[useUpdateChecker] Install failed:', error)
      toast.error(t('toasts.failedToInstallUpdate'), {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [t])

  // Load initial state and check if update ready
  useEffect(() => {
    const checkAndNotify = async (info: UpdateInfo) => {
      if (info.downloadState === 'error') {
        const errorMessage = info.error?.trim() || t('appSettings.downloadFailed')
        const signature = `${info.latestVersion ?? 'unknown'}:${errorMessage}`
        if (shownErrorSignatureRef.current !== signature) {
          shownErrorSignatureRef.current = signature
          toast.error(t('updates.updateFailed'), {
            description: errorMessage,
          })
        }
        return
      }

      // Reset when updater moves out of error state.
      shownErrorSignatureRef.current = null

      if (!info.available || !info.latestVersion) return
      if (info.downloadState !== 'ready') return

      // Check if this version was dismissed
      const dismissedVersion = await window.electronAPI.getDismissedUpdateVersion()
      if (dismissedVersion === info.latestVersion) {
        console.log('[useUpdateChecker] Update dismissed, skipping toast')
        return
      }

      // Show toast for ready update
      showUpdateToast(info.latestVersion, installUpdate)
    }

    // Get initial update info
    window.electronAPI.getUpdateInfo().then((info) => {
      setUpdateInfo(info)
      checkAndNotify(info)
    })

    // Subscribe to update availability changes
    const cleanupAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      checkAndNotify(info)
    })

    // Subscribe to download progress updates
    const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((progress) => {
      setUpdateInfo((prev) => prev ? { ...prev, downloadProgress: progress } : prev)
    })

    return () => {
      cleanupAvailable()
      cleanupProgress()
    }
  }, [showUpdateToast, installUpdate, t])

  // Check for updates manually
  const checkForUpdates = useCallback(async () => {
    try {
      const info = await window.electronAPI.checkForUpdates()
      setUpdateInfo(info)

      if (!info.available) {
        toast.success(t('toasts.youreUpToDate'), {
          description: t('toasts.runningLatestVersion'),
          duration: 3000,
        })
      } else if (info.downloadState === 'ready' && info.latestVersion) {
        // If already ready, show toast (clear any previous dismissal since user explicitly checked)
        shownToastVersionRef.current = null // Reset so toast can show again
        showUpdateToast(info.latestVersion, installUpdate)
      }
    } catch (error) {
      console.error('[useUpdateChecker] Check failed:', error)
      toast.error(t('toasts.failedToCheckForUpdates'), {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [t, showUpdateToast, installUpdate])

  return {
    updateInfo,
    updateAvailable: updateInfo?.available ?? false,
    isDownloading: updateInfo?.downloadState === 'downloading',
    isReadyToInstall: updateInfo?.downloadState === 'ready',
    downloadProgress: updateInfo?.downloadProgress ?? 0,
    checkForUpdates,
    installUpdate,
  }
}
