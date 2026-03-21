import { atom } from "jotai"

import type { BrowserInstanceInfo } from "../../shared/types"

export const browserInstancesMapAtom = atom<Map<string, BrowserInstanceInfo>>(new Map())

export const browserInstancesAtom = atom<BrowserInstanceInfo[]>((get) =>
  Array.from(get(browserInstancesMapAtom).values())
)

export const activeBrowserInstanceIdAtom = atom<string | null>(null)

export const removedBrowserInstanceIdsAtom = atom<Set<string>>(new Set())

/** Max entries before the removed-IDs set is trimmed to half its cap. */
const REMOVED_IDS_CAP = 100

export const updateBrowserInstanceAtom = atom(
  null,
  (get, set, info: BrowserInstanceInfo) => {
    if (get(removedBrowserInstanceIdsAtom).has(info.id)) return

    const next = new Map(get(browserInstancesMapAtom))
    next.set(info.id, info)
    set(browserInstancesMapAtom, next)
  }
)

export const removeBrowserInstanceAtom = atom(
  null,
  (get, set, id: string) => {
    const next = new Map(get(browserInstancesMapAtom))
    next.delete(id)
    set(browserInstancesMapAtom, next)

    const removed = new Set(get(removedBrowserInstanceIdsAtom))
    removed.add(id)

    // Prevent unbounded growth: when the set exceeds the cap, keep only the
    // most recent half.  Set iteration order is insertion order, so we drop
    // the oldest entries from the front.
    if (removed.size > REMOVED_IDS_CAP) {
      const keep = Math.floor(REMOVED_IDS_CAP / 2)
      const entries = Array.from(removed)
      removed.clear()
      for (let i = entries.length - keep; i < entries.length; i++) {
        removed.add(entries[i])
      }
    }

    set(removedBrowserInstanceIdsAtom, removed)
  }
)

export const setBrowserInstancesAtom = atom(
  null,
  (get, set, instances: BrowserInstanceInfo[]) => {
    const next = new Map<string, BrowserInstanceInfo>()
    for (const instance of instances) {
      next.set(instance.id, instance)
    }
    set(browserInstancesMapAtom, next)

    const removed = new Set(get(removedBrowserInstanceIdsAtom))
    for (const instance of instances) {
      removed.delete(instance.id)
    }
    set(removedBrowserInstanceIdsAtom, removed)
  }
)
