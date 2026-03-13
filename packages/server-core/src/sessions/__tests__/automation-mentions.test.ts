import { describe, expect, it } from 'bun:test'
import { AGENTS_PLUGIN_NAME, type LoadedSkill } from '@agent-operator/shared/skills'
import type { LoadedSource } from '@agent-operator/shared/sources'
import { normalizeAutomationPromptMentions, type ResolvedAutomationMentions } from '../automation-mentions'

function makeSource(slug: string, name = slug): LoadedSource {
  return {
    type: 'api',
    config: {
      slug,
      name,
      connection: {
        transport: 'api',
      },
    },
  } as LoadedSource
}

function makeSkill(
  slug: string,
  name = slug,
  source: LoadedSkill['source'] = 'workspace',
): LoadedSkill {
  return {
    slug,
    path: `/tmp/${slug}/SKILL.md`,
    content: '',
    metadata: {
      name,
      description: '',
      globs: [],
    },
    source,
  } as LoadedSkill
}

describe('normalizeAutomationPromptMentions', () => {
  it('converts resolved source and skill mentions to bracket syntax with badges', () => {
    const resolved: ResolvedAutomationMentions = {
      workspaceId: 'ws-123',
      sourceSlugs: ['linear'],
      skillSlugs: ['youtube-feed'],
      sources: [makeSource('linear', 'Linear')],
      skills: [makeSkill('youtube-feed', 'YouTube Feed')],
    }

    const result = normalizeAutomationPromptMentions(
      'Read @youtube-feed and sync issues to @linear.',
      resolved,
    )

    expect(result.prompt).toBe('Read [skill:ws-123:youtube-feed] and sync issues to [source:linear].')
    expect(result.badges).toEqual([
      {
        type: 'skill',
        label: 'YouTube Feed',
        rawText: '[skill:ws-123:youtube-feed]',
        start: 5,
        end: 32,
      },
      {
        type: 'source',
        label: 'Linear',
        rawText: '[source:linear]',
        start: 52,
        end: 67,
      },
    ])
  })

  it('does not rewrite email addresses or unknown mentions', () => {
    const resolved: ResolvedAutomationMentions = {
      workspaceId: 'ws-123',
      sourceSlugs: ['linear'],
      skillSlugs: [],
      sources: [makeSource('linear', 'Linear')],
      skills: [],
    }

    const result = normalizeAutomationPromptMentions(
      'Email me at test@example.com and then check @unknown before @linear',
      resolved,
    )

    expect(result.prompt).toBe('Email me at test@example.com and then check @unknown before [source:linear]')
    expect(result.badges).toEqual([
      {
        type: 'source',
        label: 'Linear',
        rawText: '[source:linear]',
        start: 60,
        end: 75,
      },
    ])
  })

  it('uses the shared .agents namespace for non-workspace skills', () => {
    const resolved: ResolvedAutomationMentions = {
      workspaceId: 'ws-123',
      sourceSlugs: [],
      skillSlugs: ['daily-brief'],
      sources: [],
      skills: [makeSkill('daily-brief', 'Daily Brief', 'global')],
    }

    const result = normalizeAutomationPromptMentions('Run @daily-brief now.', resolved)

    expect(result.prompt).toBe(`Run [skill:${AGENTS_PLUGIN_NAME}:daily-brief] now.`)
    expect(result.badges).toEqual([
      {
        type: 'skill',
        label: 'Daily Brief',
        rawText: `[skill:${AGENTS_PLUGIN_NAME}:daily-brief]`,
        start: 4,
        end: 31,
      },
    ])
  })
})
