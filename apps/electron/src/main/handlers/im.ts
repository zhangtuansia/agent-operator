import { IPC_CHANNELS } from '../../shared/types'
import type { RpcServer } from '../../transport/server'
import type { IMServiceManager } from '../im-services'

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.IM_GET_CONFIG,
  IPC_CHANNELS.IM_SET_CONFIG,
  IPC_CHANNELS.IM_GET_SETTINGS,
  IPC_CHANNELS.IM_SET_SETTINGS,
  IPC_CHANNELS.IM_START_CHANNEL,
  IPC_CHANNELS.IM_STOP_CHANNEL,
  IPC_CHANNELS.IM_TEST_CHANNEL,
  IPC_CHANNELS.IM_GET_STATUS,
  IPC_CHANNELS.IM_GET_SESSION_MAPPINGS,
  IPC_CHANNELS.IM_DELETE_SESSION_MAPPING,
] as const

export function registerImHandlers(server: RpcServer, imServices: IMServiceManager): void {
  imServices.registerRpcHandlers(server)
}
