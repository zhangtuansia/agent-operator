import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import { Toaster } from '@/components/ui/sonner'
import { windowWorkspaceIdAtom } from '@/atoms/sessions'
import { detectSystemLanguage, type Language } from './i18n'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { EscapeInterruptProvider } from '@/context/EscapeInterruptContext'
import TrayApp from './TrayApp'

function TrayBootstrap() {
  const workspaceId = useAtomValue(windowWorkspaceIdAtom)
  const setWorkspaceId = useSetAtom(windowWorkspaceIdAtom)
  const [language, setLanguage] = React.useState<Language | null>(null)

  React.useEffect(() => {
    let isMounted = true

    void Promise.all([
      window.electronAPI.getWindowWorkspace(),
      window.electronAPI.getLanguage?.(),
    ]).then(([loadedWorkspaceId, loadedLanguage]) => {
      if (!isMounted) return
      setWorkspaceId(loadedWorkspaceId)
      setLanguage(loadedLanguage ?? detectSystemLanguage())
    })

    return () => {
      isMounted = false
    }
  }, [setWorkspaceId])

  if (!language) {
    return null
  }

  return (
    <ErrorBoundary level="app">
      <LanguageProvider initialLanguage={language}>
        <ThemeProvider activeWorkspaceId={workspaceId}>
          <EscapeInterruptProvider>
            <TrayApp />
            <Toaster />
          </EscapeInterruptProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  )
}

export default function TrayRoot() {
  return <TrayBootstrap />
}
