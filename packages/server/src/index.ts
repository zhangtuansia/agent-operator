#!/usr/bin/env bun
/**
 * @agent-operator/server — standalone headless Dazi server.
 *
 * Usage:
 *   COWORK_SERVER_TOKEN=<secret> bun run packages/server/src/index.ts
 *
 * Environment:
 *   COWORK_SERVER_TOKEN   — required bearer token for client auth
 *   COWORK_RPC_HOST       — bind address (default: 127.0.0.1)
 *   COWORK_RPC_PORT       — bind port (default: 9100)
 *   COWORK_RPC_TLS_CERT   — path to PEM certificate file (enables TLS/wss)
 *   COWORK_RPC_TLS_KEY    — path to PEM private key file (required with cert)
 *   COWORK_RPC_TLS_CA     — path to PEM CA chain file (optional)
 *   COWORK_APP_ROOT       — app root path (default: cwd)
 *   COWORK_RESOURCES_PATH — resources path (default: cwd/resources)
 *   COWORK_IS_PACKAGED    — 'true' for production (default: false)
 *   COWORK_VERSION        — app version (default: 0.0.0-dev)
 *   COWORK_DEBUG          — 'true' for debug logging
 */

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { startHeadlessServer } from '@agent-operator/server-core/bootstrap'
import type { WsRpcTlsOptions } from '@agent-operator/server-core/transport'
import { registerCoreRpcHandlers, cleanupSessionFileWatchForClient } from '@agent-operator/server-core/handlers/rpc'
import { SessionManager, setSessionPlatform, setSessionRuntimeHooks } from '@agent-operator/server-core/sessions'
import { initModelRefreshService, setFetcherPlatform } from '@agent-operator/server-core/model-fetchers'
import { setSearchPlatform, setImageProcessor } from '@agent-operator/server-core/services'
import type { HandlerDeps } from '@agent-operator/server-core/handlers'

process.env.COWORK_IS_PACKAGED ??= 'false'

// In dev (monorepo), bundled assets root is the repo root (4 levels up from this file).
// In packaged mode, use COWORK_BUNDLED_ASSETS_ROOT env or cwd.
const bundledAssetsRoot = process.env.COWORK_BUNDLED_ASSETS_ROOT
  ?? join(import.meta.dir, '..', '..', '..', '..')

// TLS configuration — when cert + key paths are provided, server listens on wss://
let tls: WsRpcTlsOptions | undefined
const tlsCertPath = process.env.COWORK_RPC_TLS_CERT
const tlsKeyPath = process.env.COWORK_RPC_TLS_KEY
if (tlsCertPath || tlsKeyPath) {
  if (!tlsCertPath || !tlsKeyPath) {
    console.error('TLS requires both COWORK_RPC_TLS_CERT and COWORK_RPC_TLS_KEY.')
    process.exit(1)
  }
  tls = {
    cert: readFileSync(tlsCertPath),
    key: readFileSync(tlsKeyPath),
    ...(process.env.COWORK_RPC_TLS_CA ? { ca: readFileSync(process.env.COWORK_RPC_TLS_CA) } : {}),
  }
}

const instance = await (async () => {
  try {
    return await startHeadlessServer<SessionManager, HandlerDeps>({
      bundledAssetsRoot,
      tls,
      applyPlatformToSubsystems: (platform) => {
        setFetcherPlatform(platform)
        setSessionPlatform(platform)
        setSessionRuntimeHooks({
          updateBadgeCount: () => {},
          captureException: (error) => {
            const err = error instanceof Error ? error : new Error(String(error))
            platform.captureError?.(err)
          },
        })
        setSearchPlatform(platform)
        setImageProcessor(platform.imageProcessor)
      },
      initModelRefreshService: () => initModelRefreshService(async (slug: string) => {
        const { getCredentialManager } = await import('@agent-operator/shared/credentials')
        const manager = getCredentialManager()
        const [apiKey, oauth] = await Promise.all([
          manager.getLlmApiKey(slug).catch(() => null),
          manager.getLlmOAuth(slug).catch(() => null),
        ])
        return {
          apiKey: apiKey ?? undefined,
          oauthAccessToken: oauth?.accessToken,
          oauthRefreshToken: oauth?.refreshToken,
          oauthIdToken: oauth?.idToken,
        }
      }),
      createSessionManager: () => new SessionManager(),
      createHandlerDeps: ({ sessionManager, platform, oauthFlowStore }) => ({
        sessionManager,
        platform,
        oauthFlowStore,
      }),
      registerAllRpcHandlers: registerCoreRpcHandlers,
      setSessionEventSink: (sessionManager, sink) => {
        sessionManager.setEventSink(sink)
      },
      initializeSessionManager: async (sessionManager) => {
        await sessionManager.initialize()
      },
      cleanupSessionManager: async (sessionManager) => {
        try {
          await sessionManager.flushAllSessions()
        } finally {
          sessionManager.cleanup()
        }
      },
      cleanupClientResources: cleanupSessionFileWatchForClient,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
})()

console.log(`COWORK_SERVER_URL=${instance.protocol}://${instance.host}:${instance.port}`)
console.log(`COWORK_SERVER_TOKEN=${instance.token}`)

// Warn if binding to a non-localhost address without TLS — tokens would be sent in cleartext
const isLocalBind = instance.host === '127.0.0.1' || instance.host === 'localhost' || instance.host === '::1'
if (!isLocalBind && instance.protocol === 'ws') {
  console.warn(
    '\n⚠️  WARNING: Server is listening on a network address without TLS.\n' +
    '   Authentication tokens will be sent in cleartext.\n' +
    '   Set COWORK_RPC_TLS_CERT and COWORK_RPC_TLS_KEY to enable wss://.\n'
  )
}

const shutdown = async () => {
  await instance.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
