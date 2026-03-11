import React, { useCallback, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserEmptyStateCard } from '@agent-operator/ui'
import { detectSystemLanguage, type Language } from './i18n'
import { routes } from '../shared/routes'
import {
  EMPTY_STATE_PROMPT_SAMPLES_EN,
  EMPTY_STATE_PROMPT_SAMPLES_ZH,
} from './components/browser/empty-state-prompts'
import './index.css'

async function launchRoute(route: string): Promise<void> {
  const token = String(Date.now())
  const payload = { route, token }

  if (window.electronAPI?.browserPane?.emptyStateLaunch) {
    try {
      await window.electronAPI.browserPane.emptyStateLaunch(payload)
      return
    } catch {
      // Fall back for BrowserView pages without preload transport.
    }
  }

  const params = new URLSearchParams({ route, token })
  window.location.hash = `launch=${params.toString()}`
}

function BrowserEmptyStateApp() {
  const language = detectSystemLanguage()
  const title = language === 'zh'
    ? '这个浏览器已经准备好供搭子和你一起使用'
    : 'This browser is ready for Dazi and for you'
  const description = language === 'zh'
    ? '让任意会话使用这个浏览器继续做调研、表单填写、QA 检查或数据提取。'
    : 'Ask any session to use this browser to continue research, form filling, QA checks, or data extraction.'
  const safetyHint = language === 'zh'
    ? '只有在你明确要求时，搭子才会控制浏览器窗口。'
    : 'Dazi only controls browser windows when you ask it to.'
  const prompts = language === 'zh' ? EMPTY_STATE_PROMPT_SAMPLES_ZH : EMPTY_STATE_PROMPT_SAMPLES_EN

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = language === 'zh' ? '浏览器工作区' : 'Browser Workspace'
  }, [language])

  const handlePrompt = useCallback((sample: { full: string }) => {
    void launchRoute(routes.action.newChat({ input: sample.full, send: true })).catch(() => {})
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-foreground-2">
      <div className="h-full w-full overflow-auto bg-background">
        <BrowserEmptyStateCard
          title={title}
          description={description}
          prompts={prompts}
          showExamplePrompts={true}
          showSafetyHint={true}
          safetyHint={safetyHint}
          onPromptSelect={handlePrompt}
        />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserEmptyStateApp />
  </React.StrictMode>,
)
