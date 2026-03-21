/**
 * OpenAI Model Fetcher
 *
 * Fetches available models from the OpenAI /v1/models API.
 * Supports both API key and OAuth (ChatGPT Plus) authentication.
 * Filters for GPT and Codex models that DAZI can use.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'
import { ipcLog } from '../logger'

const OPENAI_TIMEOUT_MS = 30_000
const OPENAI_BASE_URL = 'https://api.openai.com'

/** Model ID prefixes we want to include */
const SUPPORTED_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'codex-']

/** Model IDs to exclude (legacy, internal, embedding-only, etc.) */
const EXCLUDED_PATTERNS = [
  'gpt-3.5',
  'gpt-4-base',
  'gpt-4o-realtime',
  'gpt-4o-audio',
  'gpt-4o-mini-realtime',
  'gpt-4o-mini-audio',
  '-preview',
  'search',
  'instruct',
  'whisper',
  'tts',
  'dall-e',
  'davinci',
  'babbage',
  'embedding',
]

function isUsableModel(id: string): boolean {
  const lower = id.toLowerCase()

  // Must match at least one supported prefix
  if (!SUPPORTED_PREFIXES.some(p => lower.startsWith(p))) return false

  // Must not match any excluded pattern
  if (EXCLUDED_PATTERNS.some(p => lower.includes(p))) return false

  return true
}

function extractShortName(id: string): string {
  // GPT-5.4 → GPT-5.4, GPT-5.3-Codex → GPT-5.3-Codex, o4-mini → O4-Mini
  return id
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
    .replace(/^Gpt/, 'GPT')
    .replace(/-(\d{4})(\d{2})(\d{2})$/, '') // strip date suffix
}

function extractDisplayName(id: string, rawName?: string): string {
  if (rawName && rawName !== id) return rawName
  return extractShortName(id)
}

export class OpenAIModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 60 * 60 * 1000 // 60 minutes

  async fetchModels(connection: LlmConnection, credentials: ModelFetcherCredentials): Promise<ModelFetchResult> {
    const apiKey = credentials.apiKey
    const oauthAccessToken = credentials.oauthAccessToken

    if (!apiKey && !oauthAccessToken) {
      throw new Error('OpenAI credentials required to fetch models')
    }

    const baseUrl = connection.baseUrl || OPENAI_BASE_URL
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`
    } else {
      headers.authorization = `Bearer ${oauthAccessToken}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new Error(`OpenAI /v1/models failed: ${response.status} ${response.statusText} ${errorBody.slice(0, 200)}`)
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string
          object: string
          created: number
          owned_by: string
        }>
      }

      if (!data.data || data.data.length === 0) {
        throw new Error('No models returned from OpenAI API')
      }

      const models = data.data
        .filter(m => isUsableModel(m.id))
        .sort((a, b) => b.created - a.created) // newest first
        .map(m => ({
          id: m.id,
          name: extractDisplayName(m.id),
          shortName: extractShortName(m.id),
          description: '',
          provider: 'openai' as const,
          contextWindow: m.id.includes('codex') ? 192_000 : 128_000,
        }))

      // Determine server default (first model, typically newest flagship)
      const serverDefault = models[0]?.id

      ipcLog.info(`Fetched ${models.length} OpenAI models: ${models.map(m => m.id).join(', ')}`)
      return { models, serverDefault }
    } finally {
      clearTimeout(timeout)
    }
  }
}
