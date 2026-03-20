import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'
import { getOpenTargetPreference, setOpenTargetPreference } from '@agent-operator/shared/config/storage'
import { listOpenTargets, openPathWithTarget } from '../open-targets'
import { validateFilePath } from '../file-access'

export function registerOpenTargetHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.OPEN_TARGETS_LIST, async (_ctx, path: string) => {
    const targets = await listOpenTargets()
    const preferredTargetId = getOpenTargetPreference(path)
    const availableDefaultTargetId = preferredTargetId && targets.some(target => target.id === preferredTargetId)
      ? preferredTargetId
      : targets[0]?.id ?? null

    return {
      targets,
      defaultTargetId: availableDefaultTargetId,
    }
  })

  server.handle(IPC_CHANNELS.OPEN_FILE_WITH_TARGET, async (_ctx, targetId: string, path: string) => {
    const safePath = await validateFilePath(path)
    await openPathWithTarget(targetId, safePath)
  })

  server.handle(IPC_CHANNELS.SET_OPEN_TARGET_PREFERENCE, async (_ctx, targetId: string, path?: string) => {
    setOpenTargetPreference(targetId, path)
  })
}
