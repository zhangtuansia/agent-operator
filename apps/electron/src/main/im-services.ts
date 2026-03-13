/**
 * IM Service Manager
 *
 * Electron-specific integration layer for IM channel plugins.
 * Handles RPC registration, lifecycle management, and bridges
 * the IM GatewayManager with the SessionManager.
 */

import {
  IMGatewayManager,
  IMCoworkHandler,
  feishuChannel,
  telegramChannel,
  getIMConfig,
  saveIMConfig,
  getChannelConfig,
  saveChannelConfig,
  getIMSettings,
  saveIMSettings,
  listSessionMappings,
  deleteSessionMapping,
  type IMPlatform,
  type IMSessionManager,
  type PermissionResponse,
  type ChannelConfig,
} from '@agent-operator/shared/im'
import { IPC_CHANNELS } from '@agent-operator/shared/ipc'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import type { CreateSessionOptions, SessionEvent } from '@agent-operator/shared/protocol'
import { pushTyped, type RpcServer } from '../transport/server'
import type { WindowManager } from './window-manager'
import { mainLog } from './logger'
import type { SessionEventHub } from './session-event-hub'

// ============================================================
// IM Service Manager
// ============================================================

export class IMServiceManager {
  private gatewayManager: IMGatewayManager
  private coworkHandler: IMCoworkHandler | null = null
  private sessionManager: ISessionManager
  private sessionEventHub: SessionEventHub
  private rpcServer: RpcServer | null = null

  constructor(sessionManager: ISessionManager, windowManager: WindowManager, sessionEventHub: SessionEventHub) {
    this.sessionManager = sessionManager
    void windowManager
    this.sessionEventHub = sessionEventHub

    // Create gateway manager and register channels
    this.gatewayManager = new IMGatewayManager()
    this.gatewayManager.registerChannel(feishuChannel)
    this.gatewayManager.registerChannel(telegramChannel)

    // Forward status changes to renderer
    this.gatewayManager.on('statusChange', (statuses) => {
      if (!this.rpcServer) return
      pushTyped(this.rpcServer, IPC_CHANNELS.IM_STATUS_CHANGED, { to: 'all' }, statuses)
    })

    // Forward message events to renderer (for activity log)
    this.gatewayManager.on('message', (message) => {
      if (!this.rpcServer) return
      pushTyped(this.rpcServer, IPC_CHANNELS.IM_MESSAGE_RECEIVED, { to: 'all' }, message)
    })
  }

  /**
   * Initialize IM services — load config and start enabled channels
   */
  async initialize(): Promise<void> {
    mainLog.info('[IM] Initializing IM services...')

    try {
      // Set up the message handler (CoworkHandler bridges IM → Agent sessions)
      this.setupMessageHandler()

      // Load config and start enabled channels
      const config = getIMConfig()
      const channelConfigs: Partial<Record<IMPlatform, ChannelConfig>> = {}

      if (config.feishu) {
        channelConfigs.feishu = config.feishu as ChannelConfig
      }
      if (config.telegram) {
        channelConfigs.telegram = config.telegram as ChannelConfig
      }

      await this.gatewayManager.startAllEnabled(channelConfigs)

      const status = this.gatewayManager.getAllStatus()
      const connectedCount = status.filter(s => s.connected).length
      mainLog.info(`[IM] Initialized: ${connectedCount} channel(s) connected`)
    } catch (error: any) {
      mainLog.error('[IM] Failed to initialize:', error.message)
    }
  }

  /**
   * Shut down all IM services
   */
  async shutdown(): Promise<void> {
    mainLog.info('[IM] Shutting down...')

    if (this.coworkHandler) {
      this.coworkHandler.destroy()
      this.coworkHandler = null
    }

    await this.gatewayManager.stopAll()
    mainLog.info('[IM] Shutdown complete')
  }

