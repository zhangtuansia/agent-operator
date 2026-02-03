import * as React from 'react'
import { exportToSvg } from '@excalidraw/excalidraw'
import { Maximize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { ExcalidrawPreviewOverlay } from '../overlay/ExcalidrawPreviewOverlay'

// ============================================================================
// MarkdownExcalidrawBlock — renders Excalidraw JSON code fences as SVG diagrams.
//
// Uses @excalidraw/excalidraw to export the scene as an SVG string.
// Falls back to a plain code block if rendering fails (invalid JSON, etc).
//
// Wide diagrams: Horizontal drawings can become unreadably small when fit to
// container width. To fix this, we enforce a minimum rendered height
// (MIN_READABLE_HEIGHT). If the natural scale would produce a height below this
// threshold, we scale up and allow horizontal scroll. A CSS mask gradient fades
// the edges to indicate scrollable content.
// ============================================================================

// Cap inline preview height so large canvases don't dominate the layout.
const MAX_INLINE_HEIGHT = 260

// Fade zone size for scroll indicators (px)
const FADE_SIZE = 32

// Small overflow threshold — if diagram overflows by less than this, scale to fit
const SMALL_OVERFLOW_THRESHOLD = 80

/** Parse width/height from an SVG string's root element attributes. */
function parseSvgDimensions(svgString: string): { width: number; height: number } | null {
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/)
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/)
  if (!widthMatch?.[1] || !heightMatch?.[1]) return null
  return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) }
}

interface ParsedExcalidraw {
  elements: unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

function parseExcalidraw(code: string): ParsedExcalidraw | null {
  try {
    const parsed = JSON.parse(code) as unknown

    if (Array.isArray(parsed)) {
      return { elements: parsed, appState: {}, files: {} }
    }

    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>
      const elements = Array.isArray(data.elements) ? data.elements : null
      if (!elements) return null

      const appState = (data.appState && typeof data.appState === 'object')
        ? (data.appState as Record<string, unknown>)
        : {}
      const files = (data.files && typeof data.files === 'object')
        ? (data.files as Record<string, unknown>)
        : {}

      return { elements, appState, files }
    }

    return null
  } catch {
    return null
  }
}

export interface MarkdownExcalidrawBlockProps {
  code: string
  className?: string
  /** Whether to show the inline expand button. Default true.
   *  Set to false when the excalidraw block is the first block in a message,
   *  where the TurnCard's own fullscreen button already occupies the same position. */
  showExpandButton?: boolean
}

