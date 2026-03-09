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
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'ipcMain') return null

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

  it('covers the extracted settings and llm connection entry points', () => {
    const registrations = getHandlerFileUrls().flatMap(collectHandleRegistrations)
    const channels = new Set(registrations.map((registration) => registration.channel))

    expect(channels.has('SETTINGS_GET_BILLING_METHOD')).toBe(true)
    expect(channels.has('SETTINGS_UPDATE_BILLING_METHOD')).toBe(true)
    expect(channels.has('SETTINGS_GET_AGENT_TYPE')).toBe(true)
    expect(channels.has('SETTINGS_START_CODEX_LOGIN')).toBe(true)
    expect(channels.has('SETTINGS_GET_STORED_CONFIG')).toBe(true)
    expect(channels.has('SETUP_LLM_CONNECTION')).toBe(true)
    expect(channels.has('SETTINGS_TEST_API_CONNECTION')).toBe(true)
    expect(channels.has('SETTINGS_TEST_OPENAI_CONNECTION')).toBe(true)
    expect(channels.has('LLM_CONNECTION_TEST')).toBe(true)
    expect(channels.has('CHATGPT_START_OAUTH')).toBe(true)
    expect(channels.has('COPILOT_START_OAUTH')).toBe(true)
    expect(channels.has('GET_SESSIONS')).toBe(true)
    expect(channels.has('GET_SESSION_MESSAGES')).toBe(true)
    expect(channels.has('SEARCH_SESSION_CONTENT')).toBe(true)
    expect(channels.has('CREATE_SESSION')).toBe(true)
    expect(channels.has('CREATE_SUB_SESSION')).toBe(true)
    expect(channels.has('DELETE_SESSION')).toBe(true)
    expect(channels.has('IMPORT_SESSIONS')).toBe(true)
    expect(channels.has('SEND_MESSAGE')).toBe(true)
    expect(channels.has('CANCEL_PROCESSING')).toBe(true)
    expect(channels.has('KILL_SHELL')).toBe(true)
    expect(channels.has('GET_TASK_OUTPUT')).toBe(true)
    expect(channels.has('RESPOND_TO_PERMISSION')).toBe(true)
    expect(channels.has('RESPOND_TO_CREDENTIAL')).toBe(true)
    expect(channels.has('SESSION_COMMAND')).toBe(true)
    expect(channels.has('GET_PENDING_PLAN_EXECUTION')).toBe(true)
    expect(channels.has('GET_WORKSPACES')).toBe(true)
    expect(channels.has('CREATE_WORKSPACE')).toBe(true)
    expect(channels.has('CHECK_WORKSPACE_SLUG')).toBe(true)
    expect(channels.has('GET_WINDOW_WORKSPACE')).toBe(true)
    expect(channels.has('GET_PENDING_DEEP_LINK')).toBe(true)
    expect(channels.has('OPEN_WORKSPACE')).toBe(true)
    expect(channels.has('OPEN_SESSION_IN_NEW_WINDOW')).toBe(true)
    expect(channels.has('GET_WINDOW_MODE')).toBe(true)
    expect(channels.has('CLOSE_WINDOW')).toBe(true)
    expect(channels.has('WINDOW_CONFIRM_CLOSE')).toBe(true)
    expect(channels.has('WINDOW_SET_TRAFFIC_LIGHTS')).toBe(true)
    expect(channels.has('SWITCH_WORKSPACE')).toBe(true)
    expect(channels.has('BROWSER_PANE_CREATE')).toBe(true)
    expect(channels.has('BROWSER_PANE_DESTROY')).toBe(true)
    expect(channels.has('BROWSER_PANE_LIST')).toBe(true)
    expect(channels.has('BROWSER_PANE_NAVIGATE')).toBe(true)
    expect(channels.has('BROWSER_PANE_GO_BACK')).toBe(true)
    expect(channels.has('BROWSER_PANE_GO_FORWARD')).toBe(true)
    expect(channels.has('BROWSER_PANE_RELOAD')).toBe(true)
    expect(channels.has('BROWSER_PANE_STOP')).toBe(true)
    expect(channels.has('BROWSER_PANE_FOCUS')).toBe(true)
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
    expect(channels.has('READ_FILE')).toBe(true)
    expect(channels.has('OPEN_FILE_DIALOG')).toBe(true)
    expect(channels.has('READ_FILE_ATTACHMENT')).toBe(true)
    expect(channels.has('GENERATE_THUMBNAIL')).toBe(true)
    expect(channels.has('STORE_ATTACHMENT')).toBe(true)
    expect(channels.has('OPEN_URL')).toBe(true)
    expect(channels.has('OPEN_FILE')).toBe(true)
    expect(channels.has('SHOW_IN_FOLDER')).toBe(true)
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
    expect(channels.has('GET_SYSTEM_THEME')).toBe(true)
    expect(channels.has('GET_HOME_DIR')).toBe(true)
    expect(channels.has('IS_DEBUG_MODE')).toBe(true)
    expect(channels.has('GITBASH_CHECK')).toBe(true)
    expect(channels.has('GITBASH_BROWSE')).toBe(true)
    expect(channels.has('GITBASH_SET_PATH')).toBe(true)
    expect(channels.has('GET_APP_VERSION')).toBe(true)
    expect(channels.has('GET_VERSIONS')).toBe(true)
    expect(channels.has('GET_RELEASE_NOTES')).toBe(true)
    expect(channels.has('GET_LATEST_RELEASE_VERSION')).toBe(true)
    expect(channels.has('GET_FONTS_PATH')).toBe(true)
    expect(channels.has('UPDATE_CHECK')).toBe(true)
    expect(channels.has('UPDATE_GET_INFO')).toBe(true)
    expect(channels.has('UPDATE_INSTALL')).toBe(true)
    expect(channels.has('UPDATE_DISMISS')).toBe(true)
    expect(channels.has('UPDATE_GET_DISMISSED')).toBe(true)
    expect(channels.has('THEME_GET_APP')).toBe(true)
    expect(channels.has('THEME_GET_PRESETS')).toBe(true)
    expect(channels.has('THEME_LOAD_PRESET')).toBe(true)
    expect(channels.has('THEME_GET_COLOR_THEME')).toBe(true)
    expect(channels.has('THEME_SET_COLOR_THEME')).toBe(true)
    expect(channels.has('THEME_BROADCAST_PREFERENCES')).toBe(true)
    expect(channels.has('THEME_GET_WORKSPACE_COLOR_THEME')).toBe(true)
    expect(channels.has('THEME_SET_WORKSPACE_COLOR_THEME')).toBe(true)
    expect(channels.has('THEME_WORKSPACE_CHANGED')).toBe(true)
    expect(channels.has('THEME_GET_ALL_WORKSPACE_THEMES')).toBe(true)
    expect(channels.has('LOGO_GET_URL')).toBe(true)
    expect(channels.has('TOOL_ICONS_GET_MAPPINGS')).toBe(true)
    expect(channels.has('APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS')).toBe(true)
    expect(channels.has('APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS')).toBe(true)
    expect(channels.has('NOTIFICATION_SHOW')).toBe(true)
    expect(channels.has('NOTIFICATION_GET_ENABLED')).toBe(true)
    expect(channels.has('NOTIFICATION_SET_ENABLED')).toBe(true)
    expect(channels.has('LANGUAGE_GET')).toBe(true)
    expect(channels.has('LANGUAGE_SET')).toBe(true)
    expect(channels.has('INPUT_GET_AUTO_CAPITALISATION')).toBe(true)
    expect(channels.has('INPUT_SET_AUTO_CAPITALISATION')).toBe(true)
    expect(channels.has('INPUT_GET_SEND_MESSAGE_KEY')).toBe(true)
    expect(channels.has('INPUT_SET_SEND_MESSAGE_KEY')).toBe(true)
    expect(channels.has('INPUT_GET_SPELL_CHECK')).toBe(true)
    expect(channels.has('INPUT_SET_SPELL_CHECK')).toBe(true)
    expect(channels.has('POWER_GET_KEEP_AWAKE')).toBe(true)
    expect(channels.has('POWER_SET_KEEP_AWAKE')).toBe(true)
    expect(channels.has('BADGE_UPDATE')).toBe(true)
    expect(channels.has('BADGE_CLEAR')).toBe(true)
    expect(channels.has('BADGE_SET_ICON')).toBe(true)
    expect(channels.has('WINDOW_GET_FOCUS_STATE')).toBe(true)
    expect(channels.has('GET_SESSION_FILES')).toBe(true)
    expect(channels.has('WATCH_SESSION_FILES')).toBe(true)
    expect(channels.has('GET_SESSION_NOTES')).toBe(true)
    expect(channels.has('SKILLS_GET')).toBe(true)
    expect(channels.has('SKILLS_OPEN_FINDER')).toBe(true)
    expect(channels.has('SKILLS_IMPORT_CONTENT')).toBe(true)
    expect(channels.has('SOURCES_ENSURE_GWS_INSTALLED')).toBe(true)
    expect(channels.has('SOURCES_GET')).toBe(true)
    expect(channels.has('SOURCES_UPDATE')).toBe(true)
    expect(channels.has('SOURCES_START_OAUTH')).toBe(true)
    expect(channels.has('SOURCES_GET_MCP_TOOLS')).toBe(true)
    expect(channels.has('WORKSPACE_GET_PERMISSIONS')).toBe(true)
    expect(channels.has('DEFAULT_PERMISSIONS_GET')).toBe(true)
    expect(channels.has('STATUSES_LIST')).toBe(true)
    expect(channels.has('LABELS_LIST')).toBe(true)
    expect(channels.has('VIEWS_LIST')).toBe(true)
    expect(channels.has('WORKSPACE_READ_IMAGE')).toBe(true)
  })
})
