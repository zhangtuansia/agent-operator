import { atom } from "jotai"

import { parseRouteToNavigationState } from "../../shared/route-parser"
import type { ViewRoute } from "../../shared/routes"

let nextPanelId = 0

function generatePanelId(): string {
  nextPanelId += 1
  return `panel-${nextPanelId}-${Date.now()}`
}

export type PanelType = "session" | "source" | "settings" | "skills" | "automation" | "other"
export type PanelLaneId = "main"
export type OpenIntent = "implicit" | "explicit"

export interface PanelLanePolicy {
  id: PanelLaneId
  order: number
  allowedTypes: PanelType[]
  locked: boolean
  singleton: boolean
}

export const PANEL_LANE_POLICIES: Record<PanelLaneId, PanelLanePolicy> = {
  main: {
    id: "main",
    order: 0,
    allowedTypes: ["session", "source", "settings", "skills", "automation", "other"],
    locked: false,
    singleton: false,
  },
}

export interface PanelStackEntry {
  id: string
  route: ViewRoute
  proportion: number
  panelType: PanelType
  laneId: PanelLaneId
}

export const panelStackAtom = atom<PanelStackEntry[]>([])
export const focusedPanelIdAtom = atom<string | null>(null)

export const panelCountAtom = atom((get) => get(panelStackAtom).length)

export const focusedPanelIndexAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const focusedId = get(focusedPanelIdAtom)
  if (!focusedId) return 0
  const index = stack.findIndex((entry) => entry.id === focusedId)
  return index === -1 ? 0 : index
})

export const focusedPanelRouteAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const index = get(focusedPanelIndexAtom)
  return stack[index]?.route ?? null
})

export function getPanelTypeFromRoute(route: ViewRoute): PanelType {
  const navState = parseRouteToNavigationState(route)
  if (!navState) return "other"

  switch (navState.navigator) {
    case "chats":
      return "session"
    case "sources":
      return "source"
    case "settings":
      return "settings"
    case "skills":
      return "skills"
    case "automations":
      return "automation"
    default:
      return "other"
  }
}

export function getDefaultLaneForType(_type: PanelType): PanelLaneId {
  return "main"
}

function createEntry(route: ViewRoute, proportion: number, id?: string): PanelStackEntry {
  const panelType = getPanelTypeFromRoute(route)
  return {
    id: id ?? generatePanelId(),
    route,
    proportion,
    panelType,
    laneId: getDefaultLaneForType(panelType),
  }
}

function normalizeProportions(stack: PanelStackEntry[]): PanelStackEntry[] {
  if (stack.length === 0) return stack

  const total = stack.reduce((sum, entry) => sum + entry.proportion, 0)
  if (total <= 0) {
    const equal = 1 / stack.length
    return stack.map((entry) => ({ ...entry, proportion: equal }))
  }

  return stack.map((entry) => ({ ...entry, proportion: entry.proportion / total }))
}

export function parseSessionIdFromRoute(route: ViewRoute): string | null {
  const segments = route.split("/")
  const index = segments.indexOf("chat")
  if (index >= 0 && index + 1 < segments.length) {
    return segments[index + 1] ?? null
  }
  return null
}

export const focusedSessionIdAtom = atom((get) => {
  const route = get(focusedPanelRouteAtom)
  if (!route) return null
  return parseSessionIdFromRoute(route)
})

export const pushPanelAtom = atom(
  null,
  (get, set, { route, afterIndex }: { route: ViewRoute; afterIndex?: number; targetLaneId?: PanelLaneId; intent?: OpenIntent }) => {
    const stack = get(panelStackAtom)
    let insertAt = stack.length
    if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < stack.length) {
      insertAt = afterIndex + 1
    }

    const nextStack = [...stack.slice(0, insertAt), createEntry(route, 0), ...stack.slice(insertAt)]
    const normalized = normalizeProportions(nextStack)
    const created = normalized[insertAt]

    set(panelStackAtom, normalized)
    set(focusedPanelIdAtom, created?.id ?? null)
  }
)

export const closePanelAtom = atom(
  null,
  (get, set, id: string) => {
    const stack = get(panelStackAtom)
    const index = stack.findIndex((entry) => entry.id === id)
    if (index === -1) return

    const remaining = [...stack.slice(0, index), ...stack.slice(index + 1)]
    set(panelStackAtom, normalizeProportions(remaining))

    if (get(focusedPanelIdAtom) === id) {
      const nextIndex = Math.min(index, remaining.length - 1)
      set(focusedPanelIdAtom, remaining[nextIndex]?.id ?? null)
    }
  }
)

