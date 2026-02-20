/**
 * AllRunsHistory
 *
 * Global run history list across all tasks.
 */

import * as React from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { useAllTaskRuns } from '@/hooks/useScheduledTasks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

interface AllRunsHistoryProps {
  workspaceId: string | null
  onViewSession: (sessionId: string, taskId: string) => void
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m`
}

export function AllRunsHistory({ workspaceId, onViewSession }: AllRunsHistoryProps) {
  const { t } = useLanguage()
  const { runs, isLoading } = useAllTaskRuns(workspaceId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <Empty className="py-16 pb-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Clock className="h-10 w-10" />
          </EmptyMedia>
          <EmptyTitle>{t('scheduledTasks.historyEmpty')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('scheduledTasks.historyColTitle')}</TableHead>
          <TableHead>{t('scheduledTasks.historyColTime')}</TableHead>
          <TableHead>{t('scheduledTasks.lastDuration')}</TableHead>
          <TableHead>{t('scheduledTasks.historyColStatus')}</TableHead>
          <TableHead className="text-right">{t('scheduledTasks.viewSession')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="max-w-[260px] truncate">
              {run.taskName}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {new Date(run.startedAt).toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDuration(run.durationMs)}
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
                {run.status === 'running' && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {run.sessionId ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => onViewSession(run.sessionId!, run.taskId)}
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
