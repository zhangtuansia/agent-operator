import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Command as CommandPrimitive } from 'cmdk'
import { Check, DatabaseZap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { SourceAvatar } from '@/components/ui/source-avatar'
import { FreeFormInputContextBadge } from './FreeFormInputContextBadge'
import { useTranslation } from '@/i18n'
import type { LoadedSource } from '../../../../shared/types'

export interface SourceSelectorBadgeProps {
  /** Available sources (enabled only) */
  sources: LoadedSource[]
  /** Currently enabled source slugs (optimistic - managed by parent) */
  enabledSourceSlugs: string[]
  /** Callback when source selection changes (receives new slugs array) */
  onSourcesChange: (slugs: string[]) => void
  /** Whether badge is expanded (for empty session state) */
  isEmptySession?: boolean
  /** Whether the input is disabled */
  disabled?: boolean
}

/**
 * SourceSelectorBadge - Context badge for selecting which sources to query
 * Uses a portal dropdown for proper z-index handling
 *
 * Note: This component does not manage optimistic state internally.
 * The parent (FreeFormInput) manages optimistic state to share across
 * @mentions, submit logic, and this badge.
 */
export function SourceSelectorBadge({
  sources,
  enabledSourceSlugs,
  onSourcesChange,
  isEmptySession = false,
  disabled = false,
}: SourceSelectorBadgeProps) {
  const { t } = useTranslation()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const filterInputRef = React.useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null)

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.top,
        left: rect.left,
      })
      // Focus filter input after popover opens
      setTimeout(() => filterInputRef.current?.focus(), 0)
    } else {
      // Clear filter when closing
      setFilter('')
    }
    setIsOpen(!isOpen)
  }

  const handleClose = () => {
    setIsOpen(false)
    setFilter('')
  }

  const handleSelect = (slug: string) => {
    const isEnabled = enabledSourceSlugs.includes(slug)
    const newSlugs = isEnabled
      ? enabledSourceSlugs.filter(s => s !== slug)
      : [...enabledSourceSlugs, slug]
    // Parent handles optimistic update and server sync
    onSourcesChange(newSlugs)
  }

  // Build the icon based on selected sources
  const icon = enabledSourceSlugs.length === 0 ? (
    <DatabaseZap className="h-4 w-4" />
  ) : (
    <div className="flex items-center -ml-0.5">
      {(() => {
        const enabledSources = sources.filter(s => enabledSourceSlugs.includes(s.config.slug))
        const displaySources = enabledSources.slice(0, 3)
        const remainingCount = enabledSources.length - 3
        return (
          <>
            {displaySources.map((source, index) => (
              <div
                key={source.config.slug}
                className={cn("relative h-5 w-5 rounded-[4px] bg-background shadow-minimal flex items-center justify-center", index > 0 && "-ml-1")}
                style={{ zIndex: index + 1 }}
              >
                <SourceAvatar source={source} size="xs" />
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                className="-ml-1 h-5 w-5 rounded-[4px] bg-background shadow-minimal flex items-center justify-center text-[8px] font-medium text-muted-foreground"
                style={{ zIndex: displaySources.length + 1 }}
              >
                +{remainingCount}
              </div>
            )}
          </>
        )
      })()}
    </div>
  )

  // Build the label based on selected sources
  const label = enabledSourceSlugs.length === 0
    ? t('input.chooseSources')
    : (() => {
        const enabledSources = sources.filter(s => enabledSourceSlugs.includes(s.config.slug))
        if (enabledSources.length === 1) return enabledSources[0].config.name
        if (enabledSources.length === 2) return enabledSources.map(s => s.config.name).join(', ')
        return t('input.nSources').replace('{n}', String(enabledSources.length))
      })()

  return (
    <div className="relative">
      <FreeFormInputContextBadge
        buttonRef={buttonRef}
        icon={icon}
        label={label}
        isExpanded={isEmptySession}
        hasSelection={enabledSourceSlugs.length > 0}
        showChevron={true}
        isOpen={isOpen}
        disabled={disabled}
        data-tutorial="source-selector-button"
        onClick={handleToggle}
        tooltip={t('sidebar.sources')}
      />
      {isOpen && position && ReactDOM.createPortal(
        <>
          <div
            className="fixed inset-0 z-floating-backdrop"
            onClick={handleClose}
          />
          <div
            className="fixed z-floating-menu min-w-[200px] overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small"
            style={{
              top: position.top - 8,
              left: position.left,
              transform: 'translateY(-100%)',
            }}
          >
            {sources.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3">
                {t('sources.noSourcesConfigured')}
                <br />
                {t('sources.addSourcesInSettings')}
              </div>
            ) : (
              <CommandPrimitive
                className="min-w-[200px]"
                shouldFilter={false}
              >
                <div className="border-b border-border/50 px-3 py-2">
                  <CommandPrimitive.Input
                    ref={filterInputRef}
                    value={filter}
                    onValueChange={setFilter}
                    placeholder={t('sources.searchSources')}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <CommandPrimitive.List className="max-h-[240px] overflow-y-auto p-1">
                  {sources
                    .filter(source => source.config.name.toLowerCase().includes(filter.toLowerCase()))
                    .map((source, index) => {
                      const isEnabled = enabledSourceSlugs.includes(source.config.slug)
                      return (
                        <CommandPrimitive.Item
                          key={source.config.slug}
                          value={source.config.slug}
                          data-tutorial={index === 0 ? "source-dropdown-item-first" : undefined}
                          onSelect={() => handleSelect(source.config.slug)}
                          className={cn(
                            "flex cursor-pointer select-none items-center gap-3 rounded-[6px] px-3 py-2 text-[13px]",
                            "outline-none data-[selected=true]:bg-foreground/5",
                            isEnabled && "bg-foreground/3"
                          )}
                        >
                          <div className="shrink-0 text-muted-foreground flex items-center">
                            <SourceAvatar
                              source={source}
                              size="sm"
                            />
                          </div>
                          <div className="flex-1 min-w-0 truncate">{source.config.name}</div>
                          <div className={cn(
                            "shrink-0 h-4 w-4 rounded-full bg-current flex items-center justify-center",
                            !isEnabled && "opacity-0"
                          )}>
                            <Check className="h-2.5 w-2.5 text-white dark:text-black" strokeWidth={3} />
                          </div>
                        </CommandPrimitive.Item>
                      )
                    })}
                </CommandPrimitive.List>
              </CommandPrimitive>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
