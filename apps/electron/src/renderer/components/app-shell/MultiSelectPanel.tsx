/**
 * MultiSelectPanel - Empty state panel shown when multiple sessions are selected.
 *
 * Displays the selection count and provides batch action buttons for:
 * - Change status
 * - Set labels
 * - Archive selected sessions
 * - Clear selection
 */

import * as React from 'react'
import { Archive, Tag, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isMac } from '@/lib/platform'
import { DropdownMenu, DropdownMenuTrigger, StyledDropdownMenuContent, StyledDropdownMenuItem, StyledDropdownMenuSeparator, StyledDropdownMenuSubContent, StyledDropdownMenuSubTrigger, DropdownMenuSub } from '@/components/ui/styled-dropdown'
import type { SessionStatusId, SessionStatus } from '@/config/session-status-config'
import type { LabelConfig } from '@agent-operator/shared/labels'
import { LabelMenuItems, StatusMenuItems } from './SessionMenuParts'
import { useTranslation } from '@/i18n'

export interface MultiSelectPanelProps {
  /** Number of selected sessions */
  count: number
  /** Available session statuses */
  sessionStatuses?: SessionStatus[]
  /** Active status if all selected share the same state */
  activeStatusId?: SessionStatusId | null
  /** Callback when setting status for all selected */
  onSetStatus?: (status: SessionStatusId) => void
  /** Available label configs (tree) */
  labels?: LabelConfig[]
  /** Labels applied to all selected sessions */
  appliedLabelIds?: Set<string>
  /** Callback when toggling a label for all selected */
  onToggleLabel?: (labelId: string) => void
  /** Callback when archiving all selected */
  onArchive?: () => void
  /** Callback when clearing the selection */
  onClearSelection?: () => void
  /** Optional className for the container */
  className?: string
}

export function MultiSelectPanel({
  count,
  sessionStatuses = [],
  activeStatusId,
  onSetStatus,
  labels = [],
  appliedLabelIds = new Set(),
  onToggleLabel,
  onArchive,
  onClearSelection,
  className,
}: MultiSelectPanelProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full gap-6 p-8',
        className
      )}
    >
      {/* Selection count */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
          <span className="text-2xl font-semibold text-accent">{count}</span>
        </div>
        <h2 className="text-lg font-medium text-foreground">
          {t('sessionList.selectedSessions', { count })}
        </h2>
        <div className="text-sm text-foreground/50 flex flex-col items-center gap-1">
          <span>{t('multiSelectPanel.toggleHint', { modKey: isMac ? '⌘' : 'Ctrl', shiftKey: 'Shift' })}</span>
          <span>{t('multiSelectPanel.clearHint')}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        {onSetStatus && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 bg-background shadow-minimal hover:bg-foreground/[0.03]"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('multiSelectPanel.changeStatus')}
              </Button>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="center">
              <StatusMenuItems
                sessionStatuses={sessionStatuses}
                activeStateId={activeStatusId ?? undefined}
                onSelect={onSetStatus}
                menu={{ MenuItem: StyledDropdownMenuItem }}
              />
            </StyledDropdownMenuContent>
          </DropdownMenu>
        )}
        {onToggleLabel && labels.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 bg-background shadow-minimal hover:bg-foreground/[0.03]"
              >
                <Tag className="w-4 h-4" />
                {t('multiSelectPanel.setLabels')}
              </Button>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="center" className="min-w-[220px]">
              <LabelMenuItems
                labels={labels}
                appliedLabelIds={appliedLabelIds}
                onToggle={onToggleLabel}
                menu={{
                  MenuItem: StyledDropdownMenuItem,
                  Separator: StyledDropdownMenuSeparator,
                  Sub: DropdownMenuSub,
                  SubTrigger: StyledDropdownMenuSubTrigger,
                  SubContent: StyledDropdownMenuSubContent,
                }}
              />
            </StyledDropdownMenuContent>
          </DropdownMenu>
        )}
        {onArchive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArchive}
            className="gap-2 bg-background shadow-minimal hover:bg-foreground/[0.03]"
          >
            <Archive className="w-4 h-4" />
            {t('sessionMenu.archive')}
          </Button>
        )}
      </div>

      {/* Keyboard hint moved below click hint */}
    </div>
  )
}
