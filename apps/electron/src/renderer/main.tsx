import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import { Toaster } from '@/components/ui/sonner'
import { initAnalytics, instrumentElectronApi } from './lib/analytics'
import './index.css'

/**
 * Root component - always renders App
 * App.tsx handles window mode detection internally (main vs tab-content)
 */
function Root() {
  return <App />
}

void initAnalytics(window.electronAPI)
// Store instrumented API on a different property (electronAPI is read-only from contextBridge)
;(window as unknown as { __instrumentedAPI: typeof window.electronAPI }).__instrumentedAPI = instrumentElectronApi(window.electronAPI)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <JotaiProvider>
      <ThemeProvider>
        <LanguageProvider>
          <Root />
          <Toaster />
        </LanguageProvider>
      </ThemeProvider>
    </JotaiProvider>
  </React.StrictMode>
)
