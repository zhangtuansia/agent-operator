/**
 * TaskList
 *
 * Displays all scheduled tasks with chat-list style interactions.
 */

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Clock,
  Play,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  ToggleLeft,
} from 'lucide-react'
import type { ScheduledTask, Schedule } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { getDateFnsLocale } from '@/i18n'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
} from '@/components/ui/styled-dropdown'
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from '@/components/ui/styled-context-menu'
import { DropdownMenuProvider, ContextMenuProvider } from '@/components/ui/menu-context'
import { useMenuComponents } from '@/components/ui/menu-context'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

interface TaskListProps {
  tasks: ScheduledTask[]
  selectedTaskId?: string | null
  isLoading: boolean
  onSelectTask: (taskId: string) => void
  onToggleTask: (taskId: string, enabled: boolean) => void
  onRunManually: (taskId: string) => void
  onDelete: (taskId: string) => void
  onEdit: (taskId: string) => void
}

export function TaskList({
  tasks,
  selectedTaskId = null,
  isLoading,
  onSelectTask,
  onToggleTask,
  onRunManually,
  onDelete,
  onEdit,
}: TaskListProps) {
  const { t, language } = useLanguage()

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

  const formatTaskMeta = (task: ScheduledTask) => {
    const scheduleLabel = formatScheduleLabel(task.schedule, t)
    if (!task.state.lastRunAtMs) return scheduleLabel
    return `${scheduleLabel} · ${formatDistanceToNow(new Date(task.state.lastRunAtMs), {
      addSuffix: true,
      locale: getDateFnsLocale(language),
    })}`
  }

  return (
    <ScrollArea className="flex-1">
      <div className="pt-2 pb-2">
        {tasks.map((task, index) => (
          <TaskItem
            key={task.id}
            task={task}
            isSelected={selectedTaskId === task.id}
            isFirst={index === 0}
            subtitle={formatTaskMeta(task)}
            onSelect={() => onSelectTask(task.id)}
            onToggleTask={(enabled) => onToggleTask(task.id, enabled)}
            onRun={() => onRunManually(task.id)}
            onEdit={() => onEdit(task.id)}
            onDelete={() => onDelete(task.id)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

interface TaskItemProps {
  task: ScheduledTask
  isSelected: boolean
  isFirst: boolean
  subtitle: string
  onSelect: () => void
  onToggleTask: (enabled: boolean) => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}

function getTaskStatusBadge(task: ScheduledTask, t: (key: string) => string): { label: string; classes: string } {
  if (!task.enabled) {
    return { label: t('common.disabled'), classes: 'bg-foreground/10 text-foreground/55' }
  }
  if (task.state.lastStatus === 'running') {
    return { label: t('scheduledTasks.statusRunning'), classes: 'bg-info/10 text-info' }
  }
  if (task.state.lastStatus === 'success') {
    return { label: t('scheduledTasks.statusSuccess'), classes: 'bg-success/10 text-success' }
  }
  if (task.state.lastStatus === 'error') {
    return { label: t('scheduledTasks.statusError'), classes: 'bg-destructive/10 text-destructive' }
  }
  return { label: t('common.enabled'), classes: 'bg-accent/10 text-accent' }
}

function TaskActionsMenu({
  enabled,
  isRunning,
  onToggleTask,
  onRun,
  onEdit,
  onDelete,
}: {
  enabled: boolean
  isRunning: boolean
  onToggleTask: (enabled: boolean) => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useLanguage()
  const { MenuItem, Separator } = useMenuComponents()

  return (
    <>
      <MenuItem onClick={() => onToggleTask(!enabled)}>
        <ToggleLeft className={cn('h-3.5 w-3.5', !enabled && 'opacity-50')} />
        <span className="flex-1">{t('scheduledTasks.form.enabled')}</span>
        <Switch
          checked={enabled}
          aria-hidden="true"
          className="scale-[0.8] pointer-events-none"
        />
      </MenuItem>
      <Separator />
      <MenuItem disabled={isRunning} onClick={onRun}>
        <Play className="h-3.5 w-3.5" />
        <span className="flex-1">{t('scheduledTasks.run')}</span>
      </MenuItem>
      <MenuItem onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="flex-1">{t('scheduledTasks.edit')}</span>
      </MenuItem>
      <MenuItem onClick={onDelete} variant="destructive">
        <Trash2 className="h-3.5 w-3.5" />
        <span className="flex-1">{t('scheduledTasks.delete')}</span>
      </MenuItem>
    </>
  )
}

function TaskItem({
  task,
  isSelected,
  isFirst,
  subtitle,
  onSelect,
  onToggleTask,
  onRun,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false)
  const { t } = useLanguage()
  const statusBadge = getTaskStatusBadge(task, t)

  return (
    <div className="task-item" data-selected={isSelected || undefined}>
      {!isFirst && (
        <div className="task-separator pl-12 pr-4">
          <Separator />
        </div>
      )}
      <ContextMenu modal={true} onOpenChange={setContextMenuOpen}>
        <ContextMenuTrigger asChild>
          <div className="task-content relative group select-none pl-2 mr-2">
            <div className="absolute left-[18px] top-3.5 z-10 flex items-center justify-center">
              {task.state.lastStatus === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin text-info" />
              ) : (
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    !task.enabled
                      ? 'bg-muted-foreground/30'
                      : task.state.lastStatus === 'success'
                      ? 'bg-success'
                      : task.state.lastStatus === 'error'
                      ? 'bg-destructive'
                      : 'bg-foreground/40'
                  )}
                />
              )}
            </div>

            <button
              type="button"
              className={cn(
                'flex w-full items-start gap-2 pl-2 pr-4 py-3 text-left text-sm outline-none rounded-[8px]',
                'transition-[background-color] duration-75',
                isSelected ? 'bg-foreground/5 hover:bg-foreground/7' : 'hover:bg-foreground/2'
              )}
              onClick={onSelect}
              aria-selected={isSelected}
            >
              <div className="w-5 h-5 shrink-0" />
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex items-start gap-2 w-full pr-10 min-w-0">
                  <div
                    className={cn(
                      'font-medium font-sans line-clamp-2 min-w-0 -mb-[2px]',
                      !task.enabled && 'text-muted-foreground/70 line-through'
                    )}
                  >
                    {task.name}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-foreground/70 w-full -mb-[2px] pr-10 min-w-0">
                  <span className={cn('shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded', statusBadge.classes)}>
                    {statusBadge.label}
                  </span>
                  <span className="truncate">{subtitle}</span>
                </div>
              </div>
            </button>

            <div
              className={cn(
                'absolute right-2 top-2 transition-opacity z-10',
                menuOpen || contextMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <div className="flex items-center rounded-[8px] overflow-hidden border border-transparent hover:border-border/50">
                <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <div className="p-1.5 hover:bg-foreground/10 data-[state=open]:bg-foreground/10 cursor-pointer">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </DropdownMenuTrigger>
                  <StyledDropdownMenuContent align="end">
                    <DropdownMenuProvider>
                      <TaskActionsMenu
                        enabled={task.enabled}
                        isRunning={task.state.lastStatus === 'running'}
                        onToggleTask={onToggleTask}
                        onRun={onRun}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    </DropdownMenuProvider>
                  </StyledDropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <StyledContextMenuContent>
          <ContextMenuProvider>
            <TaskActionsMenu
              enabled={task.enabled}
              isRunning={task.state.lastStatus === 'running'}
              onToggleTask={onToggleTask}
              onRun={onRun}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </ContextMenuProvider>
        </StyledContextMenuContent>
      </ContextMenu>
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
