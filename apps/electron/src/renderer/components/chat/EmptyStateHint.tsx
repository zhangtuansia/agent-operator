/**
 * EmptyStateHint - Rotating workflow suggestions for empty chat state
 *
 * Displays inspirational hints showing what users can do with the agent.
 * Each hint contains inline entity badges (sources, files, folders, skills)
 * with generic Lucide icons.
 *
 * Entity token format in hints:
 * - {source:Gmail} → Globe icon + "Gmail" label
 * - {file:screenshot} → Paperclip icon + "screenshot" label
 * - {folder} → Folder icon + "folder" label
 * - {skill} → Zap icon + "skill" label
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/LanguageContext'

// ============================================================================
// Types
// ============================================================================

/** Entity types that can appear in hints */
type EntityType = 'source' | 'file' | 'folder' | 'skill'

/** Parsed segment of a hint - either text or an entity */
type HintSegment =
  | { type: 'text'; content: string }
  | { type: 'entity'; entityType: EntityType; label: string; provider?: string }

/** A complete hint with its segments */
interface ParsedHint {
  id: string
  segments: HintSegment[]
}

// ============================================================================
// Hint Templates
// ============================================================================

/**
 * Hint templates with entity placeholders.
 * Format: {type:label} or {type} for default label
 *
 * Supported tokens:
 * - {source:name} - Source with specific provider (gmail, slack, github, etc.)
 * - {file:label} - File attachment with custom label
 * - {folder} - Working directory
 * - {skill} - Custom skill
 *
 * Note: Actual templates are loaded from i18n translations (en.ts/zh.ts hints array)
 */
const HINT_COUNT = 15 // Number of hint templates available

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse a hint template into segments
 * Tokens: {source:Gmail}, {file:screenshot}, {folder}, {skill}
 */
function parseHintTemplate(template: string, id: string): ParsedHint {
  const segments: HintSegment[] = []
  // Regex matches {type} or {type:label}
  const tokenRegex = /\{(source|file|folder|skill)(?::([^}]+))?\}/g

  let lastIndex = 0
  let match

  while ((match = tokenRegex.exec(template)) !== null) {
    // Add text before the token
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: template.slice(lastIndex, match.index),
      })
    }

    const entityType = match[1] as EntityType
    const labelOrProvider = match[2]

    // For source type, the second part is the provider/label
    // For other types, it's just a custom label
    if (entityType === 'source') {
      segments.push({
        type: 'entity',
        entityType,
        label: labelOrProvider || 'source',
        provider: labelOrProvider?.toLowerCase(),
      })
    } else {
      segments.push({
        type: 'entity',
        entityType,
        label: labelOrProvider || entityType,
      })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < template.length) {
    segments.push({
      type: 'text',
      content: template.slice(lastIndex),
    })
  }

  return { id, segments }
}

/**
 * Parse all hint templates from the provided array
 */
function parseAllHints(templates: readonly string[]): ParsedHint[] {
  return templates.map((template, index) => parseHintTemplate(template, `hint-${index}`))
}

// ============================================================================
// Entity Badge Component
// ============================================================================

interface EntityBadgeProps {
  entityType: EntityType
  label: string
  provider?: string
}

/**
 * EntityBadge - Inline label for hint entities with subtle badge styling
 */
function EntityBadge({ label }: EntityBadgeProps) {
  return (
    <span className="inline-flex pl-[8px] pr-[10px] py-0.5 mx-[2px] rounded-[8px] bg-foreground/5 shadow-minimal text-foreground/40">
      {label}
    </span>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export interface EmptyStateHintProps {
  /** Specific hint index to display (for playground testing) */
  hintIndex?: number
  /** Custom class name */
  className?: string
}

/**
 * EmptyStateHint - Displays a random workflow suggestion
 *
 * Shows what users can accomplish with the agent by displaying
 * example workflows with inline entity badges.
 */
export function EmptyStateHint({ hintIndex, className }: EmptyStateHintProps) {
  const { translations } = useLanguage()

  // Parse all hints from translations
  const allHints = React.useMemo(
    () => parseAllHints(translations.hints),
    [translations.hints]
  )

  // Select a hint - either specified index or random on mount
  const [selectedIndex] = React.useState(() => {
    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < allHints.length) {
      return hintIndex
    }
    return Math.floor(Math.random() * allHints.length)
  })

  // Update if hintIndex prop changes
  const displayIndex = hintIndex !== undefined ? hintIndex : selectedIndex
  const hint = allHints[displayIndex % allHints.length]

  return (
    <div
      className={cn(
        'text-center leading-relaxed tracking-tight',
        'max-w-md mx-auto select-none',
        'text-[20px] font-bold text-black',
        className
      )}
    >
      {hint.segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>
        }

        return (
          <EntityBadge
            key={index}
            entityType={segment.entityType}
            label={segment.label}
            provider={segment.provider}
          />
        )
      })}
    </div>
  )
}

/**
 * Get the total number of available hints (for playground variant generation)
 */
export function getHintCount(): number {
  return HINT_COUNT
}
