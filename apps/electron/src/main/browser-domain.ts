import { normalizeCanonicalBrowserToolName } from '@agent-operator/shared/agent'

const BROWSER_TOOL_OVERLAY_EXCLUDED_COMMANDS = new Set([
  '--help',
  '-h',
  'help',
  'open',
  'release',
  'close',
  'hide',
])

export type BrowserOwnershipReleaser = {
  clearVisualsForSession(sessionId: string): Promise<void>
  unbindAllForSession(sessionId: string): void
}

export function normalizeBrowserToolName(toolName: string): string | null {
  return normalizeCanonicalBrowserToolName(toolName)
}

export function getBrowserToolCommandVerb(toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== 'object') return ''

  const command = (toolInput as { command?: unknown }).command
  if (typeof command !== 'string') return ''

  return command.trim().toLowerCase().split(/\s+/)[0] || ''
}

export function shouldActivateBrowserOverlay(toolName: string, toolInput: unknown): boolean {
  const normalizedToolName = normalizeBrowserToolName(toolName)
  if (normalizedToolName !== 'browser_tool') return false

  const verb = getBrowserToolCommandVerb(toolInput)
  if (!verb) return false

  return !BROWSER_TOOL_OVERLAY_EXCLUDED_COMMANDS.has(verb)
}

export function shouldClearBrowserOverlayOnToolResult(toolName: string, toolInput: unknown): boolean {
  const normalizedToolName = normalizeBrowserToolName(toolName)
  if (normalizedToolName !== 'browser_tool') return false

  const verb = getBrowserToolCommandVerb(toolInput)
  if (!verb) return false

  return verb === 'release' || verb === 'close' || verb === 'hide'
}

export async function releaseBrowserOwnershipOnForcedStop(
  browserPaneManager: BrowserOwnershipReleaser | null | undefined,
  sessionId: string,
): Promise<void> {
  if (!browserPaneManager) return
  await browserPaneManager.clearVisualsForSession(sessionId)
  browserPaneManager.unbindAllForSession(sessionId)
}
