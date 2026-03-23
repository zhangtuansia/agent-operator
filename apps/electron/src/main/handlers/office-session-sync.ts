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

  return sessionManager
    .getSessions()
    .filter(session => !session.isArchived && !session.hidden)
    .map(session => ({
      sessionId: session.id,
      sessionName: session.name || 'Agent',
      isActive: session.isProcessing,
    }))
}
