import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import * as ts from 'typescript'
import { IPC_CHANNELS } from '../../../shared/types'
import { RPC_CHANNELS } from '@agent-operator/shared/protocol'

function resolveRpcChannel(pathParts: string[]): string | null {
  let current: any = RPC_CHANNELS
  for (const part of pathParts) {
    current = current?.[part]
    if (typeof current === 'undefined') return null
  }
  return typeof current === 'string' ? current : null
}

function resolveHandleChannel(callExpression: ts.CallExpression): string | null {
  const expression = callExpression.expression
  if (!ts.isPropertyAccessExpression(expression)) return null
  if (expression.name.text !== 'handle') return null
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'server') return null

  const firstArgument = callExpression.arguments[0]
  if (!firstArgument || !ts.isPropertyAccessExpression(firstArgument)) return null

  if (ts.isIdentifier(firstArgument.expression) && firstArgument.expression.text === 'IPC_CHANNELS') {
    return IPC_CHANNELS[firstArgument.name.text as keyof typeof IPC_CHANNELS] ?? null
  }

  if (!ts.isPropertyAccessExpression(firstArgument.expression)) return null
  if (!ts.isIdentifier(firstArgument.expression.expression) || firstArgument.expression.expression.text !== 'RPC_CHANNELS') return null

  const pathParts = [firstArgument.expression.name.text, firstArgument.name.text]
  return resolveRpcChannel(pathParts)
}

function collectHandledWireChannels(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const channels: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const channel = resolveHandleChannel(node)
      if (channel) channels.push(channel)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return channels
}

function collectFromDir(dirPath: string): string[] {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts')
    .flatMap((entry) => collectHandledWireChannels(path.join(dirPath, entry.name)))
}

const LOCAL_HANDLER_DIR = path.resolve(import.meta.dir, '..')
const CORE_HANDLER_DIR = path.resolve(import.meta.dir, '../../../../../../packages/server-core/src/handlers/rpc')

const ALLOWED_DUPLICATES = new Set<string>()
const EXPECTED_LOCAL_HANDLER_FILES = [
  'browser.ts',
  'file-ops.ts',
  'im.ts',
  'oauth.ts',
  'permissions.ts',
  'sources.ts',
  'system.ts',
  'ui-preferences.ts',
  'workspace-window.ts',
] as const

describe('core/local handler channel collisions', () => {
  it('keeps only the expected Electron-local handler modules', () => {
    const files = readdirSync(LOCAL_HANDLER_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts' && entry.name !== 'handler-deps.ts')
      .map((entry) => entry.name)
      .sort()

    expect(files).toEqual([...EXPECTED_LOCAL_HANDLER_FILES].sort())
  })

  it('only keeps intentional overlaps while main-chain migration is in progress', () => {
    const localChannels = collectFromDir(LOCAL_HANDLER_DIR)
    const coreChannels = new Set(collectFromDir(CORE_HANDLER_DIR))
    const collisions = [...new Set(localChannels.filter((channel) => coreChannels.has(channel)))].sort()

    expect(collisions).toEqual([...ALLOWED_DUPLICATES].sort())
  })

  it('registers migrated legacy settings channels in server-core', () => {
    const coreChannels = new Set(collectFromDir(CORE_HANDLER_DIR))

    expect(coreChannels.has(IPC_CHANNELS.GET_LLM_API_KEY)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_GET_BILLING_METHOD)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_UPDATE_BILLING_METHOD)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_GET_AGENT_TYPE)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_SET_AGENT_TYPE)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_CHECK_CODEX_AUTH)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_START_CODEX_LOGIN)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_GET_STORED_CONFIG)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_UPDATE_PROVIDER_CONFIG)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_GET_MODEL)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.SETTINGS_SET_MODEL)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_GET)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_SET)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_ADD)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_UPDATE)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_DELETE)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.CUSTOM_MODELS_REORDER)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.ONBOARDING_GET_EXISTING_CLAUDE_TOKEN)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.ONBOARDING_IS_CLAUDE_CLI_INSTALLED)).toBe(true)
    expect(coreChannels.has(IPC_CHANNELS.ONBOARDING_RUN_CLAUDE_SETUP_TOKEN)).toBe(true)
  })
})
