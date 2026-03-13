import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'

const MAIN_DIR = path.resolve(import.meta.dir, '..')
const INDEX_PATH = path.join(MAIN_DIR, 'index.ts')
const BOOTSTRAP_HANDLERS_PATH = path.join(MAIN_DIR, 'bootstrap-handlers.ts')

const EXPECTED_INTERNAL_CHANNELS = [
  '__get-ws-port',
  '__get-ws-token',
  '__get-web-contents-id',
  '__get-workspace-id',
  '__transport:status',
  '__dialog:showMessageBox',
  '__dialog:showOpenDialog',
  '__deeplink:open',
  '__oauth:performFlow',
  '__oauth:performChatGptFlow',
  '__oauth:cancelChatGptFlow',
] as const

function collectInternalIpcChannels(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const channels: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression
      const method = node.expression.name.text
      const firstArgument = node.arguments[0]

      if (
        ts.isIdentifier(receiver) &&
        receiver.text === 'ipcMain' &&
        (method === 'handle' || method === 'on') &&
        firstArgument &&
        ts.isStringLiteral(firstArgument) &&
        firstArgument.text.startsWith('__')
      ) {
        channels.push(firstArgument.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return channels
}

describe('transport bootstrap handlers', () => {
  it('keeps internal preload bootstrap IPC out of main index', () => {
    expect(collectInternalIpcChannels(INDEX_PATH)).toEqual([])
  })

  it('centralizes the expected internal bootstrap IPC channels', () => {
    expect(collectInternalIpcChannels(BOOTSTRAP_HANDLERS_PATH).sort()).toEqual([...EXPECTED_INTERNAL_CHANNELS].sort())
  })
})
