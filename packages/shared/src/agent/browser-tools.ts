import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

export interface BrowserToolNode {
  ref: string
  role: string
  name: string
  value?: string
  description?: string
  focused?: boolean
  checked?: boolean
  disabled?: boolean
}

export interface BrowserToolWindow {
  id: string
  title: string
  url: string
  isVisible: boolean
  ownerType: 'session' | 'manual'
  ownerSessionId: string | null
  boundSessionId: string | null
  agentControlActive?: boolean
}

export interface BrowserToolConsoleEntry {
  level: 'log' | 'warning' | 'error' | 'debug' | 'info'
  message: string
  sourceId?: string
  line?: number
  timestamp: number
}

export interface BrowserToolNetworkEntry {
  id: number | string
  method: string
  url: string
  status?: number
  resourceType?: string
  errorText?: string
  state: 'pending' | 'completed' | 'failed'
  timestamp: number
}

export interface BrowserToolWaitResult {
  kind: 'selector' | 'text' | 'url' | 'network-idle'
  matched: string
  timeoutMs: number
  elapsedMs: number
}

export interface BrowserToolKeyOptions {
  modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>
}

export interface BrowserLifecycleActionResult {
  action: 'closed' | 'hidden' | 'released' | 'noop'
  requestedInstanceId?: string
  resolvedInstanceId?: string
  affectedIds: string[]
  reason?: string
}

export interface BrowserPaneFns {
  openPanel: (options?: { background?: boolean }) => Promise<{ instanceId: string }>
  navigate: (url: string) => Promise<{ url: string; title: string }>
  snapshot: () => Promise<{ url: string; title: string; nodes: BrowserToolNode[] }>
  click: (ref: string, options?: { waitFor?: 'none' | 'navigation' | 'network-idle'; timeoutMs?: number }) => Promise<void>
  clickAt: (x: number, y: number) => Promise<void>
  drag: (x1: number, y1: number, x2: number, y2: number) => Promise<void>
  fill: (ref: string, value: string) => Promise<void>
  upload: (ref: string, filePaths: string[]) => Promise<void>
  typeText: (text: string) => Promise<void>
  pressKey: (key: string, options?: BrowserToolKeyOptions) => Promise<void>
  select: (ref: string, value: string) => Promise<void>
  screenshot: (args?: { annotate?: boolean; format?: 'png' | 'jpeg' }) => Promise<{
    imageBuffer: Buffer
    imageFormat: 'png' | 'jpeg'
    metadata?: Record<string, unknown>
  }>
  scroll: (direction: 'up' | 'down' | 'left' | 'right', amount?: number) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  evaluate: (expression: string) => Promise<unknown>
  wait: (args: { kind: BrowserToolWaitResult['kind']; value?: string; timeoutMs?: number }) => Promise<BrowserToolWaitResult>
  getConsoleEntries: (limit?: number, level?: BrowserToolConsoleEntry['level'] | 'all') => Promise<BrowserToolConsoleEntry[]>
  getNetworkEntries: (limit?: number, state?: BrowserToolNetworkEntry['state'] | 'all') => Promise<BrowserToolNetworkEntry[]>
  setClipboard: (text: string) => Promise<void>
  getClipboard: () => Promise<string>
  paste: (text: string) => Promise<void>
  focusWindow: (instanceId?: string) => Promise<{ instanceId: string; title: string; url: string }>
  closeWindow: (instanceId?: string) => Promise<BrowserLifecycleActionResult>
  hideWindow: (instanceId?: string) => Promise<BrowserLifecycleActionResult>
  releaseControl: (instanceId?: string) => Promise<BrowserLifecycleActionResult>
  listWindows: () => Promise<BrowserToolWindow[]>
}

export interface BrowserToolsOptions {
  sessionId: string
  getBrowserPaneFns: () => BrowserPaneFns | undefined
}

type ToolResult = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg' }
  >
  isError?: boolean
}

const BROWSER_RELEASE_HINT = '\n\n当你用完浏览器后，调用 `browser_tool close` 可以彻底关闭窗口；调用 `browser_tool hide` 或 `browser_tool release` 可以隐藏窗口但保留当前状态。'
const BROWSER_SEARCH_URL_BASE = 'https://www.bing.com/search?q='

