import { atom } from "jotai"

import type { BrowserInstanceInfo } from "../../shared/types"

export const browserInstancesMapAtom = atom<Map<string, BrowserInstanceInfo>>(new Map())

export const browserInstancesAtom = atom<BrowserInstanceInfo[]>((get) =>
  Array.from(get(browserInstancesMapAtom).values())
)

export const activeBrowserInstanceIdAtom = atom<string | null>(null)

export const removedBrowserInstanceIdsAtom = atom<Set<string>>(new Set())

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
