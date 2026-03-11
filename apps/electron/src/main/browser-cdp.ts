import type { WebContents } from 'electron'
import { mainLog } from './logger'
import type {
  BrowserAccessibilityNode,
  BrowserAccessibilitySnapshot,
  BrowserElementGeometry,
  BrowserKeyOptions,
  BrowserModifierKey,
} from '../shared/types'

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'treeitem', 'row', 'cell', 'columnheader',
  'rowheader', 'gridcell',
])

const CONTENT_ROLES = new Set([
  'heading', 'img', 'table', 'list', 'listitem',
  'paragraph', 'blockquote', 'article', 'main',
  'navigation', 'complementary', 'contentinfo', 'banner',
  'form', 'region', 'alert', 'dialog', 'alertdialog',
  'status', 'progressbar', 'meter', 'timer',
])

const FALLBACK_EXCLUDED_ROLES = new Set(['none', 'generic', 'rootwebarea', 'webarea'])
const MAX_AX_SNAPSHOT_NODES = 500
const CDP_IDLE_DETACH_MS = 5_000
const KEY_ALIASES: Record<string, string> = {
  cmd: 'meta',
  command: 'meta',
  ctrl: 'control',
  control: 'control',
  option: 'alt',
  alt: 'alt',
  shift: 'shift',
  meta: 'meta',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  space: 'Space',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

function normalizeAxText(value: unknown): string {
  return String(value ?? '').trim()
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function summarizeTopCounts(map: Map<string, number>, maxEntries = 8): string {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ')
}

function normalizeModifierKey(value: string): BrowserModifierKey {
  const normalized = KEY_ALIASES[value.toLowerCase()] ?? value.toLowerCase()
  if (normalized === 'meta' || normalized === 'control' || normalized === 'shift' || normalized === 'alt') {
    return normalized
  }
  throw new Error(`Unsupported modifier "${value}"`)
}

function normalizeKeyCode(value: string): string {
  if (!value) {
    throw new Error('Missing key')
  }

  const aliased = KEY_ALIASES[value.toLowerCase()] ?? value
  if (aliased.length === 1) {
    return aliased.toUpperCase()
  }

  if (/^f\d{1,2}$/i.test(aliased)) {
    return aliased.toUpperCase()
  }

  return aliased
}

function isPrintableKey(keyCode: string): boolean {
  return keyCode.length === 1
}

function getModifierBitmask(modifiers: BrowserModifierKey[]): number {
  return modifiers.reduce((mask, modifier) => {
    switch (modifier) {
      case 'alt':
        return mask | 1
      case 'control':
        return mask | 2
      case 'meta':
        return mask | 4
      case 'shift':
        return mask | 8
      default:
        return mask
    }
  }, 0)
}

export interface ViewportMetrics {
  width: number
  height: number
  dpr: number
  scrollX: number
  scrollY: number
}

export class BrowserCDP {
  private readonly webContents: WebContents
  private attached = false
  private detachListenerRegistered = false
  private idleDetachTimer: ReturnType<typeof setTimeout> | null = null
  private readonly refMap = new Map<string, number>()
  private readonly refDetails = new Map<string, { role: string; name: string }>()
  private readonly backendNodeRefMap = new Map<number, string>()
  private nextRefCounter = 0

  constructor(webContents: WebContents) {
    this.webContents = webContents
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached) return

    try {
      this.webContents.debugger.attach('1.3')
      this.attached = true
    } catch (error) {
      if (String(error).includes('Already attached')) {
        this.attached = true
      } else {
        throw error
      }
    }

    if (!this.detachListenerRegistered) {
      this.detachListenerRegistered = true
      this.webContents.debugger.on('detach', () => {
        this.attached = false
      })
    }
  }

  private resetIdleDetachTimer(): void {
    if (this.idleDetachTimer) {
      clearTimeout(this.idleDetachTimer)
    }

    this.idleDetachTimer = setTimeout(() => {
      if (!this.attached) return
      mainLog.info('[browser-cdp] idle detach after inactivity')
      this.detach()
    }, CDP_IDLE_DETACH_MS)
  }

  detach(): void {
    if (this.idleDetachTimer) {
      clearTimeout(this.idleDetachTimer)
      this.idleDetachTimer = null
    }

    if (!this.attached) return
    try {
      this.webContents.debugger.detach()
    } catch {
      // Ignore detach races during shutdown.
    }
    this.attached = false
  }

  private async send(method: string, params?: Record<string, unknown>): Promise<any> {
    await this.ensureAttached()
    try {
      return await this.webContents.debugger.sendCommand(method, params)
    } finally {
      this.resetIdleDetachTimer()
    }
  }

  private allocateRef(backendDOMNodeId?: number): string {
    if (backendDOMNodeId !== undefined) {
      const existing = this.backendNodeRefMap.get(backendDOMNodeId)
      if (existing) return existing
    }

    this.nextRefCounter += 1
    const ref = `@e${this.nextRefCounter}`
    if (backendDOMNodeId !== undefined) {
      this.backendNodeRefMap.set(backendDOMNodeId, ref)
    }
    return ref
  }

  async getAccessibilitySnapshot(): Promise<BrowserAccessibilitySnapshot> {
    const tree = await this.send('Accessibility.getFullAXTree')
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes as any[] : []

    this.refMap.clear()
    this.refDetails.clear()

    const result: BrowserAccessibilityNode[] = []
    const fallbackCandidates: Array<{
      backendDOMNodeId: number
      role: string
      name: string
      value?: string
      description?: string
      focused?: boolean
      checked?: boolean
      disabled?: boolean
    }> = []
    const rawRoleCounts = new Map<string, number>()
    const droppedReasonCounts = new Map<string, number>()
    const seenBackendNodeIds = new Set<number>()

    const pushAccessNode = (entry: {
      backendDOMNodeId?: number
      role: string
      name: string
      value?: string
      description?: string
      focused?: boolean
      checked?: boolean
      disabled?: boolean
    }): boolean => {
      if (result.length >= MAX_AX_SNAPSHOT_NODES) return false

      if (entry.backendDOMNodeId !== undefined) {
        if (seenBackendNodeIds.has(entry.backendDOMNodeId)) return true
        seenBackendNodeIds.add(entry.backendDOMNodeId)
      }

      const ref = this.allocateRef(entry.backendDOMNodeId)
      if (entry.backendDOMNodeId !== undefined) {
        this.refMap.set(ref, entry.backendDOMNodeId)
      }
      this.refDetails.set(ref, { role: entry.role, name: entry.name })

      const node: BrowserAccessibilityNode = {
        ref,
        role: entry.role,
        name: entry.name,
      }

      if (entry.value !== undefined) node.value = entry.value
      if (entry.description) node.description = entry.description
      if (entry.focused) node.focused = true
      if (entry.checked) node.checked = true
      if (entry.disabled) node.disabled = true

      result.push(node)
      return true
    }

    for (const node of nodes) {
      const role = normalizeAxText(node.role?.value).toLowerCase()
      const name = normalizeAxText(node.name?.value)
      const rawValue = node.value?.value
      const value = rawValue !== undefined && rawValue !== '' ? String(rawValue) : undefined
      const description = normalizeAxText(node.description?.value) || undefined
      const backendDOMNodeId = typeof node.backendDOMNodeId === 'number' ? node.backendDOMNodeId : undefined

      incrementCount(rawRoleCounts, role || '(empty)')

      let focused = false
      let checked = false
      let disabled = false
      let focusable = false

      const props = node.properties as any[] | undefined
      if (props) {
        for (const prop of props) {
          if (prop.name === 'focused' && prop.value?.value === true) focused = true
          if (prop.name === 'checked' && prop.value?.value !== 'false') checked = prop.value?.value === true || prop.value?.value === 'true'
          if (prop.name === 'disabled' && prop.value?.value === true) disabled = true
          if (prop.name === 'focusable' && prop.value?.value === true) focusable = true
        }
      }

      const isInteractive = INTERACTIVE_ROLES.has(role)
      const isContent = CONTENT_ROLES.has(role) && !!name
      const hasPrimarySignal = isInteractive || isContent || value !== undefined
      const isGenericWithoutName = (!role || role === 'generic' || role === 'none') && !name

      if (!hasPrimarySignal) {
        incrementCount(droppedReasonCounts, 'no-primary-signal')
      } else if (isGenericWithoutName) {
        incrementCount(droppedReasonCounts, 'generic-without-name')
      }

      const shouldKeepPrimary = hasPrimarySignal && !isGenericWithoutName
      if (shouldKeepPrimary) {
        pushAccessNode({
          backendDOMNodeId,
          role,
          name,
          value,
          description,
          focused,
          checked,
          disabled,
        })
        if (result.length >= MAX_AX_SNAPSHOT_NODES) break
        continue
      }

      const fallbackEligible = !!backendDOMNodeId
        && !FALLBACK_EXCLUDED_ROLES.has(role)
        && (!!name || value !== undefined || focusable || focused)

      if (fallbackEligible) {
        fallbackCandidates.push({
          backendDOMNodeId,
          role,
          name,
          value,
          description,
          focused,
          checked,
          disabled,
        })
      }
    }

    if (result.length === 0 && fallbackCandidates.length > 0) {
      for (const candidate of fallbackCandidates) {
        const pushed = pushAccessNode(candidate)
        if (!pushed) break
      }

      mainLog.info(
        `[browser-cdp] snapshot fallback url=${this.webContents.getURL()} raw=${nodes.length} kept=${result.length} roles=[${summarizeTopCounts(rawRoleCounts)}] dropped=[${summarizeTopCounts(droppedReasonCounts)}]`,
      )
    }

    if (result.length === 0 && nodes.length > 0) {
      mainLog.warn(
        `[browser-cdp] snapshot yielded zero nodes url=${this.webContents.getURL()} raw=${nodes.length} roles=[${summarizeTopCounts(rawRoleCounts)}] dropped=[${summarizeTopCounts(droppedReasonCounts)}]`,
      )
    }

    return {
      url: this.webContents.getURL(),
      title: this.webContents.getTitle(),
      nodes: result,
    }
  }

  async getElementGeometry(ref: string): Promise<BrowserElementGeometry> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser snapshot first.`)
    }

    const { model } = await this.send('DOM.getBoxModel', { backendNodeId })
    const content = model.content as number[]
    const xs = [content[0], content[2], content[4], content[6]]
    const ys = [content[1], content[3], content[5], content[7]]

    const details = this.refDetails.get(ref)
    return {
      ref,
      role: details?.role,
      name: details?.name,
      box: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      clickPoint: {
        x: (content[0] + content[2] + content[4] + content[6]) / 4,
        y: (content[1] + content[3] + content[5] + content[7]) / 4,
      },
    }
  }

  async getViewportMetrics(): Promise<ViewportMetrics> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
      }))()`,
      returnByValue: true,
    })

    const value = result?.result?.value ?? {}
    return {
      width: Number(value.width || 0),
      height: Number(value.height || 0),
      dpr: Number(value.dpr || 1),
      scrollX: Number(value.scrollX || 0),
      scrollY: Number(value.scrollY || 0),
    }
  }

  async renderTemporaryOverlay(params: {
    geometries: BrowserElementGeometry[]
    includeMetadata?: boolean
    metadataText?: string
    includeClickPoints?: boolean
  }): Promise<void> {
    const payload = {
      geometries: params.geometries,
      includeMetadata: !!params.includeMetadata,
      metadataText: params.metadataText || '',
      includeClickPoints: params.includeClickPoints !== false,
    }

    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const existing = document.getElementById('__dazi_browser_overlay__');
        if (existing) existing.remove();

        const root = document.createElement('div');
        root.id = '__dazi_browser_overlay__';
        root.style.position = 'fixed';
        root.style.inset = '0';
        root.style.pointerEvents = 'none';
        root.style.zIndex = '2147483647';

        const payload = ${JSON.stringify(payload)};

        for (const geometry of payload.geometries || []) {
          const box = document.createElement('div');
          box.style.position = 'fixed';
          box.style.left = geometry.box.x + 'px';
          box.style.top = geometry.box.y + 'px';
          box.style.width = geometry.box.width + 'px';
          box.style.height = geometry.box.height + 'px';
          box.style.border = '2px solid rgba(59, 130, 246, 0.95)';
          box.style.borderRadius = '6px';
          root.appendChild(box);

          const label = document.createElement('div');
          label.style.position = 'fixed';
          label.style.left = geometry.box.x + 'px';
          label.style.top = Math.max(4, geometry.box.y - 24) + 'px';
          label.style.padding = '2px 6px';
          label.style.borderRadius = '6px';
          label.style.font = '12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
          label.style.background = 'rgba(15, 23, 42, 0.92)';
          label.style.color = 'white';
          label.style.maxWidth = '70vw';
          label.style.whiteSpace = 'nowrap';
          label.style.overflow = 'hidden';
          label.style.textOverflow = 'ellipsis';
          label.textContent = [geometry.ref, geometry.role, geometry.name].filter(Boolean).join(' • ');
          root.appendChild(label);

          if (payload.includeClickPoints && geometry.clickPoint) {
            const point = document.createElement('div');
            point.style.position = 'fixed';
            point.style.left = (geometry.clickPoint.x - 4) + 'px';
            point.style.top = (geometry.clickPoint.y - 4) + 'px';
            point.style.width = '8px';
            point.style.height = '8px';
            point.style.borderRadius = '999px';
            point.style.background = 'rgba(239, 68, 68, 0.98)';
            root.appendChild(point);
          }
        }

        if (payload.includeMetadata && payload.metadataText) {
          const meta = document.createElement('div');
          meta.style.position = 'fixed';
          meta.style.right = '8px';
          meta.style.bottom = '8px';
          meta.style.padding = '4px 8px';
          meta.style.borderRadius = '6px';
          meta.style.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
          meta.style.background = 'rgba(15, 23, 42, 0.92)';
          meta.style.color = 'white';
          meta.textContent = payload.metadataText;
          root.appendChild(meta);
        }

        document.documentElement.appendChild(root);
      })()`,
    })
  }

  async clearTemporaryOverlay(): Promise<void> {
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const existing = document.getElementById('__dazi_browser_overlay__');
        if (existing) existing.remove();
      })()`,
    })
  }

  private generateTrajectory(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    steps: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps
      const arcOffset = Math.sin(t * Math.PI) * Math.min(15, Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2) * 0.05)
      const dx = toX - fromX
      const dy = toY - fromY
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const perpX = -dy / len
      const perpY = dx / len
      const jitterX = (Math.random() - 0.5) * 4
      const jitterY = (Math.random() - 0.5) * 4
      points.push({
        x: Math.round(fromX + dx * t + perpX * arcOffset + jitterX),
        y: Math.round(fromY + dy * t + perpY * arcOffset + jitterY),
      })
    }
    if (points.length > 0) {
      points[points.length - 1] = { x: Math.round(toX), y: Math.round(toY) }
    }
    return points
  }

  private sendNativeMouseEvent(type: 'mouseMove' | 'mouseDown' | 'mouseUp', x: number, y: number, button?: 'left' | 'right' | 'middle', clickCount?: number): void {
    const wc = this.webContents as WebContents & { sendInputEvent?: (event: Record<string, unknown>) => void }
    if (typeof wc.sendInputEvent !== 'function') {
      throw new Error('Native mouse events are unavailable for this webContents')
    }
    const event: Record<string, unknown> = { type, x: Math.round(x), y: Math.round(y) }
    if (button) event.button = button
    if (clickCount !== undefined) event.clickCount = clickCount
    wc.sendInputEvent(event)
  }

  private sendNativeKeyEvent(type: 'keyDown' | 'keyUp' | 'char', keyCode: string, modifiers?: BrowserModifierKey[]): void {
    const wc = this.webContents as WebContents & { sendInputEvent?: (event: Record<string, unknown>) => void }
    if (typeof wc.sendInputEvent !== 'function') {
      throw new Error('Native keyboard events are unavailable for this webContents')
    }
    wc.sendInputEvent({
      type,
      keyCode,
      modifiers,
    })
  }

  private async clickAtCDP(x: number, y: number): Promise<void> {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
  }

  async clickAtCoordinates(x: number, y: number): Promise<void> {
    try {
      const startX = x + (Math.random() - 0.5) * 60
      const startY = y + (Math.random() - 0.5) * 60
      const trajectory = this.generateTrajectory(startX, startY, x, y, 3 + Math.floor(Math.random() * 3))

      for (const point of trajectory) {
        this.sendNativeMouseEvent('mouseMove', point.x, point.y)
        await new Promise((resolve) => setTimeout(resolve, 4 + Math.random() * 8))
      }

      this.sendNativeMouseEvent('mouseDown', x, y, 'left', 1)
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 40))
      this.sendNativeMouseEvent('mouseUp', x, y, 'left', 1)
    } catch (error) {
      mainLog.warn(`[browser-cdp] native clickAt failed, falling back to CDP: ${error instanceof Error ? error.message : String(error)}`)
      await this.clickAtCDP(x, y)
    }
  }

  private async dragCDP(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(5, Math.min(20, Math.round(distance / 20)))
    let lastX = x1
    let lastY = y1

    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x1,
      y: y1,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })

    try {
      for (let index = 1; index <= steps; index += 1) {
        const t = index / steps
        const nextX = Math.round(x1 + dx * t)
        const nextY = Math.round(y1 + dy * t)
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: nextX,
          y: nextY,
          button: 'left',
          buttons: 1,
        })
        lastX = nextX
        lastY = nextY
        if (index < steps) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
      }
    } finally {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: lastX,
        y: lastY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    }
  }

  async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    try {
      const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      const steps = Math.max(5, Math.min(20, Math.round(distance / 20)))
      this.sendNativeMouseEvent('mouseMove', x1, y1)
      await new Promise((resolve) => setTimeout(resolve, 10))
      this.sendNativeMouseEvent('mouseDown', x1, y1, 'left', 1)
      await new Promise((resolve) => setTimeout(resolve, 30))

      let lastX = x1
      let lastY = y1
      try {
        const trajectory = this.generateTrajectory(x1, y1, x2, y2, steps)
        for (let index = 0; index < trajectory.length; index += 1) {
          const point = trajectory[index]!
          this.sendNativeMouseEvent('mouseMove', point.x, point.y)
          lastX = point.x
          lastY = point.y
          if (index < trajectory.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 8 + Math.random() * 12))
          }
        }
      } catch (error) {
        this.sendNativeMouseEvent('mouseUp', lastX, lastY, 'left', 1)
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
      this.sendNativeMouseEvent('mouseUp', lastX, lastY, 'left', 1)
    } catch (error) {
      mainLog.warn(`[browser-cdp] native drag failed, falling back to CDP: ${error instanceof Error ? error.message : String(error)}`)
      await this.dragCDP(x1, y1, x2, y2)
    }
  }

  async typeText(text: string): Promise<void> {
    await this.send('Input.insertText', { text })
  }

  async pressKey(key: string, options?: BrowserKeyOptions): Promise<void> {
    const keyCode = normalizeKeyCode(key)
    const modifiers = (options?.modifiers ?? []).map(normalizeModifierKey)

    try {
      this.sendNativeKeyEvent('keyDown', keyCode, modifiers)
      if (isPrintableKey(keyCode) && !modifiers.some((modifier) => modifier === 'meta' || modifier === 'control' || modifier === 'alt')) {
        this.sendNativeKeyEvent('char', keyCode, modifiers)
      }
      this.sendNativeKeyEvent('keyUp', keyCode, modifiers)
    } catch (error) {
      mainLog.warn(`[browser-cdp] native key dispatch failed, falling back to CDP: ${error instanceof Error ? error.message : String(error)}`)
      const modifierMask = getModifierBitmask(modifiers)
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: keyCode,
        code: keyCode,
        modifiers: modifierMask,
        text: isPrintableKey(keyCode) && modifierMask === 0 ? keyCode.toLowerCase() : undefined,
      })
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: keyCode,
        code: keyCode,
        modifiers: modifierMask,
      })
    }
  }

  async clickElement(ref: string): Promise<BrowserElementGeometry> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser snapshot first.`)
    }

    const { object } = await this.send('DOM.resolveNode', { backendNodeId })
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: 'function() { this.scrollIntoViewIfNeeded?.(); this.scrollIntoView?.({ block: "center", inline: "center" }); }',
    })

    const geometry = await this.getElementGeometry(ref)
    await this.clickAtCoordinates(geometry.clickPoint.x, geometry.clickPoint.y)
    return geometry
  }

  async fillElement(ref: string, value: string): Promise<BrowserElementGeometry> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser snapshot first.`)
    }

    await this.send('DOM.focus', { backendNodeId })
    const { object } = await this.send('DOM.resolveNode', { backendNodeId })
    await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function(nextValue) {
        if (typeof this.focus === 'function') this.focus();
        if ('value' in this) {
          this.value = nextValue;
        } else {
          this.textContent = nextValue;
        }
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
      }`,
      arguments: [{ value }],
    })

    return this.getElementGeometry(ref)
  }

  async selectOption(ref: string, value: string): Promise<BrowserElementGeometry> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser snapshot first.`)
    }

    const { object } = await this.send('DOM.resolveNode', { backendNodeId })
    const result = await this.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      returnByValue: true,
      functionDeclaration: `function(nextValue) {
        const normalize = (input) => String(input ?? '').trim().toLowerCase();
        const desired = normalize(nextValue);

        const dispatchChange = (el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };

        if (this instanceof HTMLSelectElement) {
          const options = Array.from(this.options);
          const match = options.find((option) => normalize(option.value) === desired || normalize(option.textContent) === desired || normalize(option.textContent).includes(desired));
          if (!match) {
            return { ok: false, reason: 'option_not_found' };
          }
          this.value = match.value;
          dispatchChange(this);
          return { ok: true };
        }

        const visibleOptions = Array.from(document.querySelectorAll('[role="option"], option, [data-value]'));
        const match = visibleOptions.find((option) => {
          const optionValue = normalize(option.getAttribute?.('data-value') || option.getAttribute?.('value') || option.textContent || '');
          return optionValue === desired || optionValue.includes(desired);
        });

        if (!match) {
          return { ok: false, reason: 'option_not_found' };
        }

        if (typeof this.click === 'function') this.click();
        if (typeof match.scrollIntoView === 'function') match.scrollIntoView({ block: 'nearest' });
        if (typeof match.click === 'function') match.click();
        return { ok: true };
      }`,
      arguments: [{ value }],
    })

    if (!result?.result?.value?.ok) {
      throw new Error(`Failed to select "${value}" on ${ref}`)
    }

    return this.getElementGeometry(ref)
  }

  async setFileInputFiles(ref: string, filePaths: string[]): Promise<BrowserElementGeometry> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser snapshot first.`)
    }

    await this.send('DOM.setFileInputFiles', {
      files: filePaths,
      backendNodeId,
    })

    return this.getElementGeometry(ref)
  }
}