function buildBrowserSearchUrl(query: string): string {
  return `${BROWSER_SEARCH_URL_BASE}${encodeURIComponent(query.trim())}`
}

const BROWSER_TOOL_DESCRIPTION = `Run browser actions using a single CLI-like command.

Use this when you need Dazi's built-in browser windows. The tool can:
- open or focus a browser window
- search the web inside the built-in browser
- navigate to a URL or search term
- snapshot accessibility elements and return stable refs like @e1
- click, click at coordinates, drag, fill, type, select, upload files
- wait for selectors/text/URLs/network idle
- inspect console and network activity
- read/write/paste clipboard text
- scroll, go back/forward
- run JavaScript in page context
- capture screenshots
- list, focus, hide, release, or close managed browser windows

Examples:
- \`--help\`
- \`open\`
- \`open --foreground\`
- \`search latest React 19 docs\`
- \`navigate https://example.com\`
- \`snapshot\`
- \`find login button\`
- \`click @e12\`
- \`click-at 350 220\`
- \`drag 100 200 300 260\`
- \`click @e12 network-idle 5000\`
- \`fill @e5 user@example.com\`
- \`type hello world\`
- \`select @e3 optionValue\`
- \`upload @e7 /absolute/path/to/file.pdf\`
- \`set-clipboard Hello\`
- \`get-clipboard\`
- \`paste Name\\tAge\\nAlice\\t30\`
- \`scroll down 800\`
- \`wait selector input[type="email"] 5000\`
- \`console 100 warning\`
- \`network 50 failed\`
- \`key Enter\`
- \`key k meta\`
- \`evaluate document.title\`
- \`screenshot --annotated\`
- \`windows\`
- \`focus\`
- \`hide\`
- \`close\`

String mode supports semicolon-separated batches:
\`fill @e1 name; fill @e2 email@example.com; click @e3\`

Array mode preserves raw arguments exactly:
\`["evaluate", "document.title"]\`
\`["navigate", "example.com"]\`
\`["search", "latest React 19 docs"]\``

function errorResponse(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

function successResponse(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  }
}

function decodeEscapes(input: string): string {
  return input.replace(/\\(.)/g, (_match, ch: string) => {
    if (ch === 'n') return '\n'
    if (ch === 't') return '\t'
    if (ch === 'r') return '\r'
    if (ch === '"') return '"'
    if (ch === "'") return "'"
    if (ch === '\\') return '\\'
    return `\\${ch}`
  })
}

function splitBatchCommands(input: string): string[] {
  const commands: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!

    if (escaped) {
      current += ch
      escaped = false
      continue
    }

    if (ch === '\\') {
      current += ch
      escaped = true
      continue
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      continue
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
      continue
    }

    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = current.trim()
      if (trimmed) commands.push(trimmed)
      current = ''
      continue
    }

    current += ch
  }

  if (inSingle || inDouble) {
    throw new Error('Parse error: unclosed quote in browser_tool command.')
  }

  const trimmed = current.trim()
  if (trimmed) commands.push(trimmed)
  return commands
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let tokenStarted = false
  let inSingle = false
  let inDouble = false
  let escaped = false

  const pushCurrent = () => {
    if (!tokenStarted) return
    tokens.push(decodeEscapes(current))
    current = ''
    tokenStarted = false
  }

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!

    if (escaped) {
      current += `\\${ch}`
      tokenStarted = true
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      tokenStarted = true
      continue
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      tokenStarted = true
      continue
    }

    if (!inSingle && !inDouble && /\s/.test(ch)) {
      pushCurrent()
      continue
    }

    current += ch
    tokenStarted = true
  }

  if (inSingle || inDouble) {
    throw new Error('Parse error: unclosed quote in browser_tool command.')
  }

  pushCurrent()
  return tokens
}

function formatNodeLine(node: BrowserToolNode): string {
  let line = `  ${node.ref} [${node.role}] "${node.name}"`
  if (node.value !== undefined && node.value !== '') line += ` value="${node.value}"`
  if (node.focused) line += ' (focused)'
  if (node.checked) line += ' (checked)'
  if (node.disabled) line += ' (disabled)'
  if (node.description) line += ` — ${node.description}`
  return line
}

function shortText(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return String(value)
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '[Result contains non-serializable data]'
  }
}

