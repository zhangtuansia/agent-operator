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
 * Pushes events to the Pixel Agents server over the current dynamic localhost
 * port managed by office-server.ts.
 */

import { startOfficeServer } from './office-server'
import { dispatchToOfficeWindow } from './handlers/office'

// Track active tool IDs per session for dedup / done matching
const activeToolIds = new Map<string, string>()

// Map sessionId → numeric agent ID (assigned by server)
const sessionAgentIds = new Map<string, number>()

// ============================================================================
// Internal helpers
// ============================================================================

async function postEvent(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const officeApi = await startOfficeServer()
    if (!officeApi) {
      return null
    }
    console.log(`[office-bridge] POST ${endpoint}`, JSON.stringify(body).substring(0, 100))
    const res = await fetch(`${officeApi}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    console.log(`[office-bridge] POST ${endpoint} → ${res.status} ${text.substring(0, 80)}`)
    try { return JSON.parse(text) } catch { return null }
  } catch (err: unknown) {
    console.log(`[office-bridge] POST ${endpoint} FAILED:`, err instanceof Error ? err.message : err)
    return null
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
  createdSessions.add(sessionId)
  postEvent('/api/agent-created', { sessionId, sessionName })
}

/**
 * A DAZI session was closed/archived. Despawn the pixel character.
 */
export function officeAgentClosed(sessionId: string): void {
  createdSessions.delete(sessionId)
  activeToolIds.delete(sessionId)
  postEvent('/api/agent-closed', { sessionId })
}

// Track which sessions we've already created agents for
const createdSessions = new Set<string>()

/**
 * Agent started processing (thinking / beginning a turn).
 * Also lazily creates the pixel character if this is the first time we see this session.
 */
export async function officeAgentStarted(sessionId: string, sessionName?: string): Promise<void> {
  if (!createdSessions.has(sessionId)) {
    createdSessions.add(sessionId)
    // Create the agent on the server first
    const result = await postEvent('/api/agent-created', {
      sessionId,
      sessionName: sessionName || 'Agent',
    })
    if (result?.agentId) {
      sessionAgentIds.set(sessionId, result.agentId as number)
      // Also dispatch directly to office window (bypass broken WebSocket)
      dispatchToOfficeWindow({
        type: 'agentCreated',
        id: result.agentId,
        folderName: sessionName || 'Agent',
      })
    }
  }

  const agentId = sessionAgentIds.get(sessionId)
  console.log(`[office-bridge] agentStarted: sessionId=${sessionId} agentId=${agentId} knownIds=${[...sessionAgentIds.entries()].map(([k,v])=>`${k}:${v}`).join(',')}`)
  if (agentId) {
    // Dispatch tool start directly to window so character walks to desk
    const tid = `thinking-${Date.now()}`
    activeToolIds.set(sessionId, tid)
    console.log(`[office-bridge] dispatching agentToolStart id=${agentId} tid=${tid}`)
    dispatchToOfficeWindow({
      type: 'agentToolStart',
      id: agentId,
      toolId: tid,
      status: 'Thinking',
    })
  } else {
    console.log(`[office-bridge] WARNING: no agentId for ${sessionId}, cannot dispatch to window`)
  }

  // Also notify server (for persistent state)
  postEvent('/api/agent-status', {
    sessionId,
    sessionName: sessionName || 'Agent',
    status: 'active',
  })
}

/**
 * Agent is calling a specific tool.
 */
export function officeAgentToolCall(sessionId: string, toolName: string, toolId?: string): void {
  const tid = toolId || `tool-${Date.now()}`
  activeToolIds.set(sessionId, tid)

  const agentId = sessionAgentIds.get(sessionId)
  if (agentId) {
    dispatchToOfficeWindow({
      type: 'agentToolStart',
      id: agentId,
      toolId: tid,
      status: toolNameToDetail(toolName),
    })
  }

  postEvent('/api/agent-tool-start', { sessionId, toolName, toolId: tid })
}

/**
 * Agent finished a specific tool call.
 */
export function officeAgentToolDone(sessionId: string, toolId?: string): void {
  const tid = toolId || activeToolIds.get(sessionId)
  if (tid) {
    const agentId = sessionAgentIds.get(sessionId)
    if (agentId) {
      dispatchToOfficeWindow({
        type: 'agentToolDone',
        id: agentId,
        toolId: tid,
      })
    }
    postEvent('/api/agent-tool-done', { sessionId, toolId: tid })
  }
}

/**
 * Agent finished its turn (all tools done). Character goes idle.
 */
export function officeAgentFinished(sessionId: string): void {
  activeToolIds.delete(sessionId)

  const agentId = sessionAgentIds.get(sessionId)
  if (agentId) {
    dispatchToOfficeWindow({
      type: 'agentToolsClear',
      id: agentId,
    })
  }

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
  activeToolIds.delete(sessionId)
  postEvent('/api/agent-tools-clear', { sessionId })
}

/**
 * Bulk sync all active sessions (e.g., on app startup).
 */
export async function officeAgentBulkSync(
  sessions: Array<{
    sessionId: string
    sessionName: string
    isActive?: boolean
    currentTool?: string
  }>
): Promise<void> {
  const result = await postEvent('/api/bulk-sync', { sessions })
  // Track the agent IDs returned by the server
  if (result?.agentIds && typeof result.agentIds === 'object') {
    for (const [sid, id] of Object.entries(result.agentIds as Record<string, number>)) {
      sessionAgentIds.set(sid, id)
      createdSessions.add(sid)
    }
  }
}

/**
 * Reverse lookup: get sessionId for a given pixel agent ID.
 * Used when user clicks a character in the office to navigate to the session.
 */
export function getSessionIdForAgent(agentId: number): string | null {
  for (const [sessionId, id] of sessionAgentIds.entries()) {
    if (id === agentId) return sessionId
  }
  return null
}

/**
 * Get current office state (for testing/debugging).
 */
export function getOfficeState(): string {
  return 'multi-session'
}
