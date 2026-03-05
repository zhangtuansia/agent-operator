/**
 * EntityList — Reusable container for rendering a scrollable list of EntityRow items.
 *
 * Handles:
 * - ScrollArea wrapping with proper padding
 * - Optional grouped layout with section headers
 * - Empty state rendering (centered, outside ScrollArea)
 * - Header (e.g. search bar) and footer (e.g. infinite scroll sentinel) slots
 *
 * Domain-specific logic (filtering, keyboard nav, multi-select) lives in the consumer.
 */

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface EntityListGroup<T> {
  /** Unique key for the group */
  key: string
  /** Label shown in the section header */
  label: string
  /** Items in this group */
  items: T[]
  /** Whether this group can be collapsed */
  collapsible?: boolean
  /** Whether this group is currently collapsed */
  collapsed?: boolean
  /** Optional total item count (used for collapsed summary) */
  itemCount?: number
}

export interface EntityListProps<T> {
  /** Flat item list (used when not grouped) */
  items?: T[]
  /** Grouped items with section headers (takes precedence over items) */
  groups?: EntityListGroup<T>[]
  /** Render function for each item */
  renderItem: (item: T, index: number, isFirstInGroup: boolean) => React.ReactNode
  /** Unique key extractor */
  getKey: (item: T) => string
  /** Empty state content — rendered centered, outside ScrollArea */
  emptyState?: React.ReactNode
  /** Header content above the list (e.g. search bar) — rendered outside ScrollArea */
  header?: React.ReactNode
  /** Footer content after all items (e.g. infinite scroll sentinel) — inside ScrollArea */
  footer?: React.ReactNode
  /** Ref for the inner list container (for keyboard navigation zones) */
  containerRef?: React.Ref<HTMLDivElement>
  /** Props spread on the inner list container (role, aria-label, data-focus-zone) */
  containerProps?: Record<string, string>
  /** Additional ScrollArea class */
  scrollAreaClassName?: string
  /** Called when a collapsible group header is clicked */
  onToggleGroup?: (groupKey: string) => void
  className?: string
}

// ============================================================================
// Section Header
// ============================================================================

function SectionHeader({
  label,
  collapsible = false,
  collapsed = false,
  itemCount,
  onToggle,
}: {
  label: string
  collapsible?: boolean
  collapsed?: boolean
  itemCount?: number
  onToggle?: () => void
}) {
  const headerLabel = collapsed && typeof itemCount === 'number'
    ? `${label} · ${itemCount}`
    : label

  if (collapsible) {
    return (
      <button
        type="button"
        className="w-full px-4 py-2 flex items-center gap-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {headerLabel}
        </span>
      </button>
    )
  }

  return (
    <div className="px-4 py-2">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {headerLabel}
      </span>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function EntityList<T>({
  items,
  groups,
  renderItem,
  getKey,
  emptyState,
  header,
  footer,
  containerRef,
  containerProps,
  scrollAreaClassName,
  onToggleGroup,
  className,
}: EntityListProps<T>) {
  // Determine if we have content
  const hasGroups = groups && groups.length > 0
  const hasItems = items && items.length > 0
  const isEmpty = !hasGroups && !hasItems

  // Empty state — rendered outside everything for proper centering
  if (isEmpty && emptyState) {
    return (
      <div className={cn('flex flex-col flex-1', className)}>
        {header}
        {emptyState}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col flex-1 min-h-0', className)}>
      {header}
      <ScrollArea className={cn('flex-1', scrollAreaClassName)}>
        <div
          ref={containerRef}
          className="flex flex-col pb-2"
          {...containerProps}
        >
          <div className="pt-2">
            {hasGroups
              ? groups!.map((group) => (
                  <div key={group.key}>
                    <SectionHeader
                      label={group.label}
                      collapsible={group.collapsible}
                      collapsed={group.collapsed}
                      itemCount={group.itemCount}
                      onToggle={group.collapsible ? () => onToggleGroup?.(group.key) : undefined}
                    />
                    {!group.collapsed && group.items.map((item, indexInGroup) =>
                      <React.Fragment key={getKey(item)}>
                        {renderItem(item, indexInGroup, indexInGroup === 0)}
                      </React.Fragment>
                    )}
                  </div>
                ))
              : items?.map((item, index) =>
                  <React.Fragment key={getKey(item)}>
                    {renderItem(item, index, index === 0)}
                  </React.Fragment>
                )
            }
          </div>
          {footer}
        </div>
      </ScrollArea>
    </div>
  )
}
