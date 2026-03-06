import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import * as ts from 'typescript'
import { CHANNEL_MAP } from '../channel-map'

function getElectronApiMethodNames(): string[] {
  const source = readFileSync(new URL('../../shared/types.ts', import.meta.url), 'utf8')
  const sourceFile = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'ElectronAPI') continue

    return statement.members
      .filter((member): member is ts.MethodSignature => ts.isMethodSignature(member))
      .map((member) => member.name)
      .filter((name): name is ts.Identifier => ts.isIdentifier(name))
      .map((name) => name.text)
  }

  throw new Error('ElectronAPI interface not found')
}

describe('CHANNEL_MAP parity', () => {
  it('covers every ElectronAPI method exactly once', () => {
    const apiMethods = new Set(getElectronApiMethodNames())
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
})
