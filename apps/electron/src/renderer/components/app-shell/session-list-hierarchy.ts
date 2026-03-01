import type { SessionMeta } from '@/atoms/sessions'

export type ChildVisibilityMode = 'all' | 'candidate-only'

export interface SessionBlock {
  parent: SessionMeta
  children: SessionMeta[]
}

export interface SessionListRow {
  item: SessionMeta
  depth: 0 | 1
  parentId?: string
  childCount: number
  isParentExpanded: boolean
  isFirstChild: boolean
  isLastChild: boolean
}

export interface RowBuildResult {
  rows: SessionListRow[]
  visibleChildIdsByParent: Map<string, string[]>
}

export interface BuildSessionBlocksOptions {
  orderedItems: SessionMeta[]
  sessionById: Map<string, SessionMeta>
  childSessionsByParent: Map<string, SessionMeta[]>
  childVisibility: ChildVisibilityMode
}

export interface BuildSessionBlocksResult {
  blocks: SessionBlock[]
  /** Parents that appeared only via child matches (parent injected as context) */
  contextParentIds: Set<string>
  /** Parents that have at least one child present in the ordered candidate list */
  parentIdsWithCandidateChildren: Set<string>
}

interface InternalBlock {
  parent: SessionMeta
  candidateChildren: SessionMeta[]
  contextParent: boolean
}

function dedupeSessions(items: SessionMeta[]): SessionMeta[] {
  const seen = new Set<string>()
  const result: SessionMeta[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function resolveCandidateChildren(
  parentId: string,
  candidateChildren: SessionMeta[],
  childSessionsByParent: Map<string, SessionMeta[]>
): SessionMeta[] {
  if (candidateChildren.length === 0) return []

  const orderedChildren = childSessionsByParent.get(parentId) ?? []
  const candidateIds = new Set(candidateChildren.map(child => child.id))
  const orderedMatches = orderedChildren.filter(child => candidateIds.has(child.id))

  const orderedMatchIds = new Set(orderedMatches.map(child => child.id))
  const extras = candidateChildren.filter(child => !orderedMatchIds.has(child.id))

  return [...orderedMatches, ...extras]
}

/**
 * Build parent/child blocks from a candidate list. One-level hierarchy only.
 *
 * - Injects missing parents when a child appears without its parent.
 * - Preserves candidate ordering for top-level block appearance.
 * - Supports two child-visibility modes:
 *   - all: parent uses full children list from childSessionsByParent
 *   - candidate-only: parent only includes child sessions present in orderedItems
 */
export function buildSessionBlocks({
  orderedItems,
  sessionById,
  childSessionsByParent,
  childVisibility,
}: BuildSessionBlocksOptions): BuildSessionBlocksResult {
  const candidateIds = new Set(orderedItems.map(item => item.id))
  const blockByParentId = new Map<string, InternalBlock>()
  const blocks: InternalBlock[] = []

  const contextParentIds = new Set<string>()
  const parentIdsWithCandidateChildren = new Set<string>()

  const ensureBlock = (parent: SessionMeta, contextParent: boolean): InternalBlock => {
    const existing = blockByParentId.get(parent.id)
    if (existing) {
      if (!contextParent) {
        existing.contextParent = false
      }
      return existing
    }

    const block: InternalBlock = {
      parent,
      candidateChildren: [],
      contextParent,
    }
    blockByParentId.set(parent.id, block)
    blocks.push(block)

    if (contextParent) {
      contextParentIds.add(parent.id)
    }

    return block
  }

  for (const candidate of orderedItems) {
    if (!candidate.parentSessionId) {
      ensureBlock(candidate, false)
      continue
    }

    const parent = sessionById.get(candidate.parentSessionId)
    if (!parent) {
      // Missing parent in the in-memory store: render child as standalone root row
      ensureBlock(candidate, false)
      continue
    }

    const block = ensureBlock(parent, !candidateIds.has(parent.id))
    block.candidateChildren.push(candidate)
    parentIdsWithCandidateChildren.add(parent.id)
  }

  const resolvedBlocks: SessionBlock[] = blocks.map((block) => {
    const children = childVisibility === 'all'
      ? dedupeSessions(childSessionsByParent.get(block.parent.id) ?? [])
      : dedupeSessions(resolveCandidateChildren(block.parent.id, block.candidateChildren, childSessionsByParent))

    return {
      parent: block.parent,
      children,
    }
  })

  return {
    blocks: resolvedBlocks,
    contextParentIds,
    parentIdsWithCandidateChildren,
  }
}

export interface GroupSearchBlocksResult {
  matching: SessionBlock[]
  other: SessionBlock[]
}

/**
 * Assign full parent/child blocks into search groups.
 * Matching group wins: if any row in the block is matching, the whole block is matching.
 */
export function groupSearchBlocks(
  blocks: SessionBlock[],
  matchingSessionIds: Set<string>
): GroupSearchBlocksResult {
  const matching: SessionBlock[] = []
  const other: SessionBlock[] = []

  for (const block of blocks) {
    const hasMatchingMember = matchingSessionIds.has(block.parent.id)
      || block.children.some(child => matchingSessionIds.has(child.id))

    if (hasMatchingMember) {
      matching.push(block)
    } else {
      other.push(block)
    }
  }

  return { matching, other }
}

export interface FlattenSessionBlocksOptions {
  blocks: SessionBlock[]
  expandedParentIds: Set<string>
  forcedExpandedParentIds?: Set<string>
}

/**
 * Flatten parent/child blocks into render rows based on expanded state.
 */
export function flattenSessionBlocks({
  blocks,
  expandedParentIds,
  forcedExpandedParentIds,
}: FlattenSessionBlocksOptions): RowBuildResult {
  const rows: SessionListRow[] = []
  const visibleChildIdsByParent = new Map<string, string[]>()

  for (const block of blocks) {
    const childCount = block.children.length
    const isParentExpanded = childCount > 0 && (
      expandedParentIds.has(block.parent.id)
      || forcedExpandedParentIds?.has(block.parent.id)
      || false
    )

    rows.push({
      item: block.parent,
      depth: 0,
      childCount,
      isParentExpanded,
      isFirstChild: false,
      isLastChild: false,
    })

    if (!isParentExpanded) continue

    const visibleChildIds: string[] = []
    block.children.forEach((child, index) => {
      visibleChildIds.push(child.id)
      rows.push({
        item: child,
        depth: 1,
        parentId: block.parent.id,
        childCount: 0,
        isParentExpanded: false,
        isFirstChild: index === 0,
        isLastChild: index === block.children.length - 1,
      })
    })

    visibleChildIdsByParent.set(block.parent.id, visibleChildIds)
  }

  return {
    rows,
    visibleChildIdsByParent,
  }
}
