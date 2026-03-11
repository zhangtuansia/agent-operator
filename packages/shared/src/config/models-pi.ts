/**
 * Pi Model & Provider Discovery (from SDK)
 *
 * Separated from models.ts because @mariozechner/pi-ai transitively pulls in
 * @aws-sdk/client-bedrock-runtime → @smithy/node-http-handler → Node.js `stream`,
 * which breaks the Vite renderer build (browser context, no Node.js modules).
 *
 * This file should ONLY be imported from:
 *   - Main process code (Electron main, IPC handlers)
 *   - Server-side code (build scripts, CLI)
 *   - Registration calls (e.g., registerPiModelResolver)
 *
 * NEVER import this file from renderer components or from files that the renderer imports.
 */

import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { KnownProvider, Model, Api } from '@mariozechner/pi-ai';
import type { ModelDefinition } from './models.ts';
import { getBedrockModel } from './models.ts';
import type { LlmAuthType, LlmProviderType } from './llm-connections.ts';

const PI_MODEL_PROVIDER_CACHE = new Map<string, string>();

// ============================================
// PI MODEL DISCOVERY
// ============================================

/**
 * Convert a Pi SDK Model to our ModelDefinition format.
 */
function piModelToDefinition(m: Model<Api>): ModelDefinition {
  const lastPart = m.name.split(/[\s-]/).pop() ?? m.name;
  const shortName = m.name.length > 20 ? lastPart : m.name;

  return {
    id: `pi/${m.id}`,
    name: m.name,
    shortName,
    description: `${m.provider} model via Pi backend`,
    contextWindow: m.contextWindow,
  };
}

/**
 * Models to EXCLUDE from the Pi model list.
 * Temporary workaround for models that are broken in the current Pi SDK version.
 * e.g., gemini-1.5-flash fails with "not found for API version v1beta"
 */
const PI_EXCLUDED_MODELS: Set<string> = new Set([
  // Unsupported 1.5 models
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',

  // Unsupported 2.0 models
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]);

/**
 * Get Pi models for a specific auth provider directly from the Pi SDK.
 */
export function getPiModelsForAuthProvider(piAuthProvider: string): ModelDefinition[] {
  try {
    const models = getModels(piAuthProvider as KnownProvider);
    if (models.length > 0) {
      return models
        .filter(m => !PI_EXCLUDED_MODELS.has(m.id))
        .map(piModelToDefinition);
    }
  } catch {
    // Provider not recognized by SDK — fall through
  }
  return [];
}

/**
 * Get all Pi models across all providers from the SDK.
 */
export function getAllPiModels(): ModelDefinition[] {
  const allModels: ModelDefinition[] = [];
  for (const provider of getProviders()) {
    try {
      const models = getModels(provider);
      allModels.push(...models
        .filter(m => !PI_EXCLUDED_MODELS.has(m.id))
        .map(piModelToDefinition)
      );
    } catch {
      // Skip providers that fail
    }
  }
  return allModels;
}

// ============================================
// PI PROVIDER DISCOVERY
// ============================================

/**
 * Display metadata for Pi SDK providers.
 */
const PI_PROVIDER_DISPLAY: Partial<Record<KnownProvider, { label: string; placeholder: string }>> = {
  'anthropic':              { label: 'Anthropic',          placeholder: 'sk-ant-...' },
  'google':                 { label: 'Google AI Studio',   placeholder: 'AIza...' },
  'openai':                 { label: 'OpenAI',             placeholder: 'sk-...' },
  'openrouter':             { label: 'OpenRouter',         placeholder: 'sk-or-...' },
  'groq':                   { label: 'Groq',               placeholder: 'gsk_...' },
  'mistral':                { label: 'Mistral',            placeholder: 'Paste your key here...' },
  'xai':                    { label: 'xAI (Grok)',         placeholder: 'xai-...' },
  'cerebras':               { label: 'Cerebras',           placeholder: 'csk-...' },
  'amazon-bedrock':         { label: 'Amazon Bedrock',     placeholder: 'AKIA...' },
  'azure-openai-responses': { label: 'Azure OpenAI',       placeholder: 'Paste your key here...' },
  'vercel-ai-gateway':      { label: 'Vercel AI Gateway',  placeholder: 'Paste your key here...' },
  'huggingface':            { label: 'Hugging Face',       placeholder: 'hf_...' },
  'zai':                    { label: 'z.ai (GLM)',         placeholder: 'Paste your key here...' },
};

