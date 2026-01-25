/**
 * Centralized model definitions for the entire application.
 * Update model IDs here when new versions are released.
 */

export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  inputCostPer1M: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1M: number;
}

export interface ModelDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** Token pricing (optional, defaults provided) */
  pricing?: ModelPricing;
}

// ============================================
// USER-SELECTABLE MODELS (shown in UI)
// ============================================

// Default pricing per 1M tokens (USD) - https://anthropic.com/pricing
const PRICING_OPUS: ModelPricing = { inputCostPer1M: 15, outputCostPer1M: 75 };
const PRICING_SONNET: ModelPricing = { inputCostPer1M: 3, outputCostPer1M: 15 };
const PRICING_HAIKU: ModelPricing = { inputCostPer1M: 0.25, outputCostPer1M: 1.25 };
const PRICING_GLM_HIGH: ModelPricing = { inputCostPer1M: 5, outputCostPer1M: 15 };
const PRICING_GLM_PLUS: ModelPricing = { inputCostPer1M: 3, outputCostPer1M: 9 };
const PRICING_GLM_AIR: ModelPricing = { inputCostPer1M: 0.5, outputCostPer1M: 1.5 };
const PRICING_GLM_FREE: ModelPricing = { inputCostPer1M: 0, outputCostPer1M: 0 };
const PRICING_DEEPSEEK: ModelPricing = { inputCostPer1M: 0.14, outputCostPer1M: 0.28 };
const PRICING_MINIMAX: ModelPricing = { inputCostPer1M: 1, outputCostPer1M: 3 };
const PRICING_FREE: ModelPricing = { inputCostPer1M: 0, outputCostPer1M: 0 };
const PRICING_DEFAULT: ModelPricing = { inputCostPer1M: 3, outputCostPer1M: 15 };

export const DEFAULT_PRICING = {
  opus: PRICING_OPUS,
  sonnet: PRICING_SONNET,
  haiku: PRICING_HAIKU,
  'glm-4.7': PRICING_GLM_HIGH,
  'glm-4-plus': PRICING_GLM_PLUS,
  'glm-4-air': PRICING_GLM_AIR,
  'glm-4-airx': PRICING_GLM_AIR,
  'glm-4-flash': PRICING_GLM_FREE,
  deepseek: PRICING_DEEPSEEK,
  minimax: PRICING_MINIMAX,
  openrouter: PRICING_DEFAULT,
  ollama: PRICING_FREE,
  default: PRICING_DEFAULT,
} as const;

// Anthropic Claude models (default)
export const CLAUDE_MODELS: ModelDefinition[] = [
  { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', shortName: 'Opus', description: 'Most capable', pricing: DEFAULT_PRICING.opus },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', shortName: 'Sonnet', description: 'Balanced', pricing: DEFAULT_PRICING.sonnet },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', shortName: 'Haiku', description: 'Fast & efficient', pricing: DEFAULT_PRICING.haiku },
];

// 智谱 GLM models
export const GLM_MODELS: ModelDefinition[] = [
  { id: 'glm-4.7', name: 'GLM-4.7', shortName: 'GLM-4.7', description: 'Latest & most capable', pricing: DEFAULT_PRICING['glm-4.7'] },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', shortName: 'GLM-4+', description: 'Enhanced capabilities', pricing: DEFAULT_PRICING['glm-4-plus'] },
  { id: 'glm-4-air', name: 'GLM-4 Air', shortName: 'GLM-4 Air', description: 'Fast & efficient', pricing: DEFAULT_PRICING['glm-4-air'] },
  { id: 'glm-4-airx', name: 'GLM-4 AirX', shortName: 'GLM-4 AirX', description: 'Fastest inference', pricing: DEFAULT_PRICING['glm-4-airx'] },
  { id: 'glm-4-flash', name: 'GLM-4 Flash', shortName: 'GLM-4 Flash', description: 'Free tier model', pricing: DEFAULT_PRICING['glm-4-flash'] },
];

// MiniMax models
export const MINIMAX_MODELS: ModelDefinition[] = [
  { id: 'abab6.5s-chat', name: 'ABAB 6.5s', shortName: 'ABAB 6.5s', description: 'Most capable' },
  { id: 'abab6.5g-chat', name: 'ABAB 6.5g', shortName: 'ABAB 6.5g', description: 'General purpose' },
  { id: 'abab5.5-chat', name: 'ABAB 5.5', shortName: 'ABAB 5.5', description: 'Fast & efficient' },
];

