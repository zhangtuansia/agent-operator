import * as React from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        allowpopups?: string
      }
    }
  }
}

async function buildOfficeUrl(): Promise<string | null> {
  const baseUrl = await window.electronAPI.getOfficeServerUrl()
  if (!baseUrl) return null
  return `${baseUrl}/?desktop=1&cb=${Date.now().toString(36)}`
}

type LoadState = 'loading' | 'ready' | 'error'
type OfficeWebview = HTMLElement & {
  reload: () => void
  src: string
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
}

export function OfficeWorkspace() {
  const { t } = useTranslation()
  const [key, setKey] = React.useState(0)
  const [src, setSrc] = React.useState<string>('')
  const [loadState, setLoadState] = React.useState<LoadState>('loading')
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  const webviewRef = React.useRef<OfficeWebview | null>(null)

  const handleLoadError = React.useCallback(() => {
    // Auto-retry after 3 seconds (backend may still be starting)
    retryTimerRef.current = setTimeout(() => {
      void buildOfficeUrl().then((nextUrl) => {
        if (!nextUrl) {
          setLoadState('error')
          return
        }
        setSrc(nextUrl)
        setKey(k => k + 1)
      })
    }, 3000)
    setLoadState('error')
  }, [])

  React.useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleFinishLoad = () => setLoadState('ready')
    const handleFailLoad = () => handleLoadError()

    webview.addEventListener('did-finish-load', handleFinishLoad)
    webview.addEventListener('did-fail-load', handleFailLoad)

    return () => {
      webview.removeEventListener('did-finish-load', handleFinishLoad)
      webview.removeEventListener('did-fail-load', handleFailLoad)
    }
  }, [src, key, handleLoadError])

  // Cleanup retry timer
  React.useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Reset load state when key changes (retry)
  React.useEffect(() => {
    setLoadState('loading')
    let mounted = true
    void buildOfficeUrl().then((nextUrl) => {
      if (!mounted) return
      if (!nextUrl) {
        setLoadState('error')
        return
      }
      setSrc(nextUrl)
    })
    return () => {
      mounted = false
    }
  }, [key])

  const handleRetry = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    setKey(k => k + 1)
  }, [])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 min-h-[40px] border-b border-border/50">
        <span className="text-sm font-medium">{t('sidebar.office') ?? '办公室'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleRetry}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content — Pixel Agents fills the entire available space */}
      <div className="flex-1 min-h-0 w-full overflow-hidden bg-black relative">
        {/* Loading overlay */}
        {loadState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
            <div className="flex flex-col items-center gap-3 text-white/70">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">办公室启动中...</span>
            </div>
          </div>
        )}

        {/* webview — Pixel Agents UI runs in its own guest page process */}
        {src ? (
          <webview
            key={key}
            ref={node => {
              webviewRef.current = node as OfficeWebview | null
            }}
            src={src}
            allowpopups="false"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
