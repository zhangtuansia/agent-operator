/**
 * TransportConnectionBanner
 *
 * Shows a dismissible banner when the remote transport connection is
 * in a non-connected state (connecting, reconnecting, disconnected, failed).
 *
 * The banner auto-reappears whenever the status transitions to a new
 * non-connected state, even if the user previously dismissed it.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TransportConnectionState } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function shouldShowTransportConnectionBanner(
  state: TransportConnectionState | null,
): boolean {
  if (!state) return false
  if (state.mode !== 'remote') return false
  return state.status !== 'connected' && state.status !== 'idle'
}

type BannerTone = 'warning' | 'error' | 'info'

interface BannerCopy {
  titleKey: string
  description: string
  showRetry: boolean
  tone: BannerTone
}

function getFailureReason(
  state: TransportConnectionState,
  t: (key: string) => string,
): string {
  const err = state.lastError
  if (err) {
    if (err.kind === 'auth') return t('transportBanner.errorAuth')
    if (err.kind === 'protocol') return t('transportBanner.errorProtocol')
    if (err.kind === 'timeout')
      return t('transportBanner.errorTimeout').replace('{url}', state.url)
    if (err.kind === 'network')
      return t('transportBanner.errorNetwork').replace('{url}', state.url)
    return err.message
  }

  if (state.lastClose?.code != null) {
    const reason = state.lastClose.reason ? ` (${state.lastClose.reason})` : ''
    return t('transportBanner.errorWsClosed')
      .replace('{code}', String(state.lastClose.code))
      .replace('{reason}', reason)
  }

  return t('transportBanner.waiting')
}

function getBannerCopy(
  state: TransportConnectionState,
  t: (key: string) => string,
): BannerCopy {
  switch (state.status) {
    case 'connecting':
      return {
        titleKey: 'transportBanner.connecting',
        description: t('transportBanner.connectingDesc').replace('{url}', state.url),
        showRetry: false,
        tone: 'info',
      }

    case 'reconnecting': {
      const retryLabel =
        state.nextRetryInMs != null
          ? t('transportBanner.retryIn').replace('{ms}', String(state.nextRetryInMs))
          : t('transportBanner.retrying')
      return {
        titleKey: 'transportBanner.reconnecting',
        description: `${getFailureReason(state, t)} (${retryLabel}, ${t('transportBanner.attempt').replace('{n}', String(state.attempt))})`,
        showRetry: true,
        tone: 'warning',
      }
    }

    case 'failed':
      return {
        titleKey: 'transportBanner.failed',
        description: getFailureReason(state, t),
        showRetry: true,
        tone: 'error',
      }

    case 'disconnected':
      return {
        titleKey: 'transportBanner.disconnected',
        description: getFailureReason(state, t),
        showRetry: true,
        tone: 'warning',
      }

    default:
      return {
        titleKey: 'transportBanner.status',
        description: getFailureReason(state, t),
        showRetry: true,
        tone: 'info',
      }
  }
}

const toneClasses: Record<BannerTone, string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransportConnectionBanner({
  state,
  onRetry,
}: {
  state: TransportConnectionState
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const copy = getBannerCopy(state, t)

  // Dismiss state — resets whenever the status changes so the banner
  // reappears on new disconnections.
  const [dismissed, setDismissed] = useState(false)
  const prevStatusRef = useRef(state.status)

  useEffect(() => {
    if (state.status !== prevStatusRef.current) {
      prevStatusRef.current = state.status
      setDismissed(false)
    }
  }, [state.status])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  if (dismissed) return null

  return (
    <div className={`shrink-0 border-b px-4 py-2 ${toneClasses[copy.tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{t(copy.titleKey)}</p>
          <p className="text-xs opacity-90 truncate">{copy.description}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {copy.showRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7">
              {t('common.tryAgain')}
            </Button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity"
            aria-label={t('common.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
