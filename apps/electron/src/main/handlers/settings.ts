import { RPC_CHANNELS } from '@agent-operator/shared/protocol'
import type { NetworkProxySettings } from '@agent-operator/shared/config'
import type { RpcServer } from '../../transport/server'

export const GUI_HANDLED_CHANNELS = [
  RPC_CHANNELS.settings.SET_NETWORK_PROXY,
] as const

export const HANDLED_CHANNELS = GUI_HANDLED_CHANNELS

export function registerSettingsGuiHandlers(server: RpcServer): void {
  server.handle(RPC_CHANNELS.settings.SET_NETWORK_PROXY, async (_ctx, settings: NetworkProxySettings) => {
    const { updateConfiguredProxySettings } = await import('../network-proxy')
    await updateConfiguredProxySettings(settings)
  })
}
