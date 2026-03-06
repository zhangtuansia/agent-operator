import { BrowserWindow, ipcMain } from 'electron'
import type { Dirent, FSWatcher } from 'node:fs'
import { existsSync, watch } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcLog } from '../logger'
import type { SessionManager } from '../sessions'
import {
  IPC_CHANNELS,
  type SessionFile,
  type SessionFileScope,
  type SessionFilesChangedEvent,
  type SessionFilesResult,
} from '../../shared/types'

type SessionWatchEntry = {
  sessionId: string
  sessionPath: string
  workspacePath: string | null
  sessionWatcher: FSWatcher | null
  workspaceWatcher: FSWatcher | null
  subscribers: Set<number>
  pendingChanges: Map<SessionFileScope, string | undefined>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const WORKSPACE_EXCLUDED_DIRS = ['sessions', 'sources', 'skills', 'statuses', 'labels']

export function registerSessionFileHandlers(sessionManager: SessionManager): void {
  const sessionWatchers = new Map<string, SessionWatchEntry>()
  const senderSubscriptions = new Map<number, Set<string>>()
  const senderDestroyHookRegistered = new Set<number>()

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_FILES, async (_event, sessionId: string): Promise<SessionFilesResult> => {
    const sessionPath = sessionManager.getSessionPath(sessionId)
    const workspacePath = sessionManager.getSessionWorkspacePath(sessionId)

    const result: SessionFilesResult = {
      sessionFiles: [],
      workspaceFiles: [],
    }

    if (sessionPath) {
      try {
        result.sessionFiles = await scanDirectory(sessionPath)
      } catch (error) {
        ipcLog.error('Failed to get session files:', error)
      }
    }

    if (workspacePath) {
      try {
        result.workspaceFiles = await scanDirectory(workspacePath, WORKSPACE_EXCLUDED_DIRS)
      } catch (error) {
        ipcLog.error('Failed to get workspace files:', error)
      }
    }

    return result
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_SESSION_FILES_BY_SCOPE,
    async (_event, sessionId: string, scope: SessionFileScope): Promise<SessionFile[]> => {
      const path =
        scope === 'session'
          ? sessionManager.getSessionPath(sessionId)
          : sessionManager.getSessionWorkspacePath(sessionId)
      if (!path) return []

      try {
        return await scanDirectory(path, scope === 'workspace' ? WORKSPACE_EXCLUDED_DIRS : [])
      } catch (error) {
        ipcLog.error(`Failed to get ${scope} files:`, error)
        return []
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.WATCH_SESSION_FILES, async (event, sessionId: string) => {
    const senderId = event.sender.id
    const sessionPath = sessionManager.getSessionPath(sessionId)
    if (!sessionPath) return
    const workspacePath = sessionManager.getSessionWorkspacePath(sessionId)

    const existingSubscriptions = senderSubscriptions.get(senderId)
    if (existingSubscriptions?.size === 1 && existingSubscriptions.has(sessionId)) {
      return
    }

    removeSenderSubscriptions(senderId, undefined, senderSubscriptions, sessionWatchers)

    let entry = sessionWatchers.get(sessionId)
    if (!entry) {
      entry = {
        sessionId,
        sessionPath,
        workspacePath,
        sessionWatcher: null,
        workspaceWatcher: null,
        subscribers: new Set<number>(),
        pendingChanges: new Map<SessionFileScope, string | undefined>(),
        debounceTimer: null,
      }

      try {
        entry.sessionWatcher = await createWatcher(sessionPath, (filename) =>
          queueFileChange(entry!, 'session', sessionPath, filename),
        )
        if (workspacePath) {
          entry.workspaceWatcher = await createWatcher(workspacePath, (filename) =>
            queueFileChange(entry!, 'workspace', workspacePath, filename),
          )
        }
      } catch (error) {
        ipcLog.error('Failed to start session/workspace watchers:', error)
        closeWatchEntry(entry)
        return
      }

      sessionWatchers.set(sessionId, entry)
      ipcLog.info(`Watching session files: ${sessionId}`)
    }

    entry.subscribers.add(senderId)
    if (!senderSubscriptions.has(senderId)) {
      senderSubscriptions.set(senderId, new Set())
    }
    if (!senderDestroyHookRegistered.has(senderId)) {
      senderDestroyHookRegistered.add(senderId)
      event.sender.once('destroyed', () => {
        removeSenderSubscriptions(senderId, undefined, senderSubscriptions, sessionWatchers)
        senderDestroyHookRegistered.delete(senderId)
      })
    }
    senderSubscriptions.get(senderId)!.add(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.UNWATCH_SESSION_FILES, async (event, sessionId?: string) => {
    removeSenderSubscriptions(event.sender.id, sessionId, senderSubscriptions, sessionWatchers)
  })

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_NOTES, async (_event, sessionId: string): Promise<string> => {
    const sessionPath = sessionManager.getSessionPath(sessionId)
    if (!sessionPath) return ''

    try {
      const notesPath = join(sessionPath, 'notes.md')
      return await readFile(notesPath, 'utf-8')
    } catch {
      return ''
    }
  })

  ipcMain.handle(IPC_CHANNELS.SET_SESSION_NOTES, async (_event, sessionId: string, content: string) => {
    const sessionPath = sessionManager.getSessionPath(sessionId)
    if (!sessionPath) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    try {
      const notesPath = join(sessionPath, 'notes.md')
      await writeFile(notesPath, content, 'utf-8')
    } catch (error) {
      ipcLog.error('Failed to save session notes:', error)
      throw error
    }
  })
}

async function scanDirectory(dirPath: string, excludeDirs: string[] = []): Promise<SessionFile[]> {
  const entries = await readdir(dirPath, { withFileTypes: true }) as Dirent[]
  const files: SessionFile[] = []

  for (const entry of entries) {
    if (entry.name === 'session.jsonl' || entry.name.startsWith('.')) continue
    if (excludeDirs.includes(entry.name)) continue

    const fullPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = await scanDirectory(fullPath, [])
      if (children.length > 0) {
        files.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        })
      }
    } else {
      const stats = await stat(fullPath)
      files.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
        size: stats.size,
      })
    }
  }

  return files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function isInternalPath(scope: SessionFileScope, relativePath: string | null): boolean {
  if (!relativePath) return false
  const normalized = relativePath.replace(/\\/g, '/')
  const basename = normalized.split('/').pop() || ''
  if (basename.startsWith('.')) return true
  if (basename === 'session.jsonl' || normalized.includes('/session.jsonl')) return true

  if (scope === 'workspace') {
    for (const excluded of WORKSPACE_EXCLUDED_DIRS) {
      if (normalized === excluded || normalized.startsWith(`${excluded}/`)) {
        return true
      }
    }
  }

  return false
}

