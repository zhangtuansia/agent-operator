import type { BrowserWindow } from 'electron'

interface OfficeWindowManager {
  getWindowByWebContentsId(webContentsId: number): BrowserWindow | null
  getLastActiveWindow(): BrowserWindow | null
}

export function syncOfficeMainWindowRef(
  windowManager: OfficeWindowManager | null | undefined,
  setMainWindowRef: ((win: BrowserWindow) => void) | null | undefined,
  candidate?: BrowserWindow | null,
): void {
  if (!windowManager || !setMainWindowRef) return

  const managedWindow = candidate && windowManager.getWindowByWebContentsId(candidate.webContents.id)
    ? candidate
    : windowManager.getLastActiveWindow()

  if (managedWindow) {
    setMainWindowRef(managedWindow)
  }
}
