/**
 * Connection Setup Logic
 *
 * Pure functions extracted from ipc.ts for testability.
 * No dependency on ipcMain, sessionManager, credential manager, or file I/O.
 */

import type { ModelDefinition } from '@agent-operator/shared/config/models'
import {
  type LlmConnection,
  getDefaultModelsForConnection,
  getDefaultModelForConnection,
  getDefaultModelsForSlug,
  getDefaultModelForSlug,
} from '@agent-operator/shared/config'

// ============================================================
// Error Parsing
// ============================================================

/**
 * Parse an error message from a connection test into a user-friendly string.
 */
export function parseTestConnectionError(msg: string): string {
  const lower = msg.toLowerCase()

  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
    return 'Cannot connect to API server. Check the URL and ensure the server is running.'
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'Invalid API key'
  }
  if (lower.includes('404') && lower.includes('model')) {
    return 'Model not found. Check the model name and try again.'
  }
  if (lower.includes('404')) {
    return 'API endpoint not found. Check the URL.'
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Rate limit exceeded. Please try again.'
  }
  if (lower.includes('403')) {
    return 'API key does not have permission to access this resource'
  }

  return msg.slice(0, 300)
}

// ============================================================
// Built-in Connection Templates
// ============================================================

export interface BuiltInConnectionTemplate {
  name: string | ((hasCustomEndpoint: boolean) => string)
  providerType: LlmConnection['providerType'] | ((hasCustomEndpoint: boolean) => LlmConnection['providerType'])
  authType: LlmConnection['authType'] | ((hasCustomEndpoint: boolean) => LlmConnection['authType'])
  baseUrl?: string
}

/**
 * Built-in connection templates for the onboarding flow.
 * Each template defines the default configuration for a known connection slug.
 */
export const BUILT_IN_CONNECTION_TEMPLATES: Record<string, BuiltInConnectionTemplate> = {
  'anthropic-api': {
    name: (h) => h ? 'Custom Anthropic-Compatible' : 'Anthropic API',
    providerType: (h) => h ? 'anthropic_compat' : 'anthropic',
    authType: (h) => h ? 'api_key_with_endpoint' : 'api_key',
  },
  'claude-max': {
    name: 'Claude Max',
    providerType: 'anthropic',
    authType: 'oauth',
  },
  'bedrock': {
    name: 'AWS Bedrock',
    providerType: 'bedrock',
    authType: 'environment',
  },
  'codex': {
    name: 'Codex (ChatGPT Plus)',
    providerType: 'openai',
    authType: 'oauth',
  },
  'codex-api': {
    name: (h) => h ? 'Codex (Custom Endpoint)' : 'Codex (OpenAI API Key)',
    providerType: (h) => h ? 'openai_compat' : 'openai',
    authType: (h) => h ? 'api_key_with_endpoint' : 'api_key',
  },
  'copilot': {
    name: 'GitHub Copilot',
    providerType: 'copilot',
    authType: 'oauth',
  },
  'deepseek-api': {
    name: 'DeepSeek',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.deepseek.com/anthropic',
  },
  'glm-api': {
    name: '智谱 GLM',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
  },
  'minimax-api': {
    name: 'MiniMax',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.minimaxi.com/anthropic',
  },
  'doubao-api': {
    name: '豆包 Doubao',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
  },
  'kimi-api': {
    name: 'Kimi',
    providerType: 'anthropic_compat',
    authType: 'api_key_with_endpoint',
    baseUrl: 'https://api.moonshot.ai/anthropic/',
  },
}

// ============================================================
// Connection Creation
// ============================================================

/**
 * Create an LLM connection configuration from a connection slug.
 * Uses built-in templates for known slugs, returns null for unknown slugs
 * (custom connections are created through the settings UI).
 */
export function createBuiltInConnection(slug: string, baseUrl?: string | null): LlmConnection | null {
  // Try exact match first, then strip numeric suffix for derived slugs (e.g. 'anthropic-api-2' → 'anthropic-api')
  const baseSlug = slug.replace(/-\d+$/, '')
  const template = BUILT_IN_CONNECTION_TEMPLATES[slug] ?? BUILT_IN_CONNECTION_TEMPLATES[baseSlug]
  if (!template) return null

  const now = Date.now()
  const hasCustomEndpoint = typeof baseUrl === 'string' && baseUrl.trim().length > 0

  const providerType = typeof template.providerType === 'function'
    ? template.providerType(hasCustomEndpoint) : template.providerType
  const authType = typeof template.authType === 'function'
    ? template.authType(hasCustomEndpoint) : template.authType
  let name = typeof template.name === 'function'
    ? template.name(hasCustomEndpoint) : template.name

  // Append suffix number to name for derived connections (e.g. 'anthropic-api-2' → 'Anthropic API 2')
  const suffixMatch = slug.match(/-(\d+)$/)
  if (suffixMatch && !BUILT_IN_CONNECTION_TEMPLATES[slug]) {
    name = `${name} ${suffixMatch[1]}`
  }

  // Slug-level models (third-party providers), fallback to providerType-level
  const slugModels = getDefaultModelsForSlug(slug)
  const models = slugModels.length > 0 ? slugModels : getDefaultModelsForConnection(providerType)
  const defaultModel = getDefaultModelForSlug(slug) ?? getDefaultModelForConnection(providerType)

  const effectiveBaseUrl = hasCustomEndpoint
    ? baseUrl!.trim()
    : template.baseUrl ?? undefined

  return { slug, name, providerType, authType, baseUrl: effectiveBaseUrl, models, defaultModel, createdAt: now }
}

// ============================================================
// Model Validation
// ============================================================

/**
 * Validate that the default model exists in the provided model list.
 * Handles both string and ModelDefinition model entries.
 *
 * Extracted from inline logic to fix a bug where Array.includes() compared
 * strings against ModelDefinition objects, always returning false.
 */
export function validateModelList(
  models: Array<ModelDefinition | string>,
  defaultModel: string | undefined,
): { valid: boolean; error?: string; resolvedDefaultModel?: string } {
  if (!models || models.length === 0) {
    return { valid: true }
  }

  const modelIds = models.map(m => typeof m === 'string' ? m : m.id)

  if (defaultModel && !modelIds.includes(defaultModel)) {
    return {
      valid: false,
      error: `Default model "${defaultModel}" is not in the provided model list.`,
    }
  }

  if (!defaultModel) {
    const firstModel = models[0]
    const firstModelId = typeof firstModel === 'string' ? firstModel : firstModel!.id
    return {
      valid: true,
      resolvedDefaultModel: firstModelId,
    }
  }

  return { valid: true }
}
