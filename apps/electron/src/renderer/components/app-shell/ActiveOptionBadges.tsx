import * as React from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SlashCommandMenu, type SlashCommandId, type CommandGroup, type SlashCommand } from '@/components/ui/slash-command-menu'
import { ChevronDown, X, Brain } from 'lucide-react'
import { PERMISSION_MODE_CONFIG, PERMISSION_MODE_ORDER, type PermissionMode } from '@agent-operator/shared/agent/modes'
import { ActiveTasksBar, type BackgroundTask } from './ActiveTasksBar'
import { LabelIcon, LabelValueTypeIcon } from '@/components/ui/label-icon'
import { LabelValuePopover } from '@/components/ui/label-value-popover'
import type { LabelConfig } from '@agent-operator/shared/labels'
import { flattenLabels, parseLabelEntry, formatLabelEntry } from '@agent-operator/shared/labels'
import { resolveEntityColor } from '@agent-operator/shared/colors'
import { useTheme } from '@/context/ThemeContext'
import { useDynamicStack } from '@/hooks/useDynamicStack'
import type { SessionStatus } from '@/config/session-status-config'
import { getState } from '@/config/session-status-config'
import { SessionStatusMenu } from '@/components/ui/session-status-menu'
import { useLanguage } from '@/context/LanguageContext'

// ============================================================================
// Permission Mode Icon Component
// ============================================================================

function PermissionModeIcon({ mode, className }: { mode: PermissionMode; className?: string }) {
  const config = PERMISSION_MODE_CONFIG[mode] ?? PERMISSION_MODE_CONFIG['ask']
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={config.svgPath} />
    </svg>
  )
}

export interface ActiveOptionBadgesProps {
  /** Show ultrathink badge */
  ultrathinkEnabled?: boolean
  /** Callback when ultrathink is toggled off */
  onUltrathinkChange?: (enabled: boolean) => void
  /** Current permission mode */
  permissionMode?: PermissionMode
  /** Callback when permission mode changes */
  onPermissionModeChange?: (mode: PermissionMode) => void
  /** Background tasks to display */
  tasks?: BackgroundTask[]
  /** Session ID for opening preview windows */
  sessionId?: string
  /** Callback when kill button is clicked on a task */
  onKillTask?: (taskId: string) => void
  /** Callback to insert message into input field */
  onInsertMessage?: (text: string) => void
  /** Label entries applied to this session (e.g., ["bug", "priority::3"]) */
  sessionLabels?: string[]
  /** Available label configs (tree structure) for resolving label display */
  labels?: LabelConfig[]
  /** Callback when a label is removed (legacy — prefer onLabelsChange) */
  onRemoveLabel?: (labelId: string) => void
  /** Callback when session labels array changes (value edits or removals) */
  onLabelsChange?: (updatedLabels: string[]) => void
  /** Label ID whose value popover should auto-open (set when a valued label is added via # menu) */
  autoOpenLabelId?: string | null
  /** Called after the auto-open has been consumed, so the parent can clear the signal */
  onAutoOpenConsumed?: () => void
  // -- State/status badge --
  /** Available workflow states */
  sessionStatuses?: SessionStatus[]
  /** Current session state ID */
  currentSessionStatus?: string
  /** Callback when state changes */
  onSessionStatusChange?: (stateId: string) => void
  /** Additional CSS classes */
  className?: string
}

/** Resolved label entry: config + parsed value + original index in sessionLabels */
interface ResolvedLabelEntry {
  config: LabelConfig
  rawValue?: string
  index: number
}

