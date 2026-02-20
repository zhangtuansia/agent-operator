/**
 * LabelBadgeRow - Renders a flex-wrap row of LabelBadge chips for applied session labels.
 *
 * Positioned above the RichTextInput in FreeFormInput. Each badge shows
 * the label's color, name, and optional typed value. Clicking a badge
 * opens a LabelValuePopover for editing or removing.
 *
 * Data flow:
 * - sessionLabels: string[] (e.g., ["bug", "priority::3", "due::2026-01-30"])
 * - labels: LabelConfig[] (workspace label tree for resolving colors/valueTypes)
 * - Parses each entry via parseLabelEntry() to extract id + rawValue
 * - Resolves LabelConfig from flat tree for color and valueType
 */

import * as React from 'react'
import { LabelBadge } from './label-badge'
import { LabelValuePopover } from './label-value-popover'
import { parseLabelEntry, formatLabelEntry, extractLabelId } from '@agent-operator/shared/labels'
import type { LabelConfig } from '@agent-operator/shared/labels'
import { cn } from '@/lib/utils'

export interface LabelBadgeRowProps {
  /** Applied session labels (encoded strings like "bug" or "priority::3") */
  sessionLabels: string[]
  /** Full label config tree (for resolving colors, names, valueTypes) */
  labels: LabelConfig[]
  /** Called when a label value is changed — receives the updated full sessionLabels array */
  onLabelsChange?: (updatedLabels: string[]) => void
  /** Additional className for the container */
  className?: string
}

/**
 * Flatten a recursive LabelConfig tree into a map of id → LabelConfig
 * for O(1) lookup when resolving session label entries.
 */
function flattenLabelTree(labels: LabelConfig[]): Map<string, LabelConfig> {
  const map = new Map<string, LabelConfig>()
  function walk(items: LabelConfig[]) {
    for (const item of items) {
      map.set(item.id, item)
      if (item.children?.length) {
        walk(item.children)
      }
    }
  }
  walk(labels)
  return map
}

export function LabelBadgeRow({
  sessionLabels,
  labels,
  onLabelsChange,
  className,
}: LabelBadgeRowProps) {
  // Track which badge's popover is open (by index)
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  // Memoize flat lookup map (only recompute when labels config changes)
  const labelMap = React.useMemo(() => flattenLabelTree(labels), [labels])

  // Filter out internal labels (scheduled:*, imported:*) - these are for sidebar filtering, not display
  const visibleLabels = React.useMemo(
    () => sessionLabels.filter(l => !l.startsWith('scheduled:') && !l.startsWith('imported:')),
    [sessionLabels]
  )

  // Don't render if no visible labels
  if (visibleLabels.length === 0) return null

  /** Update a label entry's value by finding its real index in sessionLabels */
  const handleValueChange = (entry: string, labelId: string, newValue: string | undefined) => {
    const realIndex = sessionLabels.indexOf(entry)
    if (realIndex === -1) return
    const updated = [...sessionLabels]
    updated[realIndex] = formatLabelEntry(labelId, newValue)
    onLabelsChange?.(updated)
  }

  /** Remove a label by finding its real index in sessionLabels */
  const handleRemove = (entry: string) => {
    const realIndex = sessionLabels.indexOf(entry)
    if (realIndex === -1) return
    const updated = sessionLabels.filter((_, i) => i !== realIndex)
    onLabelsChange?.(updated)
  }

  return (
    <div className={cn('flex flex-wrap gap-1 px-4 pt-3 pb-1', className)}>
      {visibleLabels.map((entry, index) => {
        const parsed = parseLabelEntry(entry)
        const config = labelMap.get(parsed.id)

        // If no config found, create a minimal fallback so the badge still renders
        const resolvedConfig: LabelConfig = config ?? { id: parsed.id, name: parsed.id }

        return (
          <LabelValuePopover
            key={`${parsed.id}-${index}`}
            label={resolvedConfig}
            value={parsed.rawValue}
            open={openIndex === index}
            onOpenChange={(open) => setOpenIndex(open ? index : null)}
            onValueChange={(newValue) => handleValueChange(entry, parsed.id, newValue)}
            onRemove={() => handleRemove(entry)}
          >
            <LabelBadge
              label={resolvedConfig}
              value={parsed.rawValue}
              isActive={openIndex === index}
            />
          </LabelValuePopover>
        )
      })}
    </div>
  )
}