function summarizeWindows(windows: BrowserToolWindow[]): string {
  const visible = windows.filter((win) => win.isVisible).length
  const locked = windows.filter((win) => !!win.boundSessionId).length
  return `total=${windows.length}, visible=${visible}, locked=${locked}`
}

function formatLifecycleResult(result: BrowserLifecycleActionResult): string {
  if (result.action === 'noop') {
    return [
      'No browser window state changed.',
      result.reason ? `Reason: ${result.reason}` : undefined,
      result.requestedInstanceId ? `Requested: ${result.requestedInstanceId}` : undefined,
    ].filter(Boolean).join(' ')
  }

  return [
    `Action: ${result.action}`,
    `resolved=${result.resolvedInstanceId ?? 'none'}`,
    `affected=[${result.affectedIds.join(', ') || 'none'}]`,
  ].join(', ')
}

function normalizeConsoleLevel(input?: string): BrowserToolConsoleEntry['level'] | 'all' {
  if (!input) return 'all'
  const normalized = input.toLowerCase()
  if (normalized === 'all') return 'all'
  if (normalized === 'warn') return 'warning'
  if (normalized === 'log' || normalized === 'warning' || normalized === 'error' || normalized === 'debug' || normalized === 'info') {
    return normalized
  }
  throw new Error(`Invalid console level "${input}". Use one of: all, log, info, warning, warn, error, debug.`)
}

function normalizeKeyModifiers(tokens: string[]): Array<'shift' | 'control' | 'alt' | 'meta'> {
  const modifiers = tokens
    .flatMap((token) => token.split('+'))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)

  for (const modifier of modifiers) {
    if (!['shift', 'control', 'alt', 'meta'].includes(modifier)) {
      throw new Error(`Invalid key modifier "${modifier}". Use shift|control|alt|meta`)
    }
  }

  return modifiers as Array<'shift' | 'control' | 'alt' | 'meta'>
}

function formatNetworkEntry(entry: BrowserToolNetworkEntry): string {
  const status = entry.status != null ? String(entry.status) : entry.state
  const resource = entry.resourceType ?? 'unknown'
  const suffix = entry.errorText ? ` (${entry.errorText})` : ''
  return `[${new Date(entry.timestamp).toISOString()}] ${entry.method} ${status} ${resource} ${entry.url}${suffix}`
}

function matchesNetworkFilter(entry: BrowserToolNetworkEntry, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'pending':
    case 'completed':
    case 'failed':
      return entry.state === filter
    case '2xx':
      return (entry.status ?? 0) >= 200 && (entry.status ?? 0) < 300
    case '3xx':
      return (entry.status ?? 0) >= 300 && (entry.status ?? 0) < 400
    case '4xx':
      return (entry.status ?? 0) >= 400 && (entry.status ?? 0) < 500
    case '5xx':
      return (entry.status ?? 0) >= 500 && (entry.status ?? 0) < 600
    default:
      return false
  }
}

function scoreNode(node: BrowserToolNode, keywords: string[]): number | null {
  const haystack = [node.role, node.name, node.value, node.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!keywords.every((keyword) => haystack.includes(keyword))) return null

  let score = 0
  for (const keyword of keywords) {
    if ((node.name ?? '').toLowerCase().includes(keyword)) score += 3
    if ((node.role ?? '').toLowerCase().includes(keyword)) score += 2
    if ((node.value ?? '').toLowerCase().includes(keyword)) score += 1
    if ((node.description ?? '').toLowerCase().includes(keyword)) score += 1
  }
  return score
}

const NAVIGATION_COMMANDS = new Set(['search', 'navigate', 'click', 'back', 'forward'])

