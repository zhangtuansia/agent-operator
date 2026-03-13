import { shell } from 'electron'
import {
  CHATGPT_OAUTH_CONFIG,
  createCallbackServer,
  prepareChatGptOAuth,
  type CallbackServer,
  exchangeChatGptTokens,
} from '@agent-operator/shared/auth'
import { getCredentialManager } from '@agent-operator/shared/credentials'
import type { Logger } from '../logger'
import { getModelRefreshService } from '../model-fetchers'

let activeChatGptFlow:
  | {
    callbackServer: CallbackServer
    reject: (error: Error) => void
  }
  | null = null

export async function performLocalChatGptOAuthFlow(
  connectionSlug: string,
  logger: Pick<Logger, 'info' | 'error' | 'warn'>,
): Promise<{ success: boolean; error?: string }> {
  if (activeChatGptFlow) {
    activeChatGptFlow.callbackServer.close()
    activeChatGptFlow.reject(new Error('ChatGPT OAuth flow replaced by a newer request'))
    activeChatGptFlow = null
  }

  const credentialManager = getCredentialManager()
  let callbackServer: CallbackServer | null = null

  try {
    logger.info(`[ChatGPT OAuth] Starting local flow for ${connectionSlug}`)

    callbackServer = await createCallbackServer({
      appType: 'electron',
      port: CHATGPT_OAUTH_CONFIG.CALLBACK_PORT,
      callbackPaths: ['/auth/callback'],
    })

    const prepared = prepareChatGptOAuth()
    const callbackPromise = new Promise<Awaited<typeof callbackServer.promise>>((resolve, reject) => {
      activeChatGptFlow = {
        callbackServer: callbackServer!,
        reject,
      }
      callbackServer!.promise.then(resolve, reject)
    })

    await shell.openExternal(prepared.authUrl)

    const callback = await callbackPromise

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

    const tokens = await exchangeChatGptTokens(code, prepared.codeVerifier, (status) => {
      logger.info(`[ChatGPT OAuth] ${status}`)
    })

    await credentialManager.setLlmOAuth(connectionSlug, {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    })

    getModelRefreshService().refreshNow(connectionSlug).catch(err => {
      logger.warn(`[ChatGPT OAuth] Model refresh failed for ${connectionSlug}: ${err instanceof Error ? err.message : err}`)
    })

    logger.info(`[ChatGPT OAuth] Completed local flow for ${connectionSlug}`)
    return { success: true }
  } catch (error) {
    logger.error('[ChatGPT OAuth] Local flow failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ChatGPT OAuth flow failed',
    }
  } finally {
    callbackServer?.close()
    if (activeChatGptFlow?.callbackServer === callbackServer) {
      activeChatGptFlow = null
    }
  }
}

export function cancelLocalChatGptOAuthFlow(
  logger: Pick<Logger, 'info' | 'error' | 'warn'>,
): { success: boolean } {
  if (activeChatGptFlow) {
    activeChatGptFlow.callbackServer.close()
    activeChatGptFlow.reject(new Error('ChatGPT OAuth cancelled'))
    activeChatGptFlow = null
    logger.info('[ChatGPT OAuth] Local flow cancelled')
  }
  return { success: true }
}
