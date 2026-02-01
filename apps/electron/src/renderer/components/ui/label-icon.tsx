/**
 * LabelIcon - Renders a colored circle representing a label.
 *
 * Labels are color-only (no icons/emoji). The circle size scales
 * with the icon size variant for consistent inline display.
 */

import type { IconSize } from '@agent-operator/shared/icons'
import type { EntityColor } from '@agent-operator/shared/colors'
import { resolveEntityColor } from '@agent-operator/shared/colors'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'
import { Hash, CalendarDays, Type } from 'lucide-react'
import type { LabelConfig } from '@agent-operator/shared/labels'

interface LabelIconProps {
  /** Label configuration (matches LabelConfig from @agent-operator/shared/labels) */
  label: {
    id: string
    /** EntityColor: system color string or custom color object */
    color?: EntityColor
  }
  /** Size variant (default: 'sm' - labels are typically small inline elements) */
  size?: IconSize
  /** When true, renders an inner circle (radio-button style) to indicate nested children */
  hasChildren?: boolean
  /** Additional className */
  className?: string
}

/** Circle diameter in pixels for each icon size */
const CIRCLE_SIZES: Record<IconSize, number> = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
}

export function LabelIcon({ label, size = 'sm', hasChildren, className }: LabelIconProps) {
  const { isDark } = useTheme()

  // Resolve the label's color for inline styling
  const resolvedColor = label.color
    ? resolveEntityColor(label.color, isDark)
    : undefined

  // Parent labels get a slightly larger circle to accommodate the inner dot
  const diameter = CIRCLE_SIZES[size] + (hasChildren ? 2 : 0)
  return (
    <span
      className={cn('inline-flex items-center justify-center shrink-0', className)}
      style={{ width: diameter, height: diameter }}
    >
      <span
        className="relative rounded-full w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: resolvedColor || 'currentColor',
          opacity: resolvedColor ? 1 : 0.4,
        }}
      >
        {/* Inner dot signals this label has nested children (radio-button style).
            Color is 85% background + 15% label color via color-mix. */}
        {hasChildren && (
          <span
            className="rounded-full shadow-minimal"
            style={{
              width: 4,
              height: 4,
              backgroundColor: `color-mix(in srgb, var(--background) 85%, ${resolvedColor || 'currentColor'} 15%)`,
            }}
          />
        )}
      </span>
    </span>
  )
}

/**
 * LabelValueTypeIcon - Renders a placeholder icon for typed labels with no value set.
 *
 * Maps valueType to a Lucide icon:
 *   - number → Hash
 *   - date   → CalendarDays
 *   - string → Type
 *
 * Returns null if the label has no valueType (boolean/presence-only labels).
 * Used in both SessionList and LabelBadge to indicate a typed label awaiting a value.
 */
const VALUE_TYPE_ICONS = {
  number: Hash,
  date: CalendarDays,
  string: Type,
} as const

interface LabelValueTypeIconProps {
  /** The label's valueType ('number' | 'date' | 'string' | undefined) */
  valueType: LabelConfig['valueType']
  /** Icon size in pixels (default: 11) */
  size?: number
  /** Additional className */
  className?: string
}

export function LabelValueTypeIcon({ valueType, size = 11, className }: LabelValueTypeIconProps) {
  if (!valueType) return null

  const IconComponent = VALUE_TYPE_ICONS[valueType]
  if (!IconComponent) return null

  return <IconComponent size={size} className={cn('shrink-0 opacity-45', className)} />
}