async function executeBrowserToolCommand(args: {
  command: string | string[]
  fns: BrowserPaneFns
}): Promise<{ output: string; appendReleaseHint: boolean; image?: { data: string; mimeType: 'image/png' | 'image/jpeg' } }> {
  if (Array.isArray(args.command)) {
    if (args.command.length === 0) {
      throw new Error('Missing command. Use "--help" to see supported browser_tool commands.')
    }
    return executeSingleCommand(args.command, args.fns)
  }

  const trimmed = args.command.trim()
  if (!trimmed) {
    throw new Error('Missing command. Use "--help" to see supported browser_tool commands.')
  }

  const commands = splitBatchCommands(trimmed)
  if (commands.length === 1) {
    return executeSingleCommand(trimmed, args.fns)
  }

  const outputs: string[] = []
  let lastImage: { data: string; mimeType: 'image/png' | 'image/jpeg' } | undefined
  let appendReleaseHint = false

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index]!
    const result = await executeSingleCommand(command, args.fns)
    outputs.push(result.output)
    if (result.image) lastImage = result.image
    if (result.appendReleaseHint) appendReleaseHint = true

    const verb = tokenizeCommand(command)[0]?.toLowerCase()
    if (verb && NAVIGATION_COMMANDS.has(verb) && index < commands.length - 1) {
      outputs.push(`(stopped batch after "${verb}" — page may have changed, run snapshot again before continuing)`)
      break
    }
  }

  return {
    output: outputs.join('\n'),
    appendReleaseHint,
    image: lastImage,
  }
}