export function MarkdownExcalidrawBlock({
  code,
  className,
  showExpandButton = true,
}: MarkdownExcalidrawBlockProps) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<Error | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  // Scroll state for fade indicators
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const parsed = parseExcalidraw(code)
    if (!parsed) {
      setError(new Error('Invalid Excalidraw JSON'))
      setSvg(null)
      return () => { cancelled = true }
    }

    setError(null)

    ;(async () => {
      try {
        const files = Object.keys(parsed.files).length > 0 ? parsed.files : null
        const svgElement = await exportToSvg({
          elements: parsed.elements as any,
          appState: parsed.appState as any,
          files: files as any,
        })

        if (!cancelled) {
          setSvg(svgElement.outerHTML)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setSvg(null)
        }
      }
    })()

    return () => { cancelled = true }
  }, [code])

  // Track horizontal scroll state for fade indicators.
  // Updates on scroll events and container resize.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || !svg) return

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el
      setCanScrollLeft(scrollLeft > 1) // 1px threshold to avoid float rounding
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
    }

    // Initial check and listeners
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })

    // ResizeObserver catches container width changes (e.g., window resize)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      resizeObserver.disconnect()
    }
  }, [svg])

  // Calculate scaled dimensions for wide diagrams.
  // If the natural height at container width would be below MIN_READABLE_HEIGHT,
  // scale up to reach that height — but never exceed 100% (natural size).
  // This prevents small diagrams from being over-zoomed and pixelated.
  const getScaledDimensions = React.useCallback(() => {
    if (!svg) return null

    const dims = parseSvgDimensions(svg)
    if (!dims) return null

    const containerWidth = scrollRef.current?.clientWidth ?? 600

    const fitScale = Math.min(1, containerWidth / dims.width)
    let scale = fitScale

    // Always fit to container width for inline previews.
    let scaledWidth = dims.width * scale
    let scaledHeight = dims.height * scale

    // If the fitted height is still too tall, scale down further.
    if (scaledHeight > MAX_INLINE_HEIGHT) {
      const heightScale = MAX_INLINE_HEIGHT / scaledHeight
      scale *= heightScale
      scaledWidth = dims.width * scale
      scaledHeight = dims.height * scale
    }

    // If we barely overflow due to rounding, snap to fit width.
    const overflow = scaledWidth - containerWidth
    if (overflow > 0 && overflow < SMALL_OVERFLOW_THRESHOLD) {
      scale = fitScale
      scaledWidth = dims.width * scale
      scaledHeight = dims.height * scale
    }

    const needsScroll = scaledWidth > containerWidth + 1
    const shouldSetSize = needsScroll || scale !== 1

    return {
      scale,
      width: shouldSetSize ? scaledWidth : undefined,
      height: shouldSetSize ? scaledHeight : undefined,
      needsScroll,
    }
  }, [svg])

  // Build CSS mask gradient based on scroll state
  const getMaskImage = React.useCallback(() => {
    if (canScrollLeft && canScrollRight) {
      return `linear-gradient(to right, transparent, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent)`
    }
    if (canScrollRight) {
      return `linear-gradient(to right, black calc(100% - ${FADE_SIZE}px), transparent)`
    }
    if (canScrollLeft) {
      return `linear-gradient(to right, transparent, black ${FADE_SIZE}px)`
    }
    return undefined
  }, [canScrollLeft, canScrollRight])

  // On error, fall back to a plain code block showing the Excalidraw JSON
  if (error) {
    return <CodeBlock code={code} language="excalidraw" mode="full" className={className} />
  }

  // Loading state: show the code block until SVG is ready
  if (!svg) {
    return <CodeBlock code={code} language="excalidraw" mode="full" className={className} />
  }

  const scaledDims = getScaledDimensions()
  const maskImage = getMaskImage()

  // Scaling mode: when dimensions are provided OR scale !== 1
  // This is separate from needsScroll — we may scale to fit without scrolling
  const needsScaling = scaledDims && (scaledDims.width != null || scaledDims.scale !== 1)

  return (
    <>
      {/* Wrapper with group class so the expand button shows on hover */}
      <div className={cn('relative group', className)}>
        {/* Expand button — matches code block expand button style (TurnCard pattern).
            Hidden when showExpandButton is false (first block in message, where
            TurnCard's own fullscreen button occupies the same top-right position). */}
        {showExpandButton && (
          <button
            onClick={() => setIsFullscreen(true)}
            className={cn(
              'absolute top-2 right-2 p-1 rounded-[6px] transition-all z-10 select-none',
              'opacity-0 group-hover:opacity-100',
              'bg-background shadow-minimal',
              'text-muted-foreground/50 hover:text-foreground',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100'
            )}
            title="View Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Scroll container with fade mask for overflow indication.
            CSS mask gradient fades the edges when content is scrollable. */}
        <div
          ref={scrollRef}
          style={{
            overflowX: 'auto',
            overflowY: 'hidden',
            maskImage,
            WebkitMaskImage: maskImage,
          }}
        >
          {/* Size wrapper — uses explicit dimensions when scaling or scrolling.
              Block display for scaled/scrolling content, flex center for natural fit. */}
          <div
            style={{
              width: needsScaling && scaledDims?.width ? `${scaledDims.width}px` : undefined,
              height: needsScaling && scaledDims?.height ? `${scaledDims.height}px` : undefined,
              display: needsScaling ? 'block' : 'flex',
              justifyContent: needsScaling ? undefined : 'center',
              margin: needsScaling && !scaledDims?.needsScroll ? '0 auto' : undefined,
            }}
          >
            {/* SVG container — CSS transform scales the SVG visually.
                transform-origin: top left ensures scaling expands down and right. */}
            <div
              dangerouslySetInnerHTML={{ __html: svg }}
              style={{
                transformOrigin: 'top left',
                transform: scaledDims && scaledDims.scale !== 1 ? `scale(${scaledDims.scale})` : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay with zoom/pan */}
      <ExcalidrawPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        svg={svg}
        code={code}
      />
    </>
  )
}
