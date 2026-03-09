import * as React from "react"
import { useAtomValue, useSetAtom } from "jotai"

import { panelStackAtom, resizePanelsAtom } from "@/atoms/panel-stack"
import { useResizeGradient } from "@/hooks/useResizeGradient"

import {
  PANEL_MIN_WIDTH,
  PANEL_SASH_FLEX_MARGIN,
  PANEL_SASH_HALF_HIT_WIDTH,
  PANEL_SASH_LINE_WIDTH,
  PANEL_STACK_VERTICAL_OVERFLOW,
} from "./panel-constants"

interface PanelResizeSashProps {
  leftIndex: number
  rightIndex: number
}

export function PanelResizeSash({ leftIndex, rightIndex }: PanelResizeSashProps) {
  const resizePanels = useSetAtom(resizePanelsAtom)
  const panelStack = useAtomValue(panelStackAtom)
  const { ref, handlers, gradientStyle } = useResizeGradient()
  const startXRef = React.useRef(0)
  const startLeftWidthRef = React.useRef(0)
  const startRightWidthRef = React.useRef(0)
  const combinedProportionRef = React.useRef(0)

  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      handlers.onMouseDown()

      const sashElement = ref.current
      if (!sashElement) return

      const leftPanel = sashElement.previousElementSibling as HTMLElement | null
      const rightPanel = sashElement.nextElementSibling as HTMLElement | null
      if (!leftPanel || !rightPanel) return

      startXRef.current = event.clientX
      startLeftWidthRef.current = leftPanel.getBoundingClientRect().width
      startRightWidthRef.current = rightPanel.getBoundingClientRect().width

      const leftProportion = panelStack[leftIndex]?.proportion ?? 0.5
      const rightProportion = panelStack[rightIndex]?.proportion ?? 0.5
      combinedProportionRef.current = leftProportion + rightProportion

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current
        const combinedWidth = startLeftWidthRef.current + startRightWidthRef.current

        let nextLeftWidth = startLeftWidthRef.current + delta
        let nextRightWidth = startRightWidthRef.current - delta

        if (nextLeftWidth < PANEL_MIN_WIDTH) {
          nextLeftWidth = PANEL_MIN_WIDTH
          nextRightWidth = combinedWidth - PANEL_MIN_WIDTH
        }
        if (nextRightWidth < PANEL_MIN_WIDTH) {
          nextRightWidth = PANEL_MIN_WIDTH
          nextLeftWidth = combinedWidth - PANEL_MIN_WIDTH
        }

        const totalWidth = nextLeftWidth + nextRightWidth
        const combinedProportion = combinedProportionRef.current
        const nextLeftProportion = (nextLeftWidth / totalWidth) * combinedProportion
        const nextRightProportion = combinedProportion - nextLeftProportion

        resizePanels({
          leftIndex,
          rightIndex,
          leftProportion: nextLeftProportion,
          rightProportion: nextRightProportion,
        })
      }

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
      }

      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [handlers, leftIndex, panelStack, ref, resizePanels, rightIndex]
  )

  const handleDoubleClick = React.useCallback(() => {
    const left = panelStack[leftIndex]
    const right = panelStack[rightIndex]
    if (!left || !right) return

    const combined = left.proportion + right.proportion
    const half = combined / 2
    resizePanels({
      leftIndex,
      rightIndex,
      leftProportion: half,
      rightProportion: half,
    })
  }, [leftIndex, panelStack, resizePanels, rightIndex])

  return (
    <div
      ref={ref}
      className="relative h-full w-0 shrink-0 cursor-col-resize flex justify-center"
      style={{ margin: `0 ${PANEL_SASH_FLEX_MARGIN}px` }}
      onMouseDown={handleMouseDown}
      onMouseMove={handlers.onMouseMove}
      onMouseLeave={handlers.onMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="absolute inset-y-0 flex justify-center cursor-col-resize"
        style={{ left: -PANEL_SASH_HALF_HIT_WIDTH, right: -PANEL_SASH_HALF_HIT_WIDTH }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            ...gradientStyle,
            width: PANEL_SASH_LINE_WIDTH,
            top: PANEL_STACK_VERTICAL_OVERFLOW,
            bottom: PANEL_STACK_VERTICAL_OVERFLOW,
          }}
        />
      </div>
    </div>
  )
}
