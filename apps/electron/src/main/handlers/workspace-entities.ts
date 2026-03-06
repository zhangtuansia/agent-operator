import { app, ipcMain } from 'electron'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { IPC_CHANNELS } from '../../shared/types'
import { ipcLog } from '../logger'
import type { WindowManager } from '../window-manager'

export function registerWorkspaceEntityHandlers(windowManager: WindowManager): void {
  ipcMain.handle(IPC_CHANNELS.STATUSES_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listStatuses } = await import('@agent-operator/shared/statuses')
    return listStatuses(workspace.rootPath)
  })

  ipcMain.handle(IPC_CHANNELS.STATUSES_REORDER, async (_event, workspaceId: string, orderedIds: string[]) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { reorderStatuses } = await import('@agent-operator/shared/statuses')
    reorderStatuses(workspace.rootPath, orderedIds)
  })

  ipcMain.handle(IPC_CHANNELS.LABELS_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listLabels } = await import('@agent-operator/shared/labels/storage')
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    const storedLang = loadStoredConfig()?.uiLanguage
    const systemLang = app.getLocale()?.startsWith('zh') ? 'zh' : undefined
    const locale = storedLang || systemLang
    return listLabels(workspace.rootPath, locale)
  })

  ipcMain.handle(IPC_CHANNELS.LABELS_CREATE, async (_event, workspaceId: string, input: import('@agent-operator/shared/labels').CreateLabelInput) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { createLabel } = await import('@agent-operator/shared/labels/crud')
    const label = createLabel(workspace.rootPath, input)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
    return label
  })

  ipcMain.handle(IPC_CHANNELS.LABELS_DELETE, async (_event, workspaceId: string, labelId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteLabel } = await import('@agent-operator/shared/labels/crud')
    const result = deleteLabel(workspace.rootPath, labelId)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
    return result
  })

  ipcMain.handle(IPC_CHANNELS.VIEWS_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listViews } = await import('@agent-operator/shared/views/storage')
    return listViews(workspace.rootPath)
  })

  ipcMain.handle(IPC_CHANNELS.VIEWS_SAVE, async (_event, workspaceId: string, views: import('@agent-operator/shared/views').ViewConfig[]) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { saveViews } = await import('@agent-operator/shared/views/storage')
    saveViews(workspace.rootPath, views)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_READ_IMAGE, async (_event, workspaceId: string, relativePath: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { readFileSync, existsSync } = await import('fs')
    const { join, normalize } = await import('path')
    const allowedExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']

    if (relativePath.includes('..')) {
      throw new Error('Invalid path: directory traversal not allowed')
    }

    const ext = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'))
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Invalid file type: ${ext}. Allowed: ${allowedExtensions.join(', ')}`)
    }

    const absolutePath = normalize(join(workspace.rootPath, relativePath))
    if (!absolutePath.startsWith(workspace.rootPath)) {
      throw new Error('Invalid path: outside workspace directory')
    }

    if (!existsSync(absolutePath)) {
      return ''
    }

    const buffer = readFileSync(absolutePath)
    if (ext === '.svg') {
      return buffer.toString('utf-8')
    }

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.gif': 'image/gif',
    }
    const mimeType = mimeTypes[ext] || 'image/png'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_WRITE_IMAGE, async (_event, workspaceId: string, relativePath: string, base64: string, mimeType: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { writeFileSync, unlinkSync, readdirSync } = await import('fs')
    const { join, normalize, basename } = await import('path')
    const allowedExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']

    if (relativePath.includes('..')) {
      throw new Error('Invalid path: directory traversal not allowed')
    }

    const ext = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'))
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Invalid file type: ${ext}. Allowed: ${allowedExtensions.join(', ')}`)
    }

    const absolutePath = normalize(join(workspace.rootPath, relativePath))
    if (!absolutePath.startsWith(workspace.rootPath)) {
      throw new Error('Invalid path: outside workspace directory')
    }

    const fileName = basename(relativePath)
    if (fileName.startsWith('icon.')) {
      const files = readdirSync(workspace.rootPath)
      for (const file of files) {
        if (file.startsWith('icon.') && file !== fileName) {
          const oldPath = join(workspace.rootPath, file)
          try {
            unlinkSync(oldPath)
          } catch {
            // Ignore errors deleting old icon
          }
        }
      }
    }

    const buffer = Buffer.from(base64, 'base64')
    if (mimeType === 'image/svg+xml' || ext === '.svg') {
      writeFileSync(absolutePath, buffer)
      return
    }

    const { nativeImage } = await import('electron')
    const image = nativeImage.createFromBuffer(buffer)
    const size = image.getSize()

    if (size.width > 256 || size.height > 256) {
      const ratio = Math.min(256 / size.width, 256 / size.height)
      const newWidth = Math.round(size.width * ratio)
      const newHeight = Math.round(size.height * ratio)
      const resized = image.resize({ width: newWidth, height: newHeight, quality: 'best' })
      writeFileSync(absolutePath, resized.toPNG())
    } else {
      writeFileSync(absolutePath, buffer)
    }
  })

  ipcLog.debug('[workspace-entities] handlers registered')
}
