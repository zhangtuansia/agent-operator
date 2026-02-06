/**
 * PreferencesPage
 *
 * Form-based editor for stored user preferences (~/.cowork/preferences.json).
 * Features:
 * - Fixed input fields for known preferences (name, timezone, location, language)
 * - Free-form textarea for notes
 * - Auto-saves on change with debouncing
 */

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@agent-operator/ui'
import {
  SettingsSection,
  SettingsCard,
  SettingsInput,
  SettingsTextarea,
  SettingsSelect,
} from '@/components/settings'

// Common timezone options - returns localized options
const getTimezoneOptions = (autoLabel: string) => [
  { value: 'auto', label: autoLabel },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (中国标准时间)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (日本标准时间)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (香港时间)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (新加坡时间)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (韩国标准时间)' },
  { value: 'America/New_York', label: 'America/New_York (美国东部)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (美国西部)' },
  { value: 'America/Chicago', label: 'America/Chicago (美国中部)' },
  { value: 'Europe/London', label: 'Europe/London (英国时间)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (中欧时间)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (德国时间)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (澳大利亚东部)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (新西兰时间)' },
]

// Get user's system timezone
const getSystemTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Asia/Shanghai'
  }
}
import { EditPopover, EditButton, getEditConfig } from '@/components/ui/EditPopover'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import { useLanguage } from '@/context/LanguageContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'preferences',
}

interface PreferencesFormState {
  name: string
  timezone: string
  language: string
  city: string
  country: string
  notes: string
}

const emptyFormState: PreferencesFormState = {
  name: '',
  timezone: 'auto', // Default to auto (system timezone)
  language: '',
  city: '',
  country: '',
  notes: '',
}

// Parse JSON to form state
function parsePreferences(json: string): PreferencesFormState {
  try {
    const prefs = JSON.parse(json)
    return {
      name: prefs.name || '',
      timezone: prefs.timezone || '',
      language: prefs.language || '',
      city: prefs.location?.city || '',
      country: prefs.location?.country || '',
      notes: prefs.notes || '',
    }
  } catch {
    return emptyFormState
  }
}

// Serialize form state to JSON
function serializePreferences(state: PreferencesFormState): string {
  const prefs: Record<string, unknown> = {}

  if (state.name) prefs.name = state.name
  // Convert 'auto' to actual system timezone
  if (state.timezone) {
    prefs.timezone = state.timezone === 'auto' ? getSystemTimezone() : state.timezone
  }
  if (state.language) prefs.language = state.language

  if (state.city || state.country) {
    const location: Record<string, string> = {}
    if (state.city) location.city = state.city
    if (state.country) location.country = state.country
    prefs.location = location
  }

  if (state.notes) prefs.notes = state.notes
  prefs.updatedAt = Date.now()

  return JSON.stringify(prefs, null, 2)
}

