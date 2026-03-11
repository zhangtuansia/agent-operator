import type { Api, Model } from '@mariozechner/pi-ai';

export type PiModelLike = Model<Api>;

export function isBedrockArnModelId(modelId: string): boolean {
  return modelId.startsWith('arn:aws:bedrock:');
}

export function extractBedrockArnRegion(modelId: string): string | null {
  const match = /^arn:aws:bedrock:([^:]+):/.exec(modelId);
  return match?.[1] ?? null;
}

function buildBedrockRuntimeBaseUrl(region: string | null, fallbackBaseUrl?: string): string | undefined {
  if (region) {
    return `https://bedrock-runtime.${region}.amazonaws.com`;
  }
  return fallbackBaseUrl;
}

export function createBedrockInferenceProfileModel(
  modelId: string,
  bedrockModels: PiModelLike[],
  templateModelId?: string,
): PiModelLike | undefined {
  if (!isBedrockArnModelId(modelId)) return undefined;

  const normalizedTemplateId = templateModelId?.replace(/^pi\//, '').trim();
  const template =
    (normalizedTemplateId
      ? bedrockModels.find((model) => model.id === normalizedTemplateId || model.name === normalizedTemplateId)
      : undefined)
    ?? bedrockModels.find((model) => model.id.startsWith('us.anthropic.') || model.id.startsWith('anthropic.'))
    ?? bedrockModels[0];

  if (!template) return undefined;

  const region = extractBedrockArnRegion(modelId);
  const suffix = modelId.includes('application-inference-profile')
    ? 'Inference Profile'
    : 'Custom Bedrock Model';

  return {
    ...template,
    id: modelId,
    name: `${template.name} (${suffix})`,
    baseUrl: buildBedrockRuntimeBaseUrl(region, template.baseUrl),
  };
}
