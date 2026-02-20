/**
 * ScheduledTasksView
 *
 * Scheduled task detail panel (detail/create/edit + global history).
 */

import * as React from 'react'
import { ArrowLeft, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { ScheduledTaskInput } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { useNavigation } from '@/contexts/NavigationContext'
import { routes } from '@/lib/navigate'
import { useScheduledTasks } from '@/hooks/useScheduledTasks'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TaskForm } from './TaskForm'
import { TaskDetail } from './TaskDetail'
import { AllRunsHistory } from './AllRunsHistory'

type TabType = 'tasks' | 'history'

interface ScheduledTasksViewProps {
  workspaceId: string | null
  filterKind: 'scheduled' | 'scheduledTask'
  filterTaskId: string | null
  onViewSession: (sessionId: string, taskId: string | null) => void
}

export function ScheduledTasksView({
  workspaceId,
  filterKind,
  filterTaskId,
  onViewSession,
}: ScheduledTasksViewProps) {
  const { t } = useLanguage()
  const { navigate } = useNavigation()
  const {
    tasks,
    selectedTaskId,
    viewMode,
    setSelectedTaskId,
    setViewMode,
    createTask,
    updateTask,
    deleteTask,
    runManually,
  } = useScheduledTasks(workspaceId)
  const [activeTab, setActiveTab] = React.useState<TabType>('tasks')
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const prevFilterKindRef = React.useRef<'scheduled' | 'scheduledTask'>(filterKind)
  const hasAutoSelectedRef = React.useRef(false)

  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId) ?? null
    : null

  React.useEffect(() => {
    if (filterKind === 'scheduledTask' && filterTaskId) {
      setSelectedTaskId(filterTaskId)
      if (viewMode === 'list') {
        setViewMode('detail')
      }
    }
  }, [filterKind, filterTaskId, setSelectedTaskId, setViewMode, viewMode])

  React.useEffect(() => {
    const previous = prevFilterKindRef.current
    prevFilterKindRef.current = filterKind
    if (previous === 'scheduledTask' && filterKind === 'scheduled') {
      hasAutoSelectedRef.current = false
      setSelectedTaskId(null)
      setViewMode('list')
    }
  }, [filterKind, setSelectedTaskId, setViewMode])

  React.useEffect(() => {
    if (filterKind !== 'scheduled') return
    if (activeTab !== 'tasks') return
    if (hasAutoSelectedRef.current) return
    if (viewMode !== 'list' || selectedTaskId) return
    const firstTask = tasks[0]
    if (!firstTask) return

    hasAutoSelectedRef.current = true
    setSelectedTaskId(firstTask.id)
    setViewMode('detail')
  }, [filterKind, activeTab, viewMode, selectedTaskId, tasks, setSelectedTaskId, setViewMode])

  React.useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null)
      setViewMode('list')
      navigate(routes.view.scheduled())
    }
  }, [selectedTaskId, tasks, setSelectedTaskId, setViewMode, navigate])

  const handleBackToList = React.useCallback(() => {
    setSelectedTaskId(null)
    setViewMode('list')
    navigate(routes.view.scheduled())
  }, [setSelectedTaskId, setViewMode, navigate])

  const handleCreateSubmit = React.useCallback(async (input: ScheduledTaskInput) => {
    const task = await createTask(input)
    setSelectedTaskId(task.id)
    setViewMode('detail')
    navigate(routes.view.scheduledTask(task.id))
  }, [createTask, setSelectedTaskId, setViewMode, navigate])

  const handleUpdateSubmit = React.useCallback(async (input: ScheduledTaskInput) => {
    if (!selectedTask) return
    await updateTask(selectedTask.id, input)
    setViewMode('detail')
  }, [selectedTask, updateTask, setViewMode])

  const handleDeleteConfirm = React.useCallback(async () => {
    if (!deleteTarget) return
    await deleteTask(deleteTarget.id)
    toast.success(t('scheduledTasks.taskDeleted'))
    if (selectedTaskId === deleteTarget.id) {
      handleBackToList()
    }
    setDeleteTarget(null)
  }, [deleteTarget, deleteTask, selectedTaskId, handleBackToList, t])

  const handleRunManually = React.useCallback(async (taskId: string) => {
    await runManually(taskId)
    toast.success(t('scheduledTasks.taskStarted'))
  }, [runManually, t])

  const showTabs = viewMode === 'list' && !selectedTaskId
  const hasTasks = tasks.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-12 items-center justify-between px-4 border-b border-border shrink-0 relative z-panel titlebar-no-drag">
        <div className="flex items-center gap-2">
          {(viewMode === 'create' || viewMode === 'edit') && (
            <Button
              type="button"
              onClick={handleBackToList}
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base font-semibold text-foreground">
            {t('scheduledTasks.title')}
          </h1>
        </div>
      </div>

      {showTabs && (
        <div className="flex items-center border-b border-border px-4 py-2 shrink-0 titlebar-no-drag">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)}>
            <TabsList>
              <TabsTrigger value="tasks">{t('scheduledTasks.tabTasks')}</TabsTrigger>
              <TabsTrigger value="history">{t('scheduledTasks.tabHistory')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {showTabs && activeTab === 'history' ? (
          <AllRunsHistory
            workspaceId={workspaceId}
            onViewSession={onViewSession}
          />
        ) : (
          <>
            {viewMode === 'list' && (
              <Empty className="h-full pb-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock className="h-8 w-8" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasTasks ? t('scheduledTasks.manageHint') : t('scheduledTasks.emptyState')}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

            {viewMode === 'create' && (
              <TaskForm
                onSubmit={handleCreateSubmit}
                onCancel={handleBackToList}
              />
            )}

            {viewMode === 'edit' && selectedTask && (
              <TaskForm
                task={selectedTask}
                onSubmit={handleUpdateSubmit}
                onCancel={() => setViewMode('detail')}
              />
            )}

            {viewMode === 'detail' && selectedTask && (
              <TaskDetail
                workspaceId={workspaceId}
                task={selectedTask}
                onEdit={() => setViewMode('edit')}
                onDelete={() => setDeleteTarget({ id: selectedTask.id, name: selectedTask.name })}
                onRunNow={() => void handleRunManually(selectedTask.id)}
                onViewSession={(sessionId) => onViewSession(sessionId, selectedTask.id)}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('scheduledTasks.deleteConfirm')}</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? t('scheduledTasks.deleteConfirmMessage').replace('{name}', deleteTarget.name)
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
