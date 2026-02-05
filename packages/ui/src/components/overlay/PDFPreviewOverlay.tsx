/**
 * PDFPreviewOverlay - In-app PDF preview using Mozilla's pdf.js via react-pdf.
 *
 * Renders PDFs using the react-pdf library, which wraps pdfjs-dist.
 * This is more reliable than <embed> for Electron apps (see GitHub issues
 * electron#11065, electron#33094, electron#33519).
 *
 * The PDF is loaded from a Uint8Array (via IPC) and rendered to canvas.
 * The pdf.js worker handles decoding and rendering in a background thread.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { PreviewOverlay } from './PreviewOverlay'
import { CopyButton } from './CopyButton'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { FullscreenOverlayBaseHeaderTranslations } from './FullscreenOverlayBaseHeader'

// Configure pdf.js worker using Vite's ?url import for cross-platform dev/prod compatibility
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface PDFPreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  /** Absolute file path for the PDF */
  filePath: string
  /** Async loader that returns PDF data as Uint8Array */
  loadPdfData: (path: string) => Promise<Uint8Array>
  theme?: 'light' | 'dark'
  /** Optional localized strings */
  translations?: {
    previousPage?: string
    nextPage?: string
    copyPath?: string
    loadFailed?: string
    loading?: string
    rendering?: string
  }
  /** Optional localized strings for overlay header/menu */
  headerTranslations?: FullscreenOverlayBaseHeaderTranslations
}

export function PDFPreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadPdfData,
  theme = 'light',
  translations,
  headerTranslations,
}: PDFPreviewOverlayProps) {
  const t = {
    previousPage: translations?.previousPage ?? 'Previous page',
    nextPage: translations?.nextPage ?? 'Next page',
    copyPath: translations?.copyPath ?? 'Copy path',
    loadFailed: translations?.loadFailed ?? 'Load Failed',
    loading: translations?.loading ?? 'Loading PDF...',
    rendering: translations?.rendering ?? 'Rendering...',
  }
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load PDF data when overlay opens
  useEffect(() => {
    if (!isOpen || !filePath) return

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setPdfData(null)
    setPageNumber(1)
    setNumPages(0)

    loadPdfData(filePath)
      .then((data) => {
        if (!cancelled) {
          setPdfData(data)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t.loadFailed)
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [isOpen, filePath, loadPdfData])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    setError(`${t.loadFailed}: ${error.message}`)
  }, [t.loadFailed])

  const goToPrevPage = useCallback(() => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => Math.min(numPages, prev + 1))
  }, [numPages])

  // Memoize file object to prevent unnecessary re-renders (react-pdf uses === equality)
  const fileObj = useMemo(() =>
    pdfData ? { data: pdfData } : null,
    [pdfData]
  )

  // Header actions: page navigation + copy button
  const headerActions = (
    <div className="flex items-center gap-2">
      {numPages > 0 && (
        <>
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-foreground/5 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.previousPage}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-foreground/5 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.nextPage}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-foreground/10 mx-1" />
        </>
      )}
      <CopyButton content={filePath} title={t.copyPath} />
    </div>
  )

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      typeBadge={{
        icon: FileText,
        label: 'PDF',
        variant: 'orange',
      }}
      filePath={filePath}
      error={error ? { label: t.loadFailed, message: error } : undefined}
      headerActions={headerActions}
      headerTranslations={headerTranslations}
    >
      <div className="h-full flex flex-col items-center justify-center overflow-auto">
        {isLoading && (
          <div className="text-muted-foreground text-sm">{t.loading}</div>
        )}
        {fileObj && (
          <Document
            file={fileObj}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<div className="text-muted-foreground text-sm">{t.rendering}</div>}
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="pdf-page"
            />
          </Document>
        )}
      </div>
    </PreviewOverlay>
  )
}
