import type { ReactNode } from 'react'
import { BrowserControls } from '@agent-operator/ui'
import { cn } from '@/lib/utils'

interface BrowserToolbarProps {
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  onNavigate: (url: string) => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onStop: () => void
  compact?: boolean
  trailingContent?: ReactNode
  themeColor?: string | null
  className?: string
  urlBarClassName?: string
}

export function BrowserToolbar({
  url,
  isLoading,
  canGoBack,
  canGoForward,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  compact = false,
  trailingContent,
  themeColor,
  className,
  urlBarClassName,
}: BrowserToolbarProps) {
  return (
    <BrowserControls
      url={url}
      loading={isLoading}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onNavigate={onNavigate}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onReload={onReload}
      onStop={onStop}
      compact={compact}
      showProgressBar={!compact}
      trailingContent={trailingContent}
      themeColor={themeColor}
      urlBarClassName={urlBarClassName}
      className={cn(
        compact
          ? 'h-auto min-w-0 rounded-[8px] border border-foreground/10 bg-background/70 px-1.5 py-0.5'
          : 'titlebar-drag-region bg-background',
        className,
      )}
    />
  )
}
