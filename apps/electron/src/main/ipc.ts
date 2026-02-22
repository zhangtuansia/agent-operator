import { app, ipcMain, nativeTheme, nativeImage, dialog, shell, BrowserWindow } from 'electron'
import { readFile, realpath, mkdir, writeFile, unlink, rm } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { normalize, isAbsolute, join, basename, dirname, resolve } from 'path'
import { homedir, tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { SessionManager } from './sessions'
import type { TaskScheduler } from './scheduler'
import { ipcLog, windowLog } from './logger'
import { WindowManager } from './window-manager'
import { registerOnboardingHandlers } from './onboarding'
import { IPC_CHANNELS, type FileAttachment, type StoredAttachment, type AuthType, type BillingMethodInfo, type SendMessageOptions, type LlmConnectionSetup } from '../shared/types'
import { readFileAttachment, perf, validateImageForClaudeAPI, IMAGE_LIMITS, isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import {
  getAuthType,
  setAuthType,
  getPreferencesPath,
  getModel,
  setModel,
  getAgentType,
  setAgentType,
  getSessionDraft,
  setSessionDraft,
  deleteSessionDraft,
  getAllSessionDrafts,
  getWorkspaceByNameOrId,
  addWorkspace,
  setActiveWorkspace,
  getProviderConfig,
  loadStoredConfig,
  getLlmConnections,
  getLlmConnection,
  addLlmConnection,
  updateLlmConnection,
  deleteLlmConnection,
  getDefaultLlmConnection,
  setDefaultLlmConnection,
  touchLlmConnection,
  isCopilotProvider,
  isCompatProvider,
  isAnthropicProvider,
  isOpenAIProvider,
  getDefaultModelsForConnection,
  getDefaultModelForConnection,
  getDefaultModelsForSlug,
  getDefaultModelForSlug,
  type Workspace,
  type AgentType,
  type LlmConnection,
  type LlmConnectionWithStatus,
  CONFIG_DIR,
  ensureConfigDir,
  saveConfig,
  generateWorkspaceId,
} from '@agent-operator/shared/config'
import { getWorkspaceSessionsPath, getDefaultWorkspacesDir, createWorkspaceAtPath } from '@agent-operator/shared/workspaces'
import { searchSessions } from './search'
import { isCodexAuthenticated, startCodexOAuth } from '@agent-operator/shared/auth'
import { getSessionAttachmentsPath } from '@agent-operator/shared/sessions'
import { loadWorkspaceSources, getSourcesBySlugs, type LoadedSource } from '@agent-operator/shared/sources'
import { isValidThinkingLevel } from '@agent-operator/shared/agent/thinking-levels'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { MarkItDown } from 'markitdown-js'
import {
  SessionIdSchema,
  WorkspaceIdSchema,
  SessionCommandSchema,
  CreateSessionOptionsSchema,
  CredentialResponseSchema,
  WorkspaceSettingKeySchema,
  FileAttachmentSchema,
  StoredAttachmentSchema,
  SendMessageOptionsSchema,
  ProviderConfigSchema,
  CustomModelSchema,
  AuthTypeSchema,
} from '@agent-operator/shared/ipc/schemas'
import { validateIpcArgs, IpcValidationError } from './ipc-validator'

/**
 * Sanitizes a filename to prevent path traversal and filesystem issues.
 * Removes dangerous characters and limits length.
 */
function sanitizeFilename(name: string): string {
  return name
    // Remove path separators and traversal patterns
    .replace(/[/\\]/g, '_')
    // Remove Windows-forbidden characters: < > : " | ? *
    .replace(/[<>:"|?*]/g, '_')
    // Remove control characters (ASCII 0-31)
    .replace(/[\x00-\x1f]/g, '')
    // Collapse multiple dots (prevent hidden files and extension tricks)
    .replace(/\.{2,}/g, '.')
    // Remove leading/trailing dots and spaces (Windows issues)
    .replace(/^[.\s]+|[.\s]+$/g, '')
    // Limit length (200 chars is safe for all filesystems)
    .slice(0, 200)
    // Fallback if name is empty after sanitization
    || 'unnamed'
}

/**
 * Get workspace by ID or name, throwing if not found.
 * Use this when a workspace must exist for the operation to proceed.
 */
function getWorkspaceOrThrow(workspaceId: string): Workspace {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }
  return workspace
}

/**
 * Fetch available models from Copilot SDK and persist them on the connection.
 * Copilot models are dynamic and should not rely on hardcoded defaults.
 */
async function fetchAndStoreCopilotModels(slug: string, accessToken: string): Promise<void> {
  const { CopilotClient } = await import('@github/copilot-sdk')

  const copilotRelativePath = join('node_modules', '@github', 'copilot', 'index.js')
  const basePath = app.isPackaged ? app.getAppPath() : process.cwd()
  let copilotCliPath = join(basePath, copilotRelativePath)
  if (!existsSync(copilotCliPath)) {
    const monorepoRoot = join(basePath, '..', '..')
    copilotCliPath = join(monorepoRoot, copilotRelativePath)
  }

  const previousToken = process.env.COPILOT_GITHUB_TOKEN
  process.env.COPILOT_GITHUB_TOKEN = accessToken

  const client = new CopilotClient({
    useStdio: true,
    autoStart: true,
    logLevel: 'error',
    ...(existsSync(copilotCliPath) ? { cliPath: copilotCliPath } : {}),
  })

  let models: Array<{ id: string; name: string; supportedReasoningEfforts?: string[] }>
  try {
    await client.start()
    models = await client.listModels()
  } finally {
    try {
      await client.stop()
    } catch {
      // noop
    }
    if (previousToken !== undefined) {
      process.env.COPILOT_GITHUB_TOKEN = previousToken
    } else {
      delete process.env.COPILOT_GITHUB_TOKEN
    }
  }

  if (!models || models.length === 0) {
    throw new Error('No models returned from Copilot API')
  }

  const modelDefs = models.map((m) => ({
    id: m.id,
    name: m.name,
    shortName: m.name,
    description: '',
    provider: 'copilot' as const,
    contextWindow: 200_000,
    supportsThinking: !!(m.supportedReasoningEfforts && m.supportedReasoningEfforts.length > 0),
  }))

  const current = getLlmConnection(slug)
  const currentDefault = current?.defaultModel
  const defaultStillValid = currentDefault && modelDefs.some((m) => m.id === currentDefault)

  updateLlmConnection(slug, {
    models: modelDefs,
    defaultModel: defaultStillValid ? currentDefault : modelDefs[0].id,
  })
}

/**
 * Built-in connection templates for first-time setup flows.
 * Each entry maps a slug to its provider configuration.
 * Functions receive `hasCustomEndpoint` to vary behavior.
 */
interface BuiltInConnectionTemplate {
  name: string | ((h: boolean) => string)
  providerType: LlmConnection['providerType'] | ((h: boolean) => LlmConnection['providerType'])
  authType: LlmConnection['authType'] | ((h: boolean) => LlmConnection['authType'])
  baseUrl?: string
}

const BUILT_IN_CONNECTION_TEMPLATES: Record<string, BuiltInConnectionTemplate> = {
  'anthropic-api': {
    name: (h) => h ? 'Custom Anthropic-Compatible' : 'Anthropic API',
    providerType: (h) => h ? 'anthropic_compat' : 'anthropic',
    authType: (h) => h ? 'api_key_with_endpoint' : 'api_key',
  },
  'claude-max': {
    name: 'Claude Max',
    providerType: 'anthropic',
    authType: 'oauth',
  },
  'codex': {
    name: 'Codex (ChatGPT Plus)',
    providerType: 'openai',
    authType: 'oauth',
  },
  'codex-api': {
    name: (h) => h ? 'Codex (Custom Endpoint)' : 'Codex (OpenAI API Key)',
    providerType: (h) => h ? 'openai_compat' : 'openai',
    authType: (h) => h ? 'api_key_with_endpoint' : 'api_key',
  },
  'copilot': {
    name: 'GitHub Copilot',
    providerType: 'copilot',
    authType: 'oauth',
  },
  'deepseek-api': {
    name: 'DeepSeek',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.deepseek.com/anthropic',
  },
  'glm-api': {
    name: '智谱 GLM',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
  },
  'minimax-api': {
    name: 'MiniMax',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.minimaxi.com/anthropic',
  },
  'doubao-api': {
    name: '豆包 Doubao',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
  },
  'kimi-api': {
    name: 'Kimi',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.moonshot.ai/anthropic/',
  },
}

function createBuiltInConnection(slug: string, baseUrl?: string | null): LlmConnection | null {
  const template = BUILT_IN_CONNECTION_TEMPLATES[slug]
  if (!template) return null

  const now = Date.now()
  const hasCustomEndpoint = typeof baseUrl === 'string' && baseUrl.trim().length > 0

  const providerType = typeof template.providerType === 'function'
    ? template.providerType(hasCustomEndpoint) : template.providerType
  const authType = typeof template.authType === 'function'
    ? template.authType(hasCustomEndpoint) : template.authType
  const name = typeof template.name === 'function'
    ? template.name(hasCustomEndpoint) : template.name

  // Slug-level models (third-party), fallback to providerType-level
  const slugModels = getDefaultModelsForSlug(slug)
  const models = slugModels.length > 0 ? slugModels : getDefaultModelsForConnection(providerType)
  const defaultModel = getDefaultModelForSlug(slug) ?? getDefaultModelForConnection(providerType)

  const effectiveBaseUrl = hasCustomEndpoint
    ? baseUrl!.trim()
    : template.baseUrl ?? undefined

  return { slug, name, providerType, authType, baseUrl: effectiveBaseUrl, models, defaultModel, createdAt: now }
}

/**
 * Validates that a file path is within allowed directories to prevent path traversal attacks.
 * Allowed directories: user's home directory and /tmp
 *
 * Security measures:
 * 1. Normalizes path to resolve . and .. components
 * 2. Resolves symlinks to prevent symlink-based bypass
 * 3. Validates parent directories when file doesn't exist
 * 4. Blocks sensitive files even within allowed directories
 */
async function validateFilePath(filePath: string): Promise<string> {
  // Normalize the path to resolve . and .. components
  let normalizedPath = normalize(filePath)

  // Expand ~ to home directory
  if (normalizedPath.startsWith('~')) {
    normalizedPath = normalizedPath.replace(/^~/, homedir())
  }

  // Must be an absolute path
  if (!isAbsolute(normalizedPath)) {
    throw new Error('Only absolute file paths are allowed')
  }

  // Define allowed base directories
  const allowedDirs = [
    homedir(),      // User's home directory
    '/tmp',         // Temporary files
    '/var/folders', // macOS temp folders
    tmpdir(),       // OS-specific temp directory
  ]

  // Helper to check if path is within allowed directories
  const isPathAllowed = (pathToCheck: string): boolean => {
    return allowedDirs.some(dir => pathToCheck.startsWith(dir + '/') || pathToCheck === dir)
  }

  // Resolve symlinks to get the real path
  let realPath: string
  try {
    realPath = await realpath(normalizedPath)
  } catch {
    // File doesn't exist - validate by checking parent directories
    // Walk up the path until we find an existing directory and resolve it
    let currentPath = normalizedPath
    let existingParent: string | null = null

    while (currentPath !== '/' && currentPath !== dirname(currentPath)) {
      currentPath = dirname(currentPath)
      try {
        existingParent = await realpath(currentPath)
        break
      } catch {
        // Parent doesn't exist either, keep walking up
      }
    }

    // If we found an existing parent, verify it's in allowed directories
    if (existingParent) {
      if (!isPathAllowed(existingParent)) {
        throw new Error('Access denied: file path is outside allowed directories')
      }
      // Reconstruct the path using the resolved parent
      const relativePart = normalizedPath.slice(currentPath.length)
      realPath = join(existingParent, relativePart)
    } else {
      // No parent exists - use normalized path but still validate
      realPath = normalizedPath
    }
  }

  // Final check: ensure the real path is within an allowed directory
  if (!isPathAllowed(realPath)) {
    throw new Error('Access denied: file path is outside allowed directories')
  }

  // Block sensitive files even within home directory
  const sensitivePatterns = [
    /\.ssh\//,
    /\.gnupg\//,
    /\.aws\/credentials/,
    /\.env$/,
    /\.env\./,
    /credentials\.json$/,
    /secrets?\./i,
    /\.pem$/,
    /\.key$/,
    /\.kube\/config/,  // Kubernetes config
    /\.docker\/config\.json/,  // Docker credentials
  ]

  if (sensitivePatterns.some(pattern => pattern.test(realPath))) {
    throw new Error('Access denied: cannot read sensitive files')
  }

  return realPath
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Simple in-memory rate limiter for IPC handlers.
 * Prevents abuse by limiting request frequency per channel.
 */
class IpcRateLimiter {
  private limits = new Map<string, RateLimitEntry>()

  /**
   * Check if a request should be allowed.
   * @param key - Unique identifier (typically channel name)
   * @param limit - Maximum requests allowed in the window
   * @param windowMs - Time window in milliseconds
   * @returns true if request is allowed, false if rate limited
   */
  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    let entry = this.limits.get(key)

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
    }

    entry.count++
    this.limits.set(key, entry)

    return entry.count <= limit
  }

  /**
   * Get remaining requests for a key.
   */
  getRemaining(key: string, limit: number): number {
    const entry = this.limits.get(key)
    if (!entry || Date.now() > entry.resetAt) {
      return limit
    }
    return Math.max(0, limit - entry.count)
  }

  /**
   * Clean up expired entries to prevent memory leaks.
   * Call periodically (e.g., every minute).
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.limits) {
      if (now > entry.resetAt) {
        this.limits.delete(key)
      }
    }
  }
}

const rateLimiter = new IpcRateLimiter()

// Clean up expired rate limit entries every minute
setInterval(() => rateLimiter.cleanup(), 60_000)

// Rate limit configurations for different operations
const RATE_LIMITS = {
  // High-frequency operations: 100 req/min
  HIGH_FREQUENCY: { limit: 100, windowMs: 60_000 },
  // Normal operations: 60 req/min
  NORMAL: { limit: 60, windowMs: 60_000 },
  // Sensitive operations: 10 req/min
  SENSITIVE: { limit: 10, windowMs: 60_000 },
  // File operations: 30 req/min
  FILE_OPS: { limit: 30, windowMs: 60_000 },
} as const

/**
 * Wrapper to apply rate limiting to an IPC handler.
 * Throws an error if rate limit is exceeded.
 */
function withRateLimit<T extends unknown[], R>(
  channel: string,
  config: { limit: number; windowMs: number },
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    if (!rateLimiter.check(channel, config.limit, config.windowMs)) {
      const remaining = rateLimiter.getRemaining(channel, config.limit)
      throw new Error(`Rate limit exceeded for ${channel}. Try again later. (${remaining} remaining)`)
    }
    return handler(...args)
  }
}

export function registerIpcHandlers(
  sessionManager: SessionManager,
  windowManager: WindowManager,
  getTaskScheduler?: () => TaskScheduler | null,
): void {
  // Get all sessions
  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    const end = perf.start('ipc.getSessions')
    const sessions = sessionManager.getSessions()
    end()
    return sessions
  })

  // Get a single session with messages (for lazy loading)
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_MESSAGES, async (_event, sessionId: string) => {
    const end = perf.start('ipc.getSessionMessages')
    const session = await sessionManager.getSession(sessionId)
    end()
    return session
  })

  // Search session content using ripgrep
  ipcMain.handle(IPC_CHANNELS.SEARCH_SESSION_CONTENT, async (event, query: string) => {
    const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
    if (!workspaceId) return []
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return []
    const sessionsDir = getWorkspaceSessionsPath(workspace.rootPath)
    return searchSessions(query, sessionsDir)
  })

  // Get workspaces
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACES, async () => {
    return sessionManager.getWorkspaces()
  })

  // Create a new workspace at a folder path (Obsidian-style: folder IS the workspace)
  ipcMain.handle(IPC_CHANNELS.CREATE_WORKSPACE, async (_event, folderPath: string, name: string) => {
    const rootPath = folderPath
    const workspace = addWorkspace({ name, rootPath })
    // Make it active
    setActiveWorkspace(workspace.id)
    ipcLog.info(`Created workspace "${name}" at ${rootPath}`)
    return workspace
  })

  // Check if a workspace slug already exists (for validation before creation)
  ipcMain.handle(IPC_CHANNELS.CHECK_WORKSPACE_SLUG, async (_event, slug: string) => {
    const defaultWorkspacesDir = join(CONFIG_DIR, 'workspaces')
    const workspacePath = join(defaultWorkspacesDir, slug)
    const exists = existsSync(workspacePath)
    return { exists, path: workspacePath }
  })

  // ============================================================
  // Window Management
  // ============================================================

  // Get workspace ID for the calling window
  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_WORKSPACE, (event) => {
    const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
    // Set up ConfigWatcher for live theme/source updates
    if (workspaceId) {
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (workspace) {
        sessionManager.setupConfigWatcher(workspace.rootPath)
      }
    }
    return workspaceId
  })

  // Get pending deep link for this window (pull-based for reliable timing)
  ipcMain.handle(IPC_CHANNELS.GET_PENDING_DEEP_LINK, (event) => {
    return windowManager.getPendingDeepLink(event.sender.id)
  })

  // Open workspace in new window (or focus existing)
  ipcMain.handle(IPC_CHANNELS.OPEN_WORKSPACE, async (_event, workspaceId: string) => {
    windowManager.focusOrCreateWindow(workspaceId)
  })

  // Open a session in a new window
  ipcMain.handle(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW, async (_event, workspaceId: string, sessionId: string) => {
    // Build deep link for session navigation
    const deepLink = `agentoperator://allChats/chat/${sessionId}`
    windowManager.createWindow({
      workspaceId,
      focused: true,
      initialDeepLink: deepLink,
    })
  })

  // Get mode for the calling window (always 'main' now)
  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_MODE, () => {
    return 'main'
  })

  // Close the calling window (triggers close event which may be intercepted)
  ipcMain.handle(IPC_CHANNELS.CLOSE_WINDOW, (event) => {
    windowManager.closeWindow(event.sender.id)
  })

  // Confirm close - force close the window (bypasses interception).
  // Called by renderer when it has no modals to close and wants to proceed.
  ipcMain.handle(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE, (event) => {
    windowManager.forceCloseWindow(event.sender.id)
  })

  // Show/hide macOS traffic light buttons (for fullscreen overlays)
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS, (event, visible: boolean) => {
    windowManager.setTrafficLightsVisible(event.sender.id, visible)
  })

  // Switch workspace in current window (in-window switching)
  ipcMain.handle(IPC_CHANNELS.SWITCH_WORKSPACE, async (event, workspaceId: string) => {
    const end = perf.start('ipc.switchWorkspace', { workspaceId })

    // Update the window's workspace mapping
    const updated = windowManager.updateWindowWorkspace(event.sender.id, workspaceId)

    // If update failed, the window may have been re-created (e.g., after refresh)
    // Try to register it
    if (!updated) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        windowManager.registerWindow(win, workspaceId)
        windowLog.info(`Re-registered window ${event.sender.id} for workspace ${workspaceId}`)
      }
    }

    // Set up ConfigWatcher for the new workspace
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (workspace) {
      sessionManager.setupConfigWatcher(workspace.rootPath)
    }
    end()
  })

  // Create a new session
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, workspaceId: unknown, options?: unknown) => {
    // Validate inputs
    const validatedWorkspaceId = validateIpcArgs(WorkspaceIdSchema, workspaceId, 'CREATE_SESSION.workspaceId')
    const validatedOptions = options ? validateIpcArgs(CreateSessionOptionsSchema, options, 'CREATE_SESSION.options') : undefined

    const end = perf.start('ipc.createSession', { workspaceId: validatedWorkspaceId })
    const session = sessionManager.createSession(validatedWorkspaceId, validatedOptions)
    end()
    return session
  })

  // Create a sub-session under a parent session
  ipcMain.handle(IPC_CHANNELS.CREATE_SUB_SESSION, async (_event, workspaceId: string, parentSessionId: string, options?: unknown) => {
    const workspace = getWorkspaceOrThrow(workspaceId)
    const { createSubSession } = await import('@agent-operator/shared/sessions')
    const validatedOptions = options ? validateIpcArgs(CreateSessionOptionsSchema, options, 'CREATE_SUB_SESSION.options') : undefined
    const session = await createSubSession(workspace.rootPath, parentSessionId, validatedOptions)
    sessionManager.reloadSessions()
    return session
  })

  // Delete a session
  ipcMain.handle(IPC_CHANNELS.DELETE_SESSION, async (_event, sessionId: string) => {
    return sessionManager.deleteSession(sessionId)
  })

  // Import sessions from external platforms (OpenAI, Anthropic)
  ipcMain.handle(IPC_CHANNELS.IMPORT_SESSIONS, async (_event, args: unknown) => {
    const { ImportSessionsArgsSchema } = await import('@agent-operator/shared/ipc/schemas')
    const validated = validateIpcArgs(ImportSessionsArgsSchema, args, 'IMPORT_SESSIONS')

    const workspace = getWorkspaceOrThrow(validated.workspaceId)
    const { parseOpenAIExport, parseAnthropicExport } = await import('@agent-operator/shared/importers')
    const { createImportedSession } = await import('@agent-operator/shared/sessions')

    let fileContent: string

    // Check if the file is a zip file
    if (validated.filePath.toLowerCase().endsWith('.zip')) {
      // Extract JSON from zip file
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(validated.filePath)
      const entries = zip.getEntries()

      // Find the relevant JSON file based on source
      let jsonEntry = null
      if (validated.source === 'openai') {
        // OpenAI exports have conversations.json
        jsonEntry = entries.find(e => e.entryName === 'conversations.json' || e.entryName.endsWith('/conversations.json'))
      } else {
        // Anthropic exports may have different structures, look for any JSON file with conversations
        jsonEntry = entries.find(e =>
          e.entryName.endsWith('.json') &&
          !e.entryName.startsWith('__MACOSX') &&
          !e.entryName.includes('/.') // Skip hidden files
        )
      }

      if (!jsonEntry) {
        throw new Error(`No valid JSON file found in zip archive. Expected ${validated.source === 'openai' ? 'conversations.json' : 'a JSON file'}.`)
      }

      fileContent = jsonEntry.getData().toString('utf-8')
    } else {
      // Read the JSON file directly
      fileContent = await readFile(validated.filePath, 'utf-8')
    }

    // Parse based on source
    const parseResult = validated.source === 'openai'
      ? parseOpenAIExport(fileContent)
      : parseAnthropicExport(fileContent)

    // Create sessions for each parsed conversation
    const label = `imported:${validated.source}`
    for (const conv of parseResult.conversations) {
      createImportedSession(workspace.rootPath, {
        name: conv.title,
        labels: [label],
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: conv.messages,
      })
    }

    // Reload sessions so they appear in the list
    sessionManager.reloadSessions()

    return {
      imported: parseResult.imported,
      failed: parseResult.failed,
      errors: parseResult.errors,
    }
  })

  // Send a message to a session (with optional file attachments)
  // Note: We intentionally don't await here - the response is streamed via events.
  // The IPC handler returns immediately, and results come through SESSION_EVENT channel.
  // attachments: FileAttachment[] for Claude (has content), storedAttachments: StoredAttachment[] for persistence (has thumbnailBase64)
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (event, sessionId: string, message: string, attachments?: FileAttachment[], storedAttachments?: StoredAttachment[], options?: SendMessageOptions) => {
    // Capture the workspace from the calling window for error routing
    const callingWorkspaceId = windowManager.getWorkspaceForWindow(event.sender.id)

    // Start processing in background, errors are sent via event stream
    sessionManager.sendMessage(sessionId, message, attachments, storedAttachments, options).catch(err => {
      ipcLog.error('Error in sendMessage:', err)
      // Send error to renderer so user sees it (route to correct window)
      const window = callingWorkspaceId
        ? windowManager.getWindowByWorkspace(callingWorkspaceId)
        : BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      // Check mainFrame - it becomes null when render frame is disposed
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.mainFrame) {
        window.webContents.send(IPC_CHANNELS.SESSION_EVENT, {
          type: 'error',
          sessionId,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
        // Also send complete event to clear processing state
        window.webContents.send(IPC_CHANNELS.SESSION_EVENT, {
          type: 'complete',
          sessionId
        })
      }
    })
    // Return immediately - streaming results come via SESSION_EVENT
    return { started: true }
  })

  // Cancel processing
  ipcMain.handle(IPC_CHANNELS.CANCEL_PROCESSING, async (_event, sessionId: string, silent?: boolean) => {
    return sessionManager.cancelProcessing(sessionId, silent)
  })

  // Kill background shell
  ipcMain.handle(IPC_CHANNELS.KILL_SHELL, async (_event, sessionId: string, shellId: string) => {
    return sessionManager.killShell(sessionId, shellId)
  })

  // Get background task output
  ipcMain.handle(IPC_CHANNELS.GET_TASK_OUTPUT, async (_event, taskId: string) => {
    try {
      const output = await sessionManager.getTaskOutput(taskId)
      return output
    } catch (err) {
      ipcLog.error('Failed to get task output:', err)
      throw err
    }
  })

  // Respond to a permission request (bash command approval)
  // Returns true if the response was delivered, false if agent/session is gone
  ipcMain.handle(IPC_CHANNELS.RESPOND_TO_PERMISSION, async (_event, sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean) => {
    return sessionManager.respondToPermission(sessionId, requestId, allowed, alwaysAllow)
  })

  // Respond to a credential request (secure auth input)
  // Returns true if the response was delivered, false if agent/session is gone
  ipcMain.handle(IPC_CHANNELS.RESPOND_TO_CREDENTIAL, async (_event, sessionId: string, requestId: string, response: import('../shared/types').CredentialResponse) => {
    return sessionManager.respondToCredential(sessionId, requestId, response)
  })

  // ==========================================================================
  // Consolidated Command Handlers
  // ==========================================================================

  // Session commands - consolidated handler for session operations
  ipcMain.handle(IPC_CHANNELS.SESSION_COMMAND, async (
    _event,
    sessionId: unknown,
    command: unknown
  ) => {
    // Validate inputs
    const validatedSessionId = validateIpcArgs(SessionIdSchema, sessionId, 'SESSION_COMMAND.sessionId')
    const validatedCommand = validateIpcArgs(SessionCommandSchema, command, 'SESSION_COMMAND.command')

    switch (validatedCommand.type) {
      case 'flag':
        return sessionManager.flagSession(validatedSessionId)
      case 'unflag':
        return sessionManager.unflagSession(validatedSessionId)
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
        // Validate thinking level before passing to session manager
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
        // Return the session folder path for copying to clipboard
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
      // Pending plan execution (Accept & Compact flow)
      case 'setPendingPlanExecution':
        return sessionManager.setPendingPlanExecution(validatedSessionId, validatedCommand.planPath)
      case 'markCompactionComplete':
        return sessionManager.markCompactionComplete(validatedSessionId)
      case 'clearPendingPlanExecution':
        return sessionManager.clearPendingPlanExecution(validatedSessionId)
      default: {
        const _exhaustive: never = validatedCommand
        throw new Error(`Unknown session command: ${JSON.stringify(validatedCommand)}`)
      }
    }
  })

  // Get pending plan execution state (for reload recovery)
  ipcMain.handle(IPC_CHANNELS.GET_PENDING_PLAN_EXECUTION, async (
    _event,
    sessionId: string
  ) => {
    return sessionManager.getPendingPlanExecution(sessionId)
  })

  // Read a file (with path validation to prevent traversal attacks)
  // Rate limited to prevent abuse
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, path: string) => {
    // Apply rate limiting for file operations
    if (!rateLimiter.check('READ_FILE', RATE_LIMITS.FILE_OPS.limit, RATE_LIMITS.FILE_OPS.windowMs)) {
      throw new Error('Rate limit exceeded for file reads. Please wait before trying again.')
    }

    try {
      // Validate and normalize the path
      const safePath = await validateFilePath(path)
      const content = await readFile(safePath, 'utf-8')
      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('readFile error:', message)
      throw new Error(`Failed to read file: ${message}`)
    }
  })

  // Open native file dialog for selecting files to attach
  ipcMain.handle(IPC_CHANNELS.OPEN_FILE_DIALOG, async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const defaultFilters = [
      { name: 'All Supported', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'html', 'xml', 'yaml', 'yml'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'md'] },
      { name: 'Code', extensions: ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'css', 'html', 'xml', 'yaml', 'yml'] },
    ]
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters ?? defaultFilters,
    })
    return result.canceled ? [] : result.filePaths
  })

  // Read file and return as FileAttachment with Quick Look thumbnail
  // Rate limited to prevent abuse
  ipcMain.handle(IPC_CHANNELS.READ_FILE_ATTACHMENT, async (_event, path: string) => {
    // Apply rate limiting for file operations
    if (!rateLimiter.check('READ_FILE_ATTACHMENT', RATE_LIMITS.FILE_OPS.limit, RATE_LIMITS.FILE_OPS.windowMs)) {
      throw new Error('Rate limit exceeded for file reads. Please wait before trying again.')
    }

    try {
      // Validate path first to prevent path traversal
      const safePath = await validateFilePath(path)
      // Use shared utility that handles file type detection, encoding, etc.
      const attachment = await readFileAttachment(safePath)
      if (!attachment) return null

      // Generate Quick Look thumbnail for preview (works for images, PDFs, Office docs on macOS)
      try {
        const thumbnail = await nativeImage.createThumbnailFromPath(safePath, { width: 200, height: 200 })
        if (!thumbnail.isEmpty()) {
          ;(attachment as { thumbnailBase64?: string }).thumbnailBase64 = thumbnail.toPNG().toString('base64')
        }
      } catch (thumbError) {
        // Thumbnail generation failed - this is ok, we'll show an icon fallback
        ipcLog.info('Quick Look thumbnail failed (using fallback):', thumbError instanceof Error ? thumbError.message : thumbError)
      }

      return attachment
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('readFileAttachment error:', message)
      return null
    }
  })

  // Generate thumbnail from base64 data (for drag-drop files where we don't have a path)
  ipcMain.handle(IPC_CHANNELS.GENERATE_THUMBNAIL, async (_event, base64: string, mimeType: string): Promise<string | null> => {
    // Save to temp file, generate thumbnail, clean up
    const tempDir = tmpdir()
    const ext = mimeType.split('/')[1] || 'bin'
    const tempPath = join(tempDir, `craft-thumb-${randomUUID()}.${ext}`)

    try {
      // Write base64 to temp file
      const buffer = Buffer.from(base64, 'base64')
      await writeFile(tempPath, buffer)

      // Generate thumbnail using Quick Look
      const thumbnail = await nativeImage.createThumbnailFromPath(tempPath, { width: 200, height: 200 })

      // Clean up temp file
      await unlink(tempPath).catch(() => {})

      if (!thumbnail.isEmpty()) {
        return thumbnail.toPNG().toString('base64')
      }
      return null
    } catch (error) {
      // Clean up temp file on error
      await unlink(tempPath).catch(() => {})
      ipcLog.info('generateThumbnail failed:', error instanceof Error ? error.message : error)
      return null
    }
  })

  // Store an attachment to disk and generate thumbnail/markdown conversion
  // This is the core of the persistent file attachment system
  ipcMain.handle(IPC_CHANNELS.STORE_ATTACHMENT, async (event, sessionId: string, attachment: FileAttachment): Promise<StoredAttachment> => {
    // Track files we've written for cleanup on error
    const filesToCleanup: string[] = []

    try {
      // Reject empty files early
      if (attachment.size === 0) {
        throw new Error('Cannot attach empty file')
      }

      // Get workspace slug from the calling window
      const workspaceId = windowManager.getWorkspaceForWindow(event.sender.id)
      if (!workspaceId) {
        throw new Error('Cannot determine workspace for attachment storage')
      }
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`)
      }
      const workspaceRootPath = workspace.rootPath

      // Create attachments directory if it doesn't exist
      const attachmentsDir = getSessionAttachmentsPath(workspaceRootPath, sessionId)
      await mkdir(attachmentsDir, { recursive: true })

      // Generate unique ID for this attachment
      const id = randomUUID()
      const safeName = sanitizeFilename(attachment.name)
      const storedFileName = `${id}_${safeName}`
      const storedPath = join(attachmentsDir, storedFileName)

      // Track if image was resized (for return value)
      let wasResized = false
      let finalSize = attachment.size
      let resizedBase64: string | undefined

      // 1. Save the file (with image validation and resizing)
      if (attachment.base64) {
        // Images, PDFs, Office files - decode from base64
        // Type as Buffer (generic) to allow reassignment from nativeImage.toJPEG/toPNG
        let decoded: Buffer = Buffer.from(attachment.base64, 'base64')
        // Validate decoded size matches expected (allow small variance for encoding overhead)
        if (Math.abs(decoded.length - attachment.size) > 100) {
          throw new Error(`Attachment corrupted: size mismatch (expected ${attachment.size}, got ${decoded.length})`)
        }

        // For images: validate and resize if needed for Claude API compatibility
        if (attachment.type === 'image') {
          // Get image dimensions using nativeImage
          const image = nativeImage.createFromBuffer(decoded)
          const imageSize = image.getSize()

          // Validate image for Claude API
          const validation = validateImageForClaudeAPI(decoded.length, imageSize.width, imageSize.height)

          if (!validation.valid) {
            // Hard error - reject the image
            throw new Error(validation.error)
          }

          // If resize is recommended, do it now
          if (validation.needsResize && validation.suggestedSize) {
            ipcLog.info(`Resizing image from ${imageSize.width}×${imageSize.height} to ${validation.suggestedSize.width}×${validation.suggestedSize.height}`)

            const resized = image.resize({
              width: validation.suggestedSize.width,
              height: validation.suggestedSize.height,
              quality: 'best',
            })

            // Get as PNG for best quality (or JPEG for photos to save space)
            const isPhoto = attachment.mimeType === 'image/jpeg'
            decoded = isPhoto ? resized.toJPEG(90) : resized.toPNG()
            wasResized = true
            finalSize = decoded.length

            // Re-validate final size after resize (should be much smaller)
            if (decoded.length > IMAGE_LIMITS.MAX_SIZE) {
              // Even after resize it's too big - try more aggressive compression
              decoded = resized.toJPEG(75)
              finalSize = decoded.length
              if (decoded.length > IMAGE_LIMITS.MAX_SIZE) {
                throw new Error(`Image still too large after resize (${(decoded.length / 1024 / 1024).toFixed(1)}MB). Please use a smaller image.`)
              }
            }

            ipcLog.info(`Image resized: ${attachment.size} → ${finalSize} bytes (${Math.round((1 - finalSize / attachment.size) * 100)}% reduction)`)

            // Store resized base64 to return to renderer
            // This is used when sending to Claude API instead of original large base64
            resizedBase64 = decoded.toString('base64')
          }
        }

        await writeFile(storedPath, decoded)
        filesToCleanup.push(storedPath)
      } else if (attachment.text) {
        // Text files - save as UTF-8
        await writeFile(storedPath, attachment.text, 'utf-8')
        filesToCleanup.push(storedPath)
      } else {
        throw new Error('Attachment has no content (neither base64 nor text)')
      }

      // 2. Generate thumbnail using native OS APIs (Quick Look on macOS, Shell handlers on Windows)
      let thumbnailPath: string | undefined
      let thumbnailBase64: string | undefined
      const thumbFileName = `${id}_thumb.png`
      const thumbPath = join(attachmentsDir, thumbFileName)
      try {
        const thumbnail = await nativeImage.createThumbnailFromPath(storedPath, { width: 200, height: 200 })
        if (!thumbnail.isEmpty()) {
          const pngBuffer = thumbnail.toPNG()
          await writeFile(thumbPath, pngBuffer)
          thumbnailPath = thumbPath
          thumbnailBase64 = pngBuffer.toString('base64')
          filesToCleanup.push(thumbPath)
        }
      } catch (thumbError) {
        // Thumbnail generation failed - this is ok, we'll show an icon fallback
        ipcLog.info('Thumbnail generation failed (using fallback):', thumbError instanceof Error ? thumbError.message : thumbError)
      }

      // 3. Convert Office files to markdown (for sending to Claude)
      // This is required for Office files - Claude can't read raw Office binary
      let markdownPath: string | undefined
      if (attachment.type === 'office') {
        const mdFileName = `${id}_${safeName}.md`
        const mdPath = join(attachmentsDir, mdFileName)
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
          // Conversion failed - throw so user knows the file can't be processed
          // Claude can't read raw Office binary, so a failed conversion = unusable file
          const errorMsg = convertError instanceof Error ? convertError.message : String(convertError)
          ipcLog.error('Office to markdown conversion failed:', errorMsg)
          throw new Error(`Failed to convert "${attachment.name}" to readable format: ${errorMsg}`)
        }
      }

      // Return StoredAttachment metadata
      // Include wasResized flag so UI can show notification
      // Include resizedBase64 so renderer uses resized image for Claude API
      return {
        id,
        type: attachment.type,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: finalSize, // Use final size (may differ if resized)
        originalSize: wasResized ? attachment.size : undefined, // Track original if resized
        storedPath,
        thumbnailPath,
        thumbnailBase64,
        markdownPath,
        wasResized,
        resizedBase64, // Only set when wasResized=true, used for Claude API
      }
    } catch (error) {
      // Clean up any files we've written before the error
      if (filesToCleanup.length > 0) {
        ipcLog.info(`Cleaning up ${filesToCleanup.length} orphaned file(s) after storage error`)
        await Promise.all(filesToCleanup.map(f => unlink(f).catch(() => {})))
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('storeAttachment error:', message)
      throw new Error(`Failed to store attachment: ${message}`)
    }
  })

  // Get system theme preference (dark = true, light = false)
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_THEME, () => {
    return nativeTheme.shouldUseDarkColors
  })

  // Get user's home directory
  ipcMain.handle(IPC_CHANNELS.GET_HOME_DIR, () => {
    return homedir()
  })

  // Check if running in debug mode (from source)
  ipcMain.handle(IPC_CHANNELS.IS_DEBUG_MODE, () => {
    return !app.isPackaged
  })

  // Git Bash detection and configuration (Windows only)
  ipcMain.handle(IPC_CHANNELS.GITBASH_CHECK, async () => {
    const platform = process.platform as 'win32' | 'darwin' | 'linux'

    // Non-Windows platforms don't need Git Bash
    if (platform !== 'win32') {
      return { found: true, path: null, platform }
    }

    const commonPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'bash.exe'),
    ]

    for (const bashPath of commonPaths) {
      if (existsSync(bashPath)) {
        return { found: true, path: bashPath, platform }
      }
    }

    return { found: false, path: null, platform }
  })

  ipcMain.handle(IPC_CHANNELS.GITBASH_BROWSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: 'Select bash.exe',
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
      defaultPath: 'C:\\Program Files\\Git\\bin',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.GITBASH_SET_PATH, async (_event, bashPath: string) => {
    try {
      if (!existsSync(bashPath)) {
        return { success: false, error: 'File does not exist at the specified path' }
      }
      if (!bashPath.toLowerCase().endsWith('.exe')) {
        return { success: false, error: 'Path must be an executable (.exe) file' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to validate Git Bash path' }
    }
  })

  // Get app version and system info
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return {
      app: app.getVersion(),
      os: process.platform,
      osVersion: process.getSystemVersion?.() || '',
      arch: process.arch,
    }
  })

  // Get Node/Chrome/Electron versions (for sandbox-enabled preload)
  ipcMain.handle(IPC_CHANNELS.GET_VERSIONS, () => {
    return {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    }
  })

  // Release notes
  ipcMain.handle(IPC_CHANNELS.GET_RELEASE_NOTES, () => {
    const { getCombinedReleaseNotes } = require('@agent-operator/shared/release-notes') as typeof import('@agent-operator/shared/release-notes')
    return getCombinedReleaseNotes()
  })
  ipcMain.handle(IPC_CHANNELS.GET_LATEST_RELEASE_VERSION, () => {
    const { getLatestReleaseVersion } = require('@agent-operator/shared/release-notes') as typeof import('@agent-operator/shared/release-notes')
    return getLatestReleaseVersion()
  })

  // Get fonts path (for sandbox-enabled preload)
  ipcMain.handle(IPC_CHANNELS.GET_FONTS_PATH, () => {
    // Check if we're in development (running via Vite)
    const isDev = !app.isPackaged
    if (isDev) {
      // In development, fonts are served from the app root
      return './resources/fonts'
    }
    // In production, use file:// protocol with resourcesPath
    return `file://${process.resourcesPath}/fonts`
  })

  // Auto-update handlers
  // Manual check from UI - auto-download so user can install immediately
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    const { checkForUpdates } = await import('./auto-update')
    return checkForUpdates({ autoDownload: true })
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_INFO, async () => {
    const { getUpdateInfo } = await import('./auto-update')
    return getUpdateInfo()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
    const { installUpdate } = await import('./auto-update')
    return installUpdate()
  })

  // Dismiss update for this version (persists across restarts)
  ipcMain.handle(IPC_CHANNELS.UPDATE_DISMISS, async (_event, version: string) => {
    const { setDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    setDismissedUpdateVersion(version)
  })

  // Get dismissed version
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_DISMISSED, async () => {
    const { getDismissedUpdateVersion } = await import('@agent-operator/shared/config')
    return getDismissedUpdateVersion()
  })

  // Shell operations - open URL in external browser (or handle agentoperator:// internally)
  ipcMain.handle(IPC_CHANNELS.OPEN_URL, async (_event, url: string) => {
    ipcLog.info('[OPEN_URL] Received request:', url)
    try {
      const trimmedUrl = url.trim()

      // Support absolute local file paths passed from renderer.
      // Some UI paths currently call openUrl() with a filesystem path.
      if (isAbsolute(trimmedUrl) || trimmedUrl.startsWith('~')) {
        const absolutePath = trimmedUrl.startsWith('~') ? trimmedUrl : resolve(trimmedUrl)
        const safePath = await validateFilePath(absolutePath)
        const result = await shell.openPath(safePath)
        if (result) {
          throw new Error(result)
        }
        return
      }

      // Support relative/bare file links in markdown (e.g. "diagram.excalidraw").
      // If the path exists on disk, treat it as a file instead of URL.
      const mayBeRelativeFilePath =
        trimmedUrl.startsWith('./') ||
        trimmedUrl.startsWith('../') ||
        (!trimmedUrl.includes('://') && !trimmedUrl.startsWith('mailto:'))
      if (mayBeRelativeFilePath) {
        const candidatePath = resolve(trimmedUrl)
        if (existsSync(candidatePath)) {
          const safePath = await validateFilePath(candidatePath)
          const result = await shell.openPath(safePath)
          if (result) {
            throw new Error(result)
          }
          return
        }
      }

      // Validate URL format
      const parsed = new URL(trimmedUrl)

      // Handle agentoperator:// URLs internally via deep link handler
      // This ensures ?window= params work correctly for "Open in New Window"
      if (parsed.protocol === 'agentoperator:') {
        ipcLog.info('[OPEN_URL] Handling as deep link')
        const { handleDeepLink } = await import('./deep-link')
        const result = await handleDeepLink(trimmedUrl, windowManager)
        ipcLog.info('[OPEN_URL] Deep link result:', result)
        return
      }

      // Local file URL - open in default app
      if (parsed.protocol === 'file:') {
        const filePath = decodeURIComponent(parsed.pathname)
        const safePath = await validateFilePath(filePath)
        const result = await shell.openPath(safePath)
        if (result) {
          throw new Error(result)
        }
        return
      }

      // External URLs - open in default browser
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

  // Shell operations - open file in default application
  ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async (_event, path: string) => {
    try {
      const trimmedPath = path.trim()
      const absolutePath = trimmedPath.startsWith('~') || isAbsolute(trimmedPath)
        ? trimmedPath
        : resolve(trimmedPath)
      // Validate path is within allowed directories
      const safePath = await validateFilePath(absolutePath)
      // openPath opens file with default application (e.g., VS Code for .ts files)
      const result = await shell.openPath(safePath)
      if (result) {
        // openPath returns empty string on success, error message on failure
        throw new Error(result)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('openFile error:', message)
      throw new Error(`Failed to open file: ${message}`)
    }
  })

  // Shell operations - show file in folder (opens Finder/Explorer with file selected)
  ipcMain.handle(IPC_CHANNELS.SHOW_IN_FOLDER, async (_event, path: string) => {
    try {
      const trimmedPath = path.trim()
      const absolutePath = trimmedPath.startsWith('~') || isAbsolute(trimmedPath)
        ? trimmedPath
        : resolve(trimmedPath)
      // Validate path is within allowed directories
      const safePath = await validateFilePath(absolutePath)
      shell.showItemInFolder(safePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('showInFolder error:', message)
      throw new Error(`Failed to show in folder: ${message}`)
    }
  })

  // Show logout confirmation dialog
  ipcMain.handle(IPC_CHANNELS.SHOW_LOGOUT_CONFIRMATION, async () => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['Cancel', 'Log Out'],
      defaultId: 0,
      cancelId: 0,
      title: 'Log Out',
      message: 'Are you sure you want to log out?',
      detail: 'All conversations will be deleted. This action cannot be undone.',
    } as Electron.MessageBoxOptions)
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Log Out
    return result.response === 1
  })

  // Show delete session confirmation dialog
  ipcMain.handle(IPC_CHANNELS.SHOW_DELETE_SESSION_CONFIRMATION, async (_event, name: string) => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete Conversation',
      message: `Are you sure you want to delete: "${name}"?`,
      detail: 'This action cannot be undone.',
    } as Electron.MessageBoxOptions)
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Delete
    return result.response === 1
  })

  // Logout - clear all credentials and config
  // Rate limited as a sensitive operation
  ipcMain.handle(IPC_CHANNELS.LOGOUT, async () => {
    // Apply strict rate limiting for logout
    if (!rateLimiter.check('LOGOUT', RATE_LIMITS.SENSITIVE.limit, RATE_LIMITS.SENSITIVE.windowMs)) {
      throw new Error('Rate limit exceeded. Please wait before trying again.')
    }

    try {
      // Abort all in-progress sessions and clear session map first
      // to prevent orphan sessions from sending events to deleted workspaces
      sessionManager.clearAllSessions()

      const manager = getCredentialManager()

      // List and delete all stored credentials
      const allCredentials = await manager.list()
      for (const credId of allCredentials) {
        await manager.delete(credId)
      }

      // Delete the config file
      const configPath = join(CONFIG_DIR, 'config.json')
      await unlink(configPath).catch(() => {
        // Ignore if file doesn't exist
      })

      ipcLog.info('Logout complete - cleared all sessions, credentials and config')
    } catch (error) {
      ipcLog.error('Logout error:', error)
      throw error
    }
  })

  // Credential health check - validates credential store usability
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_HEALTH_CHECK, async () => {
    const manager = getCredentialManager()
    return manager.checkHealth()
  })

  ipcMain.handle(IPC_CHANNELS.GET_LLM_API_KEY, async (_event, connectionSlug: string) => {
    const manager = getCredentialManager()
    return manager.getLlmApiKey(connectionSlug)
  })

  // ============================================================
  // Settings - Billing Method
  // ============================================================

  // Get current billing method and credential status
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_BILLING_METHOD, async (): Promise<BillingMethodInfo> => {
    const authType = getAuthType()
    const manager = getCredentialManager()
    const providerConfig = getProviderConfig()

    let hasCredential = false
    if (authType === 'api_key') {
      hasCredential = !!(await manager.getApiKey())
    } else if (authType === 'oauth_token') {
      hasCredential = !!(await manager.getClaudeOAuth())
    } else if (authType === 'bedrock') {
      // Bedrock uses AWS credentials from ~/.aws/credentials, always considered configured
      hasCredential = true
    }

    // Return provider from config (independent of auth type)
    // Auth type determines how to authenticate, provider determines API endpoint and models
    // - bedrock overrides to 'bedrock' provider
    // - oauth_token always uses 'anthropic' (OAuth only works with official API)
    // - Otherwise use configured provider (anthropic, glm, minimax, etc.)
    let provider: string | undefined
    if (authType === 'bedrock') {
      provider = 'bedrock'
    } else if (authType === 'oauth_token') {
      // OAuth only works with official Anthropic API
      provider = 'anthropic'
    } else {
      provider = providerConfig?.provider
    }

    return { authType, hasCredential, provider }
  })

  // Update billing method and credential
  // Rate limited as a sensitive operation
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_BILLING_METHOD, async (_event, authType: AuthType, credential?: string) => {
    // Apply strict rate limiting for credential operations
    if (!rateLimiter.check('SETTINGS_UPDATE_BILLING_METHOD', RATE_LIMITS.SENSITIVE.limit, RATE_LIMITS.SENSITIVE.windowMs)) {
      throw new Error('Rate limit exceeded for credential updates. Please wait before trying again.')
    }

    const manager = getCredentialManager()
    const normalizedCredential = credential?.trim()

    if (normalizedCredential && authType === 'api_key' && !isSafeHttpHeaderValue(normalizedCredential)) {
      throw new Error('API key appears masked or contains invalid characters. Please paste the full key.')
    }

    // Store new credential first so auth type is only switched after successful save.
    if (normalizedCredential) {
      if (authType === 'api_key') {
        await manager.setApiKey(normalizedCredential)
      } else if (authType === 'oauth_token') {
        // Import full credentials including refresh token and expiry from Claude CLI
        const { getExistingClaudeCredentials } = await import('@agent-operator/shared/auth')
        const cliCreds = getExistingClaudeCredentials()
        if (cliCreds) {
          await manager.setClaudeOAuthCredentials({
            accessToken: cliCreds.accessToken,
            refreshToken: cliCreds.refreshToken,
            expiresAt: cliCreds.expiresAt,
          })
          ipcLog.info('Saved Claude OAuth credentials with refresh token')
        } else {
          // Fallback to just saving the access token
          await manager.setClaudeOAuth(normalizedCredential)
          ipcLog.info('Saved Claude OAuth access token only')
        }
      }
    }

    // Clear old credentials when switching auth types
    const oldAuthType = getAuthType()
    if (oldAuthType !== authType) {
      if (oldAuthType === 'api_key') {
        await manager.delete({ type: 'anthropic_api_key' })
      } else if (oldAuthType === 'oauth_token') {
        await manager.delete({ type: 'claude_oauth' })
      }
    }

    // Set new auth type
    setAuthType(authType)

    ipcLog.info(`Billing method updated to: ${authType}`)

    // Reinitialize SessionManager auth to pick up new credentials
    try {
      await sessionManager.reinitializeAuth()
      ipcLog.info('Reinitialized auth after billing update')
    } catch (authError) {
      ipcLog.error('Failed to reinitialize auth:', authError)
      // Don't fail the whole operation if auth reinit fails
    }
  })

  // ============================================================
  // Settings - Agent Type (Claude vs Codex)
  // ============================================================

  // Get current agent type
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_AGENT_TYPE, async (): Promise<AgentType> => {
    return getAgentType()
  })

  // Set agent type
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_AGENT_TYPE, async (_event, agentType: AgentType) => {
    setAgentType(agentType)
    ipcLog.info(`Agent type updated to: ${agentType}`)
  })

  // Check if Codex is authenticated
  ipcMain.handle(IPC_CHANNELS.SETTINGS_CHECK_CODEX_AUTH, async (): Promise<boolean> => {
    return isCodexAuthenticated()
  })

  // Start Codex login flow
  ipcMain.handle(IPC_CHANNELS.SETTINGS_START_CODEX_LOGIN, async () => {
    try {
      await startCodexOAuth((status) => {
        ipcLog.info(`Codex OAuth status: ${status}`)
      })
      return { success: true }
    } catch (error) {
      ipcLog.error('Codex login error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  })

  // ============================================================
  // ChatGPT OAuth (for Codex chatgptAuthTokens mode)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CHATGPT_START_OAUTH, async (_event, connectionSlug: string): Promise<{
    success: boolean
    error?: string
  }> => {
    try {
      const { startChatGptOAuth, exchangeChatGptCode } = await import('@agent-operator/shared/auth')
      const credentialManager = getCredentialManager()

      ipcLog.info(`Starting ChatGPT OAuth flow for connection: ${connectionSlug}`)

      const code = await startChatGptOAuth((status) => {
        ipcLog.info(`[ChatGPT OAuth] ${status}`)
      })

      const tokens = await exchangeChatGptCode(code, (status) => {
        ipcLog.info(`[ChatGPT OAuth] ${status}`)
      })

      await credentialManager.setLlmOAuth(connectionSlug, {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })

      return { success: true }
    } catch (error) {
      ipcLog.error('ChatGPT OAuth failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHATGPT_CANCEL_OAUTH, async (): Promise<{ success: boolean }> => {
    try {
      const { cancelChatGptOAuth } = await import('@agent-operator/shared/auth')
      cancelChatGptOAuth()
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to cancel ChatGPT OAuth:', error)
      return { success: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHATGPT_GET_AUTH_STATUS, async (_event, connectionSlug: string): Promise<{
    authenticated: boolean
    expiresAt?: number
    hasRefreshToken?: boolean
  }> => {
    try {
      const credentialManager = getCredentialManager()
      const oauth = await credentialManager.getLlmOAuth(connectionSlug)
      if (!oauth) {
        return { authenticated: false }
      }

      const isExpired = oauth.expiresAt !== undefined
        ? Date.now() > oauth.expiresAt - 5 * 60 * 1000
        : false
      const hasRefreshToken = !!oauth.refreshToken
      const authenticated = !!oauth.accessToken && !!oauth.idToken && (!isExpired || hasRefreshToken)

      return {
        authenticated,
        expiresAt: oauth.expiresAt,
        hasRefreshToken,
      }
    } catch (error) {
      ipcLog.error('Failed to get ChatGPT auth status:', error)
      return { authenticated: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CHATGPT_LOGOUT, async (_event, connectionSlug: string): Promise<{ success: boolean }> => {
    try {
      const credentialManager = getCredentialManager()
      await credentialManager.deleteLlmCredentials(connectionSlug)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to clear ChatGPT credentials:', error)
      return { success: false }
    }
  })

  // ============================================================
  // GitHub Copilot OAuth (device flow)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.COPILOT_START_OAUTH, async (event, connectionSlug: string): Promise<{
    success: boolean
    error?: string
  }> => {
    try {
      const { startGithubOAuth } = await import('@agent-operator/shared/auth')
      const credentialManager = getCredentialManager()

      const tokens = await startGithubOAuth(
        (status) => ipcLog.info(`[GitHub OAuth] ${status}`),
        (deviceCode) => {
          event.sender.send(IPC_CHANNELS.COPILOT_DEVICE_CODE, deviceCode)
        },
      )

      await credentialManager.setLlmOAuth(connectionSlug, {
        accessToken: tokens.accessToken,
      })

      // Refresh dynamic Copilot model list after OAuth success.
      await fetchAndStoreCopilotModels(connectionSlug, tokens.accessToken)

      return { success: true }
    } catch (error) {
      ipcLog.error('GitHub OAuth failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COPILOT_CANCEL_OAUTH, async (): Promise<{ success: boolean }> => {
    try {
      const { cancelGithubOAuth } = await import('@agent-operator/shared/auth')
      cancelGithubOAuth()
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to cancel GitHub OAuth:', error)
      return { success: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COPILOT_GET_AUTH_STATUS, async (_event, connectionSlug: string): Promise<{
    authenticated: boolean
  }> => {
    try {
      const credentialManager = getCredentialManager()
      const oauth = await credentialManager.getLlmOAuth(connectionSlug)
      return { authenticated: !!oauth?.accessToken }
    } catch (error) {
      ipcLog.error('Failed to get GitHub auth status:', error)
      return { authenticated: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COPILOT_LOGOUT, async (_event, connectionSlug: string): Promise<{ success: boolean }> => {
    try {
      const credentialManager = getCredentialManager()
      await credentialManager.deleteLlmCredentials(connectionSlug)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to clear Copilot credentials:', error)
      return { success: false }
    }
  })

  // ============================================================
  // Settings - API Setup (Unified Connection Bootstrap)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SETUP_LLM_CONNECTION, async (_event, setup: LlmConnectionSetup): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getCredentialManager()

      let connection = getLlmConnection(setup.slug)
      let isNewConnection = false

      if (!connection) {
        connection = createBuiltInConnection(setup.slug, setup.baseUrl)
        if (!connection) {
          return { success: false, error: `Unknown connection slug: ${setup.slug}` }
        }
        isNewConnection = true
      }

      const updates: Partial<LlmConnection> = {}
      if (setup.baseUrl !== undefined) {
        const hasCustomEndpoint = !!setup.baseUrl
        updates.baseUrl = setup.baseUrl ?? undefined

        if (isAnthropicProvider(connection.providerType) && connection.authType !== 'oauth') {
          const providerType = hasCustomEndpoint ? 'anthropic_compat' as const : 'anthropic' as const
          updates.providerType = providerType
          updates.authType = hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key'
          if (!hasCustomEndpoint) {
            updates.models = getDefaultModelsForConnection(providerType)
            updates.defaultModel = getDefaultModelForConnection(providerType)
          }
        }

        if (isOpenAIProvider(connection.providerType) && connection.authType !== 'oauth') {
          const providerType = hasCustomEndpoint ? 'openai_compat' as const : 'openai' as const
          updates.providerType = providerType
          updates.authType = hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key'
          if (!hasCustomEndpoint) {
            updates.models = getDefaultModelsForConnection(providerType)
            updates.defaultModel = getDefaultModelForConnection(providerType)
          }
        }
      }

      if (setup.defaultModel !== undefined) {
        updates.defaultModel = setup.defaultModel ?? undefined
      }
      if (setup.models !== undefined) {
        updates.models = setup.models ?? undefined
      }

      const pendingConnection: LlmConnection = {
        ...connection,
        ...updates,
      }

      if (updates.models && updates.models.length > 0) {
        const updateModelIds = updates.models
          .map(model => typeof model === 'string' ? model : model.id)
          .filter(Boolean)

        if (pendingConnection.defaultModel && !updateModelIds.includes(pendingConnection.defaultModel)) {
          return { success: false, error: `Default model "${pendingConnection.defaultModel}" is not in the provided model list.` }
        }
        if (!pendingConnection.defaultModel) {
          const firstModelId = updateModelIds[0]
          pendingConnection.defaultModel = firstModelId
          updates.defaultModel = firstModelId
        }
      }

      if (isCompatProvider(pendingConnection.providerType)) {
        const compatModelIds = (pendingConnection.models ?? [])
          .map(model => typeof model === 'string' ? model : model.id)
          .filter(Boolean)

        if (!pendingConnection.defaultModel) {
          return { success: false, error: 'Default model is required for compatible endpoints.' }
        }
        if (compatModelIds.length === 0) {
          return { success: false, error: 'At least one model is required for compatible endpoints.' }
        }
        if (!compatModelIds.includes(pendingConnection.defaultModel)) {
          return {
            success: false,
            error: `Default model "${pendingConnection.defaultModel}" is not in the compatible model list.`,
          }
        }
      }

      if (isNewConnection) {
        // Ensure config exists (for fresh installs where onboarding runs before any config is created)
        if (!loadStoredConfig()) {
          ensureConfigDir()
          const workspaceId = generateWorkspaceId()
          const rootPath = `${getDefaultWorkspacesDir()}/${workspaceId}`
          saveConfig({
            workspaces: [{
              id: workspaceId,
              name: 'Default',
              rootPath,
              createdAt: Date.now(),
            }],
            activeWorkspaceId: workspaceId,
            activeSessionId: null,
            llmConnections: [],
          })
          createWorkspaceAtPath(rootPath, 'Default')
          ipcLog.info('Created initial config and workspace for fresh install')
        }
        const added = addLlmConnection(pendingConnection)
        if (!added) {
          return { success: false, error: 'Connection already exists' }
        }
        ipcLog.info(`Created LLM connection: ${setup.slug}`)
      } else if (Object.keys(updates).length > 0) {
        const updated = updateLlmConnection(setup.slug, updates)
        if (!updated) {
          return { success: false, error: 'Failed to update connection' }
        }
        ipcLog.info(`Updated LLM connection settings: ${setup.slug}`)
      }

      if (setup.credential) {
        if (pendingConnection.authType === 'oauth') {
          await manager.setLlmOAuth(setup.slug, { accessToken: setup.credential })
          ipcLog.info('Saved OAuth token to LLM connection')
        } else {
          await manager.setLlmApiKey(setup.slug, setup.credential)
          ipcLog.info('Saved API key to LLM connection')
        }
      }

      // Always set the configured connection as default — the user explicitly chose it.
      setDefaultLlmConnection(setup.slug)

      if (isCopilotProvider(pendingConnection.providerType)) {
        const oauth = await manager.getLlmOAuth(setup.slug)
        if (oauth?.accessToken) {
          await fetchAndStoreCopilotModels(setup.slug, oauth.accessToken)
        }
      }

      await sessionManager.reinitializeAuth(getDefaultLlmConnection() || setup.slug)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      ipcLog.error('Failed to setup LLM connection:', message)
      return { success: false, error: message }
    }
  })

  // Test Anthropic-compatible API connection (key, endpoint, model, and tool support).
  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_API_CONNECTION, async (_event, apiKey: string, baseUrl?: string, models?: string[]): Promise<{ success: boolean; error?: string; modelCount?: number }> => {
    const trimmedKey = apiKey?.trim()
    const trimmedUrl = baseUrl?.trim()
    const normalizedModels = (models ?? []).map(m => m.trim()).filter(Boolean)

    if (!trimmedKey && !trimmedUrl) {
      return { success: false, error: 'API key is required' }
    }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      // Auth strategy for custom endpoints:
      // - With API key + custom URL: set BOTH apiKey (x-api-key) and authToken (Bearer)
      //   because different providers expect different headers:
      //   GLM uses x-api-key, DeepSeek uses Authorization: Bearer
      // - Without key (Ollama): use authToken placeholder
      // - Standard Anthropic: use apiKey only
      const hasRealKey = !!trimmedKey
      const client = new Anthropic({
        ...(trimmedUrl ? { baseURL: trimmedUrl } : {}),
        ...(trimmedUrl
          ? (hasRealKey
              ? { apiKey: trimmedKey, authToken: trimmedKey }
              : { authToken: 'ollama', apiKey: null })
          : { apiKey: trimmedKey, authToken: null }),
      })

      if (normalizedModels.length > 0) {
        // Only test the first (default) model to avoid unnecessary API calls
        const testModelId = normalizedModels[0]!
        await client.messages.create({
          model: testModelId,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return { success: true, modelCount: normalizedModels.length }
      }

      let testModel: string
      if (!trimmedUrl || trimmedUrl.includes('openrouter.ai') || trimmedUrl.includes('ai-gateway.vercel.sh')) {
        testModel = getDefaultModelForConnection('anthropic')
      } else {
        return { success: false, error: 'Please specify a model for custom endpoints' }
      }

      await client.messages.create({
        model: testModel,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 'test_tool', description: 'Test tool', input_schema: { type: 'object' as const, properties: {} } }],
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()
      ipcLog.info(`[testApiConnection] Error: ${message.slice(0, 500)}`)

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and ensure the server is running.' }
      }
      if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('authentication')) {
        return { success: false, error: 'Invalid API key' }
      }
      if (lower.includes('404') && !lower.includes('model')) {
        return { success: false, error: 'Endpoint not found. Ensure the server supports Anthropic Messages API (/v1/messages).' }
      }
      if (lower.includes('model not found') || lower.includes('invalid model') || (lower.includes('404') && lower.includes('model'))) {
        return { success: false, error: normalizedModels[0] ? `Model "${normalizedModels[0]}" not found.` : 'Could not access the default model.' }
      }
      if (lower.includes('tool') && lower.includes('support')) {
        return { success: false, error: 'Selected model does not support tool/function calling.' }
      }
      return { success: false, error: message.slice(0, 300) }
    }
  })

  // Test OpenAI API connection against /v1/models endpoint.
  ipcMain.handle(IPC_CHANNELS.SETTINGS_TEST_OPENAI_CONNECTION, async (_event, apiKey: string, baseUrl?: string, models?: string[]): Promise<{ success: boolean; error?: string }> => {
    const trimmedKey = apiKey?.trim()
    const trimmedUrl = baseUrl?.trim()
    const normalizedModels = (models ?? []).map(m => m.trim()).filter(Boolean)

    if (!trimmedKey) {
      return { success: false, error: 'API key is required' }
    }

    try {
      const effectiveBaseUrl = trimmedUrl || 'https://api.openai.com'
      const modelsUrl = `${effectiveBaseUrl.replace(/\/$/, '')}/v1/models`

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        if (normalizedModels.length > 0) {
          const payload = await response.json()
          const available = new Set((payload?.data ?? []).map((item: { id?: string }) => item.id).filter(Boolean))
          const missing = normalizedModels.find(model => !available.has(model))
          if (missing) {
            return { success: false, error: `Model "${missing}" not found.` }
          }
        }
        return { success: true }
      }

      if (response.status === 401) return { success: false, error: 'Invalid API key' }
      if (response.status === 403) return { success: false, error: 'Access denied. Check API key permissions.' }
      if (response.status === 404) return { success: false, error: 'Endpoint not found. Check base URL.' }
      if (response.status === 429) return { success: false, error: 'Rate limited or quota exceeded.' }

      const text = await response.text().catch(() => '')
      return { success: false, error: text.slice(0, 300) || `API error: ${response.status} ${response.statusText}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()
      ipcLog.info(`[testOpenAiConnection] Error: ${message.slice(0, 500)}`)

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and network.' }
      }
      return { success: false, error: message.slice(0, 300) }
    }
  })

  // ============================================================
  // Settings - Provider Config
  // ============================================================

  // Get stored config (includes providerConfig)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_STORED_CONFIG, async () => {
    const config = loadStoredConfig()
    return config ? { providerConfig: config.providerConfig } : null
  })

  // Update provider config
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_PROVIDER_CONFIG, async (_event, providerConfig: {
    provider: string
    baseURL: string
    apiFormat: 'anthropic' | 'openai'
  }) => {
    const { setProviderConfig } = await import('@agent-operator/shared/config')
    setProviderConfig(providerConfig)
    ipcLog.info(`Provider config updated: ${providerConfig.provider} - ${providerConfig.baseURL}`)

    // Reinitialize SessionManager auth to pick up new provider config
    try {
      await sessionManager.reinitializeAuth()
      ipcLog.info('Reinitialized auth after provider config update')
    } catch (authError) {
      ipcLog.error('Failed to reinitialize auth:', authError)
    }
  })

  // ============================================================
  // Settings - Model
  // ============================================================

  // Get current model (returns stored model or null if not set)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_MODEL, async (): Promise<string | null> => {
    return getModel()
  })

  // Set model preference
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_MODEL, async (_event, model: string) => {
    setModel(model)
    ipcLog.info(`Model updated to: ${model}`)
  })

  // Get session-specific model
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_MODEL, async (_event, sessionId: string, _workspaceId: string): Promise<string | null> => {
    const session = await sessionManager.getSession(sessionId)
    return session?.model ?? null
  })

  // Set session-specific model.
  // Backward compatibility: optional connection is still accepted and routed
  // through SessionManager.setSessionConnection (pre-first-message only).
  ipcMain.handle(IPC_CHANNELS.SESSION_SET_MODEL, async (_event, sessionId: string, workspaceId: string, model: string | null, connection?: string) => {
    await sessionManager.updateSessionModel(sessionId, workspaceId, model, connection)
    ipcLog.info(`Session ${sessionId} model updated to: ${model}`)
  })

  // ============================================================
  // Custom Models (for Custom provider)
  // ============================================================

  // Get all custom models
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_GET, async () => {
    const { getCustomModels } = await import('@agent-operator/shared/config')
    return getCustomModels()
  })

  // Set all custom models (replaces existing list)
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_SET, async (_event, models: import('../shared/types').CustomModel[]) => {
    const { setCustomModels } = await import('@agent-operator/shared/config')
    setCustomModels(models)
    ipcLog.info(`Custom models set: ${models.length} models`)
  })

  // Add a new custom model
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_ADD, async (_event, model: import('../shared/types').CustomModel) => {
    const { addCustomModel } = await import('@agent-operator/shared/config')
    const updatedModels = addCustomModel(model)
    ipcLog.info(`Custom model added: ${model.id} (${model.name})`)
    return updatedModels
  })

  // Update an existing custom model
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_UPDATE, async (_event, modelId: string, updates: Partial<import('../shared/types').CustomModel>) => {
    const { updateCustomModel } = await import('@agent-operator/shared/config')
    const updatedModels = updateCustomModel(modelId, updates)
    ipcLog.info(`Custom model updated: ${modelId}`)
    return updatedModels
  })

  // Delete a custom model
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_DELETE, async (_event, modelId: string) => {
    const { deleteCustomModel } = await import('@agent-operator/shared/config')
    const updatedModels = deleteCustomModel(modelId)
    ipcLog.info(`Custom model deleted: ${modelId}`)
    return updatedModels
  })

  // Reorder custom models
  ipcMain.handle(IPC_CHANNELS.CUSTOM_MODELS_REORDER, async (_event, modelIds: string[]) => {
    const { reorderCustomModels } = await import('@agent-operator/shared/config')
    const updatedModels = reorderCustomModels(modelIds)
    ipcLog.info(`Custom models reordered: ${modelIds.join(', ')}`)
    return updatedModels
  })

  // Open native folder dialog for selecting working directory
  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ============================================================
  // Workspace Settings (per-workspace configuration)
  // ============================================================

  // Get workspace settings (model, permission mode, working directory, credential strategy)
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SETTINGS_GET, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`Workspace not found: ${workspaceId}`)
      return null
    }

    // Load workspace config
    const { loadWorkspaceConfig } = await import('@agent-operator/shared/workspaces')
    const config = loadWorkspaceConfig(workspace.rootPath)

    return {
      name: config?.name,
      model: config?.defaults?.model,
      defaultLlmConnection: config?.defaults?.defaultLlmConnection,
      permissionMode: config?.defaults?.permissionMode,
      cyclablePermissionModes: config?.defaults?.cyclablePermissionModes,
      thinkingLevel: config?.defaults?.thinkingLevel,
      workingDirectory: config?.defaults?.workingDirectory,
      localMcpEnabled: config?.localMcpServers?.enabled ?? true,
    }
  })

  // Update a workspace setting
  // Valid keys: 'name', 'model', 'enabledSourceSlugs', 'permissionMode', 'cyclablePermissionModes', 'thinkingLevel', 'workingDirectory', 'defaultLlmConnection', 'localMcpEnabled'
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SETTINGS_UPDATE, async (_event, workspaceId: unknown, key: unknown, value: unknown) => {
    // Validate inputs
    const validatedWorkspaceId = validateIpcArgs(WorkspaceIdSchema, workspaceId, 'WORKSPACE_SETTINGS_UPDATE.workspaceId')
    const validatedKey = validateIpcArgs(WorkspaceSettingKeySchema, key, 'WORKSPACE_SETTINGS_UPDATE.key')

    const workspace = getWorkspaceOrThrow(validatedWorkspaceId)

    const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@agent-operator/shared/workspaces')
    const config = loadWorkspaceConfig(workspace.rootPath)
    if (!config) {
      throw new Error(`Failed to load workspace config: ${workspaceId}`)
    }

    // Validate defaultLlmConnection slug before saving.
    if (validatedKey === 'defaultLlmConnection' && value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        throw new Error('defaultLlmConnection must be a string or null')
      }
      const connection = getLlmConnection(value)
      if (!connection) {
        throw new Error(`LLM connection not found: ${value}`)
      }
    }

    // Handle 'name' specially - it's a top-level config property, not in defaults
    if (validatedKey === 'name') {
      config.name = String(value).trim()
    } else if (validatedKey === 'localMcpEnabled') {
      // Store in localMcpServers.enabled (top-level, not in defaults)
      config.localMcpServers = config.localMcpServers || { enabled: true }
      config.localMcpServers.enabled = Boolean(value)
    } else if (validatedKey === 'defaultLlmConnection') {
      config.defaults = config.defaults || {}
      if (typeof value === 'string' && value.length > 0) {
        config.defaults.defaultLlmConnection = value
      } else {
        delete config.defaults.defaultLlmConnection
      }
    } else {
      // Update the setting in defaults
      config.defaults = config.defaults || {}
      ;(config.defaults as Record<string, unknown>)[validatedKey] = value
    }

    // Save the config
    saveWorkspaceConfig(workspace.rootPath, config)
    ipcLog.info(`Workspace setting updated: ${validatedKey} = ${JSON.stringify(value)}`)
  })

  // ============================================================
  // User Preferences
  // ============================================================

  // Read user preferences file
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_READ, async () => {
    const path = getPreferencesPath()
    if (!existsSync(path)) {
      return { content: '{}', exists: false, path }
    }
    return { content: readFileSync(path, 'utf-8'), exists: true, path }
  })

  // Write user preferences file (validates JSON before saving)
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_WRITE, async (_, content: string) => {
    try {
      JSON.parse(content) // Validate JSON
      const path = getPreferencesPath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ============================================================
  // Session Drafts (persisted input text)
  // ============================================================

  // Get draft text for a session
  ipcMain.handle(IPC_CHANNELS.DRAFTS_GET, async (_event, sessionId: string) => {
    return getSessionDraft(sessionId)
  })

  // Set draft text for a session (pass empty string to clear)
  ipcMain.handle(IPC_CHANNELS.DRAFTS_SET, async (_event, sessionId: string, text: string) => {
    setSessionDraft(sessionId, text)
  })

  // Delete draft for a session
  ipcMain.handle(IPC_CHANNELS.DRAFTS_DELETE, async (_event, sessionId: string) => {
    deleteSessionDraft(sessionId)
  })

  // Get all drafts (for loading on app start)
  ipcMain.handle(IPC_CHANNELS.DRAFTS_GET_ALL, async () => {
    return getAllSessionDrafts()
  })

  // ============================================================
  // LLM Connections (provider configurations)
  // ============================================================

  // List all configured LLM connections
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_LIST, async (): Promise<LlmConnection[]> => {
    return getLlmConnections()
  })

  // List all LLM connections with authentication status
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_LIST_WITH_STATUS, async (): Promise<LlmConnectionWithStatus[]> => {
    const connections = getLlmConnections()
    const credentialManager = getCredentialManager()
    const defaultSlug = getDefaultLlmConnection()

    return Promise.all(connections.map(async (connection): Promise<LlmConnectionWithStatus> => {
      const hasCredentials = await credentialManager.hasLlmCredentials(
        connection.slug,
        connection.authType,
        connection.providerType,
      )
      return {
        ...connection,
        isAuthenticated: connection.authType === 'none' || hasCredentials,
        isDefault: connection.slug === defaultSlug,
      }
    }))
  })

  // Get a specific LLM connection by slug
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_GET, async (_event, slug: string): Promise<LlmConnection | null> => {
    return getLlmConnection(slug)
  })

  // Save (create or update) an LLM connection
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SAVE, async (_event, connection: LlmConnection): Promise<{ success: boolean; error?: string }> => {
    try {
      const existing = getLlmConnection(connection.slug)
      if (existing) {
        const { slug: _slug, ...updates } = connection
        const success = updateLlmConnection(connection.slug, updates)
        if (!success) {
          return { success: false, error: 'Failed to update connection' }
        }
      } else {
        const success = addLlmConnection(connection)
        if (!success) {
          return { success: false, error: 'Connection with this slug already exists' }
        }
      }

      ipcLog.info(`LLM connection saved: ${connection.slug}`)

      // Refresh runtime auth if the default connection changed in-place.
      if (getDefaultLlmConnection() === connection.slug) {
        await sessionManager.reinitializeAuth()
      }

      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to save LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Set API key credential for a specific LLM connection
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_API_KEY, async (_event, slug: string, apiKey: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const connection = getLlmConnection(slug)
      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      const normalizedApiKey = apiKey.trim()
      if (!normalizedApiKey) {
        return { success: false, error: 'API key is required' }
      }

      if (!isSafeHttpHeaderValue(normalizedApiKey)) {
        return { success: false, error: 'API key appears masked or contains invalid characters. Please paste the full key.' }
      }

      const credentialManager = getCredentialManager()
      await credentialManager.setLlmApiKey(slug, normalizedApiKey)

      if (getDefaultLlmConnection() === slug) {
        await sessionManager.reinitializeAuth()
      }

      ipcLog.info(`LLM connection API key updated: ${slug}`)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set LLM connection API key:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Delete an LLM connection and associated credentials
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_DELETE, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const existing = getLlmConnection(slug)
      if (!existing) {
        return { success: false, error: 'Connection not found' }
      }

      const success = deleteLlmConnection(slug)
      if (!success) {
        return { success: false, error: 'Failed to delete connection' }
      }

      const credentialManager = getCredentialManager()
      await credentialManager.deleteLlmCredentials(slug)
      ipcLog.info(`LLM connection deleted: ${slug}`)

      // Keep environment/session auth aligned after deletion/default fallback.
      await sessionManager.reinitializeAuth()

      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to delete LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Test an LLM connection (credentials + basic connectivity check where applicable)
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_TEST, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const connection = getLlmConnection(slug)
      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      const credentialManager = getCredentialManager()
      const hasCredentials = await credentialManager.hasLlmCredentials(
        slug,
        connection.authType,
        connection.providerType,
      )
      if (
        !hasCredentials
        && connection.authType !== 'none'
        && connection.authType !== 'environment'
        && connection.authType !== 'iam_credentials'
        && connection.authType !== 'service_account_file'
      ) {
        return { success: false, error: 'No credentials configured' }
      }

      const isOpenAiProvider =
        connection.providerType === 'openai' || connection.providerType === 'openai_compat'
      const isAnthropicProvider =
        connection.providerType === 'anthropic' || connection.providerType === 'anthropic_compat'

      // Copilot OAuth validation (and dynamic model refresh)
      if (isCopilotProvider(connection.providerType) && connection.authType === 'oauth') {
        const oauth = await credentialManager.getLlmOAuth(slug)
        if (!oauth?.accessToken) {
          return { success: false, error: 'Not authenticated. Please sign in with GitHub.' }
        }

        try {
          await fetchAndStoreCopilotModels(slug, oauth.accessToken)
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error'
          ipcLog.error(`Copilot model fetch failed during validation: ${msg}`)
          return { success: false, error: `Failed to load Copilot models: ${msg}` }
        }

        touchLlmConnection(slug)
        return { success: true }
      }

      // OpenAI / OpenAI-compatible validation via /v1/models
      if (isOpenAiProvider) {
        if (connection.providerType === 'openai_compat' && !connection.defaultModel) {
          return { success: false, error: 'Default model is required for OpenAI-compatible providers.' }
        }

        if (connection.authType === 'oauth') {
          // OAuth validation in this repo is credential-presence based.
          touchLlmConnection(slug)
          return { success: true }
        }

        const apiKey = (connection.authType === 'api_key'
          || connection.authType === 'api_key_with_endpoint'
          || connection.authType === 'bearer_token')
          ? await credentialManager.getLlmApiKey(slug)
          : null

        if (apiKey && !isSafeHttpHeaderValue(apiKey)) {
          return {
            success: false,
            error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
          }
        }

        const baseUrl = (connection.baseUrl || 'https://api.openai.com').replace(/\/$/, '')
        const response = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const configuredModels = (connection.models ?? [])
            .map(model => typeof model === 'string' ? model : model.id)
            .filter(Boolean)
          if (configuredModels.length > 0) {
            const payload = await response.json()
            const available = new Set(
              (Array.isArray(payload?.data) ? payload.data : [])
                .map((item: { id?: string }) => item.id)
                .filter(Boolean),
            )
            const missing = configuredModels.find(model => !available.has(model))
            if (missing) {
              return { success: false, error: `Model "${missing}" not found. Check the model name and try again.` }
            }
          }

          touchLlmConnection(slug)
          return { success: true }
        }

        if (response.status === 401) return { success: false, error: 'Invalid API key' }
        if (response.status === 403) return { success: false, error: 'API key does not have permission to access this resource' }
        if (response.status === 404) return { success: false, error: 'API endpoint not found. Check the base URL.' }
        if (response.status === 429) return { success: false, error: 'Rate limit exceeded. Please try again.' }

        try {
          const body = await response.json()
          const message = body?.error?.message
          if (typeof message === 'string' && message.length > 0) {
            return { success: false, error: message }
          }
        } catch {
          // fall through
        }
        return { success: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      // Anthropic/Anthropic-compatible validation
      if (isAnthropicProvider) {
        if (connection.providerType === 'anthropic_compat' && !connection.defaultModel) {
          return { success: false, error: 'Default model is required for Anthropic-compatible providers.' }
        }

        if (connection.authType === 'oauth') {
          // OAuth validation in this repo is credential-presence based.
          touchLlmConnection(slug)
          return { success: true }
        }
        if (connection.authType === 'iam_credentials' || connection.authType === 'service_account_file') {
          touchLlmConnection(slug)
          return { success: true }
        }

        const authKey = (connection.authType === 'api_key'
          || connection.authType === 'api_key_with_endpoint'
          || connection.authType === 'bearer_token')
          ? await credentialManager.getLlmApiKey(slug)
          : (connection.authType === 'environment' ? process.env.ANTHROPIC_API_KEY || null : null)

        if (authKey && !isSafeHttpHeaderValue(authKey)) {
          return {
            success: false,
            error: 'Stored credential appears masked or invalid. Please re-enter it in settings.',
          }
        }

        if (!authKey && connection.authType !== 'none') {
          return { success: false, error: 'Could not retrieve credentials' }
        }

        const testModel = connection.defaultModel || (
          connection.models?.[0]
            ? (typeof connection.models[0] === 'string'
                ? connection.models[0]
                : connection.models[0].id)
            : undefined
        )
        if (!testModel) {
          return { success: false, error: 'Default model is required for this connection.' }
        }

        const baseUrl = (connection.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
        const useBearerAuth = connection.authType === 'bearer_token' || !!connection.baseUrl
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(useBearerAuth
              ? (authKey ? { Authorization: `Bearer ${authKey}` } : {})
              : {
                  ...(authKey ? { 'x-api-key': authKey } : {}),
                  'anthropic-version': '2023-06-01',
                }),
          },
          body: JSON.stringify({
            model: testModel,
            max_tokens: 16,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        })

        if (response.ok) {
          touchLlmConnection(slug)
          return { success: true }
        }

        if (response.status === 401) return { success: false, error: 'Authentication failed. Check your API key or token.' }
        if (response.status === 404) return { success: false, error: 'Endpoint not found. Ensure the server supports Anthropic Messages API.' }
        if (response.status === 429) return { success: false, error: 'Rate limited or quota exceeded. Try again later.' }

        try {
          const body = await response.json()
          const message = body?.error?.message
          if (typeof message === 'string' && message.length > 0) {
            return { success: false, error: message }
          }
        } catch {
          // fall through
        }
        return { success: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      // Bedrock/Vertex (and future providers): credential-level validation only for now.
      touchLlmConnection(slug)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()

      if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
        return { success: false, error: 'Cannot connect to API server. Check the URL and network.' }
      }
      if (lower.includes('unauthorized') || lower.includes('authentication')) {
        return { success: false, error: 'Authentication failed. Check your credentials.' }
      }
      if (lower.includes('rate limit') || lower.includes('quota')) {
        return { success: false, error: 'Rate limited or quota exceeded. Try again later.' }
      }

      ipcLog.info(`[LLM_CONNECTION_TEST] Error for ${slug}: ${message.slice(0, 500)}`)
      return { success: false, error: message.slice(0, 200) }
    }
  })

  // Set global default LLM connection
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_DEFAULT, async (_event, slug: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const success = setDefaultLlmConnection(slug)
      if (!success) {
        return { success: false, error: 'Connection not found' }
      }

      ipcLog.info(`Global default LLM connection set to: ${slug}`)
      await sessionManager.reinitializeAuth()
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Set workspace default LLM connection
  ipcMain.handle(IPC_CHANNELS.LLM_CONNECTION_SET_WORKSPACE_DEFAULT, async (_event, workspaceId: string, slug: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      const workspace = getWorkspaceOrThrow(workspaceId)

      if (slug) {
        const connection = getLlmConnection(slug)
        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }
      }

      const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@agent-operator/shared/workspaces')
      const config = loadWorkspaceConfig(workspace.rootPath)
      if (!config) {
        return { success: false, error: 'Failed to load workspace config' }
      }

      config.defaults = config.defaults || {}
      if (slug) {
        config.defaults.defaultLlmConnection = slug
      } else {
        delete config.defaults.defaultLlmConnection
      }

      saveWorkspaceConfig(workspace.rootPath, config)
      ipcLog.info(`Workspace ${workspaceId} default LLM connection set to: ${slug}`)
      return { success: true }
    } catch (error) {
      ipcLog.error('Failed to set workspace default LLM connection:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ============================================================
  // Session Info Panel (files, notes, file watching)
  // ============================================================

  // Recursive directory scanner for session/workspace files
  // Filters out internal files (session.jsonl) and hidden files (. prefix)
  // Returns only non-empty directories
  // excludeDirs: directories to skip (e.g., sessions, sources, skills for workspace scan)
  async function scanDirectory(dirPath: string, excludeDirs: string[] = []): Promise<import('../shared/types').SessionFile[]> {
    const { readdir, stat } = await import('fs/promises')
    const entries = await readdir(dirPath, { withFileTypes: true })
    const files: import('../shared/types').SessionFile[] = []

    for (const entry of entries) {
      // Skip internal and hidden files
      if (entry.name === 'session.jsonl' || entry.name.startsWith('.')) continue
      // Skip excluded directories
      if (excludeDirs.includes(entry.name)) continue

      const fullPath = join(dirPath, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectory (no exclusions for nested dirs)
        const children = await scanDirectory(fullPath, [])
        // Only include non-empty directories
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

    // Sort: directories first, then alphabetically
    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  // Get files in session directory and workspace directory (recursive tree structure)
  // Returns { sessionFiles, workspaceFiles } for separate display in UI
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_FILES, async (_event, sessionId: string) => {
    const sessionPath = sessionManager.getSessionPath(sessionId)
    const workspacePath = sessionManager.getSessionWorkspacePath(sessionId)
    const WORKSPACE_EXCLUDED_DIRS = ['sessions', 'sources', 'skills', 'statuses', 'labels']

    const result: { sessionFiles: import('../shared/types').SessionFile[]; workspaceFiles: import('../shared/types').SessionFile[] } = {
      sessionFiles: [],
      workspaceFiles: [],
    }

    // Scan session directory
    if (sessionPath) {
      try {
        result.sessionFiles = await scanDirectory(sessionPath)
      } catch (error) {
        ipcLog.error('Failed to get session files:', error)
      }
    }

    // Scan workspace directory (excluding managed system directories)
    if (workspacePath) {
      try {
        result.workspaceFiles = await scanDirectory(workspacePath, WORKSPACE_EXCLUDED_DIRS)
      } catch (error) {
        ipcLog.error('Failed to get workspace files:', error)
      }
    }

    return result
  })

  // Get one section only (session/workspace) for incremental refreshes
  ipcMain.handle(
    IPC_CHANNELS.GET_SESSION_FILES_BY_SCOPE,
    async (_event, sessionId: string, scope: 'session' | 'workspace') => {
      const WORKSPACE_EXCLUDED_DIRS = ['sessions', 'sources', 'skills', 'statuses', 'labels']
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

  type SessionFileScope = 'session' | 'workspace'
  type SessionFilesChangedEvent = {
    sessionId: string
    scope: SessionFileScope
    changedPath?: string
  }

  type SessionWatchEntry = {
    sessionId: string
    sessionPath: string
    workspacePath: string | null
    sessionWatcher: import('fs').FSWatcher | null
    workspaceWatcher: import('fs').FSWatcher | null
    subscribers: Set<number> // webContents.id
    pendingChanges: Map<SessionFileScope, string | undefined>
    debounceTimer: ReturnType<typeof setTimeout> | null
  }

  const WORKSPACE_EXCLUDED_DIRS = ['sessions', 'sources', 'skills', 'statuses', 'labels']
  const sessionWatchers = new Map<string, SessionWatchEntry>()
  const senderSubscriptions = new Map<number, Set<string>>()
  const senderDestroyHookRegistered = new Set<number>()

  const isInternalPath = (scope: SessionFileScope, relativePath: string | null): boolean => {
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

  const closeWatchEntry = (entry: SessionWatchEntry): void => {
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

  const removeSenderFromSession = (senderId: number, sessionId: string): void => {
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

  const removeSenderSubscriptions = (senderId: number, sessionId?: string): void => {
    if (sessionId) {
      removeSenderFromSession(senderId, sessionId)
      return
    }

    const subscriptions = senderSubscriptions.get(senderId)
    if (!subscriptions || subscriptions.size === 0) return

    for (const watchedSessionId of [...subscriptions]) {
      removeSenderFromSession(senderId, watchedSessionId)
    }
  }

  const flushPendingChanges = (entry: SessionWatchEntry): void => {
    if (entry.pendingChanges.size === 0) return

    const events: SessionFilesChangedEvent[] = [...entry.pendingChanges.entries()].map(
      ([scope, changedPath]) => ({
        sessionId: entry.sessionId,
        scope,
        changedPath,
      }),
    )
    entry.pendingChanges.clear()

    // Notify only subscribed renderers
    for (const senderId of entry.subscribers) {
      const win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.id === senderId)
      if (!win || win.isDestroyed()) continue
      for (const payload of events) {
        win.webContents.send(IPC_CHANNELS.SESSION_FILES_CHANGED, payload)
      }
    }
  }

  const queueFileChange = (
    entry: SessionWatchEntry,
    scope: SessionFileScope,
    rootPath: string,
    filename: string | Buffer | null,
  ): void => {
    const relativePath = filename ? filename.toString() : null
    if (isInternalPath(scope, relativePath)) return
    const changedPath = relativePath ? join(rootPath, relativePath) : undefined

    // Keep latest changed path per scope and debounce bursts
    entry.pendingChanges.set(scope, changedPath)
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }
    entry.debounceTimer = setTimeout(() => flushPendingChanges(entry), 120)
  }

  const createWatcher = async (
    pathToWatch: string,
    onChange: (filename: string | Buffer | null) => void,
  ): Promise<import('fs').FSWatcher | null> => {
    if (!existsSync(pathToWatch)) return null
    const { watch } = await import('fs')

    try {
      return watch(pathToWatch, { recursive: true }, (_eventType, filename) => onChange(filename))
    } catch (error) {
      // Fallback for platforms/filesystems that don't support recursive watch.
      ipcLog.warn(`Recursive watch unavailable for ${pathToWatch}, falling back to non-recursive`, error)
      return watch(pathToWatch, { recursive: false }, (_eventType, filename) => onChange(filename))
    }
  }

  // Start watching session/workspace directories for file changes
  ipcMain.handle(IPC_CHANNELS.WATCH_SESSION_FILES, async (event, sessionId: string) => {
    const senderId = event.sender.id
    const sessionPath = sessionManager.getSessionPath(sessionId)
    if (!sessionPath) return
    const workspacePath = sessionManager.getSessionWorkspacePath(sessionId)

    const existingSubscriptions = senderSubscriptions.get(senderId)
    if (existingSubscriptions?.size === 1 && existingSubscriptions.has(sessionId)) {
      // Already watching this exact session for this renderer; avoid churn.
      return
    }

    // A renderer should only watch one session at a time.
    removeSenderSubscriptions(senderId)

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
        removeSenderSubscriptions(senderId)
        senderDestroyHookRegistered.delete(senderId)
      })
    }
    senderSubscriptions.get(senderId)!.add(sessionId)
  })

  // Stop watching session files (optionally one session; default all for this renderer)
  ipcMain.handle(IPC_CHANNELS.UNWATCH_SESSION_FILES, async (event, sessionId?: string) => {
    removeSenderSubscriptions(event.sender.id, sessionId)
  })

  // Get session notes (reads notes.md from session directory)
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_NOTES, async (_event, sessionId: string) => {
    const sessionPath = sessionManager.getSessionPath(sessionId)
    if (!sessionPath) return ''

    try {
      const notesPath = join(sessionPath, 'notes.md')
      const content = await readFile(notesPath, 'utf-8')
      return content
    } catch {
      // File doesn't exist yet - return empty string
      return ''
    }
  })

  // Set session notes (writes to notes.md in session directory)
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

  // Preview windows removed - now using in-app overlays (see ChatDisplay.tsx)

  // ============================================================
  // Sources
  // ============================================================

  // Get all sources for a workspace
  ipcMain.handle(IPC_CHANNELS.SOURCES_GET, async (_event, workspaceId: string) => {
    // Look up workspace to get rootPath
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SOURCES_GET: Workspace not found: ${workspaceId}`)
      return []
    }
    // Set up ConfigWatcher for this workspace to broadcast live updates
    sessionManager.setupConfigWatcher(workspace.rootPath)
    return loadWorkspaceSources(workspace.rootPath)
  })

  // Create a new source
  ipcMain.handle(IPC_CHANNELS.SOURCES_CREATE, async (_event, workspaceId: string, config: Partial<import('@agent-operator/shared/sources').CreateSourceInput>) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { createSource } = await import('@agent-operator/shared/sources')
    return createSource(workspace.rootPath, {
      name: config.name || 'New Source',
      provider: config.provider || 'custom',
      type: config.type || 'mcp',
      enabled: config.enabled ?? true,
      mcp: config.mcp,
      api: config.api,
      local: config.local,
    })
  })

  // Delete a source
  ipcMain.handle(IPC_CHANNELS.SOURCES_DELETE, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { deleteSource } = await import('@agent-operator/shared/sources')
    deleteSource(workspace.rootPath, sourceSlug)
  })

  // Start OAuth flow for a source
  ipcMain.handle(IPC_CHANNELS.SOURCES_START_OAUTH, async (_event, workspaceId: string, sourceSlug: string) => {
    try {
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) {
        return { success: false, error: `Workspace not found: ${workspaceId}` }
      }
      const { loadSource, getSourceCredentialManager } = await import('@agent-operator/shared/sources')

      const source = loadSource(workspace.rootPath, sourceSlug)
      if (!source || source.config.type !== 'mcp' || !source.config.mcp?.url) {
        return { success: false, error: 'Source not found or not an MCP source' }
      }

      const credManager = getSourceCredentialManager()
      const result = await credManager.authenticate(source, {
        onStatus: (message) => ipcLog.info(`[OAuth] ${source.config.name}: ${message}`),
        onError: (error) => ipcLog.error(`[OAuth] ${source.config.name} error: ${error}`),
      })

      if (!result.success) {
        return { success: false, error: result.error }
      }

      // Get token to return to caller
      const token = await credManager.getToken(source)

      ipcLog.info(`Source OAuth complete: ${sourceSlug}`)
      return { success: true, accessToken: token }
    } catch (error) {
      ipcLog.error(`Source OAuth failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
      }
    }
  })

  // Save credentials for a source (bearer token or API key)
  ipcMain.handle(IPC_CHANNELS.SOURCES_SAVE_CREDENTIALS, async (_event, workspaceId: string, sourceSlug: string, credential: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadSource, getSourceCredentialManager } = await import('@agent-operator/shared/sources')

    const source = loadSource(workspace.rootPath, sourceSlug)
    if (!source) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    // SourceCredentialManager handles credential type resolution
    const credManager = getSourceCredentialManager()
    await credManager.save(source, { value: credential })

    ipcLog.info(`Saved credentials for source: ${sourceSlug}`)
  })

  // Get permissions config for a source (raw format for UI display)
  ipcMain.handle(IPC_CHANNELS.SOURCES_GET_PERMISSIONS, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    // Load raw JSON file (not normalized) for UI display
    const { existsSync, readFileSync } = await import('fs')
    const { getSourcePermissionsPath } = await import('@agent-operator/shared/agent')
    const path = getSourcePermissionsPath(workspace.rootPath, sourceSlug)

    if (!existsSync(path)) return null

    try {
      const content = readFileSync(path, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      ipcLog.error('Error reading permissions config:', error)
      return null
    }
  })

  // Get permissions config for a workspace (raw format for UI display)
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_PERMISSIONS, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    // Load raw JSON file (not normalized) for UI display
    const { existsSync, readFileSync } = await import('fs')
    const { getWorkspacePermissionsPath } = await import('@agent-operator/shared/agent')
    const path = getWorkspacePermissionsPath(workspace.rootPath)

    if (!existsSync(path)) return null

    try {
      const content = readFileSync(path, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      ipcLog.error('Error reading workspace permissions config:', error)
      return null
    }
  })

  // Get default permissions from ~/.cowork/permissions/default.json
  // Returns raw JSON for UI display (patterns with comments), plus the file path
  ipcMain.handle(IPC_CHANNELS.DEFAULT_PERMISSIONS_GET, async () => {
    const { existsSync, readFileSync } = await import('fs')
    const { getAppPermissionsDir } = await import('@agent-operator/shared/agent')
    const { join } = await import('path')

    const defaultPath = join(getAppPermissionsDir(), 'default.json')
    if (!existsSync(defaultPath)) return { config: null, path: defaultPath }

    try {
      const content = readFileSync(defaultPath, 'utf-8')
      return { config: JSON.parse(content), path: defaultPath }
    } catch (error) {
      ipcLog.error('Error reading default permissions config:', error)
      return { config: null, path: defaultPath }
    }
  })

  // Get MCP tools for a source with permission status
  ipcMain.handle(IPC_CHANNELS.SOURCES_GET_MCP_TOOLS, async (_event, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return { success: false, error: 'Workspace not found' }

    try {
      // Load source config
      const sources = await loadWorkspaceSources(workspace.rootPath)
      const source = sources.find(s => s.config.slug === sourceSlug)
      if (!source) return { success: false, error: 'Source not found' }
      if (source.config.type !== 'mcp') return { success: false, error: 'Source is not an MCP server' }
      if (!source.config.mcp) return { success: false, error: 'MCP config not found' }

      // Check connection status
      if (source.config.connectionStatus === 'needs_auth') {
        return { success: false, error: 'Source requires authentication' }
      }
      if (source.config.connectionStatus === 'failed') {
        return { success: false, error: source.config.connectionError || 'Connection failed' }
      }
      if (source.config.connectionStatus === 'untested') {
        return { success: false, error: 'Source has not been tested yet' }
      }

      // Create unified MCP client for both stdio and HTTP transports
      const { OperatorMcpClient } = await import('@agent-operator/shared/mcp')
      let client: InstanceType<typeof OperatorMcpClient>

      if (source.config.mcp.transport === 'stdio') {
        // Stdio transport - spawn local MCP server process
        if (!source.config.mcp.command) {
          return { success: false, error: 'Stdio MCP source is missing required "command" field' }
        }
        ipcLog.info(`Fetching MCP tools via stdio: ${source.config.mcp.command}`)
        client = new OperatorMcpClient({
          transport: 'stdio',
          command: source.config.mcp.command,
          args: source.config.mcp.args,
          env: source.config.mcp.env,
        })
      } else {
        // HTTP/SSE transport - connect to remote MCP server
        if (!source.config.mcp.url) {
          return { success: false, error: 'MCP source URL is required for HTTP/SSE transport' }
        }

        let accessToken: string | undefined
        if (source.config.mcp.authType === 'oauth' || source.config.mcp.authType === 'bearer') {
          const credentialManager = getCredentialManager()
          const credentialId = source.config.mcp.authType === 'oauth'
            ? { type: 'source_oauth' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
            : { type: 'source_bearer' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
          const credential = await credentialManager.get(credentialId)
          accessToken = credential?.value
        }

        ipcLog.info(`Fetching MCP tools from ${source.config.mcp.url}`)
        client = new OperatorMcpClient({
          transport: 'http',
          url: source.config.mcp.url,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        })
      }

      // Both transports now return full Tool[] with descriptions
      const tools = await client.listTools()
      await client.close()

      // Load permissions patterns
      const { loadSourcePermissionsConfig, permissionsConfigCache } = await import('@agent-operator/shared/agent')
      const permissionsConfig = loadSourcePermissionsConfig(workspace.rootPath, sourceSlug)

      // Get merged permissions config
      const mergedConfig = permissionsConfigCache.getMergedConfig({
        workspaceRootPath: workspace.rootPath,
        activeSourceSlugs: [sourceSlug],
      })

      // Check each tool against permissions patterns
      const toolsWithPermission = tools.map(tool => {
        // Check if tool matches any allowed pattern
        const allowed = mergedConfig.readOnlyMcpPatterns.some((pattern: RegExp) => pattern.test(tool.name))
        return {
          name: tool.name,
          description: tool.description,
          allowed,
        }
      })

      return { success: true, tools: toolsWithPermission }
    } catch (error) {
      ipcLog.error('Failed to get MCP tools:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tools'
      // Provide more helpful error messages
      if (errorMessage.includes('404')) {
        return { success: false, error: 'MCP server endpoint not found. The server may be offline or the URL may be incorrect.' }
      }
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return { success: false, error: 'Authentication failed. Please re-authenticate with this source.' }
      }
      return { success: false, error: errorMessage }
    }
  })

  // ============================================================
  // Skills (Workspace-scoped)
  // ============================================================

  // Get all skills for a workspace
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

  // Get files in a skill directory
  ipcMain.handle(IPC_CHANNELS.SKILLS_GET_FILES, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      ipcLog.error(`SKILLS_GET_FILES: Workspace not found: ${workspaceId}`)
      return []
    }

    const { join } = await import('path')
    const { readdirSync, statSync } = await import('fs')
    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillDir = join(skillsDir, skillSlug)

    interface SkillFile {
      name: string
      type: 'file' | 'directory'
      size?: number
      children?: SkillFile[]
    }

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
        ipcLog.error(`SKILLS_GET_FILES: Error scanning ${dirPath}:`, err)
        return []
      }
    }

    return scanDirectory(skillDir)
  })

  // Delete a skill from a workspace
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteSkill } = await import('@agent-operator/shared/skills')
    deleteSkill(workspace.rootPath, skillSlug)
    ipcLog.info(`Deleted skill: ${skillSlug}`)
  })

  // Open skill SKILL.md in editor
  ipcMain.handle(IPC_CHANNELS.SKILLS_OPEN_EDITOR, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { join } = await import('path')
    const { shell } = await import('electron')
    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillFile = join(skillsDir, skillSlug, 'SKILL.md')
    await shell.openPath(skillFile)
  })

  // Open skill folder in Finder/Explorer
  ipcMain.handle(IPC_CHANNELS.SKILLS_OPEN_FINDER, async (_event, workspaceId: string, skillSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { join } = await import('path')
    const { shell } = await import('electron')
    const { getWorkspaceSkillsPath } = await import('@agent-operator/shared/workspaces')

    const skillsDir = getWorkspaceSkillsPath(workspace.rootPath)
    const skillDir = join(skillsDir, skillSlug)
    await shell.showItemInFolder(skillDir)
  })

  // Import skill from URL
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

  // Import skill from content (raw SKILL.md content)
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

  // ============================================================
  // Status Management (Workspace-scoped)
  // ============================================================

  // List all statuses for a workspace
  ipcMain.handle(IPC_CHANNELS.STATUSES_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listStatuses } = await import('@agent-operator/shared/statuses')
    return listStatuses(workspace.rootPath)
  })

  // Reorder statuses (drag-and-drop). Receives new ordered array of status IDs.
  // Config watcher will detect the file change and broadcast STATUSES_CHANGED.
  ipcMain.handle(IPC_CHANNELS.STATUSES_REORDER, async (_event, workspaceId: string, orderedIds: string[]) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { reorderStatuses } = await import('@agent-operator/shared/statuses')
    reorderStatuses(workspace.rootPath, orderedIds)
  })

  // ============================================================
  // Labels Management (Workspace-scoped)
  // ============================================================

  // List all labels for a workspace
  ipcMain.handle(IPC_CHANNELS.LABELS_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listLabels } = await import('@agent-operator/shared/labels/storage')
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    // Resolve locale: explicit setting > system locale > fallback to 'en'
    const storedLang = loadStoredConfig()?.uiLanguage
    const systemLang = app.getLocale()?.startsWith('zh') ? 'zh' : undefined
    const locale = storedLang || systemLang
    return listLabels(workspace.rootPath, locale)
  })

  // Create a new label in a workspace
  ipcMain.handle(IPC_CHANNELS.LABELS_CREATE, async (_event, workspaceId: string, input: import('@agent-operator/shared/labels').CreateLabelInput) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { createLabel } = await import('@agent-operator/shared/labels/crud')
    const label = createLabel(workspace.rootPath, input)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
    return label
  })

  // Delete a label (and descendants) from a workspace
  ipcMain.handle(IPC_CHANNELS.LABELS_DELETE, async (_event, workspaceId: string, labelId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { deleteLabel } = await import('@agent-operator/shared/labels/crud')
    const result = deleteLabel(workspace.rootPath, labelId)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
    return result
  })

  // ============================================================
  // Views Management (Workspace-scoped)
  // ============================================================

  // List all views for a workspace
  ipcMain.handle(IPC_CHANNELS.VIEWS_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listViews } = await import('@agent-operator/shared/views/storage')
    return listViews(workspace.rootPath)
  })

  // Save views (replaces full array)
  ipcMain.handle(IPC_CHANNELS.VIEWS_SAVE, async (_event, workspaceId: string, views: import('@agent-operator/shared/views').ViewConfig[]) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { saveViews } = await import('@agent-operator/shared/views/storage')
    saveViews(workspace.rootPath, views)
    windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
  })

  // Generic workspace image loading (for source icons, status icons, etc.)
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_READ_IMAGE, async (_event, workspaceId: string, relativePath: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { readFileSync, existsSync } = await import('fs')
    const { join, normalize } = await import('path')

    // Security: validate path
    // - Must not contain .. (path traversal)
    // - Must be a valid image extension
    const ALLOWED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']

    if (relativePath.includes('..')) {
      throw new Error('Invalid path: directory traversal not allowed')
    }

    const ext = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'))
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
    }

    // Resolve path relative to workspace root
    const absolutePath = normalize(join(workspace.rootPath, relativePath))

    // Double-check the resolved path is still within workspace
    if (!absolutePath.startsWith(workspace.rootPath)) {
      throw new Error('Invalid path: outside workspace directory')
    }

    if (!existsSync(absolutePath)) {
      // Missing icon probes are expected during extension auto-discovery.
      // Return empty payload to avoid noisy IPC error logs.
      return ''
    }

    // Read file as buffer
    const buffer = readFileSync(absolutePath)

    // If SVG, return as UTF-8 string (caller will use as innerHTML)
    if (ext === '.svg') {
      return buffer.toString('utf-8')
    }

    // For binary images, return as data URL
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

  // Generic workspace image writing (for workspace icon, etc.)
  // Resizes images to max 256x256 to keep file sizes small
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_WRITE_IMAGE, async (_event, workspaceId: string, relativePath: string, base64: string, mimeType: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { writeFileSync, existsSync, unlinkSync, readdirSync } = await import('fs')
    const { join, normalize, basename } = await import('path')

    // Security: validate path
    const ALLOWED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']

    if (relativePath.includes('..')) {
      throw new Error('Invalid path: directory traversal not allowed')
    }

    const ext = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'))
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`)
    }

    // Resolve path relative to workspace root
    const absolutePath = normalize(join(workspace.rootPath, relativePath))

    // Double-check the resolved path is still within workspace
    if (!absolutePath.startsWith(workspace.rootPath)) {
      throw new Error('Invalid path: outside workspace directory')
    }

    // If this is an icon file (icon.*), delete any existing icon files with different extensions
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

    // Decode base64 to buffer
    const buffer = Buffer.from(base64, 'base64')

    // For SVGs, just write directly (no resizing needed)
    if (mimeType === 'image/svg+xml' || ext === '.svg') {
      writeFileSync(absolutePath, buffer)
      return
    }

    // For raster images, resize to max 256x256 using nativeImage
    const image = nativeImage.createFromBuffer(buffer)
    const size = image.getSize()

    // Only resize if larger than 256px
    if (size.width > 256 || size.height > 256) {
      const ratio = Math.min(256 / size.width, 256 / size.height)
      const newWidth = Math.round(size.width * ratio)
      const newHeight = Math.round(size.height * ratio)
      const resized = image.resize({ width: newWidth, height: newHeight, quality: 'best' })

      // Write as PNG for consistency
      writeFileSync(absolutePath, resized.toPNG())
    } else {
      // Small enough, write as-is
      writeFileSync(absolutePath, buffer)
    }
  })

  // Register onboarding handlers
  registerOnboardingHandlers(sessionManager)

  // ============================================================
  // Theme (app-level only)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.THEME_GET_APP, async () => {
    const { loadAppTheme } = await import('@agent-operator/shared/config/storage')
    return loadAppTheme()
  })

  // Preset themes (app-level)
  ipcMain.handle(IPC_CHANNELS.THEME_GET_PRESETS, async () => {
    const { loadPresetThemes } = await import('@agent-operator/shared/config/storage')
    // Pass bundled themes path from Electron resources (dist/resources/themes)
    const bundledThemesDir = join(__dirname, 'resources/themes')
    return loadPresetThemes(bundledThemesDir)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_LOAD_PRESET, async (_event, themeId: string) => {
    const { loadPresetTheme } = await import('@agent-operator/shared/config/storage')
    return loadPresetTheme(themeId)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_COLOR_THEME, async () => {
    const { getColorTheme } = await import('@agent-operator/shared/config/storage')
    return getColorTheme()
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SET_COLOR_THEME, async (_event, themeId: string) => {
    const { setColorTheme } = await import('@agent-operator/shared/config/storage')
    setColorTheme(themeId)
  })

  // Broadcast theme preferences to all other windows (for cross-window sync)
  ipcMain.handle(IPC_CHANNELS.THEME_BROADCAST_PREFERENCES, async (event, preferences: { mode: string; colorTheme: string; font: string }) => {
    const senderId = event.sender.id
    // Broadcast to all windows except the sender
    for (const managed of windowManager.getAllWindows()) {
      if (!managed.window.isDestroyed() &&
          !managed.window.webContents.isDestroyed() &&
          managed.window.webContents.mainFrame &&
          managed.window.webContents.id !== senderId) {
        managed.window.webContents.send(IPC_CHANNELS.THEME_PREFERENCES_CHANGED, preferences)
      }
    }
  })

  // Workspace-level theme overrides
  ipcMain.handle(IPC_CHANNELS.THEME_SET_WORKSPACE_COLOR_THEME, async (_event, workspaceId: string, themeId: string | null) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return
    const { setWorkspaceColorTheme } = await import('@agent-operator/shared/workspaces/storage')
    setWorkspaceColorTheme(workspace.rootPath, themeId ?? undefined)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_GET_ALL_WORKSPACE_THEMES, async () => {
    const { getWorkspaceColorTheme } = await import('@agent-operator/shared/workspaces/storage')
    const themes: Record<string, string | undefined> = {}
    for (const workspace of sessionManager.getWorkspaces()) {
      themes[workspace.id] = getWorkspaceColorTheme(workspace.rootPath)
    }
    return themes
  })

  // Logo URL resolution (uses Node.js filesystem cache for provider domains)
  ipcMain.handle(IPC_CHANNELS.LOGO_GET_URL, async (_event, serviceUrl: string, provider?: string) => {
    const { getLogoUrl } = await import('@agent-operator/shared/utils/logo')
    const result = getLogoUrl(serviceUrl, provider)
    console.log(`[logo] getLogoUrl("${serviceUrl}", "${provider}") => "${result}"`)
    return result
  })

  // Tool icon mappings (for Appearance settings page)
  ipcMain.handle(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS, async () => {
    const { getToolIconsDir } = await import('@agent-operator/shared/config/storage')
    const { loadToolIconConfig } = await import('@agent-operator/shared/utils/cli-icon-resolver')
    const { encodeIconToDataUrl } = await import('@agent-operator/shared/utils/icon-encoder')
    const { join } = await import('path')

    const toolIconsDir = getToolIconsDir()
    const config = loadToolIconConfig(toolIconsDir)
    if (!config) {
      return []
    }

    // Map each tool to ToolIconMapping with resolved icon data URL
    return config.tools
      .map(tool => {
        const iconPath = join(toolIconsDir, tool.icon)
        const iconDataUrl = encodeIconToDataUrl(iconPath)
        if (!iconDataUrl) return null
        return {
          id: tool.id,
          displayName: tool.displayName,
          iconDataUrl,
          commands: tool.commands,
        }
      })
      .filter(Boolean)
  })

  // Appearance settings
  ipcMain.handle(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS, async () => {
    const { getRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    return getRichToolDescriptions()
  })

  ipcMain.handle(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS, async (_event, enabled: boolean) => {
    const { setRichToolDescriptions } = await import('@agent-operator/shared/config/storage')
    setRichToolDescriptions(enabled)
  })

  // ============================================================
  // Notifications and Badge
  // ============================================================

  // Show a notification
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SHOW, async (_event, title: string, body: string, workspaceId: string, sessionId: string) => {
    const { showNotification } = await import('./notifications')
    showNotification(title, body, workspaceId, sessionId)
  })

  // Get notifications enabled setting
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_ENABLED, async () => {
    const { getNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    return getNotificationsEnabled()
  })

  // Set notifications enabled setting (also triggers permission request if enabling)
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SET_ENABLED, async (_event, enabled: boolean) => {
    const { setNotificationsEnabled } = await import('@agent-operator/shared/config/storage')
    setNotificationsEnabled(enabled)

    // If enabling, trigger a notification to request macOS permission
    if (enabled) {
      const { showNotification } = await import('./notifications')
      showNotification('Notifications enabled', 'You will be notified when tasks complete.', '', '')
    }
  })

  // Get UI language
  ipcMain.handle(IPC_CHANNELS.LANGUAGE_GET, async () => {
    const { loadStoredConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    return config?.uiLanguage || null
  })

  // Set UI language
  ipcMain.handle(IPC_CHANNELS.LANGUAGE_SET, async (_event, language: 'en' | 'zh') => {
    const { loadStoredConfig, saveConfig } = await import('@agent-operator/shared/config/storage')
    const config = loadStoredConfig()
    if (config) {
      config.uiLanguage = language
      saveConfig(config)
    }
  })

  // ============================================
  // Input Settings
  // ============================================

  // Get auto-capitalisation setting
  ipcMain.handle(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION, async () => {
    const { getAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    return getAutoCapitalisation()
  })

  // Set auto-capitalisation setting
  ipcMain.handle(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION, async (_event, enabled: boolean) => {
    const { setAutoCapitalisation } = await import('@agent-operator/shared/config/storage')
    setAutoCapitalisation(enabled)
  })

  // Get send message key setting
  ipcMain.handle(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY, async () => {
    const { getSendMessageKey } = await import('@agent-operator/shared/config/storage')
    return getSendMessageKey()
  })

  // Set send message key setting
  ipcMain.handle(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY, async (_event, key: 'enter' | 'cmd-enter') => {
    const { setSendMessageKey } = await import('@agent-operator/shared/config/storage')
    setSendMessageKey(key)
  })

  // Get spell check setting
  ipcMain.handle(IPC_CHANNELS.INPUT_GET_SPELL_CHECK, async () => {
    const { getSpellCheck } = await import('@agent-operator/shared/config/storage')
    return getSpellCheck()
  })

  // Set spell check setting
  ipcMain.handle(IPC_CHANNELS.INPUT_SET_SPELL_CHECK, async (_event, enabled: boolean) => {
    const { setSpellCheck } = await import('@agent-operator/shared/config/storage')
    setSpellCheck(enabled)
  })

  // Power Management
  ipcMain.handle(IPC_CHANNELS.POWER_GET_KEEP_AWAKE, async () => {
    const { getKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    return getKeepAwakeWhileRunning()
  })

  ipcMain.handle(IPC_CHANNELS.POWER_SET_KEEP_AWAKE, async (_event, enabled: boolean) => {
    const { setKeepAwakeWhileRunning } = await import('@agent-operator/shared/config/storage')
    const { setKeepAwakeSetting } = await import('./power-manager')
    setKeepAwakeWhileRunning(enabled)
    setKeepAwakeSetting(enabled)
  })

  // Update app badge count
  ipcMain.handle(IPC_CHANNELS.BADGE_UPDATE, async (_event, count: number) => {
    const { updateBadgeCount } = await import('./notifications')
    updateBadgeCount(count)
  })

  // Clear app badge
  ipcMain.handle(IPC_CHANNELS.BADGE_CLEAR, async () => {
    const { clearBadgeCount } = await import('./notifications')
    clearBadgeCount()
  })

  // Set dock icon with badge (canvas-rendered badge image from renderer)
  ipcMain.handle(IPC_CHANNELS.BADGE_SET_ICON, async (_event, dataUrl: string) => {
    const { setDockIconWithBadge } = await import('./notifications')
    setDockIconWithBadge(dataUrl)
  })

  // Get window focus state
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE, () => {
    const { isAnyWindowFocused } = require('./notifications')
    return isAnyWindowFocused()
  })

  // Note: Permission mode cycling settings (cyclablePermissionModes) are now workspace-level
  // and managed via WORKSPACE_SETTINGS_GET/UPDATE channels

  // ============================================================
  // System Permissions (macOS)
  // ============================================================

  // Check if app has Full Disk Access
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_CHECK_FULL_DISK_ACCESS, async () => {
    const { hasFullDiskAccess } = await import('./permissions')
    return hasFullDiskAccess()
  })

  // Open System Preferences to Full Disk Access pane
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS, async () => {
    const { openFullDiskAccessSettings } = await import('./permissions')
    openFullDiskAccessSettings()
  })

  // Prompt user to grant Full Disk Access (shows dialog then opens settings)
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_PROMPT_FULL_DISK_ACCESS, async () => {
    const { promptForFullDiskAccess } = await import('./permissions')
    return promptForFullDiskAccess()
  })

  // Check if app has Accessibility permission
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_CHECK_ACCESSIBILITY, async () => {
    const { hasAccessibilityAccess } = await import('./permissions')
    return hasAccessibilityAccess()
  })

  // Open System Preferences to Accessibility pane
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS, async () => {
    const { openAccessibilitySettings } = await import('./permissions')
    openAccessibilitySettings()
  })

  // Get all permissions status
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_ALL, async () => {
    const { getAllPermissionsStatus } = await import('./permissions')
    return getAllPermissionsStatus()
  })

  // ============================================================
  // Scheduled Tasks (Workspace-scoped)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_LIST, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listTasks } = await import('@agent-operator/shared/scheduled-tasks/crud')
    return listTasks(workspace.rootPath)
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_GET, async (_event, workspaceId: string, taskId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { getTask } = await import('@agent-operator/shared/scheduled-tasks/crud')
    return getTask(workspace.rootPath, taskId)
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_CREATE, async (_event, workspaceId: string, input: import('@agent-operator/shared/scheduled-tasks').ScheduledTaskInput) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { createTask } = await import('@agent-operator/shared/scheduled-tasks/crud')
    const task = createTask(workspace.rootPath, input)
    getTaskScheduler?.()?.reschedule()
    windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_CHANGED, workspaceId)
    return task
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_UPDATE, async (_event, workspaceId: string, taskId: string, input: Partial<import('@agent-operator/shared/scheduled-tasks').ScheduledTaskInput>) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { updateTask } = await import('@agent-operator/shared/scheduled-tasks/crud')
    const task = updateTask(workspace.rootPath, taskId, input)
    getTaskScheduler?.()?.reschedule()
    windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_CHANGED, workspaceId)
    return task
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_DELETE, async (_event, workspaceId: string, taskId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const scheduler = getTaskScheduler?.()
    if (scheduler) {
      await scheduler.stopTask(workspaceId, taskId)
    }

    const { deleteTask } = await import('@agent-operator/shared/scheduled-tasks/crud')
    const result = deleteTask(workspace.rootPath, taskId)
    getTaskScheduler?.()?.reschedule()
    windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_CHANGED, workspaceId)
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_TOGGLE, async (_event, workspaceId: string, taskId: string, enabled: boolean) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { toggleTask } = await import('@agent-operator/shared/scheduled-tasks/crud')
    const result = toggleTask(workspace.rootPath, taskId, enabled)
    getTaskScheduler?.()?.reschedule()
    windowManager.broadcastToAll(IPC_CHANNELS.SCHEDULED_TASKS_CHANGED, workspaceId)
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_LIST_RUNS, async (_event, workspaceId: string, taskId: string, limit?: number, offset?: number) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listRuns } = await import('@agent-operator/shared/scheduled-tasks/crud')
    return listRuns(workspace.rootPath, taskId, limit, offset)
  })

  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASKS_LIST_ALL_RUNS, async (_event, workspaceId: string, limit?: number, offset?: number) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const { listAllRuns } = await import('@agent-operator/shared/scheduled-tasks/crud')
    return listAllRuns(workspace.rootPath, limit, offset)
  })

  // Run manually and Stop are handled by the scheduler instance.
  // They are registered in index.ts after scheduler initialization.

}
