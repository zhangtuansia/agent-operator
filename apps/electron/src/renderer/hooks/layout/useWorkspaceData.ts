/**
 * useWorkspaceData - Manages workspace-scoped data loading
 *
 * Handles:
 * - Sources loading and live updates
 * - Skills loading and live updates
 * - Workspace settings (localMcpEnabled, cyclablePermissionModes)
 * - Syncing to Jotai atoms for NavigationContext
 */

import { useState, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { sourcesAtom } from '@/atoms/sources'
import { skillsAtom } from '@/atoms/skills'
import type { LoadedSource, LoadedSkill, PermissionMode } from '../../../shared/types'

export interface WorkspaceData {
  sources: LoadedSource[]
  skills: LoadedSkill[]
  localMcpEnabled: boolean
  enabledModes: PermissionMode[]
  isLoading: boolean
}

export interface WorkspaceDataActions {
  setSources: React.Dispatch<React.SetStateAction<LoadedSource[]>>
  setSkills: React.Dispatch<React.SetStateAction<LoadedSkill[]>>
}

export function useWorkspaceData(workspaceId: string | null): [WorkspaceData, WorkspaceDataActions] {
  // Sources state (workspace-scoped)
  const [sources, setSources] = useState<LoadedSource[]>([])
  const [skills, setSkills] = useState<LoadedSkill[]>([])
  const [localMcpEnabled, setLocalMcpEnabled] = useState(true)
  const [enabledModes, setEnabledModes] = useState<PermissionMode[]>(['safe', 'ask', 'allow-all'])
  const [isLoading, setIsLoading] = useState(true)

  // Sync sources to atom for NavigationContext auto-selection
  const setSourcesAtom = useSetAtom(sourcesAtom)
  useEffect(() => {
    setSourcesAtom(sources)
  }, [sources, setSourcesAtom])

  // Sync skills to atom for NavigationContext auto-selection
  const setSkillsAtom = useSetAtom(skillsAtom)
  useEffect(() => {
    setSkillsAtom(skills)
  }, [skills, setSkillsAtom])

  // Load workspace settings on workspace change
  useEffect(() => {
    if (!workspaceId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    window.electronAPI.getWorkspaceSettings(workspaceId).then((settings) => {
      if (settings) {
        setLocalMcpEnabled(settings.localMcpEnabled ?? true)
        if (settings.cyclablePermissionModes && settings.cyclablePermissionModes.length >= 2) {
          setEnabledModes(settings.cyclablePermissionModes)
        }
      }
    }).catch((err) => {
      console.error('[useWorkspaceData] Failed to load workspace settings:', err)
    }).finally(() => {
      setIsLoading(false)
    })
  }, [workspaceId])

  // Load sources from backend on workspace change
  useEffect(() => {
    if (!workspaceId) {
      setSources([])
      return
    }

    window.electronAPI.getSources(workspaceId).then((loaded) => {
      setSources(loaded || [])
    }).catch(err => {
      console.error('[useWorkspaceData] Failed to load sources:', err)
    })
  }, [workspaceId])

  // Subscribe to live source updates
  useEffect(() => {
    const cleanup = window.electronAPI.onSourcesChanged((updatedSources) => {
      setSources(updatedSources || [])
    })
    return cleanup
  }, [])

  // Load skills from backend on workspace change
  useEffect(() => {
    if (!workspaceId) {
      setSkills([])
      return
    }

    window.electronAPI.getSkills(workspaceId).then((loaded) => {
      setSkills(loaded || [])
    }).catch(err => {
      console.error('[useWorkspaceData] Failed to load skills:', err)
    })
  }, [workspaceId])

  // Subscribe to live skill updates
  useEffect(() => {
    const cleanup = window.electronAPI.onSkillsChanged?.((updatedSkills) => {
      setSkills(updatedSkills || [])
    })
    return cleanup
  }, [])

  const data: WorkspaceData = {
    sources,
    skills,
    localMcpEnabled,
    enabledModes,
    isLoading,
  }

  const actions: WorkspaceDataActions = {
    setSources,
    setSkills,
  }

  return [data, actions]
}
