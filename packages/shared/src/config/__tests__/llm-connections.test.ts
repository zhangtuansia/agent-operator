import { describe, expect, it } from 'bun:test'
import {
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  isValidProviderAuthCombination,
  migrateLlmConnection,
  resolveEffectiveConnectionSlug,
  type LlmConnectionWithStatus,
} from '../llm-connections.ts'

describe('llm-connections defaults', () => {
  it('returns codex defaults for openai provider', () => {
    const models = getDefaultModelsForConnection('openai')
    const ids = models.map(model => typeof model === 'string' ? model : model.id)
    expect(ids[0]).toBe('gpt-5.3-codex')
    expect(getDefaultModelForConnection('openai')).toBe('gpt-5.3-codex')
  })

  it('returns provider-prefixed defaults for openai_compat', () => {
    const models = getDefaultModelsForConnection('openai_compat')
    const ids = models.map(model => typeof model === 'string' ? model : model.id)
    expect(ids[0]).toBe('openai/gpt-5.3-codex')
  })
})

describe('llm-connections provider/auth validation', () => {
  it('accepts supported combinations', () => {
    expect(isValidProviderAuthCombination('anthropic', 'oauth')).toBe(true)
    expect(isValidProviderAuthCombination('openai', 'api_key')).toBe(true)
    expect(isValidProviderAuthCombination('bedrock', 'environment')).toBe(true)
  })

  it('rejects invalid combinations', () => {
    expect(isValidProviderAuthCombination('anthropic', 'none')).toBe(false)
    expect(isValidProviderAuthCombination('openai_compat', 'oauth')).toBe(false)
    expect(isValidProviderAuthCombination('bedrock', 'oauth')).toBe(false)
  })
})

describe('llm-connections fallback resolution', () => {
  const connections: Pick<LlmConnectionWithStatus, 'slug' | 'isDefault'>[] = [
    { slug: 'a', isDefault: false },
    { slug: 'b', isDefault: true },
    { slug: 'c', isDefault: false },
  ]

  it('prefers session connection, then workspace, then global default, then first', () => {
    expect(resolveEffectiveConnectionSlug('c', 'a', connections)).toBe('c')
    expect(resolveEffectiveConnectionSlug(undefined, 'a', connections)).toBe('a')
    expect(resolveEffectiveConnectionSlug(undefined, undefined, connections)).toBe('b')
    expect(resolveEffectiveConnectionSlug(undefined, undefined, [{ slug: 'x' }])).toBe('x')
  })
})

describe('legacy migration helpers', () => {
  it('maps legacy openai-compat connection correctly', () => {
    const migrated = migrateLlmConnection({
      slug: 'legacy-openai',
      name: 'Legacy OpenAI',
      type: 'openai-compat',
      baseUrl: 'https://example.com/v1',
      authType: 'api_key',
      createdAt: 123,
    })

    expect(migrated.providerType).toBe('openai_compat')
    expect(migrated.authType).toBe('api_key_with_endpoint')
    expect(migrated.baseUrl).toBe('https://example.com/v1')
  })
})
