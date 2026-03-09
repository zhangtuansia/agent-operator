import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ArrowUpRight, Compass, Search, Sparkles } from 'lucide-react'
import { detectSystemLanguage, type Language } from './i18n'
import { routes } from '../shared/routes'
import './index.css'

type BrowserEmptyStateCopy = {
  title: string
  description: string
  addressLabel: string
  addressPlaceholder: string
  openLabel: string
  promptsLabel: string
  promptDescription: string
  quickSitesLabel: string
  quickSitesDescription: string
  promptCards: Array<{ title: string; prompt: string }>
}

const COPY: Record<Language, BrowserEmptyStateCopy> = {
  zh: {
    title: '这个浏览器已经准备好供搭子和你一起使用',
    description: '可以直接打开网址，也可以从这里发起一个新对话，让搭子使用当前浏览器做调研、表单填写、QA 检查或数据提取。',
    addressLabel: '打开网址或搜索',
    addressPlaceholder: '输入网址、搜索词或 localhost 地址',
    openLabel: '打开',
    promptsLabel: '常用浏览器任务',
    promptDescription: '下面这些会直接新建一个对话，并让搭子使用当前浏览器窗口继续工作。',
    quickSitesLabel: '常用站点',
    quickSitesDescription: '这些按钮会直接在当前浏览器窗口打开目标站点。',
    promptCards: [
      { title: '调研当前页面', prompt: '请使用当前浏览器调研这个页面，并总结核心信息与关键结论。' },
      { title: '检查表单流程', prompt: '请使用当前浏览器检查这个页面的表单提交流程，并指出潜在问题。' },
      { title: '做一轮 QA', prompt: '请使用当前浏览器对这个页面做一轮 QA 检查，关注布局、文案和交互问题。' },
      { title: '提取结构化信息', prompt: '请使用当前浏览器读取这个页面，并提取其中的结构化信息。' },
    ],
  },
  en: {
    title: 'This browser is ready for Dazi and for you',
    description: 'Open a site directly, or start a new chat from here and let Dazi use this browser for research, form filling, QA checks, or data extraction.',
    addressLabel: 'Open a URL or search',
    addressPlaceholder: 'Enter a URL, query, or localhost address',
    openLabel: 'Open',
    promptsLabel: 'Common browser tasks',
    promptDescription: 'These start a new chat immediately and ask Dazi to keep working in this browser window.',
    quickSitesLabel: 'Quick sites',
    quickSitesDescription: 'These buttons open a destination directly in the current browser window.',
    promptCards: [
      { title: 'Research this page', prompt: 'Use the current browser to research this page and summarize the key findings.' },
      { title: 'Check the form flow', prompt: 'Use the current browser to inspect this form flow and point out likely issues.' },
      { title: 'Run a QA pass', prompt: 'Use the current browser to run a QA pass on this page and list layout, copy, and interaction issues.' },
      { title: 'Extract structured data', prompt: 'Use the current browser to read this page and extract the structured information it contains.' },
    ],
  },
}

const QUICK_SITES = [
  { label: 'GitHub', target: 'https://www.github.com' },
  { label: 'Notion', target: 'https://www.notion.so' },
  { label: 'Google', target: 'https://www.google.com' },
  { label: 'Hacker News', target: 'https://news.ycombinator.com' },
]

const EMPTY_STATE_LAUNCH_SCHEME = 'dazi-browser://launch'

function normalizeTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return trimmed
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(?:\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  if (trimmed.includes(' ') || (!trimmed.includes('.') && !trimmed.includes('/'))) {
    return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
  }
  return `https://${trimmed}`
}

function launchRoute(route: string): void {
  const token = String(Date.now())
  const params = new URLSearchParams({
    route,
    ts: token,
  })

  try {
    window.location.assign(`${EMPTY_STATE_LAUNCH_SCHEME}?${params.toString()}`)
    return
  } catch {
    // Fallback for environments that fail to navigate the custom bridge URL.
  }

  window.location.hash = `launch=${params.toString()}`
}

function BrowserEmptyStateApp() {
  const language = detectSystemLanguage()
  const copy = useMemo(() => COPY[language], [language])
  const [target, setTarget] = useState('')

  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = language === 'zh' ? '浏览器工作区' : 'Browser Workspace'
  }, [language])

  const openTarget = React.useCallback((value: string) => {
    window.location.href = normalizeTarget(value)
  }, [])

  const handleSubmit = React.useCallback((event: React.FormEvent) => {
    event.preventDefault()
    openTarget(target)
  }, [openTarget, target])

  const handlePrompt = React.useCallback((prompt: string) => {
    launchRoute(routes.action.newChat({ input: prompt, send: true }))
  }, [])

  return (
    <div className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_top,_rgba(117,142,255,0.14),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(255,183,120,0.12),_transparent_30%),var(--background)] px-6 py-8 text-foreground">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="w-full rounded-[28px] border border-foreground/8 bg-background/90 p-7 shadow-[0_24px_64px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/8 dark:shadow-[0_28px_72px_rgba(0,0,0,0.36)]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-foreground/5 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.16em] text-foreground/70">
            <Sparkles className="h-3.5 w-3.5" />
            Browser Workspace
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div>
              <h1 className="mb-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.03em]">
                {copy.title}
              </h1>
              <p className="mb-6 max-w-2xl text-[15px] leading-7 text-foreground/70">
                {copy.description}
              </p>

              <div className="rounded-3xl border border-foreground/8 bg-background-elevated p-4 shadow-minimal">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <Search className="h-4 w-4" />
                  {copy.addressLabel}
                </div>
                <form onSubmit={handleSubmit} className="flex gap-3">
                  <input
                    autoFocus
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder={copy.addressPlaceholder}
                    className="h-12 flex-1 rounded-2xl border border-foreground/8 bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/18"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-12 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-92"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    {copy.openLabel}
                  </button>
                </form>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-foreground/8 bg-background-elevated p-5 shadow-minimal">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground/85">
                  <Compass className="h-4 w-4" />
                  {copy.quickSitesLabel}
                </div>
                <p className="mb-4 text-sm leading-6 text-foreground/65">
                  {copy.quickSitesDescription}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SITES.map((site) => (
                    <button
                      key={site.label}
                      type="button"
                      onClick={() => openTarget(site.target)}
                      className="rounded-full border border-foreground/8 bg-transparent px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/4"
                    >
                      {site.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-3xl border border-foreground/8 bg-background-elevated p-5 shadow-minimal">
            <div className="mb-1 text-sm font-medium text-foreground/85">{copy.promptsLabel}</div>
            <p className="mb-4 text-sm leading-6 text-foreground/65">
              {copy.promptDescription}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {copy.promptCards.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => handlePrompt(item.prompt)}
                  className="group rounded-2xl border border-foreground/8 bg-background p-4 text-left shadow-minimal transition-colors hover:bg-foreground/[0.025]"
                >
                  <div className="mb-2 text-sm font-medium text-foreground">{item.title}</div>
                  <div className="text-sm leading-6 text-foreground/62">
                    {item.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserEmptyStateApp />
  </React.StrictMode>,
)
