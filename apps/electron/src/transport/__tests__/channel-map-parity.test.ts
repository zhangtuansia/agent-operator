import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import * as ts from 'typescript'
import { IPC_CHANNELS } from '../../shared/types'
import { CHANNEL_MAP } from '../channel-map'
import { shouldUseWsChannel } from '../ws-channels'

function getInterfaceMethodNames(sourceFile: ts.SourceFile, interfaceName: string): string[] {
  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== interfaceName) continue

    return statement.members
      .filter((member): member is ts.MethodSignature => ts.isMethodSignature(member))
      .map((member) => member.name)
      .filter((name): name is ts.Identifier => ts.isIdentifier(name))
      .map((name) => name.text)
  }

  throw new Error(`${interfaceName} interface not found`)
}

function getChannelMapMethodNames(): string[] {
  const source = readFileSync(new URL('../../shared/types.ts', import.meta.url), 'utf8')
  const sourceFile = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const preloadOnlyMethods = new Set([
    'performOAuth',
    'getTransportConnectionState',
    'onTransportConnectionStateChanged',
    'reconnectTransport',
    'isChannelAvailable',
  ])
  const electronApiMethods = getInterfaceMethodNames(sourceFile, 'ElectronAPI')
    .filter((name) => !preloadOnlyMethods.has(name))
  const browserPaneMethods = getInterfaceMethodNames(sourceFile, 'BrowserPaneAPI').map((name) => `browserPane.${name}`)

  return [...electronApiMethods, ...browserPaneMethods]
}

describe('CHANNEL_MAP parity', () => {
  it('covers every ElectronAPI method exactly once', () => {
    const apiMethods = new Set(getChannelMapMethodNames())
    const channelMapKeys = new Set(Object.keys(CHANNEL_MAP))

    const missing = [...apiMethods].filter((name) => !channelMapKeys.has(name))
    const extra = [...channelMapKeys].filter((name) => !apiMethods.has(name))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('contains valid invoke/listener entries', () => {
    const entries = Object.values(CHANNEL_MAP)

    expect(entries.some((entry) => entry.type === 'invoke')).toBe(true)
    expect(entries.some((entry) => entry.type === 'listener')).toBe(true)

    for (const entry of entries) {
      expect(typeof entry.channel).toBe('string')
      expect(entry.channel.length).toBeGreaterThan(0)
    }
  })

  it('routes migrated server-core listener channels over WS', () => {
    const migratedListenerChannels = [
      IPC_CHANNELS.SESSION_EVENT,
      IPC_CHANNELS.SESSION_FILES_CHANGED,
      IPC_CHANNELS.SOURCES_CHANGED,
      IPC_CHANNELS.SKILLS_CHANGED,
      IPC_CHANNELS.LABELS_CHANGED,
      IPC_CHANNELS.STATUSES_CHANGED,
      IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED,
      IPC_CHANNELS.AUTOMATIONS_CHANGED,
      IPC_CHANNELS.IM_STATUS_CHANGED,
      IPC_CHANNELS.IM_MESSAGE_RECEIVED,
    ]

    for (const channel of migratedListenerChannels) {
      expect(shouldUseWsChannel(channel)).toBe(true)
    }
  })
})
