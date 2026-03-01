/**
 * Model Fetcher Registry
 *
 * Maps every FetchableProvider to its ModelFetcher implementation.
 * The ModelFetcherMap type ensures compile-time completeness —
 * adding a new LlmProviderType without a fetcher entry causes a type error.
 */

import type { ModelFetcherMap } from '@agent-operator/shared/config'
import { AnthropicModelFetcher } from './anthropic'
import { CopilotModelFetcher } from './copilot'
import { OpenAIModelFetcher } from './openai'
import { BedrockVertexModelFetcher } from './bedrock-vertex'

// Shared instances — fetchers are stateless
const anthropicFetcher = new AnthropicModelFetcher()
const copilotFetcher = new CopilotModelFetcher()
const openAIFetcher = new OpenAIModelFetcher()
const bedrockVertexFetcher = new BedrockVertexModelFetcher()

export const MODEL_FETCHERS: ModelFetcherMap = {
  anthropic: anthropicFetcher,
  copilot: copilotFetcher,
  openai: openAIFetcher,
  bedrock: bedrockVertexFetcher,
  vertex: bedrockVertexFetcher, // Shared instance — same implementation
}
