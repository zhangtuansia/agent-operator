/**
 * MarkdownHtmlBlock - Renders ```html-preview blocks as sandboxed HTML previews.
 *
 * Supports single `src` or `items[]` payloads.
 */

import * as React from 'react'
import { Globe, Maximize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { HTMLPreviewOverlay } from '../overlay/HTMLPreviewOverlay'
import { ItemNavigator } from '../overlay/ItemNavigator'
import { usePlatform } from '../../context/PlatformContext'

interface PreviewItem {
  src: string
  label?: string
}

interface HtmlPreviewSpec {
  src?: string
  title?: string
  items?: PreviewItem[]
}

class HtmlBlockErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[MarkdownHtmlBlock] Render failed, falling back to CodeBlock:', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

function injectBaseTarget(html: string): string {
  if (/<base\s/i.test(html)) return html
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, '$1<base target="_top">')
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/(<html[^>]*>)/i, '$1<head><base target="_top"></head>')
  }
  return `<head><base target="_top"></head>${html}`
}

export interface MarkdownHtmlBlockProps {
  code: string
  className?: string
}

export function MarkdownHtmlBlock({ code, className }: MarkdownHtmlBlockProps) {
  const { onReadFile } = usePlatform()

  const spec = React.useMemo<HtmlPreviewSpec | null>(() => {
    try {
      const raw = JSON.parse(code)
      if (raw.items && Array.isArray(raw.items) && raw.items.length > 0) {
        return raw as HtmlPreviewSpec
      }
      if (raw.src && typeof raw.src === 'string') {
        return raw as HtmlPreviewSpec
      }
      return null
    } catch {
      return null
    }
  }, [code])

  const items = React.useMemo<PreviewItem[]>(() => {
    if (!spec) return []
    if (spec.items && spec.items.length > 0) return spec.items
    if (spec.src) return [{ src: spec.src }]
    return []
  }, [spec])

  const [activeIndex, setActiveIndex] = React.useState(0)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [contentCache, setContentCache] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const activeItem = items[activeIndex]
  const activeHtml = activeItem ? contentCache[activeItem.src] : undefined

  React.useEffect(() => {
    if (!activeItem?.src || !onReadFile) return
    if (contentCache[activeItem.src]) {
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    onReadFile(activeItem.src)
      .then((content) => {
        setContentCache((prev) => ({ ...prev, [activeItem.src]: content }))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to read HTML file')
      })
      .finally(() => setLoading(false))
  }, [activeItem?.src, onReadFile, contentCache])

  const processedCache = React.useMemo(() => {
    const result: Record<string, string> = {}
    for (const [src, html] of Object.entries(contentCache)) {
      result[src] = injectBaseTarget(html)
    }
    return result
  }, [contentCache])

  const hasCachedContent = Object.keys(contentCache).length > 0
  const hasMultiple = items.length > 1

  const handleLoadContent = React.useCallback(async (src: string) => {
    if (contentCache[src]) return contentCache[src]
    if (!onReadFile) throw new Error('Cannot load content')
    const content = await onReadFile(src)
    setContentCache((prev) => ({ ...prev, [src]: content }))
    return content
  }, [contentCache, onReadFile])

  if (!spec || items.length === 0) {
    return <CodeBlock code={code} language="json" mode="full" className={className} />
  }

  const fallback = <CodeBlock code={code} language="json" mode="full" className={className} />

  return (
    <HtmlBlockErrorBoundary fallback={fallback}>
      <div className={cn('relative group rounded-[8px] overflow-hidden border bg-muted/10', className)}>
        <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[12px] text-muted-foreground font-medium flex-1">
            {spec.title || 'HTML Preview'}
          </span>
          <div className="flex items-center gap-1">
            <ItemNavigator items={items} activeIndex={activeIndex} onSelect={setActiveIndex} />
            <button
              onClick={() => setIsFullscreen(true)}
              className={cn(
                'p-1 rounded-[6px] transition-all select-none',
                'bg-background shadow-minimal',
                'text-muted-foreground/50 hover:text-foreground',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100',
                hasMultiple ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              title="View Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative max-h-[400px] overflow-hidden">
          {items.map((item, i) => {
            const processed = processedCache[item.src]
            if (!processed) return null
            return (
              <iframe
                key={item.src}
                sandbox="allow-same-origin allow-top-navigation-by-user-activation"
                srcDoc={processed}
                title={item.label || spec.title || 'HTML Preview'}
                className="w-full border-0 bg-white"
                style={{
                  height: '400px',
                  display: i === activeIndex ? 'block' : 'none',
                }}
              />
            )
          })}

          {!activeHtml && loading && (
            <div className="py-8 text-center text-muted-foreground text-[13px]">Loading...</div>
          )}

          {!activeHtml && !loading && error && (
            <div className="py-6 text-center text-destructive/70 text-[13px]">{error}</div>
          )}

          {hasCachedContent && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
              style={{
                background: 'linear-gradient(to bottom, transparent, var(--muted))',
              }}
            />
          )}
        </div>
      </div>

      <HTMLPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        items={items}
        contentCache={contentCache}
        onLoadContent={handleLoadContent}
        initialIndex={activeIndex}
        title={spec.title}
      />
    </HtmlBlockErrorBoundary>
  )
}
