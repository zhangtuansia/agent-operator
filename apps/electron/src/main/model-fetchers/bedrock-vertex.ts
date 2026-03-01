/**
 * Bedrock/Vertex Model Fetcher
 *
 * Dynamic model discovery is not available for AWS Bedrock and Google Vertex
 * connections. The ModelRefreshService fallback chain will use persisted models
 * or the static MODEL_REGISTRY instead.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'

export class BedrockVertexModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 0 // No periodic refresh

  async fetchModels(_connection: LlmConnection, _credentials: ModelFetcherCredentials): Promise<ModelFetchResult> {
    throw new Error('Dynamic model discovery not available for Bedrock/Vertex; using fallback chain.')
  }
}
