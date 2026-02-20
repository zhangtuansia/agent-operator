/**
 * TaskForm
 *
 * Form for creating or editing scheduled tasks.
 * Supports once, daily, weekly, monthly schedule types via cron expressions.
 */

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import type { ScheduledTask, ScheduledTaskInput, Schedule } from '@agent-operator/shared/scheduled-tasks'
import { useLanguage } from '@/context/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type ScheduleMode = 'once' | 'daily' | 'weekly' | 'monthly'

interface TaskFormProps {
  task?: ScheduledTask
  onSubmit: (input: ScheduledTaskInput) => Promise<void>
  onCancel: () => void
}

interface FormErrors {
  name?: string
  prompt?: string
  time?: string
  workingDirectory?: string
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const { t } = useLanguage()
  const isEdit = !!task

  const nameId = React.useId()
  const promptId = React.useId()
  const scheduleTypeId = React.useId()
  const workingDirectoryId = React.useId()
  const runCountId = React.useId()
  const expiresAtId = React.useId()
  const enabledId = React.useId()
  const notifyId = React.useId()

  // Parse existing schedule to UI state
  const initialScheduleState = useMemo(() => parseScheduleToUI(task?.schedule), [task])

  const [name, setName] = useState(task?.name ?? '')
  const [prompt, setPrompt] = useState(task?.prompt ?? '')
  const [workingDirectory, setWorkingDirectory] = useState(task?.workingDirectory ?? '')
  const [enabled, setEnabled] = useState(task?.enabled ?? true)
  const [notify, setNotify] = useState(task?.notify ?? true)
  const [runCount, setRunCount] = useState('')
  const [expiresAt, setExpiresAt] = useState(task?.expiresAt ?? '')

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(initialScheduleState.mode)
  const [onceDate, setOnceDate] = useState(initialScheduleState.onceDate)
  const [onceTime, setOnceTime] = useState(initialScheduleState.onceTime)
  const [dailyTime, setDailyTime] = useState(initialScheduleState.dailyTime)
  const [weekday, setWeekday] = useState(initialScheduleState.weekday)
  const [weeklyTime, setWeeklyTime] = useState(initialScheduleState.weeklyTime)
  const [monthDay, setMonthDay] = useState(initialScheduleState.monthDay)
  const [monthlyTime, setMonthlyTime] = useState(initialScheduleState.monthlyTime)

  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const validate = useCallback((): FormErrors => {
    const e: FormErrors = {}
    if (!name.trim()) e.name = t('scheduledTasks.validation.nameRequired')
    if (!prompt.trim()) e.prompt = t('scheduledTasks.validation.promptRequired')

    if (scheduleMode === 'once') {
      if (!onceDate || !onceTime) {
        e.time = t('scheduledTasks.validation.timeRequired')
      } else {
        const dt = new Date(`${onceDate}T${onceTime}`)
        if (dt.getTime() <= Date.now()) {
          e.time = t('scheduledTasks.validation.datetimeFuture')
        }
      }
    }

    return e
  }, [name, prompt, scheduleMode, onceDate, onceTime, t])

