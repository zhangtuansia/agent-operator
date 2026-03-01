import { describe, expect, test } from 'bun:test'

import type { SessionMeta } from '@/atoms/sessions'
import {
  buildSessionBlocks,
  flattenSessionBlocks,
  groupSearchBlocks,
} from './session-list-hierarchy'

function makeSession(id: string, overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id,
    workspaceId: 'workspace-1',
    lastMessageAt: 1,
    ...overrides,
  }
}

describe('session-list-hierarchy', () => {
  test('injects context parent for child-only candidate', () => {
    const parent = makeSession('p')
    const child = makeSession('c', { parentSessionId: 'p' })

    const result = buildSessionBlocks({
      orderedItems: [child],
      sessionById: new Map([
        [parent.id, parent],
        [child.id, child],
      ]),
      childSessionsByParent: new Map([[parent.id, [child]]]),
      childVisibility: 'candidate-only',
    })

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].parent.id).toBe('p')
    expect(result.blocks[0].children.map(c => c.id)).toEqual(['c'])
    expect(result.contextParentIds.has('p')).toBe(true)
    expect(result.parentIdsWithCandidateChildren.has('p')).toBe(true)
  })

  test('flattens blocks with child metadata for expanded parents', () => {
    const parent = makeSession('p')
    const child1 = makeSession('c1', { parentSessionId: 'p' })
    const child2 = makeSession('c2', { parentSessionId: 'p' })

    const collapsed = flattenSessionBlocks({
      blocks: [{ parent, children: [child1, child2] }],
      expandedParentIds: new Set(),
    })

    expect(collapsed.rows).toHaveLength(1)
    expect(collapsed.rows[0].childCount).toBe(2)
    expect(collapsed.rows[0].isParentExpanded).toBe(false)

    const expanded = flattenSessionBlocks({
      blocks: [{ parent, children: [child1, child2] }],
      expandedParentIds: new Set(['p']),
    })

    expect(expanded.rows).toHaveLength(3)
    expect(expanded.rows[1].depth).toBe(1)
    expect(expanded.rows[1].isFirstChild).toBe(true)
    expect(expanded.rows[1].isLastChild).toBe(false)
    expect(expanded.rows[2].depth).toBe(1)
    expect(expanded.rows[2].isFirstChild).toBe(false)
    expect(expanded.rows[2].isLastChild).toBe(true)
  })

  test('keeps parent-child block in matching search group when child matches', () => {
    const parent = makeSession('p')
    const child = makeSession('c', { parentSessionId: 'p' })

    const groups = groupSearchBlocks(
      [{ parent, children: [child] }],
      new Set(['c'])
    )

    expect(groups.matching).toHaveLength(1)
    expect(groups.other).toHaveLength(0)
    expect(groups.matching[0].parent.id).toBe('p')
  })

  test('does not duplicate parent block when child appears before parent candidate', () => {
    const parent = makeSession('p')
    const child = makeSession('c', { parentSessionId: 'p' })

    const result = buildSessionBlocks({
      orderedItems: [child, parent],
      sessionById: new Map([
        [parent.id, parent],
        [child.id, child],
      ]),
      childSessionsByParent: new Map([[parent.id, [child]]]),
      childVisibility: 'candidate-only',
    })

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].parent.id).toBe('p')
    expect(result.blocks[0].children.map(c => c.id)).toEqual(['c'])
  })

  test('renders child as standalone when parent is missing', () => {
    const child = makeSession('c', { parentSessionId: 'missing' })

    const result = buildSessionBlocks({
      orderedItems: [child],
      sessionById: new Map([[child.id, child]]),
      childSessionsByParent: new Map(),
      childVisibility: 'all',
    })

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].parent.id).toBe('c')
    expect(result.blocks[0].children).toHaveLength(0)
  })
})
