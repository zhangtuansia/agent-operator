import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { RPC_CHANNELS, type DocumentEntry, type DocumentKind, type Session } from '@agent-operator/shared/protocol'
import type { RpcServer } from '@agent-operator/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

const WORKSPACE_EXCLUDED_DIRS = [
  'sessions',
  'node_modules',
  'dist',
  'build',
  'coverage',
] as const

const SESSION_ARTIFACT_DIRS: Array<{ dir: string; kind: Exclude<DocumentKind, 'workspace' | 'note'> }> = [
  { dir: 'downloads', kind: 'download' },
  { dir: 'attachments', kind: 'attachment' },
  { dir: 'plans', kind: 'plan' },
  { dir: 'data', kind: 'data' },
  { dir: 'long_responses', kind: 'longResponse' },
]

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function buildDocumentId(path: string): string {
  return Buffer.from(path).toString('base64url')
}

async function scanFilesRecursively(
  rootPath: string,
  options: {
    excludeDirs?: readonly string[]
    onFile: (path: string, name: string, size: number, updatedAt: number) => DocumentEntry
    logError?: (error: unknown, path: string) => void
  },
): Promise<DocumentEntry[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(rootPath, { withFileTypes: true })
  } catch (error) {
    options.logError?.(error, rootPath)
    return []
  }

  const files: DocumentEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && options.excludeDirs?.includes(entry.name)) continue

    const fullPath = join(rootPath, entry.name)

    if (entry.isDirectory()) {
      files.push(
        ...(await scanFilesRecursively(fullPath, {
          ...options,
          excludeDirs: undefined,
        })),
      )
      continue
    }

    try {
      const stats = await stat(fullPath)
      files.push(options.onFile(fullPath, entry.name, stats.size, stats.mtimeMs))
    } catch (error) {
      options.logError?.(error, fullPath)
    }
  }

  return files
}

async function collectWorkspaceDocuments(
  workspaceRootPath: string,
  logError: (error: unknown, path: string) => void,
): Promise<DocumentEntry[]> {
  return await scanFilesRecursively(workspaceRootPath, {
    excludeDirs: WORKSPACE_EXCLUDED_DIRS,
    logError,
    onFile: (path, name, size, updatedAt) => ({
      id: buildDocumentId(path),
      name,
      path,
      scope: 'workspace',
      kind: 'workspace',
      updatedAt,
      size,
    }),
  })
}

function getSessionDisplayName(session: Session): string {
  const trimmedName = session.name?.trim()
  return trimmedName && trimmedName.length > 0 ? trimmedName : session.id
}

async function collectSessionArtifactDocuments(
  session: Session,
  sessionPath: string,
  logError: (error: unknown, path: string) => void,
): Promise<DocumentEntry[]> {
  const results: DocumentEntry[] = []
  const sessionName = getSessionDisplayName(session)

  for (const artifact of SESSION_ARTIFACT_DIRS) {
    const artifactPath = join(sessionPath, artifact.dir)
    if (!(await pathExists(artifactPath))) continue

    results.push(
      ...(await scanFilesRecursively(artifactPath, {
        logError,
        onFile: (path, name, size, updatedAt) => ({
          id: buildDocumentId(path),
          name,
          path,
          scope: 'session-artifact',
          kind: artifact.kind,
          sessionId: session.id,
          sessionName,
          updatedAt,
          size,
        }),
      })),
    )
  }

  const notesPath = join(sessionPath, 'notes.md')
  if (await pathExists(notesPath)) {
    try {
      const stats = await stat(notesPath)
      results.push({
        id: buildDocumentId(notesPath),
        name: 'notes.md',
        path: notesPath,
        scope: 'session-artifact',
        kind: 'note',
        sessionId: session.id,
        sessionName,
        updatedAt: stats.mtimeMs,
        size: stats.size,
      })
    } catch (error) {
      logError(error, notesPath)
    }
  }

  return results
}

export function registerDocumentsHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { sessionManager, platform } = deps
  const log = platform.logger

  server.handle(RPC_CHANNELS.documents.LIST, async (_ctx, workspaceId: string): Promise<DocumentEntry[]> => {
    await sessionManager.waitForInit()

    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }

    const logError = (error: unknown, path: string) => {
      log.warn(`Failed to inspect document path: ${path}`, error)
    }

    const entries: DocumentEntry[] = []
    entries.push(...(await collectWorkspaceDocuments(workspace.rootPath, logError)))

    for (const session of sessionManager.getSessions(workspaceId)) {
      if (session.hidden) continue
      const sessionPath = sessionManager.getSessionPath(session.id)
      if (!sessionPath) continue
      entries.push(...(await collectSessionArtifactDocuments(session, sessionPath, logError)))
    }

    return entries.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
      return a.name.localeCompare(b.name)
    })
  })
}
