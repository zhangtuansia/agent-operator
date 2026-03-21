/**
 * Office State Bridge — Multi-Session Edition
 *
 * Syncs DAZI session lifecycle events to the Pixel Agents server via REST API.
 * Each DAZI session maps to one pixel character in the office.
 *
 * Events flow:
 *   Session created       → POST /api/agent-created   → character spawns
 *   Session tool call     → POST /api/agent-tool-start → character types/reads
 *   Session tool done     → POST /api/agent-tool-done  → brief pause
 *   Session turn complete → POST /api/agent-tools-clear→ character goes idle
 *   Session archived      → POST /api/agent-closed     → character despawns
 *   Session status change → POST /api/agent-status     → waiting/active bubble
 *
 * Pushes events to the Pixel Agents server on port 19000.
 */

const OFFICE_API = 'http://127.0.0.1:19000'

// Track active tool IDs per session for dedup / done matching
const activeToolIds = new Map<string, string>()

// Debounce state per session
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 300

// ============================================================================
// Internal helpers
// ============================================================================

async function postEvent(endpoint: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${OFFICE_API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Office server may not be running — silently ignore
  }
}

function debounced(sessionId: string, fn: () => void): void {
  const existing = debounceTimers.get(sessionId)
  if (existing) clearTimeout(existing)
  debounceTimers.set(sessionId, setTimeout(() => {
    debounceTimers.delete(sessionId)
    fn()
  }, DEBOUNCE_MS))
}

function cancelDebounce(sessionId: string): void {
  const existing = debounceTimers.get(sessionId)
  if (existing) {
    clearTimeout(existing)
    debounceTimers.delete(sessionId)
  }
}

// ============================================================================
// Tool name classification (for character animation: typing vs reading)
// ============================================================================

const EXECUTING_TOOLS = new Set([
  'Bash', 'Write', 'Edit', 'NotebookEdit',
])

const RESEARCHING_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
])

function toolNameToDetail(toolName: string): string {
  if (EXECUTING_TOOLS.has(toolName)) return `正在执行 ${toolName}`
  if (RESEARCHING_TOOLS.has(toolName)) return `正在研究 ${toolName}`
  if (toolName.startsWith('mcp__')) return `正在同步 ${toolName.split('__')[2] || toolName}`
  return `正在使用 ${toolName}`
}

// ============================================================================
// Public API — called from SessionManager / IPC handlers
// ============================================================================

/**
 * A new DAZI session was created. Spawn a pixel character.
 */
export function officeAgentCreated(sessionId: string, sessionName: string): void {
  postEvent('/api/agent-created', { sessionId, sessionName })
}

/**
 * A DAZI session was closed/archived. Despawn the pixel character.
 */
export function officeAgentClosed(sessionId: string): void {
  cancelDebounce(sessionId)
  activeToolIds.delete(sessionId)
  postEvent('/api/agent-closed', { sessionId })
}

// Track which sessions we've already created agents for
const createdSessions = new Set<string>()

/**
 * Agent started processing (thinking / beginning a turn).
 * Also lazily creates the pixel character if this is the first time we see this session.
 */
export function officeAgentStarted(sessionId: string, sessionName?: string): void {
  // Lazily create the character on first activity
  if (!createdSessions.has(sessionId)) {
    createdSessions.add(sessionId)
    postEvent('/api/agent-created', {
      sessionId,
      sessionName: sessionName || 'Agent',
    })
  }

  debounced(sessionId, () => {
    // If no specific tool is running yet, use a generic "thinking" tool
    const toolId = `thinking-${Date.now()}`
    activeToolIds.set(sessionId, toolId)
    postEvent('/api/agent-tool-start', {
      sessionId,
      toolName: 'Bash', // Shows as typing
      toolId,
    })
  })
}

/**
 * Agent is calling a specific tool.
 */
export function officeAgentToolCall(sessionId: string, toolName: string, toolId?: string): void {
  cancelDebounce(sessionId)
  const tid = toolId || `tool-${Date.now()}`
  activeToolIds.set(sessionId, tid)
  postEvent('/api/agent-tool-start', {
    sessionId,
    toolName,
    toolId: tid,
  })
}

/**
 * Agent finished a specific tool call.
 */
export function officeAgentToolDone(sessionId: string, toolId?: string): void {
  const tid = toolId || activeToolIds.get(sessionId)
  if (tid) {
    postEvent('/api/agent-tool-done', { sessionId, toolId: tid })
  }
}

/**
 * Agent finished its turn (all tools done). Character goes idle.
 */
export function officeAgentFinished(sessionId: string): void {
  cancelDebounce(sessionId)
  activeToolIds.delete(sessionId)
  postEvent('/api/agent-tools-clear', { sessionId })
}

/**
 * Agent status changed (waiting for user input, active again).
 */
export function officeAgentStatus(sessionId: string, status: 'active' | 'waiting'): void {
  postEvent('/api/agent-status', { sessionId, status })
}

/**
 * Agent encountered an error.
 */
export function officeAgentError(sessionId: string, errorMessage?: string): void {
  cancelDebounce(sessionId)
  activeToolIds.delete(sessionId)
  postEvent('/api/agent-tools-clear', { sessionId })
}

/**
 * Bulk sync all active sessions (e.g., on app startup).
 */
export function officeAgentBulkSync(
  sessions: Array<{
    sessionId: string
    sessionName: string
    isActive?: boolean
    currentTool?: string
  }>
): void {
  postEvent('/api/bulk-sync', { sessions })
}

/**
 * Get current office state (for testing/debugging).
 */
export function getOfficeState(): string {
  return 'multi-session'
}
