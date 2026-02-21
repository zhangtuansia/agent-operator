/**
 * IM Service Manager
 *
 * Electron-specific integration layer for IM channel plugins.
 * Handles IPC registration, lifecycle management, and bridges
 * the IM GatewayManager with the SessionManager.
 */

import { ipcMain } from 'electron'
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
import type { WindowManager } from './window-manager'
import type { SessionManager } from './sessions'
import { mainLog } from './logger'

// ============================================================
// IM Service Manager
// ============================================================

export class IMServiceManager {
  private gatewayManager: IMGatewayManager
  private coworkHandler: IMCoworkHandler | null = null
  private sessionManager: SessionManager
  private windowManager: WindowManager

  constructor(sessionManager: SessionManager, windowManager: WindowManager) {
    this.sessionManager = sessionManager
    this.windowManager = windowManager

    // Create gateway manager and register channels
    this.gatewayManager = new IMGatewayManager()
    this.gatewayManager.registerChannel(feishuChannel)
    this.gatewayManager.registerChannel(telegramChannel)

    // Forward status changes to renderer
    this.gatewayManager.on('statusChange', (statuses) => {
      this.broadcastToAllWindows(IPC_CHANNELS.IM_STATUS_CHANGED, statuses)
    })

    // Forward message events to renderer (for activity log)
    this.gatewayManager.on('message', (message) => {
      this.broadcastToAllWindows(IPC_CHANNELS.IM_MESSAGE_RECEIVED, message)
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
   * Register IPC handlers for IM operations
   */
  registerIpcHandlers(): void {
    // Config
    ipcMain.handle(IPC_CHANNELS.IM_GET_CONFIG, async () => {
      return getIMConfig()
    })

    ipcMain.handle(IPC_CHANNELS.IM_SET_CONFIG, async (_event, config) => {
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

    ipcMain.handle(IPC_CHANNELS.IM_GET_SETTINGS, async () => {
      return getIMSettings()
    })

    ipcMain.handle(IPC_CHANNELS.IM_SET_SETTINGS, async (_event, settings) => {
      saveIMSettings(settings)
    })

    // Channel lifecycle
    ipcMain.handle(IPC_CHANNELS.IM_START_CHANNEL, async (_event, platform: IMPlatform) => {
      const config = getChannelConfig(platform)
      if (!config) {
        throw new Error(`No config for platform: ${platform}`)
      }
      await this.gatewayManager.startChannel(platform, config)
    })

    ipcMain.handle(IPC_CHANNELS.IM_STOP_CHANNEL, async (_event, platform: IMPlatform) => {
      await this.gatewayManager.stopChannel(platform)
    })

    ipcMain.handle(IPC_CHANNELS.IM_TEST_CHANNEL, async (_event, platform: IMPlatform, config?: ChannelConfig) => {
      const channelConfig = config || getChannelConfig(platform)
      if (!channelConfig) {
        throw new Error(`No config for platform: ${platform}`)
      }
      return this.gatewayManager.testChannel(platform, channelConfig)
    })

    // Status
    ipcMain.handle(IPC_CHANNELS.IM_GET_STATUS, async () => {
      return this.gatewayManager.getAllStatus()
    })

    // Session mappings
    ipcMain.handle(IPC_CHANNELS.IM_GET_SESSION_MAPPINGS, async (_event, platform?: IMPlatform) => {
      return listSessionMappings(platform)
    })

    ipcMain.handle(IPC_CHANNELS.IM_DELETE_SESSION_MAPPING, async (_event, conversationId: string, platform: IMPlatform) => {
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
    // Get first workspace as the default working directory for IM sessions
    // In the future, this could be configured per-channel
    try {
      const { getWorkspaces } = require('@agent-operator/shared/config')
      const workspaces = getWorkspaces()
      if (workspaces.length === 0) {
        mainLog.warn('[IM] No workspaces configured, CoworkHandler not created')
        return
      }

      const workspace = workspaces[0]
      const workingDirectory = workspace.rootPath

      // Track requestId → sessionId for permission responses
      const pendingPermissionSessions = new Map<string, string>()

      // Create real session manager adapter
      const sessionManagerAdapter: IMSessionManager = {
        createSession: async (options) => {
          const session = await this.sessionManager.createSession(workspace.id, {
            permissionMode: 'allow-all',
            workingDirectory: options.workingDirectory || workingDirectory,
            name: options.title,
            labels: ['im'],
          } as any)
          return session.id
        },

        sendMessage: async (sessionId, content) => {
          await this.sessionManager.sendMessage(sessionId, content)
        },

        isSessionActive: (sessionId) => {
          return this.sessionManager.isSessionProcessing(sessionId)
        },

        sessionExists: (sessionId) => {
          return this.sessionManager.hasSession(sessionId)
        },

        stopSession: (sessionId) => {
          this.sessionManager.cancelProcessing(sessionId, true).catch(() => {})
        },

        onSessionEvent: (sessionId, event, callback) => {
          // Map IM event names to SessionEvent types and filter
          return this.sessionManager.addSessionEventListener(sessionId, (evt) => {
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

  private broadcastToAllWindows(channel: string, data: unknown): void {
    for (const entry of this.windowManager.getAllWindows()) {
      try {
        entry.window.webContents.send(channel, data)
      } catch {
        // Window may be closed
      }
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
  sessionManager: SessionManager,
  windowManager: WindowManager
): IMServiceManager {
  imServiceManager = new IMServiceManager(sessionManager, windowManager)
  return imServiceManager
}
