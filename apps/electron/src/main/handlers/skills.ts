import { shell, ipcMain } from 'electron'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { getWorkspaceSkillsPath } from '@agent-operator/shared/workspaces'
import { ipcLog } from '../logger'
import { IPC_CHANNELS, type SkillFile } from '../../shared/types'

export function registerSkillHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SKILLS_GET, async (_event, workspaceId: string) => {
    ipcLog.info(`SKILLS_GET: Loading skills for workspace: ${workspaceId}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SKILLS_GET: Workspace not found: ${workspaceId}`)
      return []
    }
    const { loadAllSkills } = await import('@agent-operator/shared/skills')
    const skills = loadAllSkills(workspace.rootPath)
    ipcLog.info(`SKILLS_GET: Loaded ${skills.length} skills from ${workspace.rootPath}`)
    return skills
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_GET_FILES, async (_event, workspaceId: string, skillSlug: string): Promise<SkillFile[]> => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SKILLS_GET_FILES: Workspace not found: ${workspaceId}`)
      return []
    }

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillDir = join(skillsDir, skillSlug)
    return scanSkillDirectory(skillDir)
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteSkill } = await import('@agent-operator/shared/skills')
    deleteSkill(workspace.rootPath, skillSlug)
    ipcLog.info(`Deleted skill: ${skillSlug}`)
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_OPEN_EDITOR, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillFile = join(skillsDir, skillSlug, 'SKILL.md')
    await shell.openPath(skillFile)
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_OPEN_FINDER, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { loadSkill } = await import('@agent-operator/shared/skills')

    const skill = loadSkill(workspace.rootPath, skillSlug)
    if (!skill) {
      throw new Error(`Skill not found: ${skillSlug}`)
    }

    const skillFile = join(skill.path, 'SKILL.md')
    const revealPath = existsSync(skillFile) ? skillFile : skill.path
    shell.showItemInFolder(revealPath)
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_IMPORT_URL, async (_event, workspaceId: string, url: string, customSlug?: string) => {
    ipcLog.info(`SKILLS_IMPORT_URL: Importing skill from ${url} for workspace ${workspaceId}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SKILLS_IMPORT_URL: Workspace not found: ${workspaceId}`)
      return { success: false, error: 'Workspace not found' }
    }

    const { importSkillFromUrl } = await import('@agent-operator/shared/skills')
    const result = await importSkillFromUrl(workspace.rootPath, url, customSlug)

    if (result.success) {
      ipcLog.info(`SKILLS_IMPORT_URL: Successfully imported skill: ${result.skill?.slug}`)
    } else {
      ipcLog.error(`SKILLS_IMPORT_URL: Failed to import skill: ${result.error}`)
    }

    return result
  })

  ipcMain.handle(IPC_CHANNELS.SKILLS_IMPORT_CONTENT, async (_event, workspaceId: string, content: string, customSlug?: string) => {
    ipcLog.info(`SKILLS_IMPORT_CONTENT: Importing skill from content for workspace ${workspaceId}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SKILLS_IMPORT_CONTENT: Workspace not found: ${workspaceId}`)
      return { success: false, error: 'Workspace not found' }
    }

    const { importSkillFromContent } = await import('@agent-operator/shared/skills')
    const result = await importSkillFromContent(workspace.rootPath, content, customSlug)

    if (result.success) {
      ipcLog.info(`SKILLS_IMPORT_CONTENT: Successfully imported skill: ${result.skill?.slug}`)
    } else {
      ipcLog.error(`SKILLS_IMPORT_CONTENT: Failed to import skill: ${result.error}`)
    }

    return result
  })
}

function scanSkillDirectory(dirPath: string): SkillFile[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => {
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            type: 'directory' as const,
            children: scanSkillDirectory(fullPath),
          }
        }

        const stats = statSync(fullPath)
        return {
          name: entry.name,
          type: 'file' as const,
          size: stats.size,
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (error) {
    ipcLog.error(`SKILLS_GET_FILES: Error scanning ${dirPath}:`, error)
    return []
  }
}