function closeWatchEntry(entry: SessionWatchEntry): void {
  if (entry.sessionWatcher) {
    entry.sessionWatcher.close()
    entry.sessionWatcher = null
  }
  if (entry.workspaceWatcher) {
    entry.workspaceWatcher.close()
    entry.workspaceWatcher = null
  }
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer)
    entry.debounceTimer = null
  }
}

function removeSenderFromSession(
  senderId: number,
  sessionId: string,
  senderSubscriptions: Map<number, Set<string>>,
  sessionWatchers: Map<string, SessionWatchEntry>,
): void {
  const entry = sessionWatchers.get(sessionId)
  if (!entry) return

  entry.subscribers.delete(senderId)
  if (entry.subscribers.size === 0) {
    closeWatchEntry(entry)
    sessionWatchers.delete(sessionId)
    ipcLog.info(`Stopped watching session files: ${sessionId}`)
  }

  const subscriptions = senderSubscriptions.get(senderId)
  if (!subscriptions) return
  subscriptions.delete(sessionId)
  if (subscriptions.size === 0) {
    senderSubscriptions.delete(senderId)
  }
}

function removeSenderSubscriptions(
  senderId: number,
  sessionId: string | undefined,
  senderSubscriptions: Map<number, Set<string>>,
  sessionWatchers: Map<string, SessionWatchEntry>,
): void {
  if (sessionId) {
    removeSenderFromSession(senderId, sessionId, senderSubscriptions, sessionWatchers)
    return
  }

  const subscriptions = senderSubscriptions.get(senderId)
  if (!subscriptions || subscriptions.size === 0) return

  for (const watchedSessionId of [...subscriptions]) {
    removeSenderFromSession(senderId, watchedSessionId, senderSubscriptions, sessionWatchers)
  }
}

function flushPendingChanges(entry: SessionWatchEntry): void {
  if (entry.pendingChanges.size === 0) return

  const events: SessionFilesChangedEvent[] = [...entry.pendingChanges.entries()].map(
    ([scope, changedPath]) => ({
      sessionId: entry.sessionId,
      scope,
      changedPath,
    }),
  )
  entry.pendingChanges.clear()

  for (const senderId of entry.subscribers) {
    const win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id === senderId)
    if (!win || win.isDestroyed()) continue
    for (const payload of events) {
      win.webContents.send(IPC_CHANNELS.SESSION_FILES_CHANGED, payload)
    }
  }
}

function queueFileChange(
  entry: SessionWatchEntry,
  scope: SessionFileScope,
  rootPath: string,
  filename: string | Buffer | null,
): void {
  const relativePath = filename ? filename.toString() : null
  if (isInternalPath(scope, relativePath)) return
  const changedPath = relativePath ? join(rootPath, relativePath) : undefined

  entry.pendingChanges.set(scope, changedPath)
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer)
  }
  entry.debounceTimer = setTimeout(() => flushPendingChanges(entry), 120)
}

async function createWatcher(
  pathToWatch: string,
  onChange: (filename: string | Buffer | null) => void,
): Promise<FSWatcher | null> {
  if (!existsSync(pathToWatch)) return null

  try {
    return watch(pathToWatch, { recursive: true }, (_eventType, filename) => onChange(filename))
  } catch (error) {
    ipcLog.warn(`Recursive watch unavailable for ${pathToWatch}, falling back to non-recursive`, error)
    return watch(pathToWatch, { recursive: false }, (_eventType, filename) => onChange(filename))
  }
}
