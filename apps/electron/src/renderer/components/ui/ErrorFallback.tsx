import React from 'react'
import { useTranslation } from '@/i18n'
import { Button } from './button'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import type { ErrorBoundaryLevel } from './ErrorBoundary'

interface ErrorFallbackProps {
  error: Error
  resetError: () => void
  level: ErrorBoundaryLevel
}

/**
 * Fallback UI for error boundaries with different layouts based on error level.
 */
export function ErrorFallback({ error, resetError, level }: ErrorFallbackProps) {
  const { t } = useTranslation()

  // App-level error: Full page error screen
  if (level === 'app') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="flex flex-col items-center max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>

          <h1 className="text-xl font-semibold mb-2">
            {t('errorBoundary.appError')}
          </h1>

          <p className="text-muted-foreground mb-6">
            {t('errorBoundary.appErrorDescription')}
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="w-full mb-6 p-4 bg-muted rounded-lg text-left">
              <p className="text-xs font-mono text-destructive break-all">
                {error.message}
              </p>
              {error.stack && (
                <pre className="mt-2 text-xs font-mono text-muted-foreground overflow-auto max-h-32">
                  {error.stack}
                </pre>
              )}
            </div>
          )}

          <Button onClick={() => window.location.reload()} size="lg">
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('errorBoundary.reload')}
          </Button>
        </div>
      </div>
    )
  }

  // Section-level error: Error card within layout
  if (level === 'section') {
    return (
      <div className="h-full w-full flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-base font-medium mb-1">
                {t('errorBoundary.sectionError')}
              </h2>

              {process.env.NODE_ENV === 'development' && (
                <p className="text-xs font-mono text-muted-foreground mb-4 break-all">
                  {error.message}
                </p>
              )}

              <div className="flex gap-2">
                <Button onClick={resetError} size="sm" variant="default">
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  {t('errorBoundary.retry')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Component-level error: Inline error indicator
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-md text-sm">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span>{t('errorBoundary.componentError')}</span>
      <button
        onClick={resetError}
        className="p-0.5 hover:bg-destructive/20 rounded transition-colors"
        title={t('errorBoundary.retry')}
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  )
}
