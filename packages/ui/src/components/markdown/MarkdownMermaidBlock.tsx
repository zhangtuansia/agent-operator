import * as React from 'react'
import { renderMermaidSync } from '@agent-operator/mermaid'
import { Maximize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { MermaidPreviewOverlay } from '../overlay/MermaidPreviewOverlay'
import { useScrollFade } from './useScrollFade'

// ============================================================================
// MarkdownMermaidBlock — renders mermaid code fences as SVG diagrams.
//
// Uses @agent-operator/mermaid to parse flowchart text and produce an SVG string.
// Falls back to a plain code block if rendering fails (invalid syntax, etc).
//
// Theming: Colors are passed as CSS variable references (var(--background),
// var(--foreground), etc.) so the SVG inherits from the app's theme system
// via CSS cascade. Theme switches (light/dark, preset changes) apply
// automatically without re-rendering — the browser resolves the variables.
//
// Wide diagrams: Horizontal diagrams (graph LR) with many nodes can become
// unreadably small when fit to container width. To fix this, we enforce a
// minimum rendered height (MIN_READABLE_HEIGHT). If the natural scale would
// produce a height below this threshold, we scale up and allow horizontal
// scroll. A CSS mask gradient fades the edges to indicate scrollable content.
//
// Scaling approach: We modify the SVG element's width/height attributes
// directly (ensuring viewBox is set for proper internal scaling) instead of
// using CSS `transform: scale()`. CSS transforms don't change layout
// dimensions, which causes scrollWidth to reflect the unscaled SVG width
// and triggers oscillation loops with scroll-fade detection.
// ============================================================================

// Minimum rendered height for diagrams. Wide horizontal diagrams are scaled
// up to at least this height to keep text readable, with horizontal scroll.
const MIN_READABLE_HEIGHT = 280

// Fade zone size for scroll indicators (px)
const FADE_SIZE = 32

// Small overflow threshold — if diagram overflows by less than this, scale to fit
const SMALL_OVERFLOW_THRESHOLD = 200

/** Parse width/height from an SVG string's root element attributes. */
function parseSvgDimensions(svgString: string): { width: number; height: number } | null {
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/)
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/)
  if (!widthMatch?.[1] || !heightMatch?.[1]) return null
  return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) }
}

/**
 * Modify the SVG string's root element to have scaled width/height attributes
 * and ensure a viewBox exists so the SVG scales its internal content properly.
 * This approach changes *layout* dimensions (unlike CSS transform: scale()),
 * so scrollWidth correctly reflects the visible size.
 */
function scaleSvgString(
  svgString: string,
  naturalWidth: number,
  naturalHeight: number,
  newWidth: number,
  newHeight: number,
): string {
  let result = svgString

  // Ensure viewBox exists — if not, add one based on natural dimensions.
  // viewBox tells the SVG how to map its internal coordinate system.
  if (!/viewBox\s*=/.test(result)) {
    result = result.replace(/^<svg/, `<svg viewBox="0 0 ${naturalWidth} ${naturalHeight}"`)
  }

  // Replace width and height attributes with scaled values
  result = result.replace(/width="[\d.]+"/, `width="${newWidth}"`)
  result = result.replace(/height="[\d.]+"/, `height="${newHeight}"`)

  return result
}

export interface MarkdownMermaidBlockProps {
  code: string
  className?: string
  /** Whether to show the inline expand button. Default true.
   *  Set to false when the mermaid block is the first block in a message,
   *  where the TurnCard's own fullscreen button already occupies the same position. */
  showExpandButton?: boolean
}

