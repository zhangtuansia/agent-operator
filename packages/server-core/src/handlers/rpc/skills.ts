import { join } from 'path'
import { readdirSync, statSync } from 'fs'
import { RPC_CHANNELS, type SkillFile } from '@agent-operator/shared/protocol'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { pushTyped, type RpcServer } from '@agent-operator/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.skills.GET,
  RPC_CHANNELS.skills.GET_FILES,
  RPC_CHANNELS.skills.DELETE,
  RPC_CHANNELS.skills.OPEN_EDITOR,
  RPC_CHANNELS.skills.OPEN_FINDER,
  RPC_CHANNELS.skills.IMPORT_URL,
  RPC_CHANNELS.skills.IMPORT_CONTENT,
] as const

export function registerSkillsHandlers(server: RpcServer, deps: HandlerDeps): void {
  // Get all skills for a workspace (and optionally project-level skills from workingDirectory)
  server.handle(RPC_CHANNELS.skills.GET, async (_ctx, workspaceId: string, workingDirectory?: string) => {
    deps.platform.logger?.info(`SKILLS_GET: Loading skills for workspace: ${workspaceId}${workingDirectory ? `, workingDirectory: ${workingDirectory}` : ''}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      deps.platform.logger?.error(`SKILLS_GET: Workspace not found: ${workspaceId}`)
      return []
    }
    const { loadAllSkills } = await import('@agent-operator/shared/skills')
    const skills = loadAllSkills(workspace.rootPath, workingDirectory)
    deps.platform.logger?.info(`SKILLS_GET: Loaded ${skills.length} skills from ${workspace.rootPath}`)
    return skills
  })

  // Get files in a skill directory
  server.handle(RPC_CHANNELS.skills.GET_FILES, async (_ctx, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      deps.platform.logger?.error(`SKILLS_GET_FILES: Workspace not found: ${workspaceId}`)
      return []
    }

    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillDir = join(skillsDir, skillSlug)

    function scanDirectory(dirPath: string): SkillFile[] {
      try {
        const entries = readdirSync(dirPath, { withFileTypes: true })
        return entries
          .filter(entry => !entry.name.startsWith('.')) // Skip hidden files
          .map(entry => {
            const fullPath = join(dirPath, entry.name)
            if (entry.isDirectory()) {
              return {
                name: entry.name,
                type: 'directory' as const,
                children: scanDirectory(fullPath),
              }
            } else {
              const stats = statSync(fullPath)
              return {
                name: entry.name,
                type: 'file' as const,
                size: stats.size,
              }
            }
          })
          .sort((a, b) => {
            // Directories first, then files
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
      } catch (err) {
        deps.platform.logger?.error(`SKILLS_GET_FILES: Error scanning ${dirPath}:`, err)
        return []
      }
    }

    return scanDirectory(skillDir)
  })

  // Delete a skill from a workspace
  server.handle(RPC_CHANNELS.skills.DELETE, async (_ctx, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteSkill } = await import('@agent-operator/shared/skills')
    deleteSkill(workspace.rootPath, skillSlug)
    deps.platform.logger?.info(`Deleted skill: ${skillSlug}`)
  })

  // Open skill SKILL.md in editor
  server.handle(RPC_CHANNELS.skills.OPEN_EDITOR, async (_ctx, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillFile = join(skillsDir, skillSlug, 'SKILL.md')
    await deps.platform.openPath?.(skillFile)
  })

  // Open skill folder in Finder/Explorer
  server.handle(RPC_CHANNELS.skills.OPEN_FINDER, async (_ctx, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillDir = join(skillsDir, skillSlug)
    await deps.platform.showItemInFolder?.(skillDir)
  })

  server.handle(RPC_CHANNELS.skills.IMPORT_URL, async (_ctx, workspaceId: string, url: string, customSlug?: string) => {
    deps.platform.logger?.info(`SKILLS_IMPORT_URL: Importing skill from ${url} for workspace ${workspaceId}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      deps.platform.logger?.error(`SKILLS_IMPORT_URL: Workspace not found: ${workspaceId}`)
      return { success: false, error: 'Workspace not found' }
    }

    const { importSkillFromUrl, loadAllSkills } = await import('@agent-operator/shared/skills')
    const result = await importSkillFromUrl(workspace.rootPath, url, customSlug)

    if (result.success) {
      deps.platform.logger?.info(`SKILLS_IMPORT_URL: Successfully imported skill: ${result.skill?.slug}`)
      pushTyped(server, RPC_CHANNELS.skills.CHANGED, { to: 'workspace', workspaceId }, workspaceId, loadAllSkills(workspace.rootPath))
    } else {
      deps.platform.logger?.error(`SKILLS_IMPORT_URL: Failed to import skill: ${result.error}`)
    }

    return result
  })

  server.handle(RPC_CHANNELS.skills.IMPORT_CONTENT, async (_ctx, workspaceId: string, content: string, customSlug?: string) => {
    deps.platform.logger?.info(`SKILLS_IMPORT_CONTENT: Importing skill from content for workspace ${workspaceId}`)
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      deps.platform.logger?.error(`SKILLS_IMPORT_CONTENT: Workspace not found: ${workspaceId}`)
      return { success: false, error: 'Workspace not found' }
    }

    const { importSkillFromContent, loadAllSkills } = await import('@agent-operator/shared/skills')
    const result = await importSkillFromContent(workspace.rootPath, content, customSlug)

    if (result.success) {
      deps.platform.logger?.info(`SKILLS_IMPORT_CONTENT: Successfully imported skill: ${result.skill?.slug}`)
      pushTyped(server, RPC_CHANNELS.skills.CHANGED, { to: 'workspace', workspaceId }, workspaceId, loadAllSkills(workspace.rootPath))
    } else {
      deps.platform.logger?.error(`SKILLS_IMPORT_CONTENT: Failed to import skill: ${result.error}`)
    }

    return result
  })
}
