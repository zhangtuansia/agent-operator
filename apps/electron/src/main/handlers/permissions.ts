import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.PERMISSIONS_CHECK_FULL_DISK_ACCESS,
  IPC_CHANNELS.PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS,
  IPC_CHANNELS.PERMISSIONS_PROMPT_FULL_DISK_ACCESS,
  IPC_CHANNELS.PERMISSIONS_CHECK_ACCESSIBILITY,
  IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS,
  IPC_CHANNELS.PERMISSIONS_GET_ALL,
] as const

export function registerPermissionsHandlers(server: RpcServer): void {
  server.handle(IPC_CHANNELS.PERMISSIONS_CHECK_FULL_DISK_ACCESS, async () => {
    const { hasFullDiskAccess } = await import('../permissions')
    return hasFullDiskAccess()
  })

  server.handle(IPC_CHANNELS.PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS, async () => {
    const { openFullDiskAccessSettings } = await import('../permissions')
    openFullDiskAccessSettings()
  })

  server.handle(IPC_CHANNELS.PERMISSIONS_PROMPT_FULL_DISK_ACCESS, async () => {
    const { promptForFullDiskAccess } = await import('../permissions')
    return promptForFullDiskAccess()
  })

  server.handle(IPC_CHANNELS.PERMISSIONS_CHECK_ACCESSIBILITY, async () => {
    const { hasAccessibilityAccess } = await import('../permissions')
    return hasAccessibilityAccess()
  })

  server.handle(IPC_CHANNELS.PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS, async () => {
    const { openAccessibilitySettings } = await import('../permissions')
    openAccessibilitySettings()
  })

  server.handle(IPC_CHANNELS.PERMISSIONS_GET_ALL, async () => {
    const { getAllPermissionsStatus } = await import('../permissions')
    return getAllPermissionsStatus()
  })
}