  const buildSchedule = useCallback((): Schedule => {
    switch (scheduleMode) {
      case 'once':
        return { type: 'at', datetime: new Date(`${onceDate}T${onceTime}`).toISOString() }
      case 'daily': {
        const [h, m] = dailyTime.split(':')
        return { type: 'cron', expression: `${parseInt(m!)} ${parseInt(h!)} * * *` }
      }
      case 'weekly': {
        const [h, m] = weeklyTime.split(':')
        return { type: 'cron', expression: `${parseInt(m!)} ${parseInt(h!)} * * ${weekday}` }
      }
      case 'monthly': {
        const [h, m] = monthlyTime.split(':')
        return { type: 'cron', expression: `${parseInt(m!)} ${parseInt(h!)} ${monthDay} * *` }
      }
    }
  }, [scheduleMode, onceDate, onceTime, dailyTime, weekday, weeklyTime, monthDay, monthlyTime])

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const input: ScheduledTaskInput = {
        name: name.trim(),
        description: '',
        schedule: buildSchedule(),
        prompt: prompt.trim(),
        workingDirectory,
        systemPrompt: '',
        expiresAt: expiresAt || null,
        enabled,
        notify,
      }
      await onSubmit(input)
    } catch (err) {
      console.error('[TaskForm] Submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [validate, name, prompt, workingDirectory, enabled, notify, expiresAt, buildSchedule, onSubmit])

  const handleBrowseDirectory = useCallback(async () => {
    try {
      const result = await window.electronAPI.openFolderDialog()
      if (result) setWorkingDirectory(result)
    } catch (err) {
      console.error('[TaskForm] Failed to open folder dialog:', err)
    }
  }, [])

  const WEEKDAYS = [
    { value: '0', label: t('scheduledTasks.weekday.sun') },
    { value: '1', label: t('scheduledTasks.weekday.mon') },
    { value: '2', label: t('scheduledTasks.weekday.tue') },
    { value: '3', label: t('scheduledTasks.weekday.wed') },
    { value: '4', label: t('scheduledTasks.weekday.thu') },
    { value: '5', label: t('scheduledTasks.weekday.fri') },
    { value: '6', label: t('scheduledTasks.weekday.sat') },
  ]

  const fieldLabelClassName = 'mb-1.5 text-xs text-muted-foreground'

  return (
    <div className="p-4 space-y-4">
      {/* Name */}
      <div>
        <Label htmlFor={nameId} className={fieldLabelClassName}>
          {t('scheduledTasks.form.name')}
        </Label>
        <Input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('scheduledTasks.form.namePlaceholder')}
        />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>

      {/* Prompt */}
      <div>
        <Label htmlFor={promptId} className={fieldLabelClassName}>
          {t('scheduledTasks.form.prompt')}
        </Label>
        <Textarea
          id={promptId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('scheduledTasks.form.promptPlaceholder')}
          rows={6}
          className="resize-y"
        />
        {errors.prompt && <p className="text-xs text-destructive mt-1">{errors.prompt}</p>}
      </div>

      {/* Schedule Type */}
      <div>
        <Label htmlFor={scheduleTypeId} className={fieldLabelClassName}>
          {t('scheduledTasks.form.scheduleType')}
        </Label>
        <Select
          value={scheduleMode}
          onValueChange={(value) => setScheduleMode(value as ScheduleMode)}
        >
          <SelectTrigger id={scheduleTypeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">{t('scheduledTasks.form.modeOnce')}</SelectItem>
            <SelectItem value="daily">{t('scheduledTasks.form.modeDaily')}</SelectItem>
            <SelectItem value="weekly">{t('scheduledTasks.form.modeWeekly')}</SelectItem>
            <SelectItem value="monthly">{t('scheduledTasks.form.modeMonthly')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Schedule details */}
      <div className="space-y-2">
        {scheduleMode === 'once' && (
          <div className="flex gap-2">
            <Input
              type="date"
              value={onceDate}
              onChange={(e) => setOnceDate(e.target.value)}
              className="flex-1"
            />
            <Input
              type="time"
              value={onceTime}
              onChange={(e) => setOnceTime(e.target.value)}
              className="w-32"
            />
          </div>
        )}
        {scheduleMode === 'daily' && (
          <Input
            type="time"
            value={dailyTime}
            onChange={(e) => setDailyTime(e.target.value)}
          />
        )}
        {scheduleMode === 'weekly' && (
          <div className="flex gap-2">
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="time"
              value={weeklyTime}
              onChange={(e) => setWeeklyTime(e.target.value)}
              className="w-32"
            />
          </div>
        )}
        {scheduleMode === 'monthly' && (
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={31}
              value={monthDay}
              onChange={(e) => setMonthDay(e.target.value)}
              className="w-24"
            />
            <span className="self-center text-xs text-muted-foreground">{t('scheduledTasks.daySuffix')}</span>
            <Input
              type="time"
              value={monthlyTime}
              onChange={(e) => setMonthlyTime(e.target.value)}
              className="w-32"
            />
          </div>
        )}
        {errors.time && <p className="text-xs text-destructive">{errors.time}</p>}
      </div>

      {/* Working Directory */}
      <div>
        <Label htmlFor={workingDirectoryId} className={fieldLabelClassName}>
          {t('scheduledTasks.form.workingDirectory')}
        </Label>
        <div className="flex gap-2">
          <Input
            id={workingDirectoryId}
            type="text"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder={t('scheduledTasks.form.workingDirectoryPlaceholder')}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleBrowseDirectory}
          >
            <FolderOpen className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Run Count + Expires At */}
      {scheduleMode !== 'once' && (
        <div>
          <Label htmlFor={runCountId} className={fieldLabelClassName}>
            {t('scheduledTasks.form.runCount')}
            <span className="ml-1 text-muted-foreground/60">({t('scheduledTasks.form.optional')})</span>
          </Label>
          <Input
            id={runCountId}
            type="number"
            min={1}
            value={runCount}
            onChange={(e) => {
              const val = e.target.value
              setRunCount(val)
              const n = parseInt(val, 10)
              if (n > 0) {
                setExpiresAt(calculateExpiresAt(scheduleMode, n, dailyTime, weekday, weeklyTime, monthDay, monthlyTime))
              }
            }}
            placeholder={t('scheduledTasks.form.runCountPlaceholder')}
          />
          {runCount && expiresAt && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('scheduledTasks.form.runCountHint').replace('{date}', expiresAt)}
            </p>
          )}
        </div>
      )}

      {/* Expires At */}
      <div>
        <Label htmlFor={expiresAtId} className={fieldLabelClassName}>
          {t('scheduledTasks.form.expiresAt')}
          <span className="ml-1 text-muted-foreground/60">({t('scheduledTasks.form.optional')})</span>
        </Label>
        <Input
          id={expiresAtId}
          type="date"
          value={expiresAt}
          onChange={(e) => {
            setExpiresAt(e.target.value)
            setRunCount('') // Clear run count when manually setting date
          }}
        />
      </div>

      {/* Enabled & Notify */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id={enabledId}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor={enabledId} className="text-sm font-normal cursor-pointer">
            {t('scheduledTasks.form.enabled')}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={notifyId}
            checked={notify}
            onCheckedChange={setNotify}
          />
          <Label htmlFor={notifyId} className="text-sm font-normal cursor-pointer">
            {t('scheduledTasks.notifyOnCompletion')}
          </Label>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {isEdit ? t('scheduledTasks.form.update') : t('scheduledTasks.form.create')}
        </Button>
      </div>
    </div>
  )
}

