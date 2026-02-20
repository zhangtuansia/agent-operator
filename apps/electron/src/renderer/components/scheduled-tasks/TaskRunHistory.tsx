/**
 * TaskRunHistory
 *
 * Per-task run history list.
 */

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import type { ScheduledTaskRun } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TaskRunHistoryProps {
  runs: ScheduledTaskRun[]
  isLoading?: boolean
  onViewSession: (sessionId: string) => void
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m`
}

export function TaskRunHistory({ runs, isLoading = false, onViewSession }: TaskRunHistoryProps) {
  const { t } = useLanguage()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <Empty className="py-8 pb-0">
        <EmptyHeader>
          <EmptyTitle>{t('scheduledTasks.noRuns')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('scheduledTasks.historyColTime')}</TableHead>
          <TableHead>{t('scheduledTasks.schedule')}</TableHead>
          <TableHead>{t('scheduledTasks.historyColStatus')}</TableHead>
          <TableHead>{t('scheduledTasks.lastDuration')}</TableHead>
          <TableHead>{t('scheduledTasks.lastError')}</TableHead>
          <TableHead className="text-right">{t('scheduledTasks.viewSession')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="whitespace-nowrap">
              {new Date(run.startedAt).toLocaleString()}
            </TableCell>
            <TableCell>
              {run.trigger === 'manual'
                ? t('scheduledTasks.triggerManual')
                : t('scheduledTasks.triggerScheduled')}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  run.status === 'success'
                    ? 'secondary'
                    : run.status === 'error'
                    ? 'destructive'
                    : 'outline'
                }
                className="text-[10px]"
              >
                {run.status === 'success'
                  ? t('scheduledTasks.statusSuccess')
                  : run.status === 'error'
                  ? t('scheduledTasks.statusError')
                  : t('scheduledTasks.statusRunning')}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDuration(run.durationMs)}
            </TableCell>
            <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={run.error ?? ''}>
              {run.error ?? '-'}
            </TableCell>
            <TableCell className="text-right">
              {run.sessionId ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => onViewSession(run.sessionId!)}
                >
                  {t('scheduledTasks.viewSession')}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
