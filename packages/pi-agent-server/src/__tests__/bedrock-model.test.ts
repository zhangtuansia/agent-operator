import { describe, expect, it } from 'bun:test';

import {
  createBedrockInferenceProfileModel,
  extractBedrockArnRegion,
  isBedrockArnModelId,
} from '../bedrock-model.ts';

describe('bedrock-model helpers', () => {
  it('detects Bedrock ARN model ids', () => {
    expect(isBedrockArnModelId('arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test')).toBe(true);
    expect(isBedrockArnModelId('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe(false);
  });

  it('extracts region from Bedrock ARNs', () => {
    expect(extractBedrockArnRegion('arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test')).toBe('us-west-2');
    expect(extractBedrockArnRegion('not-an-arn')).toBeNull();
  });

  it('clones a compatible Bedrock model for an inference profile ARN', () => {
    const model = createBedrockInferenceProfileModel(
      'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test-profile',
      [
        {
          id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
          name: 'Claude Sonnet 4.5',
          provider: 'amazon-bedrock',
          api: 'bedrock-converse-stream',
          baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
          reasoning: true,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ] as any,
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    );

    expect(model).toBeDefined();
    expect(model?.id).toBe('arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/test-profile');
    expect(model?.provider).toBe('amazon-bedrock');
    expect(model?.baseUrl).toBe('https://bedrock-runtime.us-west-2.amazonaws.com');
    expect(model?.name).toContain('Inference Profile');
  });
});
