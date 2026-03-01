/**
 * Copilot Model Fetcher
 *
 * Fetches available models from the GitHub Copilot SDK.
 * Requires an OAuth access token set in credentials.
 */

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'path'
import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'

export class CopilotModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 0 // No periodic refresh

  async fetchModels(_connection: LlmConnection, credentials: ModelFetcherCredentials): Promise<ModelFetchResult> {
    const accessToken = credentials.oauthAccessToken
    if (!accessToken) {
      throw new Error('Copilot OAuth access token required to fetch models')
    }

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

    return { models: modelDefs }
  }
}
