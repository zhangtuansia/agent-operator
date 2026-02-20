/**
 * TaskDetail
 *
 * Detail view for a single scheduled task.
 */

import * as React from 'react'
import { Pencil, Play, Trash2, Loader2 } from 'lucide-react'
import type { ScheduledTask } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { useTaskRuns } from '@/hooks/useScheduledTasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  SettingsSection,
  SettingsCard,
  SettingsCardContent,
  SettingsRow,
} from '@/components/settings'
import { formatScheduleLabel } from './TaskList'
import { TaskRunHistory } from './TaskRunHistory'

interface TaskDetailProps {
  workspaceId: string | null
  task: ScheduledTask
  onEdit: () => void
  onDelete: () => void
  onRunNow: () => void
  onViewSession: (sessionId: string) => void
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m`
}

export function TaskDetail({
  workspaceId,
  task,
  onEdit,
  onDelete,
  onRunNow,
  onViewSession,
}: TaskDetailProps) {
  const { t } = useLanguage()
  const { runs, isLoading: runsLoading } = useTaskRuns(workspaceId, task.id)

  const statusLabel =
    task.state.lastStatus === 'success'
      ? t('scheduledTasks.statusSuccess')
      : task.state.lastStatus === 'error'
      ? t('scheduledTasks.statusError')
      : task.state.lastStatus === 'running'
      ? t('scheduledTasks.statusRunning')
      : '-'

  return (
    <div className="px-5 py-7 max-w-3xl mx-auto space-y-6">
      <SettingsSection
        title={task.name}
        action={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              onClick={onEdit}
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              title={t('scheduledTasks.edit')}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              onClick={onRunNow}
              disabled={!!task.state.runningAtMs}
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              title={t('scheduledTasks.run')}
            >
              {task.state.runningAtMs ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="button"
              onClick={onDelete}
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title={t('scheduledTasks.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      >
        <SettingsCard divided={false}>
          <SettingsCardContent className="space-y-3">
            <div className="text-sm font-medium">{t('scheduledTasks.prompt')}</div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {task.prompt}
            </div>
          </SettingsCardContent>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('scheduledTasks.configuration')}>
        <SettingsCard>
          <SettingsRow label={t('scheduledTasks.schedule')}>
            <span className="text-sm text-muted-foreground">
              {formatScheduleLabel(task.schedule, t)}
            </span>
          </SettingsRow>
          <SettingsRow label={t('scheduledTasks.status')}>
            <Badge variant={task.enabled ? 'secondary' : 'outline'} className="text-[10px]">
              {task.enabled ? t('common.enabled') : t('common.disabled')}
            </Badge>
          </SettingsRow>
          {!!task.workingDirectory && (
            <SettingsRow label={t('scheduledTasks.workingDirectory')}>
              <span
                className="max-w-[26rem] truncate font-mono text-xs text-muted-foreground"
                title={task.workingDirectory}
              >
                {task.workingDirectory}
              </span>
            </SettingsRow>
          )}
          <SettingsRow label={t('scheduledTasks.expiresAt')}>
            <span className="text-sm text-muted-foreground">
              {task.expiresAt
                ? new Date(task.expiresAt + 'T00:00:00').toLocaleDateString()
                : '-'}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('scheduledTasks.status')}>
        <SettingsCard>
          <SettingsRow label={t('scheduledTasks.lastRun')}>
            <div className="flex items-center gap-1.5">
              <Badge
                variant={
                  task.state.lastStatus === 'success'
                    ? 'secondary'
                    : task.state.lastStatus === 'error'
                    ? 'destructive'
                    : 'outline'
                }
                className="text-[10px]"
              >
                {statusLabel}
              </Badge>
              {task.state.lastRunAtMs && (
                <span className="text-xs text-muted-foreground">
                  ({new Date(task.state.lastRunAtMs).toLocaleString()})
                </span>
              )}
            </div>
          </SettingsRow>
          <SettingsRow label={t('scheduledTasks.nextRun')}>
            <span className="text-sm text-muted-foreground">
              {task.state.nextRunAtMs
                ? new Date(task.state.nextRunAtMs).toLocaleString()
                : '-'}
            </span>
          </SettingsRow>
          <SettingsRow label={t('scheduledTasks.lastDuration')}>
            <span className="text-sm text-muted-foreground">
              {formatDuration(task.state.lastDurationMs)}
            </span>
          </SettingsRow>
          <SettingsRow label={t('scheduledTasks.consecutiveErrors')}>
            <Badge
              variant={task.state.consecutiveErrors > 0 ? 'destructive' : 'outline'}
              className="text-[10px]"
            >
              {task.state.consecutiveErrors}
            </Badge>
          </SettingsRow>
          <SettingsRow label={t('scheduledTasks.lastError')}>
            <span
              className="max-w-[26rem] truncate text-xs text-muted-foreground"
              title={task.state.lastError ?? ''}
            >
              {task.state.lastError ?? '-'}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('scheduledTasks.runHistory')}>
        <SettingsCard className="p-0 overflow-hidden">
          <TaskRunHistory runs={runs} isLoading={runsLoading} onViewSession={onViewSession} />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
