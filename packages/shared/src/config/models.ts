/**
 * Centralized model definitions for the entire application.
 * Update model IDs here when new versions are released.
 */

export interface ModelDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
}

// ============================================
// USER-SELECTABLE MODELS (shown in UI)
// ============================================

// Anthropic Claude models (default)
export const CLAUDE_MODELS: ModelDefinition[] = [
  { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', shortName: 'Opus', description: 'Most capable' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', shortName: 'Sonnet', description: 'Balanced' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', shortName: 'Haiku', description: 'Fast & efficient' },
];

// 智谱 GLM models
export const GLM_MODELS: ModelDefinition[] = [
  { id: 'glm-4.7', name: 'GLM-4.7', shortName: 'GLM-4.7', description: 'Latest & most capable' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', shortName: 'GLM-4+', description: 'Enhanced capabilities' },
  { id: 'glm-4-air', name: 'GLM-4 Air', shortName: 'GLM-4 Air', description: 'Fast & efficient' },
  { id: 'glm-4-airx', name: 'GLM-4 AirX', shortName: 'GLM-4 AirX', description: 'Fastest inference' },
  { id: 'glm-4-flash', name: 'GLM-4 Flash', shortName: 'GLM-4 Flash', description: 'Free tier model' },
];

// MiniMax models
export const MINIMAX_MODELS: ModelDefinition[] = [
  { id: 'abab6.5s-chat', name: 'ABAB 6.5s', shortName: 'ABAB 6.5s', description: 'Most capable' },
  { id: 'abab6.5g-chat', name: 'ABAB 6.5g', shortName: 'ABAB 6.5g', description: 'General purpose' },
  { id: 'abab5.5-chat', name: 'ABAB 5.5', shortName: 'ABAB 5.5', description: 'Fast & efficient' },
];

// DeepSeek models
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', shortName: 'DeepSeek', description: 'General chat model' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', shortName: 'Coder', description: 'Optimized for coding' },
];

// AWS Bedrock models (Claude via Bedrock)
export const BEDROCK_MODELS: ModelDefinition[] = [
  { id: 'us.anthropic.claude-opus-4-5-20251101-v1:0', name: 'Opus 4.5 (Bedrock)', shortName: 'Opus', description: 'Most capable' },
  { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Sonnet 4.5 (Bedrock)', shortName: 'Sonnet', description: 'Balanced' },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Haiku 4.5 (Bedrock)', shortName: 'Haiku', description: 'Fast & efficient' },
];

// Provider to models mapping
export const PROVIDER_MODELS: Record<string, ModelDefinition[]> = {
  anthropic: CLAUDE_MODELS,
  api_key: CLAUDE_MODELS,  // Default Anthropic API key
  claude_oauth: CLAUDE_MODELS,  // Claude OAuth
  glm: GLM_MODELS,
  minimax: MINIMAX_MODELS,
  deepseek: DEEPSEEK_MODELS,
  bedrock: BEDROCK_MODELS,  // AWS Bedrock
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
  custom: 'claude-sonnet-4-5-20250929',
};

/**
 * Get models for a specific provider.
 * @param provider - Provider ID (e.g., 'glm', 'minimax', 'deepseek')
 * @returns Array of model definitions for the provider
 */
export function getModelsForProvider(provider: string | undefined): ModelDefinition[] {
  if (!provider) return CLAUDE_MODELS;
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
