import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'
import { getOfficeServerUrl, startOfficeServer } from '../office-server'
import { officeAgentBulkSync } from '../office-state-bridge'
import type { ISessionManager } from '@agent-operator/server-core/handlers'
import { buildOfficeBulkSyncSessions } from './office-session-sync'

export function registerOfficeHandlers(server: RpcServer, sessionManager?: ISessionManager): void {
  server.handle(IPC_CHANNELS.OFFICE_GET_SERVER_URL, async () => {
    const existingUrl = getOfficeServerUrl()
    const url = existingUrl || await startOfficeServer()
    if (!url) return null

    const sessions = await buildOfficeBulkSyncSessions(sessionManager)
    officeAgentBulkSync(sessions)

    return url
  })
}
