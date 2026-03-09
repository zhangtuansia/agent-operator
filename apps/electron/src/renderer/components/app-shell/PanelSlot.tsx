import * as React from "react"
import { useSetAtom } from "jotai"
import { X } from "lucide-react"

import { closePanelAtom, focusedPanelIdAtom, type PanelStackEntry } from "@/atoms/panel-stack"
import { PanelHeaderCenterButton } from "@/components/ui/PanelHeaderCenterButton"
import { AppShellProvider, useAppShellContext } from "@/context/AppShellContext"
import { cn } from "@/lib/utils"

import { parseRouteToNavigationState } from "../../../shared/route-parser"
import { MainContentPanel } from "./MainContentPanel"
import { PANEL_MIN_WIDTH, RADIUS_EDGE, RADIUS_INNER } from "./panel-constants"

interface PanelSlotProps {
  entry: PanelStackEntry
  isOnly: boolean
  isFocusedPanel: boolean
  isSidebarAndNavigatorHidden: boolean
  isAtLeftEdge: boolean
  isAtRightEdge: boolean
  proportion: number
  sash?: React.ReactNode
}

export function PanelSlot({
  entry,
  isOnly,
  isFocusedPanel,
  isSidebarAndNavigatorHidden,
  isAtLeftEdge,
  isAtRightEdge,
  proportion,
  sash,
}: PanelSlotProps) {
  const parentContext = useAppShellContext()
  const closePanel = useSetAtom(closePanelAtom)
  const setFocusedPanel = useSetAtom(focusedPanelIdAtom)
  const navState = parseRouteToNavigationState(entry.route)

  const handleClose = React.useCallback(() => {
    closePanel(entry.id)
  }, [closePanel, entry.id])

  const closeButton = React.useMemo(() => {
    if (isOnly) return null
    return (
      <PanelHeaderCenterButton
        icon={<X className="h-4 w-4" />}
        onClick={handleClose}
        tooltip="Close panel"
      />
    )
  }, [handleClose, isOnly])

  const rightSidebarButton = React.useMemo(() => {
    const panelScopedSidebarButton = isFocusedPanel ? parentContext.rightSidebarButton : null
    if (!closeButton) return panelScopedSidebarButton
    if (!panelScopedSidebarButton) return closeButton

    return (
      <div className="flex items-center gap-1">
        {panelScopedSidebarButton}
        {closeButton}
      </div>
    )
  }, [closeButton, isFocusedPanel, parentContext.rightSidebarButton])

  const contextOverride = React.useMemo(
    () => ({
      ...parentContext,
      rightSidebarButton,
      isFocusedPanel,
    }),
    [isFocusedPanel, parentContext, rightSidebarButton]
  )

  const handlePointerDown = React.useCallback(() => {
    if (!isFocusedPanel) {
      setFocusedPanel(entry.id)
    }
  }, [entry.id, isFocusedPanel, setFocusedPanel])

  if (!navState) return null

  return (
    <>
      {sash}
      <div
        onPointerDown={handlePointerDown}
        className={cn(
          "relative h-full overflow-hidden bg-foreground-2",
          !isOnly && isFocusedPanel ? "z-[1] shadow-focused" : "z-0 shadow-middle"
        )}
        style={{
          ...(!isOnly && !isFocusedPanel
            ? ({
                "--background": "var(--background-elevated)",
                "--shadow-minimal": "var(--shadow-minimal-flat)",
                "--user-message-bubble": "var(--user-message-bubble-dimmed)",
              } as React.CSSProperties)
            : {}),
          borderTopLeftRadius: RADIUS_INNER,
          borderBottomLeftRadius: isAtLeftEdge ? RADIUS_EDGE : RADIUS_INNER,
          borderTopRightRadius: RADIUS_INNER,
          borderBottomRightRadius: isAtRightEdge ? RADIUS_EDGE : RADIUS_INNER,
          ...(isOnly
            ? { flexGrow: 1, minWidth: 0 }
            : { flexGrow: proportion, flexShrink: 1, flexBasis: 0, minWidth: PANEL_MIN_WIDTH }),
        }}
      >
        <div className="flex h-full flex-col">
          <AppShellProvider value={contextOverride}>
            <MainContentPanel
              navStateOverride={navState}
              isFocusedMode={isSidebarAndNavigatorHidden}
            />
          </AppShellProvider>
        </div>
      </div>
    </>
  )
}
