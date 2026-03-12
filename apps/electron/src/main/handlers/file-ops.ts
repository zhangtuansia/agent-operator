import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MarkItDown } from 'markitdown-js'
import {
  getWorkspaceByNameOrId,
  loadStoredConfig,
} from '@agent-operator/shared/config'
import { getSessionAttachmentsPath } from '@agent-operator/shared/sessions'
import {
  IMAGE_LIMITS,
  readFileAttachment,
  validateImageForClaudeAPI,
} from '@agent-operator/shared/utils'
import { ipcLog } from '../logger'
import type { WindowManager } from '../window-manager'
import {
  IPC_CHANNELS,
  type FileAttachment,
  type StoredAttachment,
} from '../../shared/types'

interface FileOpsHandlerOptions {
  sanitizeFilename: (name: string) => string
  validateFilePath: (path: string) => Promise<string>
  applyFileOpsRateLimit: (channel: string) => void
}

export function registerFileOpsHandlers(
  windowManager: WindowManager,
  options: FileOpsHandlerOptions,
): void {
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, path: string) => {
    options.applyFileOpsRateLimit('READ_FILE')

    try {
      const safePath = await options.validateFilePath(path)
      return await readFile(safePath, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        ipcLog.warn('readFile: file not found:', path)
      } else {
        ipcLog.error('readFile error:', message)
      }
      throw new Error(`Failed to read file: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_FILE_OPTIONAL, async (_event, path: string) => {
    options.applyFileOpsRateLimit('READ_FILE_OPTIONAL')

    try {
      const safePath = await options.validateFilePath(path)
      return await readFile(safePath, 'utf-8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('readFileOptional error:', message)
      throw new Error(`Failed to read file: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_FILE_DIALOG, async (_event, dialogOptions?: { filters?: { name: string; extensions: string[] }[] }) => {
    const defaultFilters = [
      { name: 'All Supported', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'html', 'xml', 'yaml', 'yml'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'md'] },
      { name: 'Code', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'css', 'html', 'xml', 'yaml', 'yml'] },
    ]

    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: dialogOptions?.filters ?? defaultFilters,
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(IPC_CHANNELS.READ_FILE_ATTACHMENT, async (_event, path: string) => {
    options.applyFileOpsRateLimit('READ_FILE_ATTACHMENT')

    try {
      const safePath = await options.validateFilePath(path)
      const attachment = await readFileAttachment(safePath)
      if (!attachment) return null

      try {
        const thumbnail = await nativeImage.createThumbnailFromPath(safePath, { width: 200, height: 200 })
        if (!thumbnail.isEmpty()) {
          ;(attachment as { thumbnailBase64?: string }).thumbnailBase64 = thumbnail.toPNG().toString('base64')
        }
      } catch (thumbnailError) {
        ipcLog.info('Quick Look thumbnail failed (using fallback):', thumbnailError instanceof Error ? thumbnailError.message : thumbnailError)
      }

      return attachment
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('readFileAttachment error:', message)
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.GENERATE_THUMBNAIL, async (_event, base64: string, mimeType: string): Promise<string | null> => {
    const tempPath = join(tmpdir(), `craft-thumb-${randomUUID()}.${mimeType.split('/')[1] || 'bin'}`)

    try {
      await writeFile(tempPath, Buffer.from(base64, 'base64'))
      const thumbnail = await nativeImage.createThumbnailFromPath(tempPath, { width: 200, height: 200 })
      await unlink(tempPath).catch(() => {})
      return thumbnail.isEmpty() ? null : thumbnail.toPNG().toString('base64')
    } catch (error) {
      await unlink(tempPath).catch(() => {})
      ipcLog.info('generateThumbnail failed:', error instanceof Error ? error.message : error)
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORE_ATTACHMENT, async (event, sessionId: string, attachment: FileAttachment): Promise<StoredAttachment> => {
    const filesToCleanup: string[] = []

    try {
      if (attachment.size === 0) {
        throw new Error('Cannot attach empty file')
      }

      const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
      if (!workspaceId) {
        throw new Error('Cannot determine workspace for attachment storage')
      }

      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`)
      }

      const attachmentsDir = getSessionAttachmentsPath(workspace.rootPath, sessionId)
      await mkdir(attachmentsDir, { recursive: true })

      const id = randomUUID()
      const safeName = options.sanitizeFilename(attachment.name)
      const storedFileName = `${id}_${safeName}`
      const storedPath = join(attachmentsDir, storedFileName)

      let wasResized = false
      let finalSize = attachment.size
      let resizedBase64: string | undefined

      if (attachment.base64) {
        let decoded: Buffer = Buffer.from(attachment.base64, 'base64')
        if (Math.abs(decoded.length - attachment.size) > 100) {
          throw new Error(`Attachment corrupted: size mismatch (expected ${attachment.size}, got ${decoded.length})`)
        }

        if (attachment.type === 'image') {
          const image = nativeImage.createFromBuffer(decoded)
          const imageSize = image.getSize()
          const validation = validateImageForClaudeAPI(decoded.length, imageSize.width, imageSize.height)

          if (!validation.valid) {
            throw new Error(validation.error)
          }

          if (validation.needsResize && validation.suggestedSize) {
            ipcLog.info(`Resizing image from ${imageSize.width}×${imageSize.height} to ${validation.suggestedSize.width}×${validation.suggestedSize.height}`)

            const resized = image.resize({
              width: validation.suggestedSize.width,
              height: validation.suggestedSize.height,
              quality: 'best',
            })

            const isPhoto = attachment.mimeType === 'image/jpeg'
            decoded = isPhoto ? resized.toJPEG(90) : resized.toPNG()
            wasResized = true
            finalSize = decoded.length

            if (decoded.length > IMAGE_LIMITS.MAX_SIZE) {
              decoded = resized.toJPEG(75)
              finalSize = decoded.length
              if (decoded.length > IMAGE_LIMITS.MAX_SIZE) {
                throw new Error(`Image still too large after resize (${(decoded.length / 1024 / 1024).toFixed(1)}MB). Please use a smaller image.`)
              }
            }

            ipcLog.info(`Image resized: ${attachment.size} → ${finalSize} bytes (${Math.round((1 - finalSize / attachment.size) * 100)}% reduction)`)
            resizedBase64 = decoded.toString('base64')
          }
        }

        await writeFile(storedPath, decoded)
        filesToCleanup.push(storedPath)
      } else if (attachment.text) {
        await writeFile(storedPath, attachment.text, 'utf-8')
        filesToCleanup.push(storedPath)
      } else {
        throw new Error('Attachment has no content (neither base64 nor text)')
      }

      let thumbnailPath: string | undefined
      let thumbnailBase64: string | undefined
      const thumbPath = join(attachmentsDir, `${id}_thumb.png`)
      try {
        const thumbnail = await nativeImage.createThumbnailFromPath(storedPath, { width: 200, height: 200 })
        if (!thumbnail.isEmpty()) {
          const pngBuffer = thumbnail.toPNG()
          await writeFile(thumbPath, pngBuffer)
          thumbnailPath = thumbPath
          thumbnailBase64 = pngBuffer.toString('base64')
          filesToCleanup.push(thumbPath)
        }
      } catch (thumbnailError) {
        ipcLog.info('Thumbnail generation failed (using fallback):', thumbnailError instanceof Error ? thumbnailError.message : thumbnailError)
      }

      let markdownPath: string | undefined
      if (attachment.type === 'office') {
        const mdPath = join(attachmentsDir, `${id}_${safeName}.md`)
        try {
          const markitdown = new MarkItDown()
          const result = await markitdown.convert(storedPath)
          if (!result || !result.textContent) {
            throw new Error('Conversion returned empty result')
          }
          await writeFile(mdPath, result.textContent, 'utf-8')
          markdownPath = mdPath
          filesToCleanup.push(mdPath)
          ipcLog.info(`Converted Office file to markdown: ${mdPath}`)
        } catch (convertError) {
          const errorMsg = convertError instanceof Error ? convertError.message : String(convertError)
          ipcLog.error('Office to markdown conversion failed:', errorMsg)
          throw new Error(`Failed to convert "${attachment.name}" to readable format: ${errorMsg}`)
        }
      }

      return {
        id,
        type: attachment.type,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: finalSize,
        originalSize: wasResized ? attachment.size : undefined,
        storedPath,
        thumbnailPath,
        thumbnailBase64,
        markdownPath,
        wasResized,
        resizedBase64,
      }
    } catch (error) {
      if (filesToCleanup.length > 0) {
        ipcLog.info(`Cleaning up ${filesToCleanup.length} orphaned file(s) after storage error`)
        await Promise.all(filesToCleanup.map((file) => unlink(file).catch(() => {})))
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('storeAttachment error:', message)
      throw new Error(`Failed to store attachment: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_URL, async (_event, url: string) => {
    ipcLog.info('[OPEN_URL] Received request:', url)
    try {
      const trimmedUrl = url.trim()

      if (isAbsolute(trimmedUrl) || trimmedUrl.startsWith('~')) {
        const absolutePath = trimmedUrl.startsWith('~') ? trimmedUrl.replace(/^~/, homedir()) : resolve(trimmedUrl)
        const safePath = await options.validateFilePath(absolutePath)
        const result = await shell.openPath(safePath)
        if (result) {
          throw new Error(result)
        }
        return
      }

      const mayBeRelativeFilePath =
        trimmedUrl.startsWith('./')
        || trimmedUrl.startsWith('../')
        || (!trimmedUrl.includes('://') && !trimmedUrl.startsWith('mailto:'))

      if (mayBeRelativeFilePath) {
        const candidatePath = resolve(trimmedUrl)
        if (existsSync(candidatePath)) {
          const safePath = await options.validateFilePath(candidatePath)
          const result = await shell.openPath(safePath)
          if (result) {
            throw new Error(result)
          }
          return
        }
      }

      const parsed = new URL(trimmedUrl)

      if (parsed.protocol === 'agentoperator:') {
        ipcLog.info('[OPEN_URL] Handling as deep link')
        const { handleDeepLink } = await import('../deep-link')
        const result = await handleDeepLink(trimmedUrl, windowManager)
        ipcLog.info('[OPEN_URL] Deep link result:', result)
        return
      }

      if (parsed.protocol === 'file:') {
        const filePath = decodeURIComponent(parsed.pathname)
        const safePath = await options.validateFilePath(filePath)
        const result = await shell.openPath(safePath)
        if (result) {
          throw new Error(result)
        }
        return
      }

      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        throw new Error('Only http, https, mailto URLs are allowed')
      }

      await shell.openExternal(trimmedUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('openUrl error:', message)
      throw new Error(`Failed to open URL: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async (_event, path: string) => {
    try {
      const trimmedPath = path.trim()
      const absolutePath = trimmedPath.startsWith('~') || isAbsolute(trimmedPath)
        ? trimmedPath.replace(/^~/, homedir())
        : resolve(trimmedPath)
      const safePath = await options.validateFilePath(absolutePath)
      const result = await shell.openPath(safePath)
      if (result) {
        throw new Error(result)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('openFile error:', message)
      throw new Error(`Failed to open file: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.SHOW_IN_FOLDER, async (_event, path: string) => {
    try {
      const trimmedPath = path.trim()
      const absolutePath = trimmedPath.startsWith('~') || isAbsolute(trimmedPath)
        ? trimmedPath.replace(/^~/, homedir())
        : resolve(trimmedPath)
      const safePath = await options.validateFilePath(absolutePath)
      shell.showItemInFolder(safePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('showInFolder error:', message)
      throw new Error(`Failed to show in folder: ${message}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.MENU_UNDO, (event) => { event.sender.undo() })
  ipcMain.handle(IPC_CHANNELS.MENU_REDO, (event) => { event.sender.redo() })
  ipcMain.handle(IPC_CHANNELS.MENU_CUT, (event) => { event.sender.cut() })
  ipcMain.handle(IPC_CHANNELS.MENU_COPY, (event) => { event.sender.copy() })
  ipcMain.handle(IPC_CHANNELS.MENU_PASTE, (event) => { event.sender.paste() })
  ipcMain.handle(IPC_CHANNELS.MENU_SELECT_ALL, (event) => { event.sender.selectAll() })

  ipcMain.handle(IPC_CHANNELS.MENU_ZOOM_IN, (event) => {
    const level = event.sender.getZoomLevel()
    event.sender.setZoomLevel(level + 0.5)
  })
  ipcMain.handle(IPC_CHANNELS.MENU_ZOOM_OUT, (event) => {
    const level = event.sender.getZoomLevel()
    event.sender.setZoomLevel(level - 0.5)
  })
  ipcMain.handle(IPC_CHANNELS.MENU_ZOOM_RESET, (event) => {
    event.sender.setZoomLevel(0)
  })

  ipcMain.handle(IPC_CHANNELS.MENU_MINIMIZE, () => {
    const window = BrowserWindow.getFocusedWindow()
    window?.minimize()
  })
  ipcMain.handle(IPC_CHANNELS.MENU_MAXIMIZE, () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window?.isMaximized()) {
      window.unmaximize()
    } else {
      window?.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.MENU_NEW_WINDOW_ACTION, () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused) return

    const workspaceId = windowManager.getWorkspaceForWindow(focused.webContents.id)
    if (workspaceId) {
      windowManager.createWindow({ workspaceId })
    }
  })
}
