/**
 * useScheduledTasks Hook
 *
 * React hook for scheduled task CRUD operations and event listening.
 * Replaces LobsterAI's services/scheduledTask.ts + scheduledTaskSlice.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import type {
  ScheduledTask,
  ScheduledTaskRun,
  ScheduledTaskRunWithName,
  ScheduledTaskInput,
  ScheduledTaskStatusEvent,
  ScheduledTaskRunEvent,
} from '@agent-operator/shared/scheduled-tasks'
import {
  scheduledTasksAtom,
  selectedScheduledTaskIdAtom,
  scheduledTaskRunsAtom,
  scheduledTasksLoadingAtom,
  scheduledTaskViewModeAtom,
  type ScheduledTaskViewMode,
} from '../atoms/scheduled-tasks'

interface UseScheduledTasksResult {
  tasks: ScheduledTask[]
  selectedTaskId: string | null
  viewMode: ScheduledTaskViewMode
  isLoading: boolean
  setSelectedTaskId: (id: string | null) => void
  setViewMode: (mode: ScheduledTaskViewMode) => void
  refresh: () => Promise<void>
  createTask: (input: ScheduledTaskInput) => Promise<ScheduledTask>
  updateTask: (taskId: string, input: Partial<ScheduledTaskInput>) => Promise<ScheduledTask | null>
  deleteTask: (taskId: string) => Promise<boolean>
  toggleTask: (taskId: string, enabled: boolean) => Promise<{ task: ScheduledTask | null; warning: string | null }>
  runManually: (taskId: string) => Promise<void>
  stopTask: (taskId: string) => Promise<boolean>
}

export function useScheduledTasks(workspaceId: string | null): UseScheduledTasksResult {
  const [tasks, setTasks] = useAtom(scheduledTasksAtom)
  const [selectedTaskId, setSelectedTaskId] = useAtom(selectedScheduledTaskIdAtom)
  const [isLoading, setIsLoading] = useAtom(scheduledTasksLoadingAtom)
  const [viewMode, setViewMode] = useAtom(scheduledTaskViewModeAtom)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setTasks([])
      return
    }

    try {
      setIsLoading(true)
      const result = await window.electronAPI.listScheduledTasks(workspaceId)
      setTasks(result)
    } catch (err) {
      console.error('[useScheduledTasks] Failed to load tasks:', err)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, setTasks, setIsLoading])

  // Load on mount and workspace change
  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to live task changes
  useEffect(() => {
    if (!workspaceId) return

    const cleanupChanged = window.electronAPI.onScheduledTasksChanged((changedWorkspaceId?: string) => {
      if (changedWorkspaceId && changedWorkspaceId !== workspaceId) return
      refresh()
    })

    const cleanupStatus = window.electronAPI.onScheduledTaskStatusUpdate((event: ScheduledTaskStatusEvent) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === event.taskId ? { ...t, state: event.state } : t
        )
      )
    })

    return () => {
      cleanupChanged()
      cleanupStatus()
    }
  }, [workspaceId, refresh, setTasks])

  const createTask = useCallback(async (input: ScheduledTaskInput) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.createScheduledTask(workspaceId, input)
  }, [workspaceId])

  const updateTask = useCallback(async (taskId: string, input: Partial<ScheduledTaskInput>) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.updateScheduledTask(workspaceId, taskId, input)
  }, [workspaceId])

  const deleteTask = useCallback(async (taskId: string) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.deleteScheduledTask(workspaceId, taskId)
  }, [workspaceId])

  const toggleTask = useCallback(async (taskId: string, enabled: boolean) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.toggleScheduledTask(workspaceId, taskId, enabled)
  }, [workspaceId])

  const runManually = useCallback(async (taskId: string) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.runScheduledTaskManually(workspaceId, taskId)
  }, [workspaceId])

  const stopTask = useCallback(async (taskId: string) => {
    if (!workspaceId) throw new Error('No workspace')
    return window.electronAPI.stopScheduledTask(workspaceId, taskId)
  }, [workspaceId])

  return {
    tasks,
    selectedTaskId,
    viewMode,
    isLoading,
    setSelectedTaskId,
    setViewMode,
    refresh,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
    runManually,
    stopTask,
  }
}

// --- useTaskRuns ---

interface UseTaskRunsResult {
  runs: ScheduledTaskRun[]
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useTaskRuns(workspaceId: string | null, taskId: string | null): UseTaskRunsResult {
  const [runs, setRuns] = useAtom(scheduledTaskRunsAtom)
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!workspaceId || !taskId) {
      setRuns([])
      return
    }

    try {
      setIsLoading(true)
      const result = await window.electronAPI.listScheduledTaskRuns(workspaceId, taskId)
      setRuns(result)
    } catch (err) {
      console.error('[useTaskRuns] Failed to load runs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, taskId, setRuns])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to run updates
  useEffect(() => {
    if (!taskId) return

    const cleanup = window.electronAPI.onScheduledTaskRunUpdate((event: ScheduledTaskRunEvent) => {
      if (event.run.taskId === taskId) {
        setRuns((prev) => {
          const idx = prev.findIndex((r) => r.id === event.run.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = event.run
            return next
          }
          return [event.run, ...prev]
        })
      }
    })

    return cleanup
  }, [taskId, setRuns])

  return { runs, isLoading, refresh }
}

// --- useAllTaskRuns ---

interface UseAllTaskRunsResult {
  runs: ScheduledTaskRunWithName[]
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useAllTaskRuns(workspaceId: string | null): UseAllTaskRunsResult {
  const [runs, setRuns] = useState<ScheduledTaskRunWithName[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setRuns([])
      return
    }

    try {
      setIsLoading(true)
      const result = await window.electronAPI.listAllScheduledTaskRuns(workspaceId)
      setRuns(result)
    } catch (err) {
      console.error('[useAllTaskRuns] Failed to load runs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to run updates
  useEffect(() => {
    const cleanup = window.electronAPI.onScheduledTaskRunUpdate(() => {
      refresh()
    })
    return cleanup
  }, [refresh])

  return { runs, isLoading, refresh }
}
