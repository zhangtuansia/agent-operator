import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'
import { fetchBackendModels } from '@agent-operator/shared/agent/backend'
import { handlerLog, getHostRuntime } from './runtime'

const OPENAI_TIMEOUT_MS = 30_000

export class OpenAIModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 60 * 60 * 1000

  async fetchModels(
    connection: LlmConnection,
    credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const result = await fetchBackendModels({
      connection,
      credentials,
      timeoutMs: OPENAI_TIMEOUT_MS,
      hostRuntime: getHostRuntime(),
    })

    handlerLog.info(`Fetched ${result.models.length} OpenAI models: ${result.models.map(m => m.id).join(', ')}`)
    return result
  }
}
