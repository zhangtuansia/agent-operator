import { app, ipcMain, nativeTheme, nativeImage, dialog, shell, BrowserWindow } from 'electron'
import { readFile, appendFile, realpath, mkdir, writeFile, unlink, rm } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { normalize, isAbsolute, join, basename, dirname, resolve, delimiter, sep } from 'path'
import { homedir, tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { execSync, spawn, spawnSync } from 'child_process'
import { z } from 'zod'
import { SessionManager } from './sessions'
import { ipcLog, windowLog } from './logger'
import { WindowManager } from './window-manager'
import { registerOnboardingHandlers } from './onboarding'
import {
  IPC_CHANNELS,
  type FileAttachment,
  type StoredAttachment,
  type EnsureGwsInstalledResult,
} from '../shared/types'
import { readFileAttachment, perf, validateImageForClaudeAPI, IMAGE_LIMITS, isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import {
  getWorkspaceByNameOrId,
  loadStoredConfig,
  type Workspace,
} from '@agent-operator/shared/config'
import { getSessionAttachmentsPath } from '@agent-operator/shared/sessions'
import { getSourcesBySlugs, type LoadedSource } from '@agent-operator/shared/sources'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { MarkItDown } from 'markitdown-js'
import {
  CredentialResponseSchema,
  FileAttachmentSchema,
  StoredAttachmentSchema,
  SendMessageOptionsSchema,
  ProviderConfigSchema,
  CustomModelSchema,
  AuthTypeSchema,
} from '@agent-operator/shared/ipc/schemas'
import { validateIpcArgs, IpcValidationError } from './ipc-validator'
import { getModelRefreshService } from './model-fetchers'
import { registerFileOpsHandlers, registerLlmConnectionHandlers, registerOauthHandlers, registerSessionFileHandlers, registerSessionHandlers, registerSettingsHandlers, registerSkillHandlers, registerSourceHandlers, registerSystemHandlers, registerThemeHandlers, registerUiPreferenceHandlers, registerWorkspaceEntityHandlers, registerWorkspaceWindowHandlers } from './handlers'

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

interface CommandRunResult {
  code: number | null
  stdout: string
  stderr: string
  error?: string
  timedOut?: boolean
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
    return allowedDirs.some((dir) => pathToCheck === dir || pathToCheck.startsWith(`${dir}${sep}`))
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

function resolveUserShellPath(): string | null {
  if (process.platform === 'win32') return null

  try {
    const shellPath = process.env.SHELL || '/bin/bash'
    const result = execSync(`${shellPath} -ilc 'echo __PATH__=$PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env },
    })
    const match = result.match(/__PATH__=(.+)/)
    return match ? match[1].trim() : null
  } catch (error) {
    ipcLog.warn('[gws] Failed to resolve user shell PATH:', error)
    return null
  }
}

function buildGwsInstallEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  if (app.isPackaged) {
    if (!env.HOME) {
      env.HOME = app.getPath('home')
    }

    const userPath = resolveUserShellPath()
    if (userPath) {
      env.PATH = userPath
    } else if (process.platform !== 'win32') {
      const commonPaths = [
        env.PATH,
        '/usr/local/bin',
        '/opt/homebrew/bin',
        env.HOME ? `${env.HOME}/.nvm/current/bin` : undefined,
        env.HOME ? `${env.HOME}/.volta/bin` : undefined,
        env.HOME ? `${env.HOME}/.fnm/current/bin` : undefined,
      ].filter(Boolean)
      env.PATH = commonPaths.join(delimiter)
    }
  }

  return env
}

function findCommandInPath(commands: string[], env: NodeJS.ProcessEnv): string | null {
  const checker = process.platform === 'win32' ? 'where' : 'which'

  for (const command of commands) {
    if ((command.includes('/') || command.includes('\\')) && existsSync(command)) {
      return command
    }

    const result = spawnSync(checker, [command], {
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (result.status === 0) {
      const resolved = result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
}

function getBundledGwsRunScriptPath(): string | null {
  const relativeSegments = ['resources', 'vendor', 'gws-cli', 'node_modules', '@googleworkspace', 'cli', 'run-gws.js']
  const candidates = [
    join(__dirname, ...relativeSegments),
    join(app.getAppPath(), 'dist', ...relativeSegments),
    join(app.getAppPath(), ...relativeSegments),
    join(process.cwd(), 'apps', 'electron', 'dist', ...relativeSegments),
    join(process.cwd(), 'dist', ...relativeSegments),
  ]

  return candidates.find(candidate => existsSync(candidate)) ?? null
}

function buildBundledGwsResult(runScriptPath: string, installed: boolean): EnsureGwsInstalledResult {
  return {
    success: true,
    command: process.execPath,
    argsPrefix: [runScriptPath],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    installed,
  }
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
  } = {},
): Promise<CommandRunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const finish = (result: CommandRunResult): void => {
      if (settled) return
      settled = true
      resolvePromise(result)
    }

    const timeoutId = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, options.timeoutMs)
      : null

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)
      finish({
        code: null,
        stdout,
        stderr,
        error: error.message,
        timedOut,
      })
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      finish({
        code,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

async function ensureGwsInstalled(): Promise<EnsureGwsInstalledResult> {
  const bundledRunScript = getBundledGwsRunScriptPath()
  if (bundledRunScript) {
    return buildBundledGwsResult(bundledRunScript, false)
  }

  const installEnv = buildGwsInstallEnv()
  const systemCommand = findCommandInPath(
    process.platform === 'win32' ? ['gws.cmd', 'gws'] : ['gws'],
    installEnv,
  )
  if (systemCommand) {
    return {
      success: true,
      command: systemCommand,
      installed: false,
    }
  }

  const npmCommand = findCommandInPath(
    process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'],
    installEnv,
  )
  if (!npmCommand) {
    return {
      success: false,
      error: 'npm not found, and no bundled or system gws installation is available.',
    }
  }

  const runtimeDir = join(app.getPath('userData'), 'vendor', 'gws-cli')
  await mkdir(runtimeDir, { recursive: true })

  const installResult = await runCommand(
    npmCommand,
    [
      'install',
      '--prefix',
      runtimeDir,
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '@googleworkspace/cli@latest',
    ],
    {
      cwd: app.getAppPath(),
      env: {
        ...installEnv,
        npm_config_update_notifier: 'false',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
      },
      timeoutMs: 120000,
    },
  )

  if (installResult.code !== 0) {
    const errorMessage = installResult.error
      || installResult.stderr.trim()
      || installResult.stdout.trim()
      || 'npm install failed'
    return {
      success: false,
      error: errorMessage.slice(0, 500),
    }
  }

  const runtimeRunScript = join(
    runtimeDir,
    'node_modules',
    '@googleworkspace',
    'cli',
    'run-gws.js',
  )

  if (!existsSync(runtimeRunScript)) {
    return {
      success: false,
      error: 'Google Workspace CLI installed, but run-gws.js was not found.',
    }
  }

  return buildBundledGwsResult(runtimeRunScript, true)
}

export function registerIpcHandlers(
  sessionManager: SessionManager,
  windowManager: WindowManager,
): void {
  registerSessionHandlers(sessionManager, windowManager)
  registerWorkspaceWindowHandlers(sessionManager, windowManager)
  registerFileOpsHandlers(windowManager, {
    sanitizeFilename,
    validateFilePath,
    applyFileOpsRateLimit: (channel) => {
      if (!rateLimiter.check(channel, RATE_LIMITS.FILE_OPS.limit, RATE_LIMITS.FILE_OPS.windowMs)) {
        throw new Error('Rate limit exceeded for file reads. Please wait before trying again.')
      }
    },
  })
  registerSystemHandlers()

  // Show logout confirmation dialog
  ipcMain.handle(IPC_CHANNELS.SHOW_LOGOUT_CONFIRMATION, async () => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const isZh = (loadStoredConfig()?.uiLanguage || app.getLocale() || '').startsWith('zh')
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: [isZh ? '取消' : 'Cancel', isZh ? '退出登录' : 'Log Out'],
      defaultId: 0,
      cancelId: 0,
      title: isZh ? '退出登录' : 'Log Out',
      message: isZh ? '确定要退出登录吗？' : 'Are you sure you want to log out?',
      detail: isZh ? '所有对话将被删除，此操作无法撤消。' : 'All conversations will be deleted. This action cannot be undone.',
    } as Electron.MessageBoxOptions)
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Log Out
    return result.response === 1
  })

  // Show delete session confirmation dialog
  ipcMain.handle(IPC_CHANNELS.SHOW_DELETE_SESSION_CONFIRMATION, async (_event, name: string) => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const isZh = (loadStoredConfig()?.uiLanguage || app.getLocale() || '').startsWith('zh')
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      buttons: [isZh ? '取消' : 'Cancel', isZh ? '删除' : 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: isZh ? '删除对话' : 'Delete Conversation',
      message: isZh ? `确定要删除「${name}」吗？` : `Are you sure you want to delete: "${name}"?`,
      detail: isZh ? '此操作无法撤消。' : 'This action cannot be undone.',
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
  // ChatGPT OAuth (for Codex chatgptAuthTokens mode)
  // ============================================================

  registerSettingsHandlers(sessionManager, {
    applySensitiveRateLimit: (channel) => {
      if (!rateLimiter.check(channel, RATE_LIMITS.SENSITIVE.limit, RATE_LIMITS.SENSITIVE.windowMs)) {
        throw new Error('Rate limit exceeded for credential updates. Please wait before trying again.')
      }
    },
  })
  registerLlmConnectionHandlers(sessionManager)
  registerOauthHandlers()

  registerSessionFileHandlers(sessionManager)

  // Preview windows removed - now using in-app overlays (see ChatDisplay.tsx)

  // ============================================================
  // Sources
  // ============================================================
  registerSourceHandlers(sessionManager, {
    ensureGwsInstalled,
  })

  registerSkillHandlers()

  registerWorkspaceEntityHandlers(windowManager)

  // Register onboarding handlers
  registerOnboardingHandlers(sessionManager)
  registerThemeHandlers(sessionManager, windowManager)
  registerUiPreferenceHandlers()

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
  // Automations
  // ============================================================

  // History file name -- matches AUTOMATIONS_HISTORY_FILE from @agent-operator/shared/automations/constants
  const HISTORY_FILE = 'automations-history.jsonl'
  interface HistoryEntry { id: string; ts: number; ok: boolean; sessionId?: string; prompt?: string; error?: string }

  // Per-workspace config mutex: serializes read-modify-write cycles on automations.json
  const configMutexes = new Map<string, Promise<void>>()
  function withConfigMutex<T>(workspaceRoot: string, fn: () => Promise<T>): Promise<T> {
    const prev = configMutexes.get(workspaceRoot) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    configMutexes.set(workspaceRoot, next.then(() => {}, () => {}))
    return next
  }

  // Shared helper: resolve workspace, read automations.json, validate matcher, mutate, write back
  interface AutomationsConfigJson { automations?: Record<string, Record<string, unknown>[]>; [key: string]: unknown }
  async function withAutomationMatcher(workspaceId: string, eventName: string, matcherIndex: number, mutate: (matchers: Record<string, unknown>[], index: number, config: AutomationsConfigJson, genId: () => string) => void) {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    await withConfigMutex(workspace.rootPath, async () => {
      const { resolveAutomationsConfigPath, generateShortId } = await import('@agent-operator/shared/automations/resolve-config-path')
      const configPath = resolveAutomationsConfigPath(workspace.rootPath)

      const raw = await readFile(configPath, 'utf-8')
      const config = JSON.parse(raw)

      const eventMap = config.automations ?? {}
      const matchers = eventMap[eventName]
      if (!Array.isArray(matchers) || matcherIndex < 0 || matcherIndex >= matchers.length) {
        throw new Error(`Invalid automation reference: ${eventName}[${matcherIndex}]`)
      }

      mutate(matchers, matcherIndex, config, generateShortId)

      // Backfill missing IDs on all matchers before writing
      for (const eventMatchers of Object.values(eventMap)) {
        if (!Array.isArray(eventMatchers)) continue
        for (const m of eventMatchers as Record<string, unknown>[]) {
          if (!m.id) m.id = generateShortId()
        }
      }

      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
    })
  }

  // Test automation (manual trigger from UI)
  ipcMain.handle(IPC_CHANNELS.TEST_AUTOMATION, async (_event, payload: import('../shared/types').TestAutomationPayload) => {
    const workspace = getWorkspaceByNameOrId(payload.workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const results: import('../shared/types').TestAutomationActionResult[] = []
    const { parsePromptReferences } = await import('@agent-operator/shared/automations')

    for (const action of payload.actions) {
      const start = Date.now()
      const references = parsePromptReferences(action.prompt)

      try {
        // Use executePromptAutomation for @mention resolution and model/connection support
        const { sessionId } = await sessionManager.executePromptAutomation(
          payload.workspaceId,
          workspace.rootPath,
          action.prompt,
          payload.labels,
          payload.permissionMode,
          references.mentions,
          action.llmConnection,
          action.model,
        )

        results.push({
          type: 'prompt',
          success: true,
          sessionId,
          duration: Date.now() - start,
        })

        // Write history entry for test runs
        if (payload.automationId) {
          const entry = { id: payload.automationId, ts: Date.now(), ok: true, sessionId, prompt: action.prompt.slice(0, 200) }
          appendFile(join(workspace.rootPath, HISTORY_FILE), JSON.stringify(entry) + '\n', 'utf-8').catch(e => ipcLog.warn('[Automations] Failed to write history:', e))
        }
      } catch (err: unknown) {
        results.push({
          type: 'prompt',
          success: false,
          stderr: (err as Error).message,
          duration: Date.now() - start,
        })

        if (payload.automationId) {
          const entry = { id: payload.automationId, ts: Date.now(), ok: false, error: ((err as Error).message ?? '').slice(0, 200), prompt: action.prompt.slice(0, 200) }
          appendFile(join(workspace.rootPath, HISTORY_FILE), JSON.stringify(entry) + '\n', 'utf-8').catch(e => ipcLog.warn('[Automations] Failed to write history:', e))
        }
      }
    }

    return { actions: results } satisfies import('../shared/types').TestAutomationResult
  })

  // Toggle automation enabled/disabled
  ipcMain.handle(IPC_CHANNELS.AUTOMATIONS_SET_ENABLED, async (_event, workspaceId: string, eventName: string, matcherIndex: number, enabled: boolean) => {
    await withAutomationMatcher(workspaceId, eventName, matcherIndex, (matchers, idx) => {
      if (enabled) {
        delete matchers[idx].enabled
      } else {
        matchers[idx].enabled = false
      }
    })
  })

  // Duplicate automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATIONS_DUPLICATE, async (_event, workspaceId: string, eventName: string, matcherIndex: number) => {
    await withAutomationMatcher(workspaceId, eventName, matcherIndex, (matchers, idx, _config, genId) => {
      const clone = JSON.parse(JSON.stringify(matchers[idx]))
      clone.id = genId()
      clone.name = clone.name ? `${clone.name} Copy` : 'Untitled Copy'
      matchers.splice(idx + 1, 0, clone)
    })
  })

  // Delete automation
  ipcMain.handle(IPC_CHANNELS.AUTOMATIONS_DELETE, async (_event, workspaceId: string, eventName: string, matcherIndex: number) => {
    await withAutomationMatcher(workspaceId, eventName, matcherIndex, (matchers, idx, config) => {
      matchers.splice(idx, 1)
      if (matchers.length === 0) {
        const eventMap = config.automations
        if (eventMap) delete eventMap[eventName]
      }
    })
  })

  // Get automation execution history
  ipcMain.handle(IPC_CHANNELS.AUTOMATIONS_GET_HISTORY, async (_event, workspaceId: string, automationId: string, limit = 20) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const historyPath = join(workspace.rootPath, HISTORY_FILE)
    try {
      const content = await readFile(historyPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      return lines
        .map(line => { try { return JSON.parse(line) } catch { return null } })
        .filter((e): e is HistoryEntry => e?.id === automationId)
        .slice(-limit)
        .reverse()
    } catch {
      return []
    }
  })

  // Get last execution timestamp for all automations
  ipcMain.handle(IPC_CHANNELS.AUTOMATIONS_GET_LAST_EXECUTED, async (_event, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const historyPath = join(workspace.rootPath, HISTORY_FILE)
    try {
      const content = await readFile(historyPath, 'utf-8')
      const result: Record<string, number> = {}
      for (const line of content.trim().split('\n')) {
        try {
          const entry = JSON.parse(line)
          if (entry.id && entry.ts) result[entry.id] = entry.ts
        } catch { /* skip malformed lines */ }
      }
      return result
    } catch {
      return {}
    }
  })

}
