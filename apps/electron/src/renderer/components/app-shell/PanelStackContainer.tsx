import * as React from "react"
import { useAtomValue } from "jotai"
import { motion } from "motion/react"

import { focusedPanelIdAtom, panelStackAtom } from "@/atoms/panel-stack"
import { cn } from "@/lib/utils"

import { PanelResizeSash } from "./PanelResizeSash"
import { PanelSlot } from "./PanelSlot"
import {
  PANEL_EDGE_INSET,
  PANEL_GAP,
  PANEL_STACK_VERTICAL_OVERFLOW,
  RADIUS_EDGE,
  RADIUS_INNER,
} from "./panel-constants"

const PANEL_SPRING = { type: "spring" as const, stiffness: 600, damping: 49 }

export interface PanelStackContainerProps {
  sidebarSlot?: React.ReactNode
  sidebarWidth: number
  navigatorSlot?: React.ReactNode
  navigatorWidth: number
  contentSlot?: React.ReactNode
  isSidebarAndNavigatorHidden?: boolean
  isRightSidebarVisible?: boolean
  isResizing?: boolean
}

export function PanelStackContainer({
  sidebarSlot,
  sidebarWidth,
  navigatorSlot,
  navigatorWidth,
  contentSlot,
  isSidebarAndNavigatorHidden = false,
  isRightSidebarVisible = false,
  isResizing = false,
}: PanelStackContainerProps) {
  const panelStack = useAtomValue(panelStackAtom)
  const focusedPanelId = useAtomValue(focusedPanelIdAtom)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const previousCountRef = React.useRef(panelStack.length)
  const transition = isResizing ? { duration: 0 } : PANEL_SPRING
  const hasSidebar = sidebarWidth > 0
  const hasNavigator = navigatorWidth > 0
  const isLeftEdge = !hasNavigator
  const collapsedSidebarInset = PANEL_EDGE_INSET + PANEL_GAP

  React.useEffect(() => {
    if (panelStack.length > previousCountRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: "smooth",
        })
      })
    }
    previousCountRef.current = panelStack.length
  }, [panelStack.length])

  React.useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.shiftKey) return
      if (container.scrollWidth <= container.clientWidth + 1) return
      if (Math.abs(event.deltaX) > 0) return

      const previousLeft = container.scrollLeft
      container.scrollLeft += event.deltaY

      if (container.scrollLeft !== previousLeft) {
        event.preventDefault()
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [])

  return (
    <div className="relative z-panel flex min-w-0 flex-1">
      <motion.div
        initial={false}
        animate={{
          width: hasSidebar ? sidebarWidth : 0,
          marginRight: hasSidebar ? 0 : -PANEL_GAP,
          opacity: hasSidebar ? 1 : 0,
        }}
        transition={transition}
        className="relative h-full shrink-0"
        style={{ overflowX: "clip", overflowY: "visible" }}
      >
        <div className="h-full" style={{ width: sidebarWidth }}>
          {sidebarSlot}
        </div>
      </motion.div>

      <div
        ref={scrollRef}
        className="panel-scroll relative flex min-w-0 flex-1"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          paddingBlock: PANEL_STACK_VERTICAL_OVERFLOW,
          marginBlock: -PANEL_STACK_VERTICAL_OVERFLOW,
          marginBottom: -6,
          paddingBottom: 6,
          paddingRight: 8,
          marginRight: -8,
        }}
      >
        <motion.div
          className="flex h-full"
          initial={false}
          animate={{ paddingLeft: !hasSidebar ? collapsedSidebarInset : 0 }}
          transition={transition}
          style={{ gap: PANEL_GAP, flexGrow: 1, minWidth: 0 }}
        >
          <motion.div
            initial={false}
            animate={{
              width: hasNavigator ? navigatorWidth : 0,
              marginRight: hasNavigator ? 0 : -PANEL_GAP,
              opacity: hasNavigator ? 1 : 0,
            }}
            transition={transition}
            className={cn("relative z-[2] h-full shrink-0 overflow-hidden bg-background shadow-middle")}
            style={{
              borderTopLeftRadius: RADIUS_INNER,
              borderBottomLeftRadius: !hasSidebar ? RADIUS_EDGE : RADIUS_INNER,
              borderTopRightRadius: RADIUS_INNER,
              borderBottomRightRadius: RADIUS_INNER,
            }}
          >
            <div className="h-full" style={{ width: navigatorWidth }}>
              {navigatorSlot}
            </div>
          </motion.div>
          {panelStack.length === 0 ? (
            <div className="flex min-w-0 flex-1">{contentSlot}</div>
          ) : (
            panelStack.map((entry, index) => (
              <PanelSlot
                key={entry.id}
                entry={entry}
                isOnly={panelStack.length === 1}
                isFocusedPanel={panelStack.length > 1 ? entry.id === focusedPanelId : true}
                isSidebarAndNavigatorHidden={isSidebarAndNavigatorHidden}
                isAtLeftEdge={index === 0 && isLeftEdge}
                isAtRightEdge={!isRightSidebarVisible && index === panelStack.length - 1}
                proportion={entry.proportion}
                sash={index > 0 ? <PanelResizeSash leftIndex={index - 1} rightIndex={index} /> : undefined}
              />
            ))
          )}
        </motion.div>
      </div>
    </div>
  )
}