// --- Helpers ---

/**
 * Calculate expiresAt date from a run count and schedule mode.
 * E.g., daily + 5 runs → 5 days from now; weekly + 3 runs → 3 weeks from now.
 * Returns ISO date string (YYYY-MM-DD) set to the day AFTER the last expected run.
 */
function calculateExpiresAt(
  mode: ScheduleMode,
  count: number,
  dailyTime: string,
  weekday: string,
  weeklyTime: string,
  monthDay: string,
  monthlyTime: string,
): string {
  const now = new Date()

  switch (mode) {
    case 'daily': {
      // Parse the daily run time
      const [h, m] = dailyTime.split(':').map(Number)
      const todayRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 9, m ?? 0)
      // If today's run time hasn't passed, today counts as run 1; otherwise start from tomorrow
      const startDate = now < todayRun ? now : new Date(now.getTime() + 86400000)
      const lastRunDate = new Date(startDate.getTime() + (count - 1) * 86400000)
      // Expire the day after the last run
      const expiresDate = new Date(lastRunDate.getTime() + 86400000)
      return expiresDate.toISOString().slice(0, 10)
    }
    case 'weekly': {
      // Find the next occurrence of the target weekday
      const targetDay = parseInt(weekday, 10) // 0=Sun, 1=Mon, ...
      let daysUntilNext = (targetDay - now.getDay() + 7) % 7
      const [h, m] = weeklyTime.split(':').map(Number)
      const todayRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 9, m ?? 0)
      if (daysUntilNext === 0 && now >= todayRun) daysUntilNext = 7
      const firstRun = new Date(now.getTime() + daysUntilNext * 86400000)
      const lastRunDate = new Date(firstRun.getTime() + (count - 1) * 7 * 86400000)
      const expiresDate = new Date(lastRunDate.getTime() + 86400000)
      return expiresDate.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const day = parseInt(monthDay, 10) || 1
      const [h, m] = monthlyTime.split(':').map(Number)
      // Find next occurrence of the target day
      let nextMonth = now.getMonth()
      let nextYear = now.getFullYear()
      const todayRun = new Date(nextYear, nextMonth, day, h ?? 9, m ?? 0)
      if (now >= todayRun || now.getDate() > day) {
        nextMonth++
        if (nextMonth > 11) { nextMonth = 0; nextYear++ }
      }
      // Advance by (count - 1) months from the first run
      let finalMonth = nextMonth + (count - 1)
      let finalYear = nextYear
      while (finalMonth > 11) { finalMonth -= 12; finalYear++ }
      const lastRunDate = new Date(finalYear, finalMonth, day)
      const expiresDate = new Date(lastRunDate.getTime() + 86400000)
      return expiresDate.toISOString().slice(0, 10)
    }
    default:
      return ''
  }
}

interface ScheduleUIState {
  mode: ScheduleMode
  onceDate: string
  onceTime: string
  dailyTime: string
  weekday: string
  weeklyTime: string
  monthDay: string
  monthlyTime: string
}

function parseScheduleToUI(schedule?: Schedule): ScheduleUIState {
  const defaults: ScheduleUIState = {
    mode: 'daily',
    onceDate: new Date().toISOString().slice(0, 10),
    onceTime: '09:00',
    dailyTime: '09:00',
    weekday: '1',
    weeklyTime: '09:00',
    monthDay: '1',
    monthlyTime: '09:00',
  }

  if (!schedule) return defaults

  if (schedule.type === 'at') {
    const dt = new Date(schedule.datetime)
    return {
      ...defaults,
      mode: 'once',
      onceDate: dt.toISOString().slice(0, 10),
      onceTime: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
    }
  }

  if (schedule.type === 'cron') {
    const parts = schedule.expression.split(/\s+/)
    if (parts.length === 5) {
      const [min, hour, dayOfMonth, , dayOfWeek] = parts
      const time = `${hour!.padStart(2, '0')}:${min!.padStart(2, '0')}`

      if (dayOfMonth === '*' && dayOfWeek === '*') {
        return { ...defaults, mode: 'daily', dailyTime: time }
      }
      if (dayOfMonth === '*' && dayOfWeek !== '*') {
        return { ...defaults, mode: 'weekly', weekday: dayOfWeek!, weeklyTime: time }
      }
      if (dayOfMonth !== '*' && dayOfWeek === '*') {
        return { ...defaults, mode: 'monthly', monthDay: dayOfMonth!, monthlyTime: time }
      }
    }
  }

  return defaults
}
