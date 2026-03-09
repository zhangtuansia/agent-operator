import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type BrowserClickOptions,
  type BrowserKeyOptions,
  type BrowserPaneCreateOptions,
  type BrowserWaitOptions,
  type BrowserScreenshotOptions,
  type BrowserScrollOptions,
} from '../../shared/types'
import type { BrowserPaneManager } from '../browser-pane-manager'
import type { WindowManager } from '../window-manager'

export function registerBrowserHandlers(browserPaneManager: BrowserPaneManager, windowManager: WindowManager): void {
  browserPaneManager.registerToolbarIpc()

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CREATE, async (_event, input?: string | BrowserPaneCreateOptions) => {
    return browserPaneManager.createInstance(input)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_DESTROY, async (_event, id: string) => {
    browserPaneManager.destroyInstance(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_LIST, async () => {
    return browserPaneManager.listInstances()
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_NAVIGATE, async (_event, id: string, url: string) => {
    return browserPaneManager.navigate(id, url)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_GO_BACK, async (_event, id: string) => {
    await browserPaneManager.goBack(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD, async (_event, id: string) => {
    await browserPaneManager.goForward(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_RELOAD, async (_event, id: string) => {
    await browserPaneManager.reload(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_STOP, async (_event, id: string) => {
    await browserPaneManager.stop(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_FOCUS, async (_event, id: string) => {
    await browserPaneManager.focus(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SNAPSHOT, async (_event, id: string) => {
    return browserPaneManager.getAccessibilitySnapshot(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CLICK, async (_event, id: string, ref: string, options?: BrowserClickOptions) => {
    return browserPaneManager.clickElement(id, ref, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CLICK_AT, async (_event, id: string, x: number, y: number) => {
    return browserPaneManager.clickAt(id, x, y)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_DRAG, async (_event, id: string, x1: number, y1: number, x2: number, y2: number) => {
    return browserPaneManager.drag(id, x1, y1, x2, y2)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_FILL, async (_event, id: string, ref: string, value: string) => {
    return browserPaneManager.fillElement(id, ref, value)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SELECT, async (_event, id: string, ref: string, value: string) => {
    return browserPaneManager.selectOption(id, ref, value)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_UPLOAD, async (_event, id: string, ref: string, filePaths: string[]) => {
    return browserPaneManager.uploadFiles(id, ref, filePaths)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_TYPE, async (_event, id: string, text: string) => {
    return browserPaneManager.typeText(id, text)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_KEY, async (_event, id: string, key: string, options?: BrowserKeyOptions) => {
    return browserPaneManager.pressKey(id, key, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SCREENSHOT, async (_event, id: string, options?: BrowserScreenshotOptions) => {
    return browserPaneManager.screenshot(id, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_EVALUATE, async (_event, id: string, expression: string) => {
    return browserPaneManager.evaluate(id, expression)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SCROLL, async (_event, id: string, options?: BrowserScrollOptions) => {
    return browserPaneManager.scroll(id, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_WAIT, async (_event, id: string, options: BrowserWaitOptions) => {
    return browserPaneManager.waitFor(id, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CONSOLE, async (_event, id: string, limit?: number, level?: any) => {
    return browserPaneManager.getConsoleEntries(id, limit, level)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_NETWORK, async (_event, id: string, limit?: number, state?: any) => {
    return browserPaneManager.getNetworkEntries(id, limit, state)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_DOWNLOADS, async (_event, id: string, options?: any) => {
    return browserPaneManager.getDownloads(id, options)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SET_CLIPBOARD, async (_event, text: string) => {
    return browserPaneManager.setClipboard(text)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_GET_CLIPBOARD, async () => {
    return browserPaneManager.getClipboard()
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_PASTE, async (_event, id: string, text: string) => {
    return browserPaneManager.paste(id, text)
  })

  browserPaneManager.onStateChange((info) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED, info)
  })

  browserPaneManager.onRemoved((id) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_REMOVED, id)
  })

  browserPaneManager.onInteracted((id) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_INTERACTED, id)
  })
}
