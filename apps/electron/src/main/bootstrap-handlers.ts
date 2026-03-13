import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createCallbackServer } from '@agent-operator/shared/auth/callback-server'
import { getWorkspaceByNameOrId } from '@agent-operator/shared/config'
import { getSourceCredentialManager, loadSource, loadWorkspaceSources } from '@agent-operator/shared/sources'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import type { WsRpcServer } from '../transport/server'
import { pushTyped } from '../transport/server'
import type { WindowManager } from './window-manager'
import type { Logger } from './logger'
import { handleDeepLink } from './deep-link'
import { performLocalChatGptOAuthFlow, cancelLocalChatGptOAuthFlow } from './handlers/oauth'

interface RegisterTransportBootstrapHandlersOptions {
  getRpcServer: () => WsRpcServer | null
  getRpcToken: () => string | null
  getWindowManager: () => WindowManager | null
  getSessionManager: () => ISessionManager | null
  logger: Pick<Logger, 'info' | 'warn' | 'error'>
}

export function registerTransportBootstrapHandlers(options: RegisterTransportBootstrapHandlersOptions): void {
  ipcMain.on('__get-ws-port', (event) => {
    event.returnValue = options.getRpcServer()?.port ?? 0
  })

  ipcMain.on('__get-ws-token', (event) => {
    event.returnValue = options.getRpcToken() ?? ''
  })

  ipcMain.on('__get-web-contents-id', (event) => {
    event.returnValue = event.sender.id
  })

  ipcMain.on('__get-workspace-id', (event) => {
    event.returnValue = options.getWindowManager()?.getWorkspaceForWindow(event.sender.id) ?? ''
  })

  ipcMain.on('__transport:status', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return

    const p = payload as {
      level?: 'info' | 'warn' | 'error'
      message?: string
      status?: string
      attempt?: number
      nextRetryInMs?: number
      error?: unknown
      close?: unknown
      url?: string
    }

    const level = p.level ?? 'info'
    const message = p.message ?? '[transport] status update'
    const context = {
      status: p.status,
      attempt: p.attempt,
      nextRetryInMs: p.nextRetryInMs,
      error: p.error,
      close: p.close,
      url: p.url,
    }

    if (level === 'error') {
      options.logger.error(message, context)
    } else if (level === 'warn') {
      options.logger.warn(message, context)
    } else {
      options.logger.info(message, context)
    }
  })

  ipcMain.handle('__dialog:showMessageBox', async (event, spec) => {
    const win = BrowserWindow.fromWebContents(event.sender)
      || BrowserWindow.getFocusedWindow()
      || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showMessageBox(win ?? undefined, spec)
    return { response: result.response }
  })

  ipcMain.handle('__dialog:showOpenDialog', async (event, spec) => {
    const win = BrowserWindow.fromWebContents(event.sender)
      || BrowserWindow.getFocusedWindow()
      || BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win ?? undefined, spec)
    return { canceled: result.canceled, filePaths: result.filePaths }
  })

  ipcMain.handle('__deeplink:open', async (_event, url: string) => {
    const windowManager = options.getWindowManager()
    if (!windowManager) {
      throw new Error('WindowManager not initialized')
    }
    return handleDeepLink(url, windowManager)
  })

  ipcMain.handle('__oauth:performFlow', async (event, args: {
    sourceSlug: string
    sessionId?: string
    authRequestId?: string
    workspaceId?: string
    mode?: 'local' | 'remote'
  }) => {
    if (args.mode === 'remote') {
      return {
        success: false,
        error: 'Remote OAuth flow is not supported in the Electron preload bridge',
      }
    }

    const windowManager = options.getWindowManager()
    const sessionManager = options.getSessionManager()
    const rpcServer = options.getRpcServer()

    const workspaceId = args.workspaceId
      || windowManager?.getWorkspaceForWindow(event.sender.id)
      || ''
    if (!workspaceId) {
      return { success: false, error: 'No workspace bound to this window' }
    }

    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      return { success: false, error: `Workspace not found: ${workspaceId}` }
    }

    const source = loadSource(workspace.rootPath, args.sourceSlug)
    if (!source) {
      return { success: false, error: `Source not found: ${args.sourceSlug}` }
    }

    const credManager = getSourceCredentialManager()
    let callbackServer: Awaited<ReturnType<typeof createCallbackServer>> | null = null

    try {
      callbackServer = await createCallbackServer({ appType: 'electron' })
      const callbackPort = parseInt(new URL(callbackServer.url).port, 10)
      const prepared = await credManager.prepareOAuth(source, callbackPort)

      await shell.openExternal(prepared.authUrl)

      const callback = await callbackServer.promise
      if (callback.query.error) {
        return {
          success: false,
          error: callback.query.error_description || callback.query.error,
        }
      }

      const code = callback.query.code
      if (!code) {
        return { success: false, error: 'No authorization code received' }
      }

      if (callback.query.state !== prepared.state) {
        return { success: false, error: 'OAuth state mismatch' }
      }

      const result = await credManager.exchangeAndStore(source, prepared.provider, {
        code,
        codeVerifier: prepared.codeVerifier,
        tokenEndpoint: prepared.tokenEndpoint,
        clientId: prepared.clientId,
        clientSecret: prepared.clientSecret,
        redirectUri: prepared.redirectUri,
      })

      if (args.sessionId && args.authRequestId && sessionManager) {
        await sessionManager.completeAuthRequest(args.sessionId, {
          requestId: args.authRequestId,
          sourceSlug: args.sourceSlug,
          success: result.success,
          email: result.email,
          error: result.error,
        })
      }

      if (rpcServer) {
        const updatedSources = loadWorkspaceSources(workspace.rootPath)
        pushTyped(
          rpcServer,
          RPC_CHANNELS.sources.CHANGED,
          { to: 'workspace', workspaceId },
          workspaceId,
          updatedSources,
        )
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth flow failed',
      }
    } finally {
      callbackServer?.close()
    }
  })

  ipcMain.handle('__oauth:performChatGptFlow', async (_event, args: {
    connectionSlug: string
    mode?: 'local' | 'remote'
  }) => {
    if (args.mode === 'remote') {
      return {
        success: false,
        error: 'Remote ChatGPT OAuth flow is not supported in the Electron preload bridge',
      }
    }

    return performLocalChatGptOAuthFlow(args.connectionSlug, options.logger)
  })

  ipcMain.handle('__oauth:cancelChatGptFlow', async () => {
    return cancelLocalChatGptOAuthFlow(options.logger)
  })
}
