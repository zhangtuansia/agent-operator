import {
  IPC_CHANNELS,
  type BrowserClickOptions,
  type BrowserEmptyStateLaunchPayload,
  type BrowserKeyOptions,
  type BrowserPaneCreateOptions,
  type BrowserWaitOptions,
  type BrowserScreenshotOptions,
  type BrowserScrollOptions,
} from '../../shared/types'
import type { BrowserPaneManager } from '../browser-pane-manager'
import { mainLog } from '../logger'
import type { WindowManager } from '../window-manager'
import { pushTyped, type RpcServer } from '../../transport/server'

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.BROWSER_PANE_CREATE,
  IPC_CHANNELS.BROWSER_PANE_DESTROY,
  IPC_CHANNELS.BROWSER_PANE_LIST,
  IPC_CHANNELS.BROWSER_PANE_NAVIGATE,
  IPC_CHANNELS.BROWSER_PANE_GO_BACK,
  IPC_CHANNELS.BROWSER_PANE_GO_FORWARD,
  IPC_CHANNELS.BROWSER_PANE_RELOAD,
  IPC_CHANNELS.BROWSER_PANE_STOP,
  IPC_CHANNELS.BROWSER_PANE_FOCUS,
  IPC_CHANNELS.BROWSER_PANE_LAUNCH,
  IPC_CHANNELS.BROWSER_PANE_SNAPSHOT,
  IPC_CHANNELS.BROWSER_PANE_CLICK,
  IPC_CHANNELS.BROWSER_PANE_CLICK_AT,
  IPC_CHANNELS.BROWSER_PANE_DRAG,
  IPC_CHANNELS.BROWSER_PANE_FILL,
  IPC_CHANNELS.BROWSER_PANE_SELECT,
  IPC_CHANNELS.BROWSER_PANE_UPLOAD,
  IPC_CHANNELS.BROWSER_PANE_TYPE,
  IPC_CHANNELS.BROWSER_PANE_KEY,
  IPC_CHANNELS.BROWSER_PANE_SCREENSHOT,
  IPC_CHANNELS.BROWSER_PANE_EVALUATE,
  IPC_CHANNELS.BROWSER_PANE_SCROLL,
  IPC_CHANNELS.BROWSER_PANE_WAIT,
  IPC_CHANNELS.BROWSER_PANE_CONSOLE,
  IPC_CHANNELS.BROWSER_PANE_NETWORK,
  IPC_CHANNELS.BROWSER_PANE_DOWNLOADS,
  IPC_CHANNELS.BROWSER_PANE_SET_CLIPBOARD,
  IPC_CHANNELS.BROWSER_PANE_GET_CLIPBOARD,
  IPC_CHANNELS.BROWSER_PANE_PASTE,
] as const

interface BrowserHandlerDeps {
  browserPaneManager: BrowserPaneManager
  windowManager: WindowManager
}

