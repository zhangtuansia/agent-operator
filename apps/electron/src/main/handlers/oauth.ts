import { ipcMain } from 'electron'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import { IPC_CHANNELS } from '../../shared/types'
import { ipcLog } from '../logger'
import { getModelRefreshService } from '../model-fetchers'

export function registerOauthHandlers(): void {
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

      getModelRefreshService().refreshNow(connectionSlug).catch(err => {
        ipcLog.warn(`Model refresh after OAuth failed for ${connectionSlug}:`, err)
      })

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
}
