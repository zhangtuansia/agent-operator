/**
 * Anthropic Model Fetcher
 *
 * Fetches available Claude models from the Anthropic /v1/models API.
 * Supports both API key and OAuth authentication.
 * Bedrock/Vertex connections throw immediately (no dynamic discovery) —
 * the ModelRefreshService fallback chain handles them.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'
import { ipcLog } from '../logger'

const ANTHROPIC_TIMEOUT_MS = 30_000

export class AnthropicModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 60 * 60 * 1000 // 60 minutes

  async fetchModels(connection: LlmConnection, credentials: ModelFetcherCredentials): Promise<ModelFetchResult> {
    // Bedrock/Vertex don't support dynamic model discovery
    if (connection.providerType === 'bedrock' || connection.providerType === 'vertex') {
      throw new Error('Dynamic model discovery not available for Bedrock/Vertex connections; using fallback chain.')
    }
    if (connection.authType === 'environment') {
      throw new Error('Dynamic model discovery not supported for environment auth; using fallback chain.')
    }

    const apiKey = credentials.apiKey
    const oauthAccessToken = credentials.oauthAccessToken

    if (!apiKey && !oauthAccessToken) {
      throw new Error('Anthropic credentials required to fetch models')
    }

    const baseUrl = connection.baseUrl || 'https://api.anthropic.com'
    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey
    } else {
      headers.authorization = `Bearer ${oauthAccessToken}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)

    try {
      const allRawModels: Array<{
        id: string
        display_name: string
        created_at: string
        type: string
      }> = []
      let afterId: string | undefined

      do {
        const params = new URLSearchParams({ limit: '100' })
        if (afterId) params.set('after_id', afterId)

        const response = await fetch(`${baseUrl}/v1/models?${params}`, {
          headers,
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Anthropic /v1/models failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as {
          data: Array<{ id: string; display_name: string; created_at: string; type: string }>
          has_more: boolean
          first_id: string
          last_id: string
        }
        if (data.data) allRawModels.push(...data.data)

        if (data.has_more && data.last_id) {
          afterId = data.last_id
        } else {
          break
        }
      } while (true)

      if (allRawModels.length === 0) {
        throw new Error('No models returned from Anthropic API')
      }

      const models = allRawModels
        .filter(
          (m) =>
            m.id.startsWith('claude-') &&
            !m.id.startsWith('claude-2') &&
            !m.id.startsWith('claude-instant') &&
            !m.id.startsWith('claude-1'),
        )
        .map((m) => ({
          id: m.id,
          name: m.display_name,
          shortName: (() => {
            const stripped = m.id
              .replace('claude-', '')
              .replace(/-\d{8}$/, '')
              .replace(/-latest$/, '')
            const variant = stripped
              .replace(/^[\d.-]+/, '')
              .replace(/-[\d.]+$/, '')
              .replace(/^-/, '')
            return variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : stripped
          })(),
          description: '',
          provider: 'anthropic' as const,
          contextWindow: 200_000,
        }))

      ipcLog.info(`Fetched ${models.length} Anthropic models: ${models.map((m) => m.id).join(', ')}`)
      return { models }
    } finally {
      clearTimeout(timeout)
    }
  }
}