// DeepSeek models
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', shortName: 'DeepSeek', description: 'General chat model', pricing: DEFAULT_PRICING.deepseek },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', shortName: 'Coder', description: 'Optimized for coding', pricing: DEFAULT_PRICING.deepseek },
];

// AWS Bedrock models (Claude via Bedrock)
export const BEDROCK_MODELS: ModelDefinition[] = [
  { id: 'us.anthropic.claude-opus-4-5-20251101-v1:0', name: 'Opus 4.5 (Bedrock)', shortName: 'Opus', description: 'Most capable', pricing: DEFAULT_PRICING.opus },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Sonnet 4.5 (Bedrock)', shortName: 'Sonnet', description: 'Balanced', pricing: DEFAULT_PRICING.sonnet },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Haiku 4.5 (Bedrock)', shortName: 'Haiku', description: 'Fast & efficient', pricing: DEFAULT_PRICING.haiku },
];

// OpenRouter models (uses provider/model-name format)
export const OPENROUTER_MODELS: ModelDefinition[] = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', shortName: 'Sonnet 3.5', description: 'Via OpenRouter' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', shortName: 'Haiku 3.5', description: 'Via OpenRouter' },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', shortName: 'Opus 3', description: 'Via OpenRouter' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', shortName: 'GPT-4o', description: 'OpenAI via OpenRouter' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', shortName: 'Gemini', description: 'Google via OpenRouter' },
];

// Ollama models (local models - free)
export const OLLAMA_MODELS: ModelDefinition[] = [
  { id: 'llama3.2', name: 'Llama 3.2', shortName: 'Llama', description: 'Meta Llama 3.2', pricing: DEFAULT_PRICING.ollama },
  { id: 'llama3.2:70b', name: 'Llama 3.2 70B', shortName: 'Llama 70B', description: 'Large Llama model', pricing: DEFAULT_PRICING.ollama },
  { id: 'mistral', name: 'Mistral', shortName: 'Mistral', description: 'Mistral AI', pricing: DEFAULT_PRICING.ollama },
  { id: 'codellama', name: 'Code Llama', shortName: 'CodeLlama', description: 'Optimized for code', pricing: DEFAULT_PRICING.ollama },
  { id: 'qwen2.5', name: 'Qwen 2.5', shortName: 'Qwen', description: 'Alibaba Qwen', pricing: DEFAULT_PRICING.ollama },
];

// Vercel AI Gateway models (proxies Claude models)
export const VERCEL_MODELS: ModelDefinition[] = CLAUDE_MODELS;

// Provider to models mapping
export const PROVIDER_MODELS: Record<string, ModelDefinition[]> = {
  anthropic: CLAUDE_MODELS,
  api_key: CLAUDE_MODELS,  // Default Anthropic API key
  claude_oauth: CLAUDE_MODELS,  // Claude OAuth
  glm: GLM_MODELS,
  minimax: MINIMAX_MODELS,
  deepseek: DEEPSEEK_MODELS,
  bedrock: BEDROCK_MODELS,  // AWS Bedrock
  openrouter: OPENROUTER_MODELS,  // OpenRouter
  vercel: VERCEL_MODELS,  // Vercel AI Gateway
  ollama: OLLAMA_MODELS,  // Local Ollama
  custom: CLAUDE_MODELS,  // Custom provider defaults to Claude models
};

// Default models per provider
export const DEFAULT_PROVIDER_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  api_key: 'claude-sonnet-4-5-20250929',
  claude_oauth: 'claude-sonnet-4-5-20250929',
  glm: 'glm-4.7',
  minimax: 'abab6.5s-chat',
  deepseek: 'deepseek-chat',
  bedrock: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  openrouter: 'anthropic/claude-3.5-sonnet',
  vercel: 'claude-sonnet-4-5-20250929',
  ollama: 'llama3.2',
  custom: 'claude-sonnet-4-5-20250929',
};

/**
 * Get models for a specific provider.
 * For the 'custom' provider, pass customModels from storage/IPC.
 * @param provider - Provider ID (e.g., 'glm', 'minimax', 'deepseek', 'custom')
 * @param customModels - Optional custom model definitions (for 'custom' provider, fetched via IPC in renderer)
 * @returns Array of model definitions for the provider
 */
