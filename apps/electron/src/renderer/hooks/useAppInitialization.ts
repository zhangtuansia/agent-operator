/**
 * useAppInitialization Hook
 *
 * Handles app initialization logic including:
 * - Loading config (workspaces, theme, language, model)
 * - Setting up IPC listeners for config changes
 * - Managing app state transitions (loading -> onboarding -> ready)
 */

import { useState, useEffect, useCallback } from 'react'
import type { Workspace, SetupNeeds, TodoState } from '../../shared/types'
import type { ThemeOverrides } from '@config/theme'
import type { Language } from '@/i18n'
import { DEFAULT_MODEL, getDefaultModelForProvider } from '@config/models'

export type AppState = 'loading' | 'onboarding' | 'reauth' | 'ready'

export interface AppInitializationState {
  appState: AppState
  workspaces: Workspace[]
  windowWorkspaceId: string | null
  currentModel: string
  appTheme: ThemeOverrides | null
  initialLanguage: Language | undefined
  setupNeeds: SetupNeeds | null
  todoStates: TodoState[]
  notificationsEnabled: boolean
}

export interface AppInitializationActions {
  setAppState: (state: AppState) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setWindowWorkspaceId: (id: string | null) => void
  setCurrentModel: (model: string) => void
  setAppTheme: (theme: ThemeOverrides | null) => void
  setSetupNeeds: (needs: SetupNeeds | null) => void
  setTodoStates: (states: TodoState[]) => void
  setNotificationsEnabled: (enabled: boolean) => void
  handleModelChange: (model: string) => void
}

export interface UseAppInitializationResult {
  state: AppInitializationState
  actions: AppInitializationActions
}

/**
 * Hook for managing app initialization state and loading config.
 */
export function useAppInitialization(): UseAppInitializationResult {
  const [appState, setAppState] = useState<AppState>('loading')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [windowWorkspaceId, setWindowWorkspaceId] = useState<string | null>(null)
  const [currentModel, setCurrentModel] = useState(DEFAULT_MODEL)
  const [appTheme, setAppTheme] = useState<ThemeOverrides | null>(null)
  const [initialLanguage, setInitialLanguage] = useState<Language | undefined>(undefined)
  const [setupNeeds, setSetupNeeds] = useState<SetupNeeds | null>(null)
  const [todoStates, setTodoStates] = useState<TodoState[]>([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Handle model change with persistence
  const handleModelChange = useCallback((model: string) => {
    setCurrentModel(model)
    window.electronAPI.setModel(model)
  }, [])

  // Load initial config
  useEffect(() => {
    async function loadConfig() {
      try {
        // Load workspaces
        const ws = await window.electronAPI.getWorkspaces()
        setWorkspaces(ws)

        // Get window's workspace ID
        const wsId = await window.electronAPI.getWindowWorkspaceId()
        setWindowWorkspaceId(wsId)

        // Load theme
        const theme = await window.electronAPI.getResolvedTheme()
        setAppTheme(theme)

        // Load language
        const lang = await window.electronAPI.getLanguage()
        setInitialLanguage(lang as Language | undefined)

        // Load model with provider-aware default
        const config = await window.electronAPI.getStoredConfig()
        const provider = config?.provider || 'anthropic'
        const savedModel = config?.model
        const providerDefault = getDefaultModelForProvider(provider)
        setCurrentModel(savedModel || providerDefault || DEFAULT_MODEL)

        // Load notifications setting
        const settings = await window.electronAPI.getAppSettings()
        setNotificationsEnabled(settings?.notificationsEnabled ?? true)

        // Load todo states
        if (wsId) {
          const states = await window.electronAPI.getTodoStates(wsId)
          setTodoStates(states)
        }
      } catch (error) {
        console.error('Failed to load config:', error)
      }
    }

    loadConfig()
  }, [])

  // Listen for theme changes
  useEffect(() => {
    const cleanup = window.electronAPI.onThemeChanged((theme) => {
      setAppTheme(theme)
    })
    return cleanup
  }, [])

  // Listen for workspace config changes (todo states, etc.)
  useEffect(() => {
    if (!windowWorkspaceId) return

    const cleanup = window.electronAPI.onWorkspaceConfigChanged(async (workspaceId) => {
      if (workspaceId === windowWorkspaceId) {
        const states = await window.electronAPI.getTodoStates(workspaceId)
        setTodoStates(states)
      }
    })
    return cleanup
  }, [windowWorkspaceId])

  return {
    state: {
      appState,
      workspaces,
      windowWorkspaceId,
      currentModel,
      appTheme,
      initialLanguage,
      setupNeeds,
      todoStates,
      notificationsEnabled,
    },
    actions: {
      setAppState,
      setWorkspaces,
      setWindowWorkspaceId,
      setCurrentModel,
      setAppTheme,
      setSetupNeeds,
      setTodoStates,
      setNotificationsEnabled,
      handleModelChange,
    },
  }
}
