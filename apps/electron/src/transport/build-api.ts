import type { ElectronAPI } from '../shared/types'

export interface IpcClient {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

export type ChannelMapEntry =
  | {
      type: 'invoke'
      channel: string
      mapArgs?: (...args: any[]) => unknown[]
      transform?: (result: any) => any
    }
  | {
      type: 'listener'
      channel: string
    }

export type ChannelMap = Record<string, ChannelMapEntry>

export function buildClientApi(client: IpcClient, channelMap: ChannelMap): ElectronAPI {
  const api: Record<string, any> = {}

  for (const [key, entry] of Object.entries(channelMap)) {
    if (entry.type === 'listener') {
      api[key] = (callback: (...args: unknown[]) => void) => client.on(entry.channel, (...args) => callback(...args))
      continue
    }

    api[key] = async (...args: unknown[]) => {
      const mappedArgs = entry.mapArgs ? entry.mapArgs(...args) : args
      const result = await client.invoke(entry.channel, ...mappedArgs)
      return entry.transform ? entry.transform(result) : result
    }
  }

  return api as ElectronAPI
}
