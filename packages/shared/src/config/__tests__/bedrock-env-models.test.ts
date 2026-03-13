import { afterEach, describe, expect, it } from 'bun:test';

import {
  getBedrockModel,
  getEffectiveBedrockDefaultModel,
  getEffectiveBedrockModels,
  getPreferredBedrockPrimaryModelFromEnv,
  getPreferredBedrockSmallFastModelFromEnv,
} from '../models.ts';
import {
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  getModelsForProviderType,
} from '../llm-connections.ts';

const ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const originalValue = ORIGINAL_ENV[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

function setBedrockEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key as (typeof ENV_KEYS)[number]] = value;
  }
}

describe('Bedrock env-configured models', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('derives the available Bedrock model list from environment variables', () => {
    setBedrockEnv({
      ANTHROPIC_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
      ANTHROPIC_SMALL_FAST_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    });

    expect(getEffectiveBedrockModels().map((model) => model.id)).toEqual([
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    ]);
    expect(getEffectiveBedrockDefaultModel()).toBe(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
    );
    expect(getPreferredBedrockPrimaryModelFromEnv()).toBe(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
    );
    expect(getPreferredBedrockSmallFastModelFromEnv()).toBe(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    );
  });

  it('deduplicates repeated env-configured Bedrock models', () => {
    setBedrockEnv({
      ANTHROPIC_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/shared-model',
      ANTHROPIC_DEFAULT_SONNET_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/shared-model',
    });

    expect(getEffectiveBedrockModels().map((model) => model.id)).toEqual([
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/shared-model',
    ]);
  });

  it('prefers the app-selected Bedrock model over the env default', () => {
    setBedrockEnv({
      ANTHROPIC_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/default-model',
    });

    expect(
      getBedrockModel(
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/selected-model',
      ),
    ).toBe(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/selected-model',
    );
  });

  it('exposes env-configured Bedrock models through llm connection defaults', () => {
    setBedrockEnv({
      ANTHROPIC_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
      ANTHROPIC_SMALL_FAST_MODEL:
        'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    });

    expect(getModelsForProviderType('bedrock').map((model) => model.id)).toEqual([
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    ]);
    expect(getDefaultModelsForConnection('bedrock').map((model) => (
      typeof model === 'string' ? model : model.id
    ))).toEqual([
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/small-fast-model',
    ]);
    expect(getDefaultModelForConnection('bedrock')).toBe(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/primary-model',
    );
  });
});
