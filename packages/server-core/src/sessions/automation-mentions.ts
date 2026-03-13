import type { ContentBadge } from '@agent-operator/core/types'
import { AGENTS_PLUGIN_NAME, type LoadedSkill } from '@agent-operator/shared/skills'
import type { LoadedSource } from '@agent-operator/shared/sources'

export interface ResolvedAutomationMentions {
  workspaceId: string
  sourceSlugs: string[]
  skillSlugs: string[]
  sources: LoadedSource[]
  skills: LoadedSkill[]
}

export interface NormalizedAutomationPrompt {
  prompt: string
  badges?: ContentBadge[]
}

export function normalizeAutomationPromptMentions(
  prompt: string,
  resolved?: ResolvedAutomationMentions,
): NormalizedAutomationPrompt {
  if (!resolved || (resolved.sourceSlugs.length === 0 && resolved.skillSlugs.length === 0)) {
    return { prompt }
  }

  const sourceSlugSet = new Set(resolved.sourceSlugs)
  const skillSlugSet = new Set(resolved.skillSlugs)
  const sourceLabels = new Map(resolved.sources.map(source => [source.config.slug, source.config.name]))
  const skillLabels = new Map(resolved.skills.map(skill => [skill.slug, skill.metadata.name || skill.slug]))
  const skillRawTextBySlug = new Map(
    resolved.skills.map(skill => [
      skill.slug,
      skill.source === 'workspace'
        ? `[skill:${resolved.workspaceId}:${skill.slug}]`
        : `[skill:${AGENTS_PLUGIN_NAME}:${skill.slug}]`,
    ]),
  )
  const badges: ContentBadge[] = []
  const parts: string[] = []
  const mentionPattern = /(^|[^\w-])@([\w-]+)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionPattern.exec(prompt)) !== null) {
    const [fullMatch, prefix, slug] = match
    const isSource = sourceSlugSet.has(slug)
    const isSkill = skillSlugSet.has(slug)

    if (!isSource && !isSkill) {
      continue
    }

    const matchStart = match.index
    const mentionStart = matchStart + prefix.length
    parts.push(prompt.slice(lastIndex, mentionStart))

    const rawText = isSource
      ? `[source:${slug}]`
      : (skillRawTextBySlug.get(slug) || `[skill:${resolved.workspaceId}:${slug}]`)
    const start = parts.join('').length
    parts.push(rawText)

    badges.push({
      type: isSource ? 'source' : 'skill',
      label: isSource ? (sourceLabels.get(slug) || slug) : (skillLabels.get(slug) || slug),
      rawText,
      start,
      end: start + rawText.length,
    })

    lastIndex = mentionStart + (fullMatch.length - prefix.length)
  }

  if (badges.length === 0) {
    return { prompt }
  }

  parts.push(prompt.slice(lastIndex))
  return {
    prompt: parts.join(''),
    badges,
  }
}