async function executeSingleCommand(
  command: string | string[],
  fns: BrowserPaneFns,
): Promise<{ output: string; appendReleaseHint: boolean; image?: { data: string; mimeType: 'image/png' | 'image/jpeg' } }> {
  const parts = Array.isArray(command) ? command : tokenizeCommand(command.trim())
  const cmd = parts[0]?.toLowerCase()

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    return {
      output: [
        'browser_tool command help',
        '',
        'Usage:',
        '  --help',
        '  open [--foreground|-f]',
        '  search <query>',
        '  navigate <url|search terms>',
        '  snapshot',
        '  find <query>',
        '  click <ref> [none|navigation|network-idle] [timeoutMs]',
        '  click-at <x> <y>',
        '  drag <x1> <y1> <x2> <y2>',
        '  fill <ref> <value>',
        '  type <text>',
        '  select <ref> <value>',
        '  upload <ref> <path> [path2...]',
        '  set-clipboard <text>',
        '  get-clipboard',
        '  paste <text>',
        '  screenshot [--annotated|-a] [--png]',
        '  scroll <up|down|left|right> [amount]',
        '  wait <selector|text|url|network-idle> <value?> [timeoutMs]',
        '  console [limit] [level]',
        '  network [limit] [pending|completed|failed|2xx|3xx|4xx|5xx|all]',
        '  key <key> [modifier[+modifier] ...]',
        '  back',
        '  forward',
        '  evaluate <expression>',
        '  windows',
        '  focus [windowId]',
        '  hide [windowId]',
        '  release [windowId]',
        '  close [windowId]',
        '',
        'Batching:',
        '  fill @e1 name; fill @e2 email@example.com; click @e3',
      ].join('\n'),
      appendReleaseHint: false,
    }
  }

  if (cmd === 'open') {
    const foreground = parts.includes('--foreground') || parts.includes('-f')
    const before = await fns.listWindows()
    const result = await fns.openPanel({ background: !foreground })
    const after = await fns.listWindows()
    const reused = before.some((win) => win.id === result.instanceId)
    return {
      output: [
        `Opened browser window (${foreground ? 'foreground' : 'background'})`,
        `Instance: ${result.instanceId}`,
        `Window state: ${reused ? 'reused existing window' : 'created new window'}`,
        `Session windows: ${summarizeWindows(after)}`,
      ].join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'navigate') {
    const url = parts.slice(1).join(' ').trim()
    if (!url) throw new Error('navigate requires a URL or search term. Example: navigate https://example.com')
    const result = await fns.navigate(url)
    return {
      output: `Navigated to: ${result.url}\nTitle: ${result.title}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'search') {
    const query = parts.slice(1).join(' ').trim()
    if (!query) throw new Error('search requires a query. Example: search latest React 19 docs')
    const result = await fns.navigate(buildBrowserSearchUrl(query))
    return {
      output: `Searched for: ${query}\nSearch URL: ${result.url}\nTitle: ${result.title}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'snapshot') {
    const snapshot = await fns.snapshot()
    const lines = [
      `URL: ${snapshot.url}`,
      `Title: ${snapshot.title}`,
      `Elements: ${snapshot.nodes.length}`,
      '',
      `Elements (${snapshot.nodes.length}):`,
      ...snapshot.nodes.map(formatNodeLine),
    ]
    if (snapshot.nodes.length === 0) {
      lines.push('', 'No accessibility elements were detected on this page.')
    }
    return {
      output: lines.join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'find') {
    const query = parts.slice(1).join(' ').trim()
    if (!query) throw new Error('find requires a query. Example: find login button')
    const snapshot = await fns.snapshot()
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
    const results = snapshot.nodes
      .map((node) => {
        const score = scoreNode(node, keywords)
        return score == null ? null : { node, score }
      })
      .filter((entry): entry is { node: BrowserToolNode; score: number } => !!entry)
      .sort((a, b) => b.score - a.score)

    if (results.length === 0) {
      return {
        output: `No elements found matching "${query}" (searched ${snapshot.nodes.length} elements).`,
        appendReleaseHint: true,
      }
    }

    return {
      output: [
        `Found ${results.length} element(s) matching "${query}":`,
        ...results.slice(0, 20).map(({ node, score }) => `${formatNodeLine(node)} (score=${score})`),
      ].join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'click') {
    const ref = parts[1]
    if (!ref) throw new Error('click requires a ref. Example: click @e1')
    const waitForRaw = parts[2] as 'none' | 'navigation' | 'network-idle' | undefined
    const timeoutRaw = parts[3]
    const waitFor = waitForRaw && ['none', 'navigation', 'network-idle'].includes(waitForRaw) ? waitForRaw : undefined
    if (waitForRaw && !waitFor) {
      throw new Error('click waitFor must be one of: none, navigation, network-idle')
    }
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined
    if (timeoutRaw && Number.isNaN(timeoutMs)) {
      throw new Error(`Invalid click timeout "${timeoutRaw}". Expected a number.`)
    }
    await fns.click(ref, { waitFor, timeoutMs })
    return {
      output: `Clicked element ${ref}${waitFor ? ` (waitFor=${waitFor})` : ''}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'click-at') {
    const x = Number(parts[1])
    const y = Number(parts[2])
    if (Number.isNaN(x) || Number.isNaN(y)) {
      throw new Error('click-at requires numeric coordinates. Example: click-at 350 220')
    }
    await fns.clickAt(x, y)
    return {
      output: `Clicked at coordinates (${x}, ${y}).`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'drag') {
    const x1 = Number(parts[1])
    const y1 = Number(parts[2])
    const x2 = Number(parts[3])
    const y2 = Number(parts[4])
    if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) {
      throw new Error('drag requires 4 numeric coordinates. Example: drag 100 200 300 260')
    }
    await fns.drag(x1, y1, x2, y2)
    const distance = Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2))
    return {
      output: `Dragged from (${x1}, ${y1}) to (${x2}, ${y2}) (${distance}px).`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'fill') {
    const ref = parts[1]
    const value = parts.slice(2).join(' ')
    if (!ref || !value) throw new Error('fill requires a ref and value. Example: fill @e5 user@example.com')
    await fns.fill(ref, value)
    return {
      output: `Filled ${ref} with "${shortText(value, 80)}"`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'type') {
    const text = parts.slice(1).join(' ')
    if (!text) throw new Error('type requires text. Example: type hello world')
    await fns.typeText(text)
    return {
      output: `Typed ${text.length} characters into the focused element.`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'select') {
    const ref = parts[1]
    const value = parts.slice(2).join(' ')
    if (!ref || !value) throw new Error('select requires a ref and value. Example: select @e3 optionValue')
    await fns.select(ref, value)
    return {
      output: `Selected "${shortText(value, 80)}" on ${ref}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'upload') {
    const ref = parts[1]
    const filePaths = parts.slice(2)
    if (!ref || filePaths.length === 0) {
      throw new Error('upload requires a ref and file path(s). Example: upload @e7 /absolute/path/to/file.pdf')
    }
    await fns.upload(ref, filePaths)
    return {
      output: `Uploaded ${filePaths.length} file(s) to ${ref}.`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'set-clipboard') {
    const text = parts.slice(1).join(' ')
    if (!text) throw new Error('set-clipboard requires text. Example: set-clipboard Hello World')
    await fns.setClipboard(text)
    return {
      output: `Clipboard updated (${text.length} chars).`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'get-clipboard') {
    const text = await fns.getClipboard()
    return {
      output: text ? `Clipboard:\n${text}` : '(empty clipboard)',
      appendReleaseHint: true,
    }
  }

  if (cmd === 'paste') {
    const text = parts.slice(1).join(' ')
    if (!text) throw new Error('paste requires text. Example: paste Hello World')
    await fns.paste(text)
    return {
      output: `Pasted ${text.length} characters into the focused element.`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'screenshot') {
    const annotate = parts.includes('--annotated') || parts.includes('-a')
    const format = parts.includes('--png') ? 'png' : 'jpeg'
    const result = await fns.screenshot({ annotate, format })
    const mimeType = result.imageFormat === 'png' ? 'image/png' : 'image/jpeg'
    return {
      output: annotate
        ? `Captured annotated screenshot (${result.imageFormat.toUpperCase()}).`
        : `Captured screenshot (${result.imageFormat.toUpperCase()}).`,
      appendReleaseHint: true,
      image: {
        data: result.imageBuffer.toString('base64'),
        mimeType,
      },
    }
  }

  if (cmd === 'scroll') {
    const direction = parts[1] as 'up' | 'down' | 'left' | 'right' | undefined
    if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
      throw new Error('scroll requires a direction: up, down, left, or right.')
    }
    const amountRaw = parts[2]
    const amount = amountRaw ? Number(amountRaw) : undefined
    if (amountRaw && Number.isNaN(amount)) {
      throw new Error(`Invalid scroll amount "${amountRaw}". Expected a number.`)
    }
    await fns.scroll(direction, amount)
    return {
      output: `Scrolled ${direction}${amount ? ` by ${amount}` : ''}.`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'wait') {
    const kind = parts[1] as BrowserToolWaitResult['kind'] | undefined
    if (!kind || !['selector', 'text', 'url', 'network-idle'].includes(kind)) {
      throw new Error('wait requires kind: selector|text|url|network-idle')
    }

    let value: string | undefined
    let timeoutMs: number | undefined
    if (kind === 'network-idle') {
      const timeoutRaw = parts[2]
      timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined
      if (timeoutRaw && Number.isNaN(timeoutMs)) {
        throw new Error(`Invalid wait timeout "${timeoutRaw}". Expected a number.`)
      }
    } else {
      value = parts[2]
      if (!value) throw new Error(`wait ${kind} requires a value.`)
      const timeoutRaw = parts[3]
      timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined
      if (timeoutRaw && Number.isNaN(timeoutMs)) {
        throw new Error(`Invalid wait timeout "${timeoutRaw}". Expected a number.`)
      }
    }

    const result = await fns.wait({ kind, value, timeoutMs })
    return {
      output: `Wait succeeded (${result.kind}) in ${result.elapsedMs}ms. ${result.matched}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'console') {
    const limitRaw = parts[1]
    const level = normalizeConsoleLevel(parts[2])
    const limit = limitRaw ? Number(limitRaw) : undefined
    if (limitRaw && Number.isNaN(limit)) {
      throw new Error(`Invalid console limit "${limitRaw}". Expected a number.`)
    }

    const entries = await fns.getConsoleEntries(limit, level)
    const counts = entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.level] = (acc[entry.level] ?? 0) + 1
      return acc
    }, {})

    return {
      output: [
        `Console entries (${entries.length}) level=${level}: log=${counts.log ?? 0}, info=${counts.info ?? 0}, warning=${counts.warning ?? 0}, error=${counts.error ?? 0}, debug=${counts.debug ?? 0}`,
        ...entries.map((entry) => `[${new Date(entry.timestamp).toISOString()}] [${entry.level}] ${entry.message}`),
      ].join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'network') {
    const limitRaw = parts[1]
    const filterRaw = (parts[2] ?? 'all').toLowerCase()
    const limit = limitRaw ? Number(limitRaw) : undefined
    if (limitRaw && Number.isNaN(limit)) {
      throw new Error(`Invalid network limit "${limitRaw}". Expected a number.`)
    }
    if (!['all', 'pending', 'completed', 'failed', '2xx', '3xx', '4xx', '5xx'].includes(filterRaw)) {
      throw new Error(`Invalid network filter "${filterRaw}". Use one of: all, pending, completed, failed, 2xx, 3xx, 4xx, 5xx.`)
    }

    const allEntries = await fns.getNetworkEntries(undefined, 'all')
    const entries = allEntries
      .filter((entry) => matchesNetworkFilter(entry, filterRaw))
      .slice(-(limit ?? 50))
    const counts = entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.state] = (acc[entry.state] ?? 0) + 1
      return acc
    }, {})

    return {
      output: [
        `Network entries (${entries.length}) filter=${filterRaw}: pending=${counts.pending ?? 0}, completed=${counts.completed ?? 0}, failed=${counts.failed ?? 0}`,
        ...entries.map(formatNetworkEntry),
      ].join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'key') {
    const key = parts[1]
    if (!key) throw new Error('key requires a key value. Example: key Enter')
    const modifiers = normalizeKeyModifiers(parts.slice(2))
    await fns.pressKey(key, modifiers.length > 0 ? { modifiers } : undefined)
    return {
      output: `Sent key ${key}${modifiers.length > 0 ? ` with ${modifiers.join('+')}` : ''}.`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'back') {
    await fns.goBack()
    return {
      output: 'Navigated back.',
      appendReleaseHint: true,
    }
  }

  if (cmd === 'forward') {
    await fns.goForward()
    return {
      output: 'Navigated forward.',
      appendReleaseHint: true,
    }
  }

  if (cmd === 'evaluate') {
    const expression = Array.isArray(command) ? parts.slice(1).join(' ') : String(command).trim().slice(cmd.length).trim()
    if (!expression) throw new Error('evaluate requires a JavaScript expression. Example: evaluate document.title')
    const result = await fns.evaluate(expression)
    return {
      output: `Evaluate result:\n${serializeValue(result)}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'windows') {
    const windows = await fns.listWindows()
    if (windows.length === 0) {
      return {
        output: 'No managed browser windows are open.',
        appendReleaseHint: false,
      }
    }

    return {
      output: [
        `Managed browser windows: ${summarizeWindows(windows)}`,
        ...windows.map((win) => `- ${win.id}: ${win.title} — ${win.url} (visible=${win.isVisible}, owner=${win.ownerType}, boundSession=${win.boundSessionId ?? 'none'})`),
      ].join('\n'),
      appendReleaseHint: true,
    }
  }

  if (cmd === 'focus') {
    const requested = parts[1]
    const result = await fns.focusWindow(requested)
    return {
      output: `Focused browser window ${result.instanceId}\nTitle: ${result.title}\nURL: ${result.url}`,
      appendReleaseHint: true,
    }
  }

  if (cmd === 'hide') {
    const requested = parts[1]
    const result = await fns.hideWindow(requested)
    return {
      output: formatLifecycleResult(result),
      appendReleaseHint: false,
    }
  }

  if (cmd === 'release') {
    const requested = parts[1]
    const result = await fns.releaseControl(requested)
    return {
      output: formatLifecycleResult(result),
      appendReleaseHint: false,
    }
  }

  if (cmd === 'close') {
    const requested = parts[1]
    const result = await fns.closeWindow(requested)
    return {
      output: formatLifecycleResult(result),
      appendReleaseHint: false,
    }
  }

  throw new Error(`Unknown browser_tool command "${cmd}". Use "--help" to see supported commands.`)
}

export function createBrowserTools(options: BrowserToolsOptions) {
  function getBrowserFns(): BrowserPaneFns {
    const fns = options.getBrowserPaneFns()
    if (!fns) {
      throw new Error('Browser window controls are not available. This tool requires the desktop app.')
    }
    return fns
  }

  return [
    tool(
      'browser_tool',
      BROWSER_TOOL_DESCRIPTION,
      {
        command: z.union([z.string(), z.array(z.string())]).describe('Browser command string or array. Example: "click @e1" or ["evaluate", "document.title"].'),
      },
      async (args) => {
        try {
          const result = await executeBrowserToolCommand({
            command: args.command,
            fns: getBrowserFns(),
          })

          const text = result.appendReleaseHint
            ? `${result.output}${BROWSER_RELEASE_HINT}`
            : result.output

          if (result.image) {
            return {
              content: [
                { type: 'text' as const, text },
                { type: 'image' as const, data: result.image.data, mimeType: result.image.mimeType },
              ],
            }
          }

          return successResponse(text)
        } catch (error) {
          return errorResponse(error instanceof Error ? error.message : String(error))
        }
      },
    ),
  ]
}
