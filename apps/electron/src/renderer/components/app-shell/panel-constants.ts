import { isMac } from "@/lib/platform"

export const PANEL_GAP = 6
export const PANEL_EDGE_INSET = 6
export const RADIUS_EDGE = isMac ? 14 : 8
export const RADIUS_INNER = 10
export const PANEL_MIN_WIDTH = 440
export const PANEL_STACK_VERTICAL_OVERFLOW = 8
export const PANEL_SASH_HIT_WIDTH = 8
export const PANEL_SASH_LINE_WIDTH = 2
export const PANEL_SASH_FLEX_MARGIN = -(PANEL_GAP / 2)
export const PANEL_SASH_HALF_HIT_WIDTH = PANEL_SASH_HIT_WIDTH / 2