export function getModelsForProvider(
  provider: string | undefined,
  customModels?: Array<{ id: string; name: string; shortName?: string; description?: string }>
): ModelDefinition[] {
  if (!provider) return CLAUDE_MODELS;

  // For custom provider, use passed custom models
  if (provider === 'custom' && customModels && customModels.length > 0) {
    return customModels.map(m => ({
      id: m.id,
      name: m.name,
      shortName: m.shortName || m.name,
      description: m.description || '',
    }));
  }

  return PROVIDER_MODELS[provider] || CLAUDE_MODELS;
}

/**
 * Get default model for a specific provider.
 * @param provider - Provider ID
 * @returns Default model ID for the provider
 */
export function getDefaultModelForProvider(provider: string | undefined): string {
  if (!provider) return DEFAULT_MODEL;
  return DEFAULT_PROVIDER_MODEL[provider] || DEFAULT_MODEL;
}

// Legacy export for backward compatibility
export const MODELS: ModelDefinition[] = CLAUDE_MODELS;

// ============================================
// PURPOSE-SPECIFIC DEFAULTS
// ============================================

/** Default model for main chat (user-facing) */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/** Model for agent definition extraction (always high quality) */
export const EXTRACTION_MODEL = 'claude-opus-4-5-20251101';

/** Model for API response summarization (cost efficient) */
export const SUMMARIZATION_MODEL = 'claude-haiku-4-5-20251001';

/** Model for instruction updates (high quality for accurate document editing) */
export const INSTRUCTION_UPDATE_MODEL = 'claude-opus-4-5-20251101';

// ============================================
// HELPER FUNCTIONS
// ============================================

/** All available models across all providers */
const ALL_MODELS: ModelDefinition[] = [
  ...CLAUDE_MODELS,
  ...GLM_MODELS,
  ...MINIMAX_MODELS,
  ...DEEPSEEK_MODELS,
  ...BEDROCK_MODELS,
  ...OPENROUTER_MODELS,
  ...OLLAMA_MODELS,
];

/** Get display name for a model ID (full name with version) */
export function getModelDisplayName(modelId: string): string {
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (model) return model.name;
  // Fallback: strip prefix and date suffix
  return modelId.replace('claude-', '').replace(/-\d{8}$/, '');
}

/** Get short display name for a model ID (without version number) */
export function getModelShortName(modelId: string): string {
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (model) return model.shortName;
  // Fallback: strip prefix and date suffix
  return modelId.replace('claude-', '').replace(/-[\d.-]+$/, '');
}

/** Check if model is an Opus model (for cache TTL decisions) */
export function isOpusModel(modelId: string): boolean {
  return modelId.includes('opus');
}

/**
 * Get pricing for a model ID.
 * @param modelId - Model ID to get pricing for
 * @returns ModelPricing with input and output costs per 1M tokens
 */
export function getModelPricing(modelId: string): ModelPricing {
  // Try to find model in ALL_MODELS
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (model?.pricing) return model.pricing;

  // Fallback: detect pricing from model name
  const lowerModelId = modelId.toLowerCase();
  if (lowerModelId.includes('opus')) return PRICING_OPUS;
  if (lowerModelId.includes('haiku')) return PRICING_HAIKU;
  if (lowerModelId.includes('sonnet')) return PRICING_SONNET;
  if (lowerModelId.includes('deepseek')) return PRICING_DEEPSEEK;
  if (lowerModelId.includes('glm')) return PRICING_GLM_AIR;
  if (lowerModelId.includes('llama') || lowerModelId.includes('mistral') || lowerModelId.includes('qwen')) {
    return PRICING_FREE;
  }

  // Default to Sonnet pricing
  return PRICING_DEFAULT;
}

/**
 * Calculate estimated cost for token usage.
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param modelId - Model ID (optional, defaults to Sonnet pricing)
 * @returns Estimated cost in USD
 */
export function calculateTokenCost(inputTokens: number, outputTokens: number, modelId?: string): number {
  const pricing = modelId ? getModelPricing(modelId) : PRICING_DEFAULT;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
  return inputCost + outputCost;
}

// ============================================
// BEDROCK MODEL MAPPING
// ============================================

/**
 * Build Claude to Bedrock model mapping dynamically from CLAUDE_MODELS and BEDROCK_MODELS.
 * This ensures the mapping stays in sync when model versions are updated.
 */