export default function PreferencesPage() {
  const [formState, setFormState] = useState<PreferencesFormState>(emptyFormState)
  const [isLoading, setIsLoading] = useState(true)
  const [preferencesPath, setPreferencesPath] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialLoadRef = useRef(true)
  const formStateRef = useRef(formState)
  const lastSavedRef = useRef<string | null>(null)

  // Keep formStateRef in sync for use in cleanup
  useEffect(() => {
    formStateRef.current = formState
  }, [formState])

  // Load stored user preferences on mount
  useEffect(() => {
    const load = async () => {
      try {
        const result = await window.electronAPI.readPreferences()
        const parsed = parsePreferences(result.content)
        setFormState(parsed)
        setPreferencesPath(result.path)
        lastSavedRef.current = serializePreferences(parsed)
      } catch (err) {
        console.error('Failed to load stored user preferences:', err)
        setFormState(emptyFormState)
      } finally {
        setIsLoading(false)
        // Mark initial load as complete after a short delay
        setTimeout(() => {
          isInitialLoadRef.current = false
        }, 100)
      }
    }
    load()
  }, [])

  // Auto-save with debouncing
  useEffect(() => {
    // Skip auto-save during initial load
    if (isInitialLoadRef.current || isLoading) return

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const json = serializePreferences(formState)
        const result = await window.electronAPI.writePreferences(json)
        if (result.success) {
          lastSavedRef.current = json
        } else {
          console.error('Failed to save preferences:', result.error)
        }
      } catch (err) {
        console.error('Failed to save preferences:', err)
      }
    }, 500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [formState, isLoading])

  // Force save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      // Clear any pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Check if there are unsaved changes and save immediately
      const currentJson = serializePreferences(formStateRef.current)
      if (lastSavedRef.current !== currentJson && !isInitialLoadRef.current) {
        // Fire and forget - we can't await in cleanup
        window.electronAPI.writePreferences(currentJson).catch((err) => {
          console.error('Failed to save preferences on unmount:', err)
        })
      }
    }
  }, [])

  const updateField = useCallback(<K extends keyof PreferencesFormState>(
    field: K,
    value: PreferencesFormState[K]
  ) => {
    setFormState(prev => ({ ...prev, [field]: value }))
  }, [])

  // Handle opening preferences file in editor
  const handleEditPreferences = useCallback(async () => {
    if (!preferencesPath) return
    await window.electronAPI.openFile(preferencesPath)
  }, [preferencesPath])

  const { t } = useLanguage()

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="text-lg text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('preferences.title')} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <SettingsSection
            title={t('preferences.basicInfo')}
            description={t('preferences.basicInfoDescription')}
          >
            <SettingsCard divided>
              <SettingsInput
                label={t('preferences.yourName')}
                description={t('preferences.yourNameDescription')}
                value={formState.name}
                onChange={(v) => updateField('name', v)}
                placeholder={t('preferences.yourNamePlaceholder')}
                inCard
              />
              <SettingsSelect
                label={t('preferences.timezone')}
                description={`${t('preferences.timezoneDescription')} ${formState.timezone === 'auto' ? `(${getSystemTimezone()})` : ''}`}
                value={formState.timezone || 'auto'}
                onValueChange={(v) => updateField('timezone', v)}
                options={getTimezoneOptions(t('preferences.timezoneAuto'))}
                placeholder={t('preferences.timezonePlaceholder')}
                inCard
              />
              <SettingsInput
                label={t('preferences.preferredLanguage')}
                description={t('preferences.preferredLanguageDescription')}
                value={formState.language}
                onChange={(v) => updateField('language', v)}
                placeholder={t('preferences.preferredLanguagePlaceholder')}
                inCard
              />
            </SettingsCard>
          </SettingsSection>

          {/* Location */}
          <SettingsSection
            title={t('preferences.location')}
            description={t('preferences.locationDescription')}
          >
            <SettingsCard divided>
              <SettingsInput
                label={t('preferences.city')}
                description={t('preferences.cityDescription')}
                value={formState.city}
                onChange={(v) => updateField('city', v)}
                placeholder={t('preferences.cityPlaceholder')}
                inCard
              />
              <SettingsInput
                label={t('preferences.country')}
                description={t('preferences.countryDescription')}
                value={formState.country}
                onChange={(v) => updateField('country', v)}
                placeholder={t('preferences.countryPlaceholder')}
                inCard
              />
            </SettingsCard>
          </SettingsSection>

          {/* Notes */}
          <SettingsSection
            title={t('preferences.notes')}
            description={t('preferences.notesDescription')}
            action={
              // EditPopover for AI-assisted notes editing with "Edit File" as secondary action
              preferencesPath ? (
                <EditPopover
                  trigger={<EditButton />}
                  {...getEditConfig('preferences-notes', preferencesPath)}
                  secondaryAction={{
                    label: t('common.editFile'),
                    onClick: handleEditPreferences,
                  }}
                />
              ) : null
            }
          >
            <SettingsCard divided={false}>
              <SettingsTextarea
                value={formState.notes}
                onChange={(v) => updateField('notes', v)}
                placeholder={t('preferences.notesPlaceholder')}
                rows={5}
                inCard
              />
            </SettingsCard>
          </SettingsSection>
        </div>
        </ScrollArea>
      </div>
    </div>
  )
}
