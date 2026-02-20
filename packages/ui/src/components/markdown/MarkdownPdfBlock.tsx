/**
 * MarkdownPdfBlock - Renders ```pdf-preview blocks as inline PDF previews.
 *
 * Supports single `src` or `items[]` payloads.
 */

import * as React from 'react'
import { FileText, Maximize2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { PDFPreviewOverlay } from '../overlay/PDFPreviewOverlay'
import { ItemNavigator } from '../overlay/ItemNavigator'
import { usePlatform } from '../../context/PlatformContext'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PreviewItem {
  src: string
  label?: string
}

interface PdfPreviewSpec {
  src?: string
  title?: string
  items?: PreviewItem[]
}

class PdfBlockErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[MarkdownPdfBlock] Render failed, falling back to CodeBlock:', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export interface MarkdownPdfBlockProps {
  code: string
  className?: string
}

export function MarkdownPdfBlock({ code, className }: MarkdownPdfBlockProps) {
  const { onReadFileBinary } = usePlatform()

  const spec = React.useMemo<PdfPreviewSpec | null>(() => {
    try {
      const raw = JSON.parse(code)
      if (raw.items && Array.isArray(raw.items) && raw.items.length > 0) {
        return raw as PdfPreviewSpec
      }
      if (raw.src && typeof raw.src === 'string') {
        return raw as PdfPreviewSpec
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
  const [contentCache, setContentCache] = React.useState<Record<string, Uint8Array>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const activeItem = items[activeIndex]
  const activePdfData = activeItem ? contentCache[activeItem.src] : undefined

  React.useEffect(() => {
    if (!activeItem?.src || !onReadFileBinary) return
    if (contentCache[activeItem.src]) {
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    onReadFileBinary(activeItem.src)
      .then((data) => {
        setContentCache((prev) => ({ ...prev, [activeItem.src]: new Uint8Array(data) }))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to read PDF file')
      })
      .finally(() => setLoading(false))
  }, [activeItem?.src, onReadFileBinary, contentCache])

  const fileObjsRef = React.useRef<Record<string, { data: Uint8Array }>>({})
  for (const [src, data] of Object.entries(contentCache)) {
    if (!fileObjsRef.current[src]) {
      fileObjsRef.current[src] = { data: new Uint8Array(data) }
    }
  }

  const activeFileObj = activeItem ? fileObjsRef.current[activeItem.src] : undefined

  const loadPdfData = React.useCallback(async (path: string) => {
    if (contentCache[path]) return new Uint8Array(contentCache[path])
    if (!onReadFileBinary) throw new Error('Cannot load PDF')
    return onReadFileBinary(path)
  }, [contentCache, onReadFileBinary])

  const hasMultiple = items.length > 1

  if (!spec || items.length === 0 || !onReadFileBinary) {
    return <CodeBlock code={code} language="json" mode="full" className={className} />
  }

  const fallback = <CodeBlock code={code} language="json" mode="full" className={className} />

  return (
    <PdfBlockErrorBoundary fallback={fallback}>
      <div className={cn('relative group rounded-[8px] overflow-hidden border bg-muted/10', className)}>
        <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[12px] text-muted-foreground font-medium flex-1">
            {spec.title || 'PDF Preview'}
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

        <div className="relative h-[400px] overflow-hidden">
          {activeFileObj && (
            <div className="flex items-start justify-center bg-white p-4">
              <Document
                file={activeFileObj}
                loading={<div className="py-8 text-center text-muted-foreground text-[13px]">Rendering...</div>}
                error={<div className="py-6 text-center text-destructive/70 text-[13px]">Failed to render PDF</div>}
              >
                <Page
                  pageNumber={1}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  width={500}
                />
              </Document>
            </div>
          )}

          {!activePdfData && loading && (
            <div className="py-8 text-center text-muted-foreground text-[13px]">Loading...</div>
          )}

          {!activePdfData && !loading && error && (
            <div className="py-6 text-center text-destructive/70 text-[13px]">{error}</div>
          )}

          {activePdfData && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
              style={{
                background: 'linear-gradient(to bottom, transparent, var(--muted))',
                zIndex: 3,
              }}
            />
          )}
        </div>
      </div>

      <PDFPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        filePath={activeItem!.src}
        items={items}
        initialIndex={activeIndex}
        loadPdfData={loadPdfData}
      />
    </PdfBlockErrorBoundary>
  )
}