export const MarkdownMermaidBlock = React.memo(function MarkdownMermaidBlock({
  code,
  className,
  showExpandButton = true,
}: MarkdownMermaidBlockProps) {
  // Render synchronously — no flash between CodeBlock and SVG.
  // Colors are CSS variable references so the SVG inherits from the app's theme
  // via CSS cascade. Theme switches apply automatically without re-rendering.
  const { svg, error } = React.useMemo(() => {
    try {
      return {
        svg: renderMermaidSync(code, {
          bg: 'var(--background)',
          fg: 'var(--foreground)',
          accent: 'var(--accent)',
          line: 'var(--foreground-30)',
          muted: 'var(--muted-foreground)',
          surface: 'var(--foreground-3)',
          border: 'var(--foreground-20)',
          transparent: true,
        }),
        error: null,
      }
    } catch (err) {
      return { svg: null, error: err instanceof Error ? err : new Error(String(err)) }
    }
  }, [code])

  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const { scrollRef, maskImage } = useScrollFade(FADE_SIZE)

  // Track container width via a separate wrapper ref to avoid having two
  // ResizeObservers on the same element (scrollRef already has one from useScrollFade).
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)
  React.useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const newWidth = Math.round(entry.contentRect.width)
        setContainerWidth(prev => prev === newWidth ? prev : newWidth)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Parse SVG dimensions once per SVG change
  const svgDims = React.useMemo(() => svg ? parseSvgDimensions(svg) : null, [svg])

  // Calculate scaled dimensions as a stable memo — only recalculates when
  // containerWidth or SVG dimensions actually change, preventing render loops.
  const scaledDims = React.useMemo(() => {
    if (!svgDims || containerWidth <= 0) return null

    const { width: svgW, height: svgH } = svgDims

    // Calculate what height we'd get if we fit to container width
    const fitToContainerScale = containerWidth / svgW
    const projectedHeight = svgH * fitToContainerScale

    // If diagram height is fine at natural size, check if width overflows
    if (projectedHeight >= MIN_READABLE_HEIGHT) {
      const overflow = svgW - containerWidth

      // Small overflow: scale to fit rather than scroll
      if (overflow > 0 && overflow < SMALL_OVERFLOW_THRESHOLD) {
        const scaledHeight = svgH * fitToContainerScale
        return { scale: fitToContainerScale, width: containerWidth, height: scaledHeight, needsScroll: false }
      }

      // Large overflow: enable scroll at natural size
      const needsScroll = overflow > 0
      return {
        scale: 1,
        width: needsScroll ? svgW : undefined,
        height: needsScroll ? svgH : undefined,
        needsScroll,
      }
    }

    // Diagram would be too small at container width.
    // Scale up to reach MIN_READABLE_HEIGHT, but cap at 100% (natural size).
    const desiredScale = MIN_READABLE_HEIGHT / svgH
    const scale = Math.min(desiredScale, 1.0)

    const scaledWidth = svgW * scale
    const scaledHeight = svgH * scale

    // Enable scroll if scaled content is wider than container (beyond threshold)
    const scaledOverflow = scaledWidth - containerWidth
    if (scaledOverflow > 0 && scaledOverflow < SMALL_OVERFLOW_THRESHOLD) {
      // Small overflow: scale to fit container
      const fitScale = containerWidth / svgW
      const fitHeight = svgH * fitScale
      return { scale: fitScale, width: containerWidth, height: fitHeight, needsScroll: false }
    }

    return {
      scale,
      width: scaledWidth,
      height: scaledHeight,
      needsScroll: scaledOverflow > 0,
    }
  }, [svgDims, containerWidth])

  // Produce the final SVG string with scaled dimensions baked in.
  // By modifying width/height attributes (instead of CSS transform), the layout
  // dimensions match the visual dimensions, eliminating scroll oscillation.
  const finalSvg = React.useMemo(() => {
    if (!svg || !svgDims || !scaledDims) return svg
    if (scaledDims.scale === 1 && !scaledDims.width) return svg

    const targetW = scaledDims.width ?? svgDims.width
    const targetH = scaledDims.height ?? svgDims.height
    return scaleSvgString(svg, svgDims.width, svgDims.height, targetW, targetH)
  }, [svg, svgDims, scaledDims])

  // On error, fall back to a plain code block showing the mermaid source
  if (error) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  // Fallback: if SVG is null (should be caught by error above, but just in case)
  if (!svg) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  return (
    <>
      {/* Wrapper with group class so the expand button shows on hover.
          Also observed by containerWidth ResizeObserver (separate from scrollRef). */}
      <div ref={wrapperRef} className={cn('relative group', className)}>
        {/* Expand button — matches code block expand button style (TurnCard pattern).
            Hidden when showExpandButton is false (first block in message, where
            TurnCard's own fullscreen button occupies the same top-right position). */}
        {showExpandButton && (
          <button
            onClick={() => setIsFullscreen(true)}
            className={cn(
              "absolute top-2 right-2 p-1 rounded-[6px] transition-all z-10 select-none",
              "opacity-0 group-hover:opacity-100",
              "bg-background shadow-minimal",
              "text-muted-foreground/50 hover:text-foreground",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100"
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
          {/* SVG container — dimensions are baked into the SVG attributes,
              so layout size matches visual size (no CSS transform needed). */}
          <div
            dangerouslySetInnerHTML={{ __html: finalSvg || svg }}
            style={{
              display: scaledDims?.width ? 'block' : 'flex',
              justifyContent: scaledDims?.width ? undefined : 'center',
              overflow: 'hidden',
            }}
          />
        </div>
      </div>

      {/* Fullscreen overlay with zoom/pan */}
      <MermaidPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        svg={svg}
        code={code}
      />
    </>
  )
})