export function registerBrowserHandlers(server: RpcServer, { browserPaneManager, windowManager: _windowManager }: BrowserHandlerDeps): void {
  browserPaneManager.registerToolbarIpc()

  server.handle(IPC_CHANNELS.BROWSER_PANE_CREATE, async (_ctx, input?: string | BrowserPaneCreateOptions) => {
    if (typeof input === 'string') {
      return browserPaneManager.createInstance(input)
    }

    if (input?.bindToSessionId) {
      return browserPaneManager.createForSession(input.bindToSessionId, { show: input.show ?? false })
    }

    return browserPaneManager.createInstance(input?.id ? { ...input, id: input.id } : input)
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_DESTROY, async (_ctx, id: string) => {
    browserPaneManager.destroyInstance(id)
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_LIST, async () => {
    return browserPaneManager.listInstances()
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_NAVIGATE, async (_ctx, id: string, url: string) => {
    try {
      return await browserPaneManager.navigate(id, url)
    } catch (error) {
      mainLog.error(`[browser-pane] navigate failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_GO_BACK, async (_ctx, id: string) => {
    try {
      await browserPaneManager.goBack(id)
    } catch (error) {
      mainLog.error(`[browser-pane] goBack failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD, async (_ctx, id: string) => {
    try {
      await browserPaneManager.goForward(id)
    } catch (error) {
      mainLog.error(`[browser-pane] goForward failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_RELOAD, async (_ctx, id: string) => {
    await browserPaneManager.reload(id)
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_STOP, async (_ctx, id: string) => {
    await browserPaneManager.stop(id)
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_FOCUS, async (_ctx, id: string) => {
    await browserPaneManager.focus(id)
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_LAUNCH, async (ctx, payload: BrowserEmptyStateLaunchPayload) => {
    try {
      return await browserPaneManager.handleEmptyStateLaunchFromRenderer(ctx.webContentsId!, payload)
    } catch (error) {
      mainLog.error('[browser-pane] empty-state launch IPC failed:', error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_SNAPSHOT, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.getAccessibilitySnapshot(id)
    } catch (error) {
      mainLog.error(`[browser-pane] snapshot failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_CLICK, async (_ctx, id: string, ref: string, options?: BrowserClickOptions) => {
    try {
      return await browserPaneManager.clickElement(id, ref, options)
    } catch (error) {
      mainLog.error(`[browser-pane] click failed for ${id} ref=${ref}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_CLICK_AT, async (_ctx, id: string, x: number, y: number) => {
    try {
      return await browserPaneManager.clickAt(id, x, y)
    } catch (error) {
      mainLog.error(`[browser-pane] clickAt failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_DRAG, async (_ctx, id: string, x1: number, y1: number, x2: number, y2: number) => {
    try {
      return await browserPaneManager.drag(id, x1, y1, x2, y2)
    } catch (error) {
      mainLog.error(`[browser-pane] drag failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_FILL, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.fillElement(id, ref, value)
    } catch (error) {
      mainLog.error(`[browser-pane] fill failed for ${id} ref=${ref}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_SELECT, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.selectOption(id, ref, value)
    } catch (error) {
      mainLog.error(`[browser-pane] select failed for ${id} ref=${ref}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_UPLOAD, async (_ctx, id: string, ref: string, filePaths: string[]) => {
    try {
      return await browserPaneManager.uploadFiles(id, ref, filePaths)
    } catch (error) {
      mainLog.error(`[browser-pane] upload failed for ${id} ref=${ref}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_TYPE, async (_ctx, id: string, text: string) => {
    try {
      return await browserPaneManager.typeText(id, text)
    } catch (error) {
      mainLog.error(`[browser-pane] type failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_KEY, async (_ctx, id: string, key: string, options?: BrowserKeyOptions) => {
    try {
      return await browserPaneManager.pressKey(id, key, options)
    } catch (error) {
      mainLog.error(`[browser-pane] key failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_SCREENSHOT, async (_ctx, id: string, options?: BrowserScreenshotOptions) => {
    try {
      return await browserPaneManager.screenshot(id, options)
    } catch (error) {
      mainLog.error(`[browser-pane] screenshot failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_EVALUATE, async (_ctx, id: string, expression: string) => {
    try {
      return await browserPaneManager.evaluate(id, expression)
    } catch (error) {
      mainLog.error(`[browser-pane] evaluate failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_SCROLL, async (_ctx, id: string, options?: BrowserScrollOptions) => {
    try {
      return await browserPaneManager.scroll(id, options)
    } catch (error) {
      mainLog.error(`[browser-pane] scroll failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_WAIT, async (_ctx, id: string, options: BrowserWaitOptions) => {
    try {
      return await browserPaneManager.waitFor(id, options)
    } catch (error) {
      mainLog.error(`[browser-pane] wait failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_CONSOLE, async (_ctx, id: string, limit?: number, level?: any) => {
    try {
      return await browserPaneManager.getConsoleEntries(id, limit, level)
    } catch (error) {
      mainLog.error(`[browser-pane] console failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_NETWORK, async (_ctx, id: string, limit?: number, state?: any) => {
    try {
      return await browserPaneManager.getNetworkEntries(id, limit, state)
    } catch (error) {
      mainLog.error(`[browser-pane] network failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_DOWNLOADS, async (_ctx, id: string, options?: any) => {
    try {
      return await browserPaneManager.getDownloads(id, options)
    } catch (error) {
      mainLog.error(`[browser-pane] downloads failed for ${id}:`, error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_SET_CLIPBOARD, async (_ctx, text: string) => {
    try {
      return await browserPaneManager.setClipboard(text)
    } catch (error) {
      mainLog.error('[browser-pane] setClipboard failed:', error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_GET_CLIPBOARD, async () => {
    try {
      return await browserPaneManager.getClipboard()
    } catch (error) {
      mainLog.error('[browser-pane] getClipboard failed:', error)
      throw error
    }
  })

  server.handle(IPC_CHANNELS.BROWSER_PANE_PASTE, async (_ctx, id: string, text: string) => {
    try {
      return await browserPaneManager.paste(id, text)
    } catch (error) {
      mainLog.error(`[browser-pane] paste failed for ${id}:`, error)
      throw error
    }
  })

  browserPaneManager.onStateChange((info) => {
    pushTyped(server, IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED, { to: 'all' }, info)
  })

  browserPaneManager.onRemoved((id) => {
    pushTyped(server, IPC_CHANNELS.BROWSER_PANE_REMOVED, { to: 'all' }, id)
  })

  browserPaneManager.onInteracted((id) => {
    pushTyped(server, IPC_CHANNELS.BROWSER_PANE_INTERACTED, { to: 'all' }, id)
  })
}
