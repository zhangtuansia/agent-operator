import { describe, expect, it } from 'bun:test'
import {
  CLI_DOMAIN_POLICIES,
  DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES,
  DAZI_CLI_OWNED_BASH_GUARD_PATH_SCOPES,
  getDaziCliReadOnlyBashPatterns,
} from '../cli-domains.ts'

describe('cli-domains', () => {
  it('exposes policies for all supported namespaces', () => {
    expect(Object.keys(CLI_DOMAIN_POLICIES).sort()).toEqual([
      'automation',
      'label',
      'permission',
      'skill',
      'source',
      'theme',
    ])
  })

  it('derives workspace scopes and bash guard scopes without duplicates', () => {
    expect(DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES).toContain('labels/**')
    expect(DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES).toContain('automations.json')
    expect(DAZI_CLI_OWNED_BASH_GUARD_PATH_SCOPES).toContain('permissions.json')
    expect(new Set(DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES).size).toBe(DAZI_CLI_OWNED_WORKSPACE_PATH_SCOPES.length)
  })

  it('generates read-only bash patterns for dazi-cli and cowork-cli', () => {
    const rules = getDaziCliReadOnlyBashPatterns()
    const patterns = rules.map(rule => rule.pattern)

    expect(patterns).toContain('^(?:dazi-cli|cowork-cli)\\s+automation\\s+(list|get|validate|history|last-executed|test|lint)\\b')
    expect(patterns).toContain('^(?:dazi-cli|cowork-cli)\\s+source\\s+(list|get|validate|test|auth-help)\\b')
    expect(patterns).toContain('^(?:dazi-cli|cowork-cli)\\s*$')
  })
})