export function ActiveOptionBadges({
  ultrathinkEnabled = false,
  onUltrathinkChange,
  permissionMode = 'ask',
  onPermissionModeChange,
  tasks = [],
  sessionId,
  onKillTask,
  onInsertMessage,
  sessionLabels = [],
  labels = [],
  onRemoveLabel,
  onLabelsChange,
  autoOpenLabelId,
  onAutoOpenConsumed,
  sessionStatuses = [],
  currentSessionStatus,
  onSessionStatusChange,
  className,
}: ActiveOptionBadgesProps) {
  // Resolve session label entries to their config objects + parsed values.
  const resolvedLabels = React.useMemo((): ResolvedLabelEntry[] => {
    if (sessionLabels.length === 0 || labels.length === 0) return []
    const flat = flattenLabels(labels)
    const result: ResolvedLabelEntry[] = []
    for (let i = 0; i < sessionLabels.length; i++) {
      const parsed = parseLabelEntry(sessionLabels[i])
      const config = flat.find(l => l.id === parsed.id)
      if (config) {
        result.push({ config, rawValue: parsed.rawValue, index: i })
      }
    }
    return result
  }, [sessionLabels, labels])

  const hasLabels = resolvedLabels.length > 0

  // Resolve the current state for the badge display.
  const effectiveStateId = currentSessionStatus || 'todo'
  const resolvedState = sessionStatuses.length > 0 ? getState(effectiveStateId, sessionStatuses) : undefined
  const hasState = !!resolvedState

  const hasStackContent = hasLabels

  // Dynamic stacking with equal visible strips
  const stackRef = useDynamicStack({ gap: 8, minVisible: 20, reservedStart: 24 })

  // Only render if badges or tasks are active
  if (!ultrathinkEnabled && !permissionMode && tasks.length === 0 && !hasState && !hasStackContent) {
    return null
  }

  return (
    <div className={cn("flex items-start gap-2 mb-2 px-px pt-px pb-0.5", className)}>
      {/* Permission Mode Badge */}
      {permissionMode && (
        <div className="shrink-0">
          <PermissionModeDropdown
            permissionMode={permissionMode}
            ultrathinkEnabled={ultrathinkEnabled}
            onPermissionModeChange={onPermissionModeChange}
            onUltrathinkChange={onUltrathinkChange}
          />
        </div>
      )}

      {/* State Badge */}
      {hasState && resolvedState && (
        <div className="shrink-0">
          <StateBadge
            state={resolvedState}
            sessionStatuses={sessionStatuses}
            onSessionStatusChange={onSessionStatusChange}
          />
        </div>
      )}

      {/* Ultrathink Badge */}
      {ultrathinkEnabled && (
        <button
          type="button"
          onClick={() => onUltrathinkChange?.(false)}
          className="h-[30px] pl-2.5 pr-2 text-xs font-medium rounded-[8px] flex items-center gap-1.5 shrink-0 transition-all bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 hover:from-blue-600/15 hover:via-purple-600/15 hover:to-pink-600/15 shadow-tinted outline-none select-none"
          style={{ '--shadow-color': '147, 51, 234' } as React.CSSProperties}
        >
          <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Ultrathink
          </span>
          <X className="h-3 w-3 text-purple-500 opacity-60 hover:opacity-100 translate-y-px" />
        </button>
      )}

      {/* Stacking container for label badges (right-aligned).
       * useDynamicStack sets per-child marginLeft directly via ResizeObserver.
       * overflow: clip prevents scroll container while py/-my gives shadow room. */}
      {hasStackContent && (
        <div
          className="min-w-0 flex-1 py-0.5 -my-0.5"
          style={{
            filter: 'drop-shadow(0px 0px 0.5px rgba(var(--foreground-rgb), 0.3)) drop-shadow(0px 1px 0.1px rgba(0,0,0,0.04)) drop-shadow(0px 3px 0.2px rgba(0,0,0,0.03))',
          }}
        >
          <div
            ref={stackRef}
            className="flex items-center min-w-0 justify-end py-1 -my-1 pr-2 -mr-2"
            style={{ overflow: 'clip' }}
          >
            {resolvedLabels.map(({ config, rawValue, index }) => (
              <LabelBadge
                key={`${config.id}-${index}`}
                label={config}
                value={rawValue}
                autoOpen={config.id === autoOpenLabelId}
                onAutoOpenConsumed={onAutoOpenConsumed}
                onValueChange={(newValue) => {
                  const updated = [...sessionLabels]
                  updated[index] = formatLabelEntry(config.id, newValue)
                  onLabelsChange?.(updated)
                }}
                onRemove={() => {
                  if (onLabelsChange) {
                    onLabelsChange(sessionLabels.filter((_, i) => i !== index))
                  } else {
                    onRemoveLabel?.(config.id)
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Background Tasks - DISABLED: UI hidden because task tracking is not reliable. */}
      {/* {sessionId && <ActiveTasksBar tasks={tasks} sessionId={sessionId} onKillTask={onKillTask} onInsertMessage={onInsertMessage} />} */}
    </div>
  )
}

// ============================================================================
// Label Badge Component
// ============================================================================

function formatDisplayValue(rawValue: string, valueType?: 'string' | 'number' | 'date'): string {
  if (valueType === 'date') {
    const date = new Date(rawValue.includes('T') ? rawValue + ':00Z' : rawValue + 'T00:00:00Z')
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  return rawValue
}

function LabelBadge({
  label,
  value,
  autoOpen,
  onAutoOpenConsumed,
  onValueChange,
  onRemove,
}: {
  label: LabelConfig
  value?: string
  autoOpen?: boolean
  onAutoOpenConsumed?: () => void
  onValueChange?: (newValue: string | undefined) => void
  onRemove: () => void
}) {
  const { isDark } = useTheme()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (autoOpen && label.valueType) {
      setOpen(true)
      onAutoOpenConsumed?.()
    }
  }, [autoOpen, label.valueType, onAutoOpenConsumed])

  const resolvedColor = label.color
    ? resolveEntityColor(label.color, isDark)
    : 'var(--foreground)'

  const displayValue = value ? formatDisplayValue(value, label.valueType) : undefined

  return (
    <LabelValuePopover
      label={label}
      value={value}
      open={open}
      onOpenChange={setOpen}
      onValueChange={onValueChange}
      onRemove={onRemove}
    >
      <button
        type="button"
        className={cn(
          "h-[30px] pl-3 pr-2 text-xs font-medium rounded-[8px] flex items-center shrink-0",
          "outline-none select-none transition-colors",
          "bg-[color-mix(in_srgb,var(--background)_97%,var(--badge-color))]",
          "hover:bg-[color-mix(in_srgb,var(--background)_92%,var(--badge-color))]",
          "text-[color-mix(in_srgb,var(--foreground)_80%,var(--badge-color))]",
          "relative",
        )}
        style={{ '--badge-color': resolvedColor } as React.CSSProperties}
      >
        <LabelIcon label={label} size="lg" />
        <span className="whitespace-nowrap ml-2">{label.name}</span>
        {displayValue ? (
          <>
            <span className="opacity-30 mx-1">&middot;</span>
            <span className="opacity-60 whitespace-nowrap max-w-[100px] truncate">
              {displayValue}
            </span>
          </>
        ) : (
          label.valueType && (
            <>
              <span className="opacity-30 mx-1">&middot;</span>
              <LabelValueTypeIcon valueType={label.valueType} />
            </>
          )
        )}
        <ChevronDown className="h-3 w-3 opacity-40 ml-1 shrink-0" />
      </button>
    </LabelValuePopover>
  )
}

// ============================================================================
// State Badge Component
// ============================================================================

function StateBadge({
  state,
  sessionStatuses,
  onSessionStatusChange,
}: {
  state: SessionStatus
  sessionStatuses: SessionStatus[]
  onSessionStatusChange?: (stateId: string) => void
}) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = React.useCallback((stateId: string) => {
    setOpen(false)
    onSessionStatusChange?.(stateId)
  }, [onSessionStatusChange])

  const badgeColor = state.resolvedColor || 'var(--foreground)'
  const applyColor = state.iconColorable

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-[30px] pl-2.5 pr-2 text-xs font-medium rounded-[8px] flex items-center gap-1.5 shrink-0",
            "outline-none select-none transition-colors shadow-minimal",
            "bg-[color-mix(in_srgb,var(--background)_97%,var(--badge-color))]",
            "hover:bg-[color-mix(in_srgb,var(--background)_92%,var(--badge-color))]",
            "text-[color-mix(in_srgb,var(--foreground)_80%,var(--badge-color))]",
          )}
          style={{ '--badge-color': badgeColor } as React.CSSProperties}
        >
          <span
            className="shrink-0 flex items-center w-3.5 h-3.5 [&>svg]:w-full [&>svg]:h-full [&>img]:w-full [&>img]:h-full [&>span]:text-xs"
            style={applyColor ? { color: state.resolvedColor } : undefined}
          >
            {state.icon}
          </span>
          <span className="whitespace-nowrap">{state.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 shadow-none bg-transparent"
        side="top"
        align="end"
        sideOffset={4}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('cowork:focus-input'))
        }}
      >
        <SessionStatusMenu
          activeState={state.id}
          onSelect={handleSelect}
          states={sessionStatuses}
        />
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Permission Mode Dropdown (with i18n)
// ============================================================================

interface PermissionModeDropdownProps {
  permissionMode: PermissionMode
  ultrathinkEnabled?: boolean
  onPermissionModeChange?: (mode: PermissionMode) => void
  onUltrathinkChange?: (enabled: boolean) => void
}

function PermissionModeDropdown({ permissionMode, ultrathinkEnabled = false, onPermissionModeChange, onUltrathinkChange }: PermissionModeDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [optimisticMode, setOptimisticMode] = React.useState(permissionMode)
  const { t } = useLanguage()

  const getModeDisplayName = React.useCallback((mode: PermissionMode): string => {
    const modeTranslationMap: Record<PermissionMode, string> = {
      'safe': t('permissionModes.safe'),
      'ask': t('permissionModes.ask'),
      'allow-all': t('permissionModes.allowAll'),
    }
    return modeTranslationMap[mode]
  }, [t])

  const getModeDescription = React.useCallback((mode: PermissionMode): string => {
    const modeDescriptionMap: Record<PermissionMode, string> = {
      'safe': t('permissionModes.safeDescription'),
      'ask': t('permissionModes.askDescription'),
      'allow-all': t('permissionModes.allowAllDescription'),
    }
    return modeDescriptionMap[mode]
  }, [t])

  const MENU_ICON_SIZE = 'h-3.5 w-3.5'
  const translatedCommandGroups = React.useMemo((): CommandGroup[] => {
    const permissionModeCommands: SlashCommand[] = PERMISSION_MODE_ORDER.map(mode => {
      const config = PERMISSION_MODE_CONFIG[mode]
      return {
        id: mode as SlashCommandId,
        label: getModeDisplayName(mode),
        description: getModeDescription(mode),
        icon: (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={MENU_ICON_SIZE}
          >
            <path d={config.svgPath} />
          </svg>
        ),
      }
    })

    const ultrathinkCommand: SlashCommand = {
      id: 'ultrathink',
      label: 'Ultrathink',
      description: t('thinkingLevels.highDescription'),
      icon: <Brain className={MENU_ICON_SIZE} />,
    }

    return [
      { id: 'modes', commands: permissionModeCommands },
      { id: 'features', commands: [ultrathinkCommand] },
    ]
  }, [t, getModeDescription, getModeDisplayName])

  React.useEffect(() => {
    setOptimisticMode(permissionMode)
  }, [permissionMode])

  const activeCommands = React.useMemo((): SlashCommandId[] => {
    const active: SlashCommandId[] = [optimisticMode as SlashCommandId]
    if (ultrathinkEnabled) active.push('ultrathink')
    return active
  }, [optimisticMode, ultrathinkEnabled])

  const handleSelect = React.useCallback((commandId: SlashCommandId) => {
    if (commandId === 'safe' || commandId === 'ask' || commandId === 'allow-all') {
      setOptimisticMode(commandId)
      onPermissionModeChange?.(commandId)
    } else if (commandId === 'ultrathink') {
      onUltrathinkChange?.(!ultrathinkEnabled)
    }
    setOpen(false)
  }, [onPermissionModeChange, onUltrathinkChange, ultrathinkEnabled])

  const modeStyles: Record<PermissionMode, { className: string; shadowVar: string }> = {
    'safe': {
      className: 'bg-foreground/5 text-foreground/60',
      shadowVar: 'var(--foreground-rgb)',
    },
    'ask': {
      className: 'bg-info/10 text-info',
      shadowVar: 'var(--info-rgb)',
    },
    'allow-all': {
      className: 'bg-accent/5 text-accent',
      shadowVar: 'var(--accent-rgb)',
    },
  }
  const currentStyle = modeStyles[optimisticMode] ?? modeStyles['ask']

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tutorial="permission-mode-dropdown"
          className={cn(
            "h-[30px] pl-2.5 pr-2 text-xs font-medium rounded-[8px] flex items-center gap-1.5 shadow-tinted outline-none select-none",
            currentStyle.className
          )}
          style={{ '--shadow-color': currentStyle.shadowVar } as React.CSSProperties}
        >
          <PermissionModeIcon mode={optimisticMode} className="h-3.5 w-3.5" />
          <span>{getModeDisplayName(optimisticMode)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-border/50"
        side="top"
        align="start"
        sideOffset={4}
        style={{ borderRadius: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)' }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('cowork:focus-input'))
        }}
      >
        <SlashCommandMenu
          commandGroups={translatedCommandGroups}
          activeCommands={activeCommands}
          onSelect={handleSelect}
          showFilter
        />
      </PopoverContent>
    </Popover>
  )
}
