/**
 * ErrorFallback - Fallback UI for error boundaries
 *
 * Displays different UI based on error severity level:
 * - app: Full page error with reload button
 * - section: Card-style error with retry button
 * - component: Inline error with dismiss option
 */

import * as React from 'react'
import { AlertCircle, RefreshCw, X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/LanguageContext'
import type { ErrorLevel } from './ErrorBoundary'

export interface ErrorFallbackProps {
  error: Error
  level: ErrorLevel
  onReset?: () => void
  className?: string
}

export function ErrorFallback({ error, level, onReset, className }: ErrorFallbackProps) {
  const { t } = useLanguage()

  // App-level error: full page
  if (level === 'app') {
    return (
      <div className={cn(
        'flex h-screen w-screen flex-col items-center justify-center gap-6 bg-background p-8',
        className
      )}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="size-12 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {t('errorBoundary.appError')}
            </h1>
            <p className="max-w-md text-muted-foreground">
              {t('errorBoundary.appErrorDescription')}
            </p>
          </div>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="max-w-lg rounded-lg border bg-muted/50 p-4 text-left">
            <summary className="cursor-pointer text-sm font-medium">
              {t('errorBoundary.technicalDetails')}
            </summary>
            <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}

        <Button
          onClick={() => window.location.reload()}
          size="lg"
        >
          <RefreshCw className="mr-2 size-4" />
          {t('errorBoundary.reload')}
        </Button>
      </div>
    )
  }

  // Section-level error: card style
  if (level === 'section') {
    return (
      <div className={cn(
        'flex h-full min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border bg-muted/30 p-6',
        className
      )}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-5" />
          <span className="font-medium">{t('errorBoundary.sectionError')}</span>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {error.message}
          </p>
        )}

        {onReset && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RefreshCw className="mr-1.5 size-3" />
            {t('errorBoundary.retry')}
          </Button>
        )}
      </div>
    )
  }

  // Component-level error: inline
  return (
    <div className={cn(
      'inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive',
      className
    )}>
      <AlertCircle className="size-4 shrink-0" />
      <span>{t('errorBoundary.componentError')}</span>
      {onReset && (
        <button
          onClick={onReset}
          className="ml-1 rounded p-0.5 hover:bg-destructive/20"
          aria-label={t('errorBoundary.dismiss')}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