  /**
   * Register transport handlers for IM operations
   */
  registerRpcHandlers(server: RpcServer): void {
    this.rpcServer = server

    // Config
    server.handle(IPC_CHANNELS.IM_GET_CONFIG, async () => {
      return getIMConfig()
    })

    server.handle(IPC_CHANNELS.IM_SET_CONFIG, async (_ctx, config) => {
      // Merge with existing config to preserve secret fields not sent by UI
      const existing = getIMConfig()
      const merged: Record<string, unknown> = {}
      for (const platform of ['feishu', 'telegram'] as const) {
        if (config[platform]) {
          merged[platform] = { ...(existing[platform] as Record<string, unknown>), ...config[platform] }
        } else if (existing[platform]) {
          merged[platform] = existing[platform]
        }
      }
      if (config.settings) merged.settings = config.settings
      else if (existing.settings) merged.settings = existing.settings
      saveIMConfig(merged)
      // Re-setup message handler in case settings changed
      this.setupMessageHandler()
    })

    server.handle(IPC_CHANNELS.IM_GET_SETTINGS, async () => {
      return getIMSettings()
    })

    server.handle(IPC_CHANNELS.IM_SET_SETTINGS, async (_ctx, settings) => {
      saveIMSettings(settings)
      // Re-setup message handler in case workspace routing changed
      this.setupMessageHandler()
    })

    // Channel lifecycle
    server.handle(IPC_CHANNELS.IM_START_CHANNEL, async (_ctx, platform: IMPlatform) => {
      const config = getChannelConfig(platform)
      if (!config) {
        throw new Error(`No config for platform: ${platform}`)
      }
      await this.gatewayManager.startChannel(platform, config)
    })

    server.handle(IPC_CHANNELS.IM_STOP_CHANNEL, async (_ctx, platform: IMPlatform) => {
      await this.gatewayManager.stopChannel(platform)
    })

    server.handle(IPC_CHANNELS.IM_TEST_CHANNEL, async (_ctx, platform: IMPlatform, config?: ChannelConfig) => {
      const channelConfig = config || getChannelConfig(platform)
      if (!channelConfig) {
        throw new Error(`No config for platform: ${platform}`)
      }
      return this.gatewayManager.testChannel(platform, channelConfig)
    })

    // Status
    server.handle(IPC_CHANNELS.IM_GET_STATUS, async () => {
      return this.gatewayManager.getAllStatus()
    })

    // Session mappings
    server.handle(IPC_CHANNELS.IM_GET_SESSION_MAPPINGS, async (_ctx, platform?: IMPlatform) => {
      return listSessionMappings(platform)
    })

    server.handle(IPC_CHANNELS.IM_DELETE_SESSION_MAPPING, async (_ctx, conversationId: string, platform: IMPlatform) => {
      deleteSessionMapping(conversationId, platform)
    })
  }

  // ---- Internal ----

  private setupMessageHandler(): void {
    // The CoworkHandler needs a SessionManager adapter
    // For now, set up a direct message handler on the gateway
    this.gatewayManager.setMessageHandler(async (message, replyFn) => {
      if (this.coworkHandler) {
        await this.coworkHandler.processMessage(message, replyFn)
      } else {
        await replyFn('IM 服务尚未完全初始化，请稍后重试。')
      }
    })

    // Create/update CoworkHandler if we have the necessary dependencies
    this.createCoworkHandler()
  }

