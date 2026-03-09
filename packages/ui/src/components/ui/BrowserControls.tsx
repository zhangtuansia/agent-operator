import {
  useState,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ChevronLeft, ChevronRight, RotateCw, X, Globe } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../../lib/utils'
import { Spinner } from './LoadingIndicator'

interface NavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

const NavButton = forwardRef<HTMLButtonElement, NavButtonProps>(
  ({ children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-[6px]',
        'hover:bg-foreground/5 focus:outline-none focus-visible:ring-0',
        'disabled:opacity-30 disabled:pointer-events-none',
        'transition-colors duration-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)
NavButton.displayName = 'NavButton'

export interface BrowserControlsProps {
  url?: string
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onNavigate?: (url: string) => void
  onGoBack?: () => void
  onGoForward?: () => void
  onReload?: () => void
  onStop?: () => void
  onUrlChange?: (url: string) => void
  compact?: boolean
  leadingContent?: ReactNode
  trailingContent?: ReactNode
  showProgressBar?: boolean
  urlBarClassName?: string
  leftClearance?: number
  themeColor?: string | null
  className?: string
}

const SAFE_CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\([^;{}]*\))$/i

function safeCssColor(color: string | null | undefined): string | null {
  if (!color) return null
  const trimmed = color.trim()
  if (!trimmed || !SAFE_CSS_COLOR_RE.test(trimmed)) return null
  return trimmed
}

function colorLuminance(color: string): number | null {
  let r: number
  let g: number
  let b: number

  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(color)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (!hex) return null

    if (hex.length === 3) {
      r = Number.parseInt(hex.charAt(0).repeat(2), 16)
      g = Number.parseInt(hex.charAt(1).repeat(2), 16)
      b = Number.parseInt(hex.charAt(2).repeat(2), 16)
    } else if (hex.length >= 6) {
      r = Number.parseInt(hex.slice(0, 2), 16)
      g = Number.parseInt(hex.slice(2, 4), 16)
      b = Number.parseInt(hex.slice(4, 6), 16)
    } else {
      return null
    }
  } else {
    const rgbMatch = color.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
    if (!rgbMatch) return null

    const rStr = rgbMatch[1]
    const gStr = rgbMatch[2]
    const bStr = rgbMatch[3]
    if (!rStr || !gStr || !bStr) return null

    r = Number(rStr)
    g = Number(gStr)
    b = Number(bStr)
  }

  const toLinear = (value: number) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function BrowserControls({
  url: controlledUrl,
  loading = false,
  canGoBack = false,
  canGoForward = false,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  onUrlChange,
  compact = false,
  leadingContent,
  trailingContent,
  showProgressBar = true,
  urlBarClassName,
  themeColor,
  className,
}: BrowserControlsProps) {
  const [localUrl, setLocalUrl] = useState(controlledUrl ?? '')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isFocused && controlledUrl != null) {
      setLocalUrl(controlledUrl === 'about:blank' ? '' : controlledUrl)
    }
  }, [controlledUrl, isFocused])

  const handleSubmit = useCallback((event: FormEvent) => {
    event.preventDefault()
    const trimmed = localUrl.trim()
    if (!trimmed) return
    onNavigate?.(trimmed)
    inputRef.current?.blur()
  }, [localUrl, onNavigate])

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setLocalUrl(value)
    onUrlChange?.(value)
  }, [onUrlChange])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (controlledUrl != null) {
      setLocalUrl(controlledUrl === 'about:blank' ? '' : controlledUrl)
    }
    inputRef.current?.blur()
  }, [controlledUrl])

  const safeThemeColor = safeCssColor(themeColor)
  const themeLum = safeThemeColor ? colorLuminance(safeThemeColor) : null
  const isDarkBg = themeLum != null && themeLum < 0.4

  const reloadButton = (
    <NavButton
      aria-label={loading ? 'Stop loading' : 'Reload'}
      onClick={loading ? onStop : onReload}
    >
      {loading ? (
        <X
          className="h-[16px] w-[16px] text-foreground/70"
          style={safeThemeColor ? { color: 'var(--tb-fg)' } : undefined}
          strokeWidth={1.8}
        />
      ) : (
        <RotateCw
          className="h-[15px] w-[15px] text-foreground/70"
          style={safeThemeColor ? { color: 'var(--tb-fg)' } : undefined}
          strokeWidth={1.8}
        />
      )}
    </NavButton>
  )

  const urlForm = (
    <form className="flex-1 min-w-0" onSubmit={handleSubmit}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={localUrl}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or search..."
          className={cn(
            'w-full rounded-[8px] bg-transparent px-3 pl-8 text-[13px] text-foreground/70 outline-none transition-all',
            compact ? 'h-[28px]' : 'h-[30px]',
            !safeThemeColor && (isFocused
              ? 'bg-background border border-transparent shadow-minimal'
              : 'border border-foreground/5'),
            safeThemeColor && 'border border-transparent',
          )}
          style={safeThemeColor ? {
            color: isFocused ? (isDarkBg ? '#fff' : '#000') : 'var(--tb-fg)',
            borderColor: 'var(--tb-input-border)',
            ...(isFocused ? { boxShadow: '0 0 0 1.5px var(--tb-focus-ring)' } : {}),
          } : undefined}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <span className="absolute inset-y-0 left-3 flex items-center justify-center">
          {loading ? (
            <span
              className="flex items-center justify-center h-3.5 w-3.5"
              style={safeThemeColor ? { color: isFocused ? 'var(--tb-fg)' : 'var(--tb-fg-muted)' } : undefined}
            >
              <Spinner className="text-[11px] text-foreground/40" />
            </span>
          ) : (
            <Globe
              className="h-3.5 w-3.5 text-foreground/30"
              style={safeThemeColor ? { color: isFocused ? 'var(--tb-fg)' : 'var(--tb-fg-muted)' } : undefined}
            />
          )}
        </span>
      </div>
    </form>
  )

  const progressBar = showProgressBar && (
    <AnimatePresence>
      {loading && (
        <motion.div
          className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent"
          style={{ backgroundSize: '220% 100%' }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 0.9,
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.2, ease: 'easeOut' },
            backgroundPosition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      )}
    </AnimatePresence>
  )

  return (
    <div
      className={cn(
        'relative flex items-center gap-1',
        compact ? 'h-[40px] px-2' : 'h-[48px] border-b border-foreground/6 px-3',
        className,
      )}
      data-themed={safeThemeColor ? '' : undefined}
      style={{
        ...(safeThemeColor ? {
          backgroundColor: safeThemeColor,
          borderColor: isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          '--tb-fg': isDarkBg ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)',
          '--tb-fg-muted': isDarkBg ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
          '--tb-hover': isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
          '--tb-input-border': isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
          '--tb-focus-ring': isDarkBg ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)',
        } : {}),
        transition: 'background-color 200ms ease, border-color 200ms ease',
      } as CSSProperties}
    >
      {safeThemeColor && (
        <style dangerouslySetInnerHTML={{ __html: `
          [data-themed] button:hover:not(:disabled) { background: var(--tb-hover) !important; }
        ` }}
        />
      )}
      {leadingContent}

      <NavButton aria-label="Back" disabled={!canGoBack} onClick={onGoBack} style={safeThemeColor ? { color: 'var(--tb-fg)' } : undefined}>
        <ChevronLeft className="h-[18px] w-[18px] text-foreground/70" style={safeThemeColor ? { color: 'inherit' } : undefined} strokeWidth={1.5} />
      </NavButton>
      <NavButton aria-label="Forward" disabled={!canGoForward} onClick={onGoForward} style={safeThemeColor ? { color: 'var(--tb-fg)' } : undefined}>
        <ChevronRight className="h-[18px] w-[18px] text-foreground/70" style={safeThemeColor ? { color: 'inherit' } : undefined} strokeWidth={1.5} />
      </NavButton>

      <div className="flex-1 flex items-center min-w-0">
        <div className={cn('mx-auto flex items-center gap-1 w-full', urlBarClassName)}>
          {reloadButton}
          {urlForm}
        </div>
      </div>

      {trailingContent}
      {progressBar}
    </div>
  )
}
