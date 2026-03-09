import * as React from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Globe, Monitor, PanelRightOpen, XCircle } from "lucide-react"
import { Spinner } from "@agent-operator/ui"

import {
  DropdownMenu,
  DropdownMenuSub,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
  StyledDropdownMenuSubContent,
  StyledDropdownMenuSubTrigger,
} from "@/components/ui/styled-dropdown"
import { useTranslation } from "@/i18n"
import { navigate, routes } from "@/lib/navigate"

import {
  activeBrowserInstanceIdAtom,
  browserInstancesAtom,
  removeBrowserInstanceAtom,
  setBrowserInstancesAtom,
  updateBrowserInstanceAtom,
} from "@/atoms/browser-pane"

import type { BrowserInstanceInfo, BrowserPaneAPI } from "../../../shared/types"
import { BrowserTabBadge } from "./BrowserTabBadge"
import { getHostname } from "./utils"

const DEFAULT_MAX_VISIBLE_BADGES = 3

interface BrowserTabStripProps {
  activeSessionId?: string | null
  instancesOverride?: BrowserInstanceInfo[]
  maxVisibleBadges?: number
}

function getBrowserPaneApi(): BrowserPaneAPI | undefined {
  return window.electronAPI.browserPane
}

export function BrowserTabStrip({
  activeSessionId,
  instancesOverride,
  maxVisibleBadges = DEFAULT_MAX_VISIBLE_BADGES,
}: BrowserTabStripProps) {
  const { t } = useTranslation()
  const instances = useAtomValue(browserInstancesAtom)
  const setInstances = useSetAtom(setBrowserInstancesAtom)
  const updateInstance = useSetAtom(updateBrowserInstanceAtom)
  const removeInstance = useSetAtom(removeBrowserInstanceAtom)
  const [activeInstanceId, setActiveInstanceId] = useAtom(activeBrowserInstanceIdAtom)
  const effectiveInstances = instancesOverride ?? instances
  const instancesRef = React.useRef(effectiveInstances)
  const removeReconcileTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const orderedInstances = React.useMemo(() => {
    const items = [...effectiveInstances]

    if (activeSessionId) {
      items.sort((a, b) => {
        const aInActiveSession = a.boundSessionId === activeSessionId ? 0 : 1
        const bInActiveSession = b.boundSessionId === activeSessionId ? 0 : 1
        if (aInActiveSession !== bInActiveSession) return aInActiveSession - bInActiveSession
        return a.id.localeCompare(b.id)
      })
    } else {
      items.sort((a, b) => a.id.localeCompare(b.id))
    }

    return items
  }, [activeSessionId, effectiveInstances])

  React.useEffect(() => {
    instancesRef.current = effectiveInstances
  }, [effectiveInstances])

  React.useEffect(() => {
    if (instancesOverride) return

    const browserPaneApi = getBrowserPaneApi()
    if (!browserPaneApi) {
      setInstances([])
      setActiveInstanceId(null)
      return
    }

    void browserPaneApi
      .list()
      .then((items) => {
        setInstances(items)
        setActiveInstanceId(items[0]?.id ?? null)
      })
      .catch((error) => {
        console.warn("[BrowserTabStrip] Failed to list browser panes:", error)
        setInstances([])
        setActiveInstanceId(null)
      })
  }, [instancesOverride, setActiveInstanceId, setInstances])

  React.useEffect(() => {
    if (instancesOverride) return

    const browserPaneApi = getBrowserPaneApi()
    if (!browserPaneApi) return

    const cleanupState = browserPaneApi.onStateChanged((info) => {
      updateInstance(info)
    })

    const cleanupRemoved = browserPaneApi.onRemoved((id) => {
      removeInstance(id)
      setActiveInstanceId((prev) => {
        if (prev !== id) return prev
        const remaining = instancesRef.current.filter((item) => item.id !== id)
        return remaining[0]?.id ?? null
      })

      if (removeReconcileTimerRef.current) {
        clearTimeout(removeReconcileTimerRef.current)
      }

      removeReconcileTimerRef.current = setTimeout(() => {
        removeReconcileTimerRef.current = null
        void browserPaneApi
          .list()
          .then((items) => {
            setInstances(items)
            setActiveInstanceId((prev) => {
              if (!prev) return items[0]?.id ?? null
              return items.some((item) => item.id === prev) ? prev : (items[0]?.id ?? null)
            })
          })
          .catch((error) => {
            console.warn("[BrowserTabStrip] Reconcile list failed after remove:", error)
          })
      }, 75)
    })

    const cleanupInteracted = browserPaneApi.onInteracted((id) => {
      setActiveInstanceId(id)
    })

    return () => {
      cleanupState()
      cleanupRemoved()
      cleanupInteracted()
      if (removeReconcileTimerRef.current) {
        clearTimeout(removeReconcileTimerRef.current)
        removeReconcileTimerRef.current = null
      }
    }
  }, [instancesOverride, removeInstance, setActiveInstanceId, setInstances, updateInstance])

  React.useEffect(() => {
    if (orderedInstances.length === 0) {
      setActiveInstanceId(null)
      return
    }

    if (!activeInstanceId || !orderedInstances.some((item) => item.id === activeInstanceId)) {
      setActiveInstanceId(orderedInstances[0].id)
    }
  }, [activeInstanceId, orderedInstances, setActiveInstanceId])

  const focusBrowserWindow = React.useCallback(
    (instance: BrowserInstanceInfo) => {
      setActiveInstanceId(instance.id)
      if (instancesOverride) return

      const browserPaneApi = getBrowserPaneApi()
      if (!browserPaneApi) return

      void browserPaneApi.focus(instance.id).catch((error) => {
        console.warn(`[BrowserTabStrip] Failed to focus browser window ${instance.id}:`, error)
      })
    },
    [instancesOverride, setActiveInstanceId]
  )

  const openSessionUsingWindow = React.useCallback((instance: BrowserInstanceInfo) => {
    const sessionId = instance.boundSessionId ?? instance.ownerSessionId
    if (!sessionId) return
    navigate(routes.view.allChats(sessionId))
  }, [])

  const terminateBrowserWindow = React.useCallback(
    (instance: BrowserInstanceInfo) => {
      if (!instancesOverride) {
        const browserPaneApi = getBrowserPaneApi()
        if (browserPaneApi) {
          void browserPaneApi.destroy(instance.id).catch((error) => {
            console.warn(`[BrowserTabStrip] Failed to terminate browser window ${instance.id}:`, error)
          })
        }
        removeInstance(instance.id)
      }

      setActiveInstanceId((prev) => {
        if (prev !== instance.id) return prev
        const remaining = instancesRef.current.filter((item) => item.id !== instance.id)
        return remaining[0]?.id ?? null
      })
    },
    [instancesOverride, removeInstance, setActiveInstanceId]
  )

  const renderBrowserActions = React.useCallback(
    (instance: BrowserInstanceInfo) => {
      const canUseLiveWindowActions = !instancesOverride
      const targetSessionId = instance.boundSessionId ?? instance.ownerSessionId
      const canOpenSession = !!targetSessionId
      const openSessionLabel = instance.agentControlActive
        ? t("browserTabStrip.openSessionUsingThisWindow")
        : t("browserTabStrip.openSessionWhichUsedThisWindow")

      return (
        <>
          <StyledDropdownMenuItem
            disabled={!canUseLiveWindowActions}
            onSelect={() => focusBrowserWindow(instance)}
          >
            <Monitor className="h-3.5 w-3.5" />
            {t("browserTabStrip.showBrowserWindow")}
          </StyledDropdownMenuItem>

          <StyledDropdownMenuItem
            disabled={!canOpenSession}
            onSelect={() => openSessionUsingWindow(instance)}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            {openSessionLabel}
          </StyledDropdownMenuItem>

          <StyledDropdownMenuSeparator />

          <StyledDropdownMenuItem
            variant="destructive"
            disabled={!canUseLiveWindowActions}
            onSelect={() => terminateBrowserWindow(instance)}
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("browserTabStrip.terminateBrowser")}
          </StyledDropdownMenuItem>
        </>
      )
    },
    [focusBrowserWindow, instancesOverride, openSessionUsingWindow, t, terminateBrowserWindow]
  )

  if (orderedInstances.length === 0) return null

  const visibleBadgeCount = Math.max(1, maxVisibleBadges)
  const visible = orderedInstances.slice(0, visibleBadgeCount)
  const overflow = orderedInstances.slice(visibleBadgeCount)

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((instance) => (
        <DropdownMenu key={instance.id}>
          <DropdownMenuTrigger asChild>
            <BrowserTabBadge instance={instance} isActive={instance.id === activeInstanceId} />
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end" minWidth="min-w-56">
            {renderBrowserActions(instance)}
          </StyledDropdownMenuContent>
        </DropdownMenu>
      ))}

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-[26px] cursor-pointer rounded-lg bg-background px-1.5 text-[11px] text-foreground/50 shadow-minimal transition-colors hover:bg-foreground/[0.03] titlebar-no-drag"
              aria-label={t("browserTabStrip.moreWindows", { count: overflow.length })}
            >
              +{overflow.length}
            </button>
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end" minWidth="min-w-64">
            {overflow.map((instance) => {
              const hostname = getHostname(instance.url)
              const displayLabel =
                instance.title.trim() ||
                hostname ||
                (instance.url.startsWith("file:")
                  ? t("browserTabStrip.localFile")
                  : t("browserTabStrip.newTab"))

              return (
                <DropdownMenuSub key={instance.id}>
                  <StyledDropdownMenuSubTrigger>
                    {instance.isLoading ? (
                      <Spinner className="text-[10px]" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    <span className="truncate">{displayLabel}</span>
                  </StyledDropdownMenuSubTrigger>
                  <StyledDropdownMenuSubContent minWidth="min-w-56">
                    {renderBrowserActions(instance)}
                  </StyledDropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })}
          </StyledDropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