function buildClaudeToBedrockMapping(): Map<string, string> {
  const mapping = new Map<string, string>();

  // Map by matching shortName (Opus -> Opus, Sonnet -> Sonnet, Haiku -> Haiku)
  for (const claudeModel of CLAUDE_MODELS) {
    const bedrockModel = BEDROCK_MODELS.find(b => b.shortName === claudeModel.shortName);
    if (bedrockModel) {
      mapping.set(claudeModel.id, bedrockModel.id);
    }
  }

  return mapping;
}

// Lazily initialized mapping (built once on first use)
let claudeToBedrockMap: Map<string, string> | null = null;

function getClaudeToBedrockMapping(): Map<string, string> {
  if (!claudeToBedrockMap) {
    claudeToBedrockMap = buildClaudeToBedrockMapping();
  }
  return claudeToBedrockMap;
}

/**
 * Check if a model ID is an AWS Bedrock ARN (Application Inference Profile or Model ARN)
 * Examples:
 * - arn:aws:bedrock:us-west-2:123456789:application-inference-profile/abc123
 * - arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-v2
 */
export function isBedrockArn(modelId: string): boolean {
  return modelId.startsWith('arn:aws:bedrock:');
}

/**
 * Check if a model ID is a native Bedrock model ID (not ARN).
 * Native Bedrock model IDs have the format: us.anthropic.claude-*
 */
export function isBedrockModelId(modelId: string): boolean {
  return modelId.startsWith('us.anthropic.') || modelId.startsWith('anthropic.');
}

/**
 * Check if a model ID is valid for Bedrock (ARN, native ID, or mappable Claude model).
 */
export function isValidBedrockModel(modelId: string): boolean {
  if (isBedrockArn(modelId)) return true;
  if (isBedrockModelId(modelId)) return true;
  // Check if it's a Claude model that can be mapped
  return getClaudeToBedrockMapping().has(modelId);
}

/**
 * Get the effective model for Bedrock mode.
 * Priority:
 * 1. ANTHROPIC_MODEL env var (supports ARN format for Application Inference Profiles)
 * 2. App-configured model (if it's a valid Bedrock model ID or mappable Claude model)
 * 3. Default Bedrock model
 *
 * This allows users to configure custom Inference Profile ARNs while still
 * allowing the app to work with standard Bedrock model IDs.
 */
export function getBedrockModel(appConfiguredModel?: string): string {
  // First priority: ANTHROPIC_MODEL env var (supports ARN and standard formats)
  const envModel = process.env.ANTHROPIC_MODEL;
  if (envModel) {
    return envModel;
  }

  // Second priority: app-configured model
  if (appConfiguredModel) {
    // Already a Bedrock ARN - use as-is
    if (isBedrockArn(appConfiguredModel)) {
      return appConfiguredModel;
    }

    // Already a native Bedrock model ID - use as-is
    if (isBedrockModelId(appConfiguredModel)) {
      return appConfiguredModel;
    }

    // Try to map standard Claude model to Bedrock equivalent
    const bedrockModel = getClaudeToBedrockMapping().get(appConfiguredModel);
    if (bedrockModel) {
      return bedrockModel;
    }

    // Unmappable model - log warning and fall through to default
    console.warn(
      `[Bedrock] Cannot map model "${appConfiguredModel}" to Bedrock format. ` +
      `Using default Bedrock model. Valid Claude models: ${Array.from(getClaudeToBedrockMapping().keys()).join(', ')}`
    );
  }

  // Fallback: default Bedrock model
  return DEFAULT_PROVIDER_MODEL.bedrock ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
}

/**
 * Get display name for a Bedrock ARN or model ID.
 * For ARNs, extract a meaningful name from the ARN structure.
 */
export function getBedrockModelDisplayName(modelId: string): string {
  if (isBedrockArn(modelId)) {
    // Extract the last part of the ARN for display
    // arn:aws:bedrock:us-west-2:123456789:application-inference-profile/abc123 -> "Inference Profile"
    // arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-v2 -> "claude-v2"
    const parts = modelId.split('/');
    const lastPart = parts[parts.length - 1] || modelId;

    if (modelId.includes('application-inference-profile')) {
      return `Inference Profile (${lastPart.substring(0, 8)}...)`;
    }
    if (modelId.includes('foundation-model')) {
      return lastPart.replace('anthropic.', '');
    }
    return lastPart;
  }
  return getModelDisplayName(modelId);
}
