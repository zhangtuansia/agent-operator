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
  const nested: Record<string, Record<string, any>> = {}

  for (const [key, entry] of Object.entries(channelMap)) {
    let fn: (...args: any[]) => any

    if (entry.type === 'listener') {
      fn = (callback: (...args: unknown[]) => void) => client.on(entry.channel, (...args) => callback(...args))
    } else {
      fn = async (...args: unknown[]) => {
        const mappedArgs = entry.mapArgs ? entry.mapArgs(...args) : args
        const result = await client.invoke(entry.channel, ...mappedArgs)
        return entry.transform ? entry.transform(result) : result
      }
    }

    const dotIndex = key.indexOf('.')
    if (dotIndex !== -1) {
      const namespace = key.slice(0, dotIndex)
      const method = key.slice(dotIndex + 1)
      if (!nested[namespace]) nested[namespace] = {}
      nested[namespace][method] = fn
      continue
    }

    api[key] = fn
  }

  for (const [namespace, methods] of Object.entries(nested)) {
    api[namespace] = methods
  }

  return api as ElectronAPI
}
