import type { ISessionManager } from '@agent-operator/server-core/handlers'

export async function buildOfficeBulkSyncSessions(
  sessionManager?: ISessionManager,
): Promise<Array<{
  sessionId: string
  sessionName: string
  isActive?: boolean
}>> {
  if (!sessionManager) return []

  await sessionManager.waitForInit()

  const MAX_OFFICE_AGENTS = 6 // Match available desk seats in the layout

  const sessions = sessionManager
    .getSessions()
    .filter(session => !session.isArchived && !session.hidden)

  // Prioritize: active sessions first, then most recently updated
  const sorted = sessions.sort((a, b) => {
    // Active sessions always come first
    if (a.isProcessing && !b.isProcessing) return -1
    if (!a.isProcessing && b.isProcessing) return 1
    // Then by most recent activity
    const aTime = a.updatedAt || a.createdAt || 0
    const bTime = b.updatedAt || b.createdAt || 0
    return bTime - aTime
  })

  return sorted
    .slice(0, MAX_OFFICE_AGENTS)
    .map(session => ({
      sessionId: session.id,
      sessionName: session.name || 'Agent',
      isActive: session.isProcessing,
    }))
}
