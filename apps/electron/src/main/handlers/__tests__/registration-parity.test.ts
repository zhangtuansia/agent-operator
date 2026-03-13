import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as ts from 'typescript'

interface HandlerRegistration {
  file: string
  channel: string
}

function getCallExpressionChannel(callExpression: ts.CallExpression): string | null {
  const expression = callExpression.expression
  if (!ts.isPropertyAccessExpression(expression)) return null
  if (expression.name.text !== 'handle') return null
  if (!ts.isIdentifier(expression.expression) || !['ipcMain', 'server'].includes(expression.expression.text)) return null

  const firstArgument = callExpression.arguments[0]
  if (!firstArgument || !ts.isPropertyAccessExpression(firstArgument)) return null
  if (!ts.isIdentifier(firstArgument.expression) || firstArgument.expression.text !== 'IPC_CHANNELS') return null

  return firstArgument.name.text
}

function collectHandleRegistrations(fileUrl: URL): HandlerRegistration[] {
  const source = readFileSync(fileUrl, 'utf8')
  const sourceFile = ts.createSourceFile(fileUrl.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const registrations: HandlerRegistration[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const channel = getCallExpressionChannel(node)
      if (channel) {
        registrations.push({
          file: basename(fileUrl.pathname),
          channel,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return registrations
}

function getHandlerFileUrls(): URL[] {
  const handlersDir = new URL('../', import.meta.url)
  return readdirSync(handlersDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts')
    .map((entry) => new URL(`../${entry.name}`, import.meta.url))
}

describe('main handler registration parity', () => {
  it('does not register the same IPC handle channel in multiple handler modules', () => {
    const registrations = getHandlerFileUrls().flatMap(collectHandleRegistrations)
    const seen = new Map<string, string>()
    const duplicates: Array<{ channel: string; files: string[] }> = []

    for (const registration of registrations) {
      const previous = seen.get(registration.channel)
      if (!previous) {
        seen.set(registration.channel, registration.file)
        continue
      }
      duplicates.push({
        channel: registration.channel,
        files: [previous, registration.file],
      })
    }

    expect(duplicates).toEqual([])
  })

  it('does not leave extracted handler channels duplicated in ipc.ts', () => {
    const handlerChannels = new Set(getHandlerFileUrls().flatMap(collectHandleRegistrations).map((registration) => registration.channel))
    const ipcRegistrations = collectHandleRegistrations(new URL('../../ipc.ts', import.meta.url))
    const duplicated = ipcRegistrations
      .map((registration) => registration.channel)
      .filter((channel) => handlerChannels.has(channel))

    expect(duplicated).toEqual([])
  })

  it('covers the remaining Electron-local handler entry points', () => {
    const registrations = getHandlerFileUrls().flatMap(collectHandleRegistrations)
    const channels = new Set(registrations.map((registration) => registration.channel))

    expect(channels.has('GET_PENDING_DEEP_LINK')).toBe(true)
    expect(channels.has('OPEN_WORKSPACE')).toBe(true)
    expect(channels.has('OPEN_SESSION_IN_NEW_WINDOW')).toBe(true)
    expect(channels.has('CLOSE_WINDOW')).toBe(true)
    expect(channels.has('WINDOW_CONFIRM_CLOSE')).toBe(true)
    expect(channels.has('WINDOW_SET_TRAFFIC_LIGHTS')).toBe(true)
    expect(channels.has('BROWSER_PANE_CREATE')).toBe(true)
    expect(channels.has('BROWSER_PANE_DESTROY')).toBe(true)
    expect(channels.has('BROWSER_PANE_DOWNLOADS')).toBe(true)
    expect(channels.has('BROWSER_PANE_LIST')).toBe(true)
    expect(channels.has('BROWSER_PANE_NAVIGATE')).toBe(true)
    expect(channels.has('BROWSER_PANE_GO_BACK')).toBe(true)
    expect(channels.has('BROWSER_PANE_GO_FORWARD')).toBe(true)
    expect(channels.has('BROWSER_PANE_RELOAD')).toBe(true)
    expect(channels.has('BROWSER_PANE_STOP')).toBe(true)
    expect(channels.has('BROWSER_PANE_FOCUS')).toBe(true)
    expect(channels.has('BROWSER_PANE_LAUNCH')).toBe(true)
    expect(channels.has('BROWSER_PANE_SNAPSHOT')).toBe(true)
    expect(channels.has('BROWSER_PANE_CLICK')).toBe(true)
    expect(channels.has('BROWSER_PANE_CLICK_AT')).toBe(true)
    expect(channels.has('BROWSER_PANE_DRAG')).toBe(true)
    expect(channels.has('BROWSER_PANE_FILL')).toBe(true)
    expect(channels.has('BROWSER_PANE_SELECT')).toBe(true)
    expect(channels.has('BROWSER_PANE_UPLOAD')).toBe(true)
    expect(channels.has('BROWSER_PANE_TYPE')).toBe(true)
    expect(channels.has('BROWSER_PANE_KEY')).toBe(true)
    expect(channels.has('BROWSER_PANE_SCREENSHOT')).toBe(true)
    expect(channels.has('BROWSER_PANE_EVALUATE')).toBe(true)
    expect(channels.has('BROWSER_PANE_SCROLL')).toBe(true)
    expect(channels.has('BROWSER_PANE_WAIT')).toBe(true)
    expect(channels.has('BROWSER_PANE_CONSOLE')).toBe(true)
    expect(channels.has('BROWSER_PANE_NETWORK')).toBe(true)
    expect(channels.has('BROWSER_PANE_SET_CLIPBOARD')).toBe(true)
    expect(channels.has('BROWSER_PANE_GET_CLIPBOARD')).toBe(true)
    expect(channels.has('BROWSER_PANE_PASTE')).toBe(true)
    expect(channels.has('READ_FILE_OPTIONAL')).toBe(true)
    expect(channels.has('OPEN_URL')).toBe(false)
    expect(channels.has('MENU_UNDO')).toBe(true)
    expect(channels.has('MENU_REDO')).toBe(true)
    expect(channels.has('MENU_CUT')).toBe(true)
    expect(channels.has('MENU_COPY')).toBe(true)
    expect(channels.has('MENU_PASTE')).toBe(true)
    expect(channels.has('MENU_SELECT_ALL')).toBe(true)
    expect(channels.has('MENU_ZOOM_IN')).toBe(true)
    expect(channels.has('MENU_ZOOM_OUT')).toBe(true)
    expect(channels.has('MENU_ZOOM_RESET')).toBe(true)
    expect(channels.has('MENU_MINIMIZE')).toBe(true)
    expect(channels.has('MENU_MAXIMIZE')).toBe(true)
    expect(channels.has('MENU_NEW_WINDOW_ACTION')).toBe(true)
    expect(channels.has('GET_APP_VERSION')).toBe(true)
    expect(channels.has('GET_FONTS_PATH')).toBe(true)
    expect(channels.has('UPDATE_CHECK')).toBe(true)
    expect(channels.has('UPDATE_GET_INFO')).toBe(true)
    expect(channels.has('UPDATE_INSTALL')).toBe(true)
    expect(channels.has('UPDATE_DISMISS')).toBe(true)
    expect(channels.has('UPDATE_GET_DISMISSED')).toBe(true)
    expect(channels.has('NOTIFICATION_SHOW')).toBe(true)
    expect(channels.has('NOTIFICATION_GET_ENABLED')).toBe(true)
    expect(channels.has('NOTIFICATION_SET_ENABLED')).toBe(true)
    expect(channels.has('LANGUAGE_GET')).toBe(true)
    expect(channels.has('LANGUAGE_SET')).toBe(true)
    expect(channels.has('BADGE_UPDATE')).toBe(true)
    expect(channels.has('BADGE_CLEAR')).toBe(true)
    expect(channels.has('BADGE_SET_ICON')).toBe(true)
    expect(channels.has('WINDOW_GET_FOCUS_STATE')).toBe(true)
    expect(channels.has('SOURCES_ENSURE_GWS_INSTALLED')).toBe(true)
    expect(channels.has('PERMISSIONS_CHECK_FULL_DISK_ACCESS')).toBe(true)
    expect(channels.has('PERMISSIONS_OPEN_FULL_DISK_ACCESS_SETTINGS')).toBe(true)
    expect(channels.has('PERMISSIONS_PROMPT_FULL_DISK_ACCESS')).toBe(true)
    expect(channels.has('PERMISSIONS_CHECK_ACCESSIBILITY')).toBe(true)
    expect(channels.has('PERMISSIONS_OPEN_ACCESSIBILITY_SETTINGS')).toBe(true)
    expect(channels.has('PERMISSIONS_GET_ALL')).toBe(true)
    expect(channels.has('WINDOW_SET_TRAY_PANEL_HEIGHT')).toBe(true)
  })
})
