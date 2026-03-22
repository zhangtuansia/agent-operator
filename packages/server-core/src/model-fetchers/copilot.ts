import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@agent-operator/shared/config'
import type { LlmConnection } from '@agent-operator/shared/config'
import { fetchBackendModels } from '@agent-operator/shared/agent/backend'
import { handlerLog, getHostRuntime } from './runtime'

const COPILOT_TIMEOUT_MS = 30_000

export class CopilotModelFetcher implements ModelFetcher {
  readonly refreshIntervalMs = 0

  async fetchModels(
    connection: LlmConnection,
    credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const result = await fetchBackendModels({
      connection,
      credentials,
      timeoutMs: COPILOT_TIMEOUT_MS,
      hostRuntime: getHostRuntime(),
    })

    handlerLog.info(`Fetched ${result.models.length} Copilot models: ${result.models.map(m => m.id).join(', ')}`)
    return result
  }
}
