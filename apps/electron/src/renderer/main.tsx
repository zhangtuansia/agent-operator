import React from 'react'
import ReactDOM from 'react-dom/client'
import { init as sentryInit } from '@sentry/electron/renderer'
import * as Sentry from '@sentry/react'
import { captureConsoleIntegration } from '@sentry/react'
import { Provider as JotaiProvider } from 'jotai'
import { useAtomValue } from 'jotai'
import App from './App'
import TrayRoot from './TrayRoot'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import { Toaster } from '@/components/ui/sonner'
import { windowWorkspaceIdAtom } from '@/atoms/sessions'
import { initAnalytics, instrumentElectronApi } from './lib/analytics'
import './index.css'

// Known-harmless console messages that should NOT be sent to Sentry.
const IGNORED_CONSOLE_PATTERNS = [
  'Received `true` for a non-boolean attribute',
  'Received `false` for a non-boolean attribute',
  'theme name already registered',
]

// Initialize Sentry in the renderer process using the dual-init pattern.
// DSN and config are inherited from the main process init.
sentryInit(
  {
    integrations: [captureConsoleIntegration({ levels: ['error'] })],

    beforeSend(event) {
      const message = event.message || event.exception?.values?.[0]?.value || ''
      if (IGNORED_CONSOLE_PATTERNS.some((pattern) => message.includes(pattern))) {
        return null
      }

      if (event.breadcrumbs) {
        for (const breadcrumb of event.breadcrumbs) {
          if (breadcrumb.data) {
            for (const key of Object.keys(breadcrumb.data)) {
              const lowerKey = key.toLowerCase()
              if (
                lowerKey.includes('token') ||
                lowerKey.includes('key') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('password') ||
                lowerKey.includes('credential') ||
                lowerKey.includes('auth')
              ) {
                breadcrumb.data[key] = '[REDACTED]'
              }
            }
          }
        }
      }

      return event
    },
  },
  Sentry.init,
)

/**
 * Minimal fallback UI shown when the entire React tree crashes.
 */
function CrashFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans text-foreground/50 gap-3">
      <p className="text-base font-medium">Something went wrong</p>
      <p className="text-[13px]">Please restart the app. The error has been reported.</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-1.5 rounded-md bg-background shadow-minimal text-[13px] text-foreground/70 cursor-pointer"
      >
        Reload
      </button>
    </div>
  )
}

const windowParams = new URLSearchParams(window.location.search)
const isTrayMode = windowParams.get('windowMode') === 'tray'

/**
 * Root component - loads workspace ID for theme context and renders App
 * App.tsx handles window mode detection internally (main vs tab-content)
 */
function Root() {
  // Shared atom — written by App on init & workspace switch, read here for ThemeProvider
  const workspaceId = useAtomValue(windowWorkspaceIdAtom)
  return (
    <ThemeProvider activeWorkspaceId={workspaceId}>
      <App />
      <Toaster />
    </ThemeProvider>
  )
}

void initAnalytics(window.electronAPI)
// Store instrumented API on a different property (electronAPI is read-only from contextBridge)
;(window as unknown as { __instrumentedAPI: typeof window.electronAPI }).__instrumentedAPI = instrumentElectronApi(window.electronAPI)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashFallback />}>
      <JotaiProvider>
        {isTrayMode ? (
          <TrayRoot />
        ) : (
          <LanguageProvider>
            <Root />
          </LanguageProvider>
        )}
      </JotaiProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