  private createCoworkHandler(): void {
    // Recreate handler with latest settings/workspace routing
    if (this.coworkHandler) {
      this.coworkHandler.destroy()
      this.coworkHandler = null
    }

    try {
      const { getWorkspaces, loadStoredConfig } = require('@agent-operator/shared/config')
      const workspaces = getWorkspaces()
      if (workspaces.length === 0) {
        mainLog.warn('[IM] No workspaces configured, CoworkHandler not created')
        return
      }

      const imSettings = getIMSettings()
      const config = loadStoredConfig()
      const configuredWorkspaceId = imSettings.workspaceId
      const activeWorkspaceId = config?.activeWorkspaceId

      const workspace = (
        (configuredWorkspaceId
          ? workspaces.find((w: { id: string }) => w.id === configuredWorkspaceId)
          : undefined) ||
        (activeWorkspaceId
          ? workspaces.find((w: { id: string }) => w.id === activeWorkspaceId)
          : undefined) ||
        workspaces[0]
      )

      if (!workspace) {
        mainLog.warn('[IM] No workspace resolved for IM sessions')
        return
      }

      const workingDirectory = workspace.rootPath

      // Track requestId → sessionId for permission responses
      const pendingPermissionSessions = new Map<string, string>()

      // Create real session manager adapter
      const sessionManagerAdapter: IMSessionManager = {
        createSession: async (options) => {
          const labels = ['im']
          if (options.platform) {
            labels.push(`im:${options.platform}`)
          }
          const sessionOptions: CreateSessionOptions = {
            permissionMode: 'allow-all',
            workingDirectory: options.workingDirectory || workingDirectory,
            name: options.title,
            labels,
          }
          const session = await this.sessionManager.createSession(workspace.id, sessionOptions)
          return session.id
        },

        sendMessage: async (sessionId, content) => {
          await this.sessionManager.sendMessage(sessionId, content)
        },

        isSessionActive: async (sessionId) => {
          const session = await this.sessionManager.getSession(sessionId)
          return session?.isProcessing ?? false
        },

        sessionExists: async (sessionId) => {
          const session = await this.sessionManager.getSession(sessionId)
          return session !== null
        },

        stopSession: (sessionId) => {
          this.sessionManager.cancelProcessing(sessionId, true).catch(() => {})
        },

        onSessionEvent: (sessionId, event, callback) => {
          return this.sessionEventHub.onSessionEvent(sessionId, (evt: SessionEvent) => {
            switch (event) {
              case 'message':
                if (evt.type === 'text_complete' && 'text' in evt) {
                  callback({ type: 'assistant', content: evt.text })
                }
                break
              case 'complete':
                if (evt.type === 'complete') {
                  callback()
                }
                break
              case 'error':
                if (evt.type === 'error' && 'error' in evt) {
                  callback(evt.error)
                } else if (evt.type === 'typed_error' && 'message' in evt) {
                  callback(evt.message)
                }
                break
              case 'permissionRequest':
                if (evt.type === 'permission_request' && 'requestId' in evt) {
                  // Track requestId → sessionId for respondToPermission
                  pendingPermissionSessions.set(evt.requestId, sessionId)
                  callback(evt)
                }
                break
            }
          })
        },

        respondToPermission: (requestId, result) => {
          const sessionId = pendingPermissionSessions.get(requestId)
          if (sessionId) {
            pendingPermissionSessions.delete(requestId)
            this.sessionManager.respondToPermission(
              sessionId,
              requestId,
              result.behavior === 'allow',
              false
            )
          } else {
            mainLog.warn(`[IM] Cannot respond to permission ${requestId} - no sessionId mapping`)
          }
        },
      }

      this.coworkHandler = new IMCoworkHandler({
        sessionManager: sessionManagerAdapter,
        workspaceId: workspace.id,
        workingDirectory,
      })

      mainLog.info('[IM] CoworkHandler created for workspace:', workspace.name)
    } catch (error: any) {
      mainLog.error('[IM] Failed to create CoworkHandler:', error.message)
    }
  }
}

// ============================================================
// Singleton
// ============================================================

let imServiceManager: IMServiceManager | null = null

export function getIMServiceManager(): IMServiceManager | null {
  return imServiceManager
}

export function createIMServiceManager(
  sessionManager: ISessionManager,
  windowManager: WindowManager,
  sessionEventHub: SessionEventHub,
): IMServiceManager {
  imServiceManager = new IMServiceManager(sessionManager, windowManager, sessionEventHub)
  return imServiceManager
}
