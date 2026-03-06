import { BrowserWindow, ipcMain, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import {
  getWorkspaceByNameOrId,
  type Workspace,
} from '@agent-operator/shared/config'
import { isValidThinkingLevel } from '@agent-operator/shared/agent/thinking-levels'
import {
  CreateSessionOptionsSchema,
  SessionIdSchema,
  SessionCommandSchema,
  WorkspaceIdSchema,
} from '@agent-operator/shared/ipc/schemas'
import { perf } from '@agent-operator/shared/utils'
import { getWorkspaceSessionsPath } from '@agent-operator/shared/workspaces'
import { searchSessions } from '../search'
import { validateIpcArgs } from '../ipc-validator'
import { ipcLog } from '../logger'
import type { SessionManager } from '../sessions'
import type { WindowManager } from '../window-manager'
import {
  IPC_CHANNELS,
  type CreateSessionOptions,
  type FileAttachment,
  type SendMessageOptions,
  type SessionCommand,
  type StoredAttachment,
} from '../../shared/types'

type ImportSessionsArgs = {
  workspaceId: string
  source: 'openai' | 'anthropic'
  filePath: string
}

function getWorkspaceOrThrow(workspaceId: string): Workspace {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return workspace
}

export function registerSessionHandlers(sessionManager: SessionManager, windowManager: WindowManager): void {
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    const end = perf.start('ipc.getSessions')
    const sessions = sessionManager.getSessions()
    end()
    return sessions
  })

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_MESSAGES, async (_event, sessionId: string) => {
    const end = perf.start('ipc.getSessionMessages')
    const session = await sessionManager.getSession(sessionId)
    end()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_SESSION_CONTENT, async (event, query: string) => {
    const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
    if (!workspaceId) return []

    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return []

    const sessionsDir = getWorkspaceSessionsPath(workspace.rootPath)
    return searchSessions(query, sessionsDir)
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, workspaceId: unknown, options?: unknown) => {
    const validatedWorkspaceId = validateIpcArgs<string>(WorkspaceIdSchema, workspaceId, 'CREATE_SESSION.workspaceId')
    const validatedOptions = options
      ? validateIpcArgs<CreateSessionOptions>(CreateSessionOptionsSchema, options, 'CREATE_SESSION.options')
      : undefined

    const end = perf.start('ipc.createSession', { workspaceId: validatedWorkspaceId })
    const session = sessionManager.createSession(validatedWorkspaceId, validatedOptions)
    end()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_SUB_SESSION, async (_event, workspaceId: string, parentSessionId: string, options?: unknown) => {
    const workspace = getWorkspaceOrThrow(workspaceId)
    const { createSubSession } = await import('@agent-operator/shared/sessions')
    const validatedOptions = options
      ? validateIpcArgs<CreateSessionOptions>(CreateSessionOptionsSchema, options, 'CREATE_SUB_SESSION.options')
      : undefined
    const session = await createSubSession(workspace.rootPath, parentSessionId, validatedOptions)
    sessionManager.reloadSessions()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_SESSION, async (_event, sessionId: string) => {
    return sessionManager.deleteSession(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_SESSIONS, async (_event, args: unknown) => {
    const { ImportSessionsArgsSchema } = await import('@agent-operator/shared/ipc/schemas')
    const validated = validateIpcArgs<ImportSessionsArgs>(ImportSessionsArgsSchema, args, 'IMPORT_SESSIONS')

    const workspace = getWorkspaceOrThrow(validated.workspaceId)
    const { parseOpenAIExport, parseAnthropicExport } = await import('@agent-operator/shared/importers')
    const { createImportedSession } = await import('@agent-operator/shared/sessions')

    let fileContent: string

    if (validated.filePath.toLowerCase().endsWith('.zip')) {
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(validated.filePath)
      const entries = zip.getEntries()

      let jsonEntry = null
      if (validated.source === 'openai') {
        jsonEntry = entries.find((entry) => entry.entryName === 'conversations.json' || entry.entryName.endsWith('/conversations.json'))
      } else {
        jsonEntry = entries.find((entry) =>
          entry.entryName.endsWith('.json')
          && !entry.entryName.startsWith('__MACOSX')
          && !entry.entryName.includes('/.'),
        )
      }

      if (!jsonEntry) {
        throw new Error(`No valid JSON file found in zip archive. Expected ${validated.source === 'openai' ? 'conversations.json' : 'a JSON file'}.`)
      }

      fileContent = jsonEntry.getData().toString('utf-8')
    } else {
      fileContent = await readFile(validated.filePath, 'utf-8')
    }

    const parseResult = validated.source === 'openai'
      ? parseOpenAIExport(fileContent)
      : parseAnthropicExport(fileContent)

    const label = `imported:${validated.source}`
    for (const conversation of parseResult.conversations) {
      createImportedSession(workspace.rootPath, {
        name: conversation.title,
        labels: [label],
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages,
      })
    }

    sessionManager.reloadSessions()

    return {
      imported: parseResult.imported,
      failed: parseResult.failed,
      errors: parseResult.errors,
    }
  })

  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (
    event,
    sessionId: string,
    message: string,
    attachments?: FileAttachment[],
    storedAttachments?: StoredAttachment[],
    options?: SendMessageOptions,
  ) => {
    const callingWorkspaceId = windowManager.getWorkspaceForWindow(event.sender.id)

    sessionManager.sendMessage(sessionId, message, attachments, storedAttachments, options).catch((error) => {
      ipcLog.error('Error in sendMessage:', error)

      const targetWindow = callingWorkspaceId
        ? windowManager.getWindowByWorkspace(callingWorkspaceId)
        : BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

      if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed() && targetWindow.webContents.mainFrame) {
        targetWindow.webContents.send(IPC_CHANNELS.SESSION_EVENT, {
          type: 'error',
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        targetWindow.webContents.send(IPC_CHANNELS.SESSION_EVENT, {
          type: 'complete',
          sessionId,
        })
      }
    })

    return { started: true }
  })

  ipcMain.handle(IPC_CHANNELS.CANCEL_PROCESSING, async (_event, sessionId: string, silent?: boolean) => {
    return sessionManager.cancelProcessing(sessionId, silent)
  })

  ipcMain.handle(IPC_CHANNELS.KILL_SHELL, async (_event, sessionId: string, shellId: string) => {
    return sessionManager.killShell(sessionId, shellId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_TASK_OUTPUT, async (_event, taskId: string) => {
    try {
      return await sessionManager.getTaskOutput(taskId)
    } catch (error) {
      ipcLog.error('Failed to get task output:', error)
      throw error
    }
  })

  ipcMain.handle(IPC_CHANNELS.RESPOND_TO_PERMISSION, async (_event, sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) => {
    return sessionManager.respondToPermission(sessionId, requestId, allowed, alwaysAllow)
  })

  ipcMain.handle(IPC_CHANNELS.RESPOND_TO_CREDENTIAL, async (_event, sessionId: string, requestId: string, response: import('../../shared/types').CredentialResponse) => {
    return sessionManager.respondToCredential(sessionId, requestId, response)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_COMMAND, async (_event, sessionId: unknown, command: unknown) => {
    const validatedSessionId = validateIpcArgs<string>(
      SessionIdSchema,
      sessionId,
      'SESSION_COMMAND.sessionId',
    )
    const validatedCommand = validateIpcArgs<SessionCommand>(
      SessionCommandSchema,
      command,
      'SESSION_COMMAND.command',
    )

    switch (validatedCommand.type) {
      case 'flag':
        return sessionManager.flagSession(validatedSessionId)
      case 'unflag':
        return sessionManager.unflagSession(validatedSessionId)
      case 'archive':
        return sessionManager.archiveSession(validatedSessionId)
      case 'unarchive':
        return sessionManager.unarchiveSession(validatedSessionId)
      case 'rename':
        return sessionManager.renameSession(validatedSessionId, validatedCommand.name)
      case 'setTodoState':
        return sessionManager.setTodoState(validatedSessionId, validatedCommand.state)
      case 'markRead':
        return sessionManager.markSessionRead(validatedSessionId)
      case 'markUnread':
        return sessionManager.markSessionUnread(validatedSessionId)
      case 'setPermissionMode':
        return sessionManager.setSessionPermissionMode(validatedSessionId, validatedCommand.mode)
      case 'setThinkingLevel':
        if (!isValidThinkingLevel(validatedCommand.level)) {
          throw new Error(`Invalid thinking level: ${validatedCommand.level}. Valid values: 'off', 'think', 'max'`)
        }
        return sessionManager.setSessionThinkingLevel(validatedSessionId, validatedCommand.level)
      case 'setConnection':
        return sessionManager.setSessionConnection(validatedSessionId, validatedCommand.connectionSlug)
      case 'updateWorkingDirectory':
        return sessionManager.updateWorkingDirectory(validatedSessionId, validatedCommand.dir)
      case 'setSources':
        return sessionManager.setSessionSources(validatedSessionId, validatedCommand.sourceSlugs)
      case 'setLabels':
        return sessionManager.setSessionLabels(validatedSessionId, validatedCommand.labels)
      case 'showInFinder': {
        const sessionPath = sessionManager.getSessionPath(validatedSessionId)
        if (sessionPath) {
          shell.showItemInFolder(sessionPath)
        }
        return
      }
      case 'copyPath': {
        const sessionPath = sessionManager.getSessionPath(validatedSessionId)
        return sessionPath ? { success: true, path: sessionPath } : { success: false }
      }
      case 'shareToViewer':
        return sessionManager.shareToViewer(validatedSessionId)
      case 'updateShare':
        return sessionManager.updateShare(validatedSessionId)
      case 'revokeShare':
        return sessionManager.revokeShare(validatedSessionId)
      case 'startOAuth':
        return sessionManager.startSessionOAuth(validatedSessionId, validatedCommand.requestId)
      case 'refreshTitle':
        ipcLog.info(`IPC: refreshTitle received for session ${validatedSessionId}`)
        return sessionManager.refreshTitle(validatedSessionId)
      case 'setPendingPlanExecution':
        return sessionManager.setPendingPlanExecution(validatedSessionId, validatedCommand.planPath)
      case 'markCompactionComplete':
        return sessionManager.markCompactionComplete(validatedSessionId)
      case 'clearPendingPlanExecution':
        return sessionManager.clearPendingPlanExecution(validatedSessionId)
      default: {
        const exhaustive: never = validatedCommand
        throw new Error(`Unknown session command: ${JSON.stringify(exhaustive)}`)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_PENDING_PLAN_EXECUTION, async (_event, sessionId: string) => {
    return sessionManager.getPendingPlanExecution(sessionId)
  })
}
