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

// MiniMax models (2025 - M2.1 series)
export const MINIMAX_MODELS: ModelDefinition[] = [
  { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', shortName: 'M2.1', description: 'Latest flagship (229B), SOTA coding & agents', pricing: PRICING_MINIMAX },
  { id: 'MiniMax-M2', name: 'MiniMax M2', shortName: 'M2', description: 'Previous generation', pricing: PRICING_MINIMAX },
];

// DeepSeek models (2025 - V3.2 series, 671B MoE)
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  { id: 'deepseek-chat', name: 'DeepSeek V3.2', shortName: 'V3.2', description: 'Latest flagship (non-thinking mode)', pricing: DEFAULT_PRICING.deepseek },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', shortName: 'Reasoner', description: 'V3.2 thinking mode with tool-use', pricing: DEFAULT_PRICING.deepseek },
];

// AWS Bedrock models (Claude via Bedrock)
export const BEDROCK_MODELS: ModelDefinition[] = [
  { id: 'us.anthropic.claude-opus-4-5-20251101-v1:0', name: 'Opus 4.5 (Bedrock)', shortName: 'Opus', description: 'Most capable', pricing: DEFAULT_PRICING.opus },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Sonnet 4.5 (Bedrock)', shortName: 'Sonnet', description: 'Balanced', pricing: DEFAULT_PRICING.sonnet },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Haiku 4.5 (Bedrock)', shortName: 'Haiku', description: 'Fast & efficient', pricing: DEFAULT_PRICING.haiku },
];

// OpenRouter models (uses provider/model-name format, 2025 updated)
export const OPENROUTER_MODELS: ModelDefinition[] = [
  { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', shortName: 'Opus 4.5', description: 'Frontier reasoning model ($5/$25 per 1M)' },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', shortName: 'Sonnet 4.5', description: 'Advanced Sonnet ($3/$15 per 1M)' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', shortName: 'Haiku 4.5', description: 'Fastest model, near-frontier' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', shortName: 'Opus 4', description: 'World best coding model' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', shortName: 'Sonnet 4', description: 'Balanced performance' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', shortName: 'GPT-4o', description: 'OpenAI via OpenRouter' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', shortName: 'Gemini 2.5', description: 'Google via OpenRouter' },
];

// Ollama models (local models - free, 2025 updated)
export const OLLAMA_MODELS: ModelDefinition[] = [
  { id: 'llama4:scout', name: 'Llama 4 Scout', shortName: 'Llama 4', description: 'Meta Llama 4 multimodal', pricing: DEFAULT_PRICING.ollama },
  { id: 'llama4:maverick', name: 'Llama 4 Maverick', shortName: 'Llama 4 Mav', description: 'Llama 4 advanced variant', pricing: DEFAULT_PRICING.ollama },
  { id: 'qwen3', name: 'Qwen 3', shortName: 'Qwen 3', description: 'Alibaba Qwen 3 (235B MoE flagship)', pricing: DEFAULT_PRICING.ollama },
  { id: 'qwen3:30b', name: 'Qwen 3 30B', shortName: 'Qwen 3 30B', description: 'Qwen 3 efficient MoE', pricing: DEFAULT_PRICING.ollama },
  { id: 'deepseek-r1:32b', name: 'DeepSeek R1 32B', shortName: 'DS-R1', description: 'DeepSeek reasoning model', pricing: DEFAULT_PRICING.ollama },
  { id: 'mistral', name: 'Mistral', shortName: 'Mistral', description: 'Mistral AI', pricing: DEFAULT_PRICING.ollama },
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
  minimax: 'MiniMax-M2.1',
  deepseek: 'deepseek-chat',
  bedrock: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  openrouter: 'anthropic/claude-sonnet-4.5',
  vercel: 'claude-sonnet-4-5-20250929',
  ollama: 'llama4:scout',
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
 * For the 'custom' provider, if customModels are provided and non-empty,
 * returns the first custom model's ID (since the hardcoded default may not
 * be supported by the user's custom API endpoint).
 * @param provider - Provider ID
 * @param customModels - Optional custom model definitions (for 'custom' provider)
 * @returns Default model ID for the provider
 */
export function getDefaultModelForProvider(
  provider: string | undefined,
  customModels?: Array<{ id: string; name: string }>
): string {
  if (!provider) return DEFAULT_MODEL;

  // For custom provider with user-defined models, use the first custom model
  if (provider === 'custom' && customModels && customModels.length > 0) {
    return customModels[0]!.id;
  }

  return DEFAULT_PROVIDER_MODEL[provider] || DEFAULT_MODEL;
}

/**
 * Check if a model is valid for a specific provider.
 * @param modelId - Model ID to check
 * @param provider - Provider ID
 * @param customModels - Optional custom models (for 'custom' provider)
 * @returns true if model is valid for the provider
 */
export function isModelValidForProvider(
  modelId: string,
  provider: string | undefined,
  customModels?: Array<{ id: string; name: string; shortName?: string; description?: string }>
): boolean {
  const models = getModelsForProvider(provider, customModels);
  return models.some(m => m.id === modelId);
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
