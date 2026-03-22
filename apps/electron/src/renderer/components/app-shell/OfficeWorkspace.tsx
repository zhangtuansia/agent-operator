import * as React from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

function buildOfficeUrl(): string {
  return `http://127.0.0.1:19000/?desktop=1&cb=${Date.now().toString(36)}`
}

type LoadState = 'loading' | 'ready' | 'error'

export function OfficeWorkspace() {
  const { t } = useTranslation()
  const [key, setKey] = React.useState(0)
  const [src, setSrc] = React.useState(() => buildOfficeUrl())
  const [loadState, setLoadState] = React.useState<LoadState>('loading')
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout>>()

  // Listen for iframe load/error events
  const handleIframeLoad = React.useCallback(() => {
    setLoadState('ready')
  }, [])

  const handleIframeError = React.useCallback(() => {
    // Auto-retry after 3 seconds (backend may still be starting)
    retryTimerRef.current = setTimeout(() => {
      setSrc(buildOfficeUrl())
      setKey(k => k + 1)
    }, 3000)
    setLoadState('error')
  }, [])

  // Cleanup retry timer
  React.useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Reset load state when key changes (retry)
  React.useEffect(() => {
    setLoadState('loading')
  }, [key])

  const handleRetry = React.useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    setSrc(buildOfficeUrl())
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

        {/* iframe — Pixel Agents UI fills available space (it handles its own zoom/pan) */}
        <iframe
          key={key}
          src={src}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          allow="autoplay"
        />
      </div>
    </div>
  )
}
