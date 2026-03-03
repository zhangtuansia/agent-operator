/**
 * useStatuses Hook
 *
 * React hook to load and manage workspace statuses.
 * Auto-refreshes when workspace changes.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { StatusConfig } from '@agent-operator/shared/statuses'
import { clearIconCache } from '@/config/session-status-config'
import { useLanguage } from '@/context/LanguageContext'

const BUILT_IN_STATUS_LABELS_EN: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  'needs-review': 'Needs Review',
  done: 'Done',
  cancelled: 'Cancelled',
}

function getLocalizedBuiltInStatusLabel(
  status: StatusConfig,
  t: (key: string) => string
): StatusConfig {
  const englishDefault = BUILT_IN_STATUS_LABELS_EN[status.id]
  if (!englishDefault) return status

  const localized = t(`statusLabels.${status.id}`)
  const currentLabel = (status.label || '').trim()

  // Only replace untouched default labels. Preserve any user-customized label.
  if (!currentLabel || currentLabel === englishDefault || currentLabel === localized) {
    return { ...status, label: localized }
  }

  return status
}

export interface UseStatusesResult {
  statuses: StatusConfig[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Load statuses for a workspace via IPC
 * Auto-refreshes when workspaceId changes
 *
 * To detect agent edits to status config files, you could:
 * - Poll periodically (simple)
 * - Use file watcher in main process (more complex but real-time)
 */
export function useStatuses(workspaceId: string | null): UseStatusesResult {
  const { t } = useLanguage()
  const [rawStatuses, setRawStatuses] = useState<StatusConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const statuses = useMemo(() => {
    return rawStatuses.map((status) => getLocalizedBuiltInStatusLabel(status, t))
  }, [rawStatuses, t])

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setRawStatuses([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const configs = await window.electronAPI.listStatuses(workspaceId)
      setRawStatuses(configs)
      setError(null)
    } catch (err) {
      console.error('[useStatuses] Failed to load statuses:', err)
      setError(err instanceof Error ? err.message : 'Failed to load statuses')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  // Load statuses when workspace changes
  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to live status changes (config or icon file changes)
  useEffect(() => {
    if (!workspaceId) return

    const cleanup = window.electronAPI.onStatusesChanged((changedWorkspaceId) => {
      // Only refresh if this is our workspace
      if (changedWorkspaceId === workspaceId) {
        clearIconCache()  // Clear cached icon files before refreshing
        refresh()
      }
    })

    return cleanup
  }, [workspaceId, refresh])

  return {
    statuses,
    isLoading,
    error,
    refresh,
  }
}
