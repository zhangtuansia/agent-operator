import { afterEach, describe, expect, it } from 'bun:test';

import {
  getPiAuthProviderForConnectionProvider,
  inferPiAuthProviderForModel,
  resolvePiRuntimeModel,
} from '../models-pi.ts';

describe('inferPiAuthProviderForModel', () => {
  it('infers the provider for the default Pi Claude model', () => {
    expect(inferPiAuthProviderForModel('pi/claude-sonnet-4-5-20250929')).toBe('anthropic');
  });

  it('returns null for unknown models', () => {
    expect(inferPiAuthProviderForModel('pi/not-a-real-model')).toBeNull();
  });
});

describe('getPiAuthProviderForConnectionProvider', () => {
  it('maps openai connections to the openai Pi provider', () => {
    expect(getPiAuthProviderForConnectionProvider('openai')).toBe('openai');
  });

  it('maps openai oauth connections to the openai-codex Pi provider', () => {
    expect(getPiAuthProviderForConnectionProvider('openai', 'oauth')).toBe('openai-codex');
  });

  it('maps bedrock connections to the amazon-bedrock Pi provider', () => {
    expect(getPiAuthProviderForConnectionProvider('bedrock')).toBe('amazon-bedrock');
  });

  it('maps vertex connections to the google Pi provider', () => {
    expect(getPiAuthProviderForConnectionProvider('vertex')).toBe('google');
  });
});

describe('resolvePiRuntimeModel', () => {
  const originalAnthropicModel = process.env.ANTHROPIC_MODEL;

  afterEach(() => {
    if (originalAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = originalAnthropicModel;
    }
  });

  it('passes through non-bedrock models unchanged', () => {
    expect(resolvePiRuntimeModel('pi/gpt-5.3-codex', 'openai')).toEqual({
      model: 'pi/gpt-5.3-codex',
    });
  });

  it('resolves bedrock models to the effective runtime ARN and keeps the template id', () => {
    process.env.ANTHROPIC_MODEL = 'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test-profile';

    expect(resolvePiRuntimeModel('pi/us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'bedrock')).toEqual({
      model: 'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test-profile',
      bedrockTemplateModel: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    });
  });
});
