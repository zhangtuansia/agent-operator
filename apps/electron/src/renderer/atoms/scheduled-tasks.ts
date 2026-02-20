/**
 * Scheduled Tasks Atoms
 *
 * Jotai atoms for scheduled task state management.
 * Replaces LobsterAI's Redux scheduledTaskSlice.
 */

import { atom } from 'jotai'
import type { ScheduledTask, ScheduledTaskRun } from '@agent-operator/shared/scheduled-tasks'

/** All scheduled tasks for the current workspace */
export const scheduledTasksAtom = atom<ScheduledTask[]>([])

/** Currently selected task ID (for detail view) */
export const selectedScheduledTaskIdAtom = atom<string | null>(null)

/** Run history for the selected task */
export const scheduledTaskRunsAtom = atom<ScheduledTaskRun[]>([])

/** Loading state */
export const scheduledTasksLoadingAtom = atom(false)

/** View mode for the scheduled tasks panel */
export type ScheduledTaskViewMode = 'list' | 'create' | 'edit' | 'detail'
export const scheduledTaskViewModeAtom = atom<ScheduledTaskViewMode>('list')
