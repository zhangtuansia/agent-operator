import { app, nativeTheme, nativeImage, shell } from 'electron'
import { unlink, rm } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, resolve } from 'path'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import type { BrowserPaneManager } from './browser-pane-manager'
import { ipcLog, windowLog } from './logger'
import { WindowManager } from './window-manager'
import type { RpcServer } from '../transport/server'
import {
  IPC_CHANNELS,
  type FileAttachment,
  type StoredAttachment,
  type EnsureGwsInstalledResult,
} from '../shared/types'
import { readFileAttachment, perf, validateImageForClaudeAPI, IMAGE_LIMITS, isSafeHttpHeaderValue } from '@agent-operator/shared/utils'
import {
  CONFIG_DIR,
  getWorkspaceByNameOrId,
  loadStoredConfig,
  type Workspace,
} from '@agent-operator/shared/config'
import { getSessionAttachmentsPath } from '@agent-operator/shared/sessions'
import { getSourcesBySlugs, type LoadedSource } from '@agent-operator/shared/sources'
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
import type { HandlerDeps } from './handlers/handler-deps'
import { registerAllRpcHandlers, registerElectronLocalRpcHandlers } from './handlers'
import { createPrepareWorkspaceSources } from './handlers/sources'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import { validateFilePath } from './file-access'
import { ensureGwsInstalled } from './gws-runtime'
import type { IMServiceManager } from './im-services'

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


export function registerIpcHandlers(
  sessionManager: ISessionManager,
  windowManager: WindowManager,
  browserPaneManager?: BrowserPaneManager,
  rpcServer?: RpcServer,
  rpcHandlerDeps?: HandlerDeps,
  imServices?: IMServiceManager,
): void {
  if (!rpcServer) {
    throw new Error('RpcServer is required to register IPC handlers')
  }

  const handlerDeps: HandlerDeps = {
    sessionManager,
    windowManager,
    browserPaneManager,
    ...rpcHandlerDeps,
    prepareWorkspaceSources: rpcHandlerDeps?.prepareWorkspaceSources ?? createPrepareWorkspaceSources(sessionManager, {
      ensureGwsInstalled,
    }),
  } as HandlerDeps

  registerAllRpcHandlers(rpcServer, handlerDeps)
  registerElectronLocalRpcHandlers(rpcServer, handlerDeps, {
    windowManager,
    imServices,
    validateFilePath,
    applyFileOpsRateLimit: (channel) => {
      if (!rateLimiter.check(channel, RATE_LIMITS.FILE_OPS.limit, RATE_LIMITS.FILE_OPS.windowMs)) {
        throw new Error('Rate limit exceeded for file reads. Please wait before trying again.')
      }
    },
    ensureGwsInstalled,
  })

}
