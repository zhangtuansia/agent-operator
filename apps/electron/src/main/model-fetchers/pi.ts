/**
 * Pi Model Fetcher
 *
 * Uses Pi SDK registry discovery to populate model lists.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'
import { getAllPiModels } from '@agent-operator/shared/config'

export class PiModelFetcher implements ModelFetcher {
  // Pi models are fetched on demand (no periodic refresh).
  readonly refreshIntervalMs = 0

  async fetchModels(
    _connection: LlmConnection,
    _credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const models = getAllPiModels()
    if (models.length === 0) {
      throw new Error('No Pi models available from SDK registry')
    }
    return { models }
  }
}