/**
 * Providers to EXCLUDE from the Pi API key dropdown.
 */
const PI_EXCLUDED_PROVIDERS: Set<string> = new Set([
  'github-copilot',
  'openai-codex',
  'google-vertex',
  'google-gemini-cli',
  'google-antigravity',
]);

/** Info for a Pi provider available in the API key flow. */
export interface PiProviderInfo {
  key: string;
  label: string;
  placeholder: string;
}

/** Convert 'vercel-ai-gateway' → 'Vercel Ai Gateway' etc. */
function formatProviderName(key: string): string {
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Get all Pi providers available for API key authentication.
 */
export function getPiApiKeyProviders(): PiProviderInfo[] {
  return getProviders()
    .filter(p => !PI_EXCLUDED_PROVIDERS.has(p))
    .map(p => {
      const display = PI_PROVIDER_DISPLAY[p];
      return {
        key: p,
        label: display?.label ?? formatProviderName(p),
        placeholder: display?.placeholder ?? 'sk-...',
      };
    })
    .sort((a, b) => {
      const priority = ['anthropic', 'google', 'openai'];
      const ai = priority.indexOf(a.key);
      const bi = priority.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * Get the base URL for a Pi SDK provider (e.g. 'anthropic' → 'https://api.anthropic.com').
 */
export function getPiProviderBaseUrl(provider: string): string | undefined {
  try {
    const models = getModels(provider as Parameters<typeof getModels>[0]);
    return models[0]?.baseUrl || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Infer the backing Pi provider from a model ID.
 * Accepts both raw SDK IDs and app-level `pi/...` IDs.
 */
export function inferPiAuthProviderForModel(modelId: string): string | null {
  const normalized = modelId.replace(/^pi\//, '').trim();
  if (!normalized) return null;

  const cached = PI_MODEL_PROVIDER_CACHE.get(normalized);
  if (cached) return cached;

  for (const provider of getProviders()) {
    try {
      const models = getModels(provider);
      if (models.some(model => model.id === normalized)) {
        PI_MODEL_PROVIDER_CACHE.set(normalized, provider);
        return provider;
      }
    } catch {
      // Ignore provider discovery errors and continue scanning
    }
  }

  return null;
}

/**
 * Map the app's LLM connection provider type to a Pi auth provider.
 * Prefer this over model inference when a concrete connection type is known.
 */
export function getPiAuthProviderForConnectionProvider(
  providerType?: LlmProviderType,
  authType?: LlmAuthType,
): string | null {
  switch (providerType) {
    case 'anthropic':
    case 'anthropic_compat':
      return 'anthropic';
    case 'openai':
    case 'openai_compat':
      return authType === 'oauth' ? 'openai-codex' : 'openai';
    case 'bedrock':
      return 'amazon-bedrock';
    case 'vertex':
      return 'google';
    case 'copilot':
      return 'github-copilot';
    case 'pi':
    default:
      return null;
  }
}

export interface PiRuntimeModelResolution {
  model: string;
  bedrockTemplateModel?: string;
}

/**
 * Resolve the effective runtime model for Pi.
 *
 * Bedrock is special: the app may expose a native Bedrock model ID in UI/state,
 * while the actual working runtime model is an Application Inference Profile ARN
 * carried via ANTHROPIC_MODEL. Pi needs that effective model ID, but also needs
 * the original model ID so the subprocess can clone a compatible Bedrock model
 * template.
 */
export function resolvePiRuntimeModel(
  modelId: string,
  providerType?: LlmProviderType,
): PiRuntimeModelResolution {
  if (providerType !== 'bedrock') {
    return { model: modelId };
  }

  const bareModel = modelId.replace(/^pi\//, '').trim();
  if (!bareModel) {
    return { model: modelId };
  }

  return {
    model: getBedrockModel(bareModel),
    bedrockTemplateModel: bareModel,
  };
}