export const reconcilePanelStackAtom = atom(
  null,
  (get, set, { entries, focusedIndex }: { entries: { route: ViewRoute; proportion: number }[]; focusedIndex?: number }) => {
    if (entries.length === 0) return false

    const current = get(panelStackAtom)
    const usedIds = new Set<string>()
    const requestedFocusIndex = Math.min(focusedIndex ?? 0, entries.length - 1)
    const requestedFocusRoute = entries[requestedFocusIndex]?.route ?? entries[0]?.route ?? null

    const nextStack = entries.map((target, index) => {
      const positional = current[index]
      if (positional && positional.route === target.route && !usedIds.has(positional.id)) {
        usedIds.add(positional.id)
        return { ...createEntry(target.route, target.proportion, positional.id), proportion: target.proportion }
      }

      const byRoute = current.find((entry) => entry.route === target.route && !usedIds.has(entry.id))
      if (byRoute) {
        usedIds.add(byRoute.id)
        return { ...createEntry(target.route, target.proportion, byRoute.id), proportion: target.proportion }
      }

      if (positional && !usedIds.has(positional.id)) {
        usedIds.add(positional.id)
        return { ...createEntry(target.route, target.proportion, positional.id), proportion: target.proportion }
      }

      return createEntry(target.route, target.proportion)
    })

    const normalized = normalizeProportions(nextStack)
    const isSame =
      normalized.length === current.length &&
      normalized.every((entry, index) => {
        const currentEntry = current[index]
        return (
          entry.id === currentEntry?.id &&
          entry.route === currentEntry.route &&
          entry.panelType === currentEntry.panelType &&
          entry.laneId === currentEntry.laneId &&
          Math.abs(entry.proportion - currentEntry.proportion) < 0.001
        )
      })

    const nextFocusId =
      normalized[Math.min(requestedFocusIndex, normalized.length - 1)]?.id ??
      normalized.find((entry) => entry.route === requestedFocusRoute)?.id ??
      null

    if (isSame) {
      if (get(focusedPanelIdAtom) !== nextFocusId) {
        set(focusedPanelIdAtom, nextFocusId)
      }
      return false
    }

    set(panelStackAtom, normalized)
    set(focusedPanelIdAtom, nextFocusId)
    return true
  }
)

export const resizePanelsAtom = atom(
  null,
  (
    get,
    set,
    {
      leftIndex,
      rightIndex,
      leftProportion,
      rightProportion,
    }: {
      leftIndex: number
      rightIndex: number
      leftProportion: number
      rightProportion: number
    }
  ) => {
    const stack = get(panelStackAtom)
    if (leftIndex < 0 || rightIndex >= stack.length) return

    const nextStack = stack.map((entry, index) => {
      if (index === leftIndex) return { ...entry, proportion: leftProportion }
      if (index === rightIndex) return { ...entry, proportion: rightProportion }
      return entry
    })

    set(panelStackAtom, nextStack)
  }
)

export const updateFocusedPanelRouteAtom = atom(
  null,
  (get, set, route: ViewRoute) => {
    const stack = get(panelStackAtom)
    const focusedId = get(focusedPanelIdAtom)
    if (!focusedId) return

    const nextStack = stack.map((entry) => {
      if (entry.id !== focusedId) return entry
      return {
        ...createEntry(route, entry.proportion, entry.id),
        proportion: entry.proportion,
      }
    })

    set(panelStackAtom, nextStack)
  }
)

export const focusNextPanelAtom = atom(null, (get, set) => {
  const stack = get(panelStackAtom)
  const currentIndex = get(focusedPanelIndexAtom)
  if (stack.length <= 1) return
  const nextIndex = Math.min(currentIndex + 1, stack.length - 1)
  set(focusedPanelIdAtom, stack[nextIndex]?.id ?? null)
})

export const focusPrevPanelAtom = atom(null, (get, set) => {
  const stack = get(panelStackAtom)
  const currentIndex = get(focusedPanelIndexAtom)
  if (stack.length <= 1) return
  const nextIndex = Math.max(currentIndex - 1, 0)
  set(focusedPanelIdAtom, stack[nextIndex]?.id ?? null)
})
