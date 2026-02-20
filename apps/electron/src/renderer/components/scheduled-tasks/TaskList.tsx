/**
 * TaskList
 *
 * Displays all scheduled tasks with toggle, status, and actions.
 */

import * as React from 'react'
import {
  Clock,
  Play,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
} from 'lucide-react'
import type { ScheduledTask, Schedule } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'

interface TaskListProps {
  tasks: ScheduledTask[]
  isLoading: boolean
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string, enabled: boolean) => void
  onRunManually: (taskId: string) => void
  onDelete: (taskId: string) => void
  onEdit: (taskId: string) => void
}

export function TaskList({
  tasks,
  isLoading,
  onSelectTask,
  onToggleTask,
  onRunManually,
  onDelete,
  onEdit,
}: TaskListProps) {
  const { t } = useLanguage()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <Empty className="h-56 pb-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Clock className="w-10 h-10" />
          </EmptyMedia>
          <EmptyTitle>{t('scheduledTasks.emptyState')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="divide-y divide-border">
      {tasks.map((task) => (
        // Keep entire row clickable for quick drilldown, but isolate switch/menu interactions.
        <div
          key={task.id}
          className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => onSelectTask(task.id)}
        >
          {/* Status indicator */}
          <div className="shrink-0">
            {task.state.lastStatus === 'running' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : (
              <div
                className={`w-2 h-2 rounded-full ${
                  !task.enabled
                    ? 'bg-muted-foreground/30'
                    : task.state.lastStatus === 'success'
                    ? 'bg-green-500'
                    : task.state.lastStatus === 'error'
                    ? 'bg-red-500'
                    : 'bg-muted-foreground/50'
                }`}
              />
            )}
          </div>

          {/* Task info */}
          <div className="flex-1 min-w-0">
            <div className={`text-sm truncate ${!task.enabled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {task.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {formatScheduleLabel(task.schedule, t)}
            </div>
          </div>

          <Badge
            variant={
              !task.enabled
                ? 'outline'
                : task.state.lastStatus === 'success'
                ? 'secondary'
                : task.state.lastStatus === 'error'
                ? 'destructive'
                : 'outline'
            }
            className="shrink-0 text-[10px]"
          >
            {task.state.lastStatus === 'running'
              ? t('scheduledTasks.statusRunning')
              : task.state.lastStatus === 'success'
              ? t('scheduledTasks.statusSuccess')
              : task.state.lastStatus === 'error'
              ? t('scheduledTasks.statusError')
              : task.enabled
              ? t('common.enabled')
              : t('common.disabled')}
          </Badge>

          {/* Toggle */}
          <Switch
            checked={task.enabled}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(checked) => onToggleTask(task.id, checked)}
            className="shrink-0"
          />

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                aria-label="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent
              align="end"
              light
              onClick={(e) => e.stopPropagation()}
            >
              <StyledDropdownMenuItem
                disabled={task.state.lastStatus === 'running'}
                onSelect={() => onRunManually(task.id)}
              >
                <Play className="w-3.5 h-3.5" />
                {t('scheduledTasks.run')}
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem onSelect={() => onEdit(task.id)}>
                <Pencil className="w-3.5 h-3.5" />
                {t('scheduledTasks.edit')}
              </StyledDropdownMenuItem>
              <StyledDropdownMenuItem
                variant="destructive"
                onSelect={() => onDelete(task.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('scheduledTasks.delete')}
              </StyledDropdownMenuItem>
            </StyledDropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}

// --- Helpers ---

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function formatScheduleLabel(schedule: Schedule, t: (key: string) => string): string {
  switch (schedule.type) {
    case 'at':
      return new Date(schedule.datetime).toLocaleString()
    case 'interval':
      return `${t('scheduledTasks.every')} ${schedule.value} ${t(`scheduledTasks.unit.${schedule.unit}`)}`
    case 'cron': {
      // Try to produce a human-readable label from simple cron patterns
      const parts = schedule.expression.split(/\s+/)
      if (parts.length === 5) {
        const [min, hour, dayOfMonth, , dayOfWeek] = parts
        // Daily: "0 9 * * *"
        if (dayOfMonth === '*' && dayOfWeek === '*' && min !== '*' && hour !== '*') {
          return `${t('scheduledTasks.daily')} ${hour}:${min!.padStart(2, '0')}`
        }
        // Weekly: "0 9 * * 1"
        if (dayOfMonth === '*' && dayOfWeek !== '*' && min !== '*' && hour !== '*') {
          const dayName = t(`scheduledTasks.weekday.${WEEKDAY_KEYS[parseInt(dayOfWeek!)] ?? dayOfWeek}`)
          return `${t('scheduledTasks.weekly')} ${dayName} ${hour}:${min!.padStart(2, '0')}`
        }
        // Monthly: "0 9 15 * *"
        if (dayOfMonth !== '*' && dayOfWeek === '*' && min !== '*' && hour !== '*') {
          return `${t('scheduledTasks.monthly')} ${dayOfMonth}${t('scheduledTasks.daySuffix')} ${hour}:${min!.padStart(2, '0')}`
        }
      }
      return schedule.expression
    }
    default:
      return ''
  }
}
