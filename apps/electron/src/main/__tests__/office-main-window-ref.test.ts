import { describe, expect, it, mock } from 'bun:test'
import type { BrowserWindow } from 'electron'
import { syncOfficeMainWindowRef } from '../office-main-window-ref'

function createWindow(id: number): BrowserWindow {
  return {
    webContents: { id },
  } as unknown as BrowserWindow
}

describe('syncOfficeMainWindowRef', () => {
  it('uses the candidate window when it is managed', () => {
    const candidate = createWindow(11)
    const setMainWindowRef = mock()

    syncOfficeMainWindowRef(
      {
        getWindowByWebContentsId: (id) => id === 11 ? candidate : null,
        getLastActiveWindow: () => null,
      },
      setMainWindowRef,
      candidate,
    )

    expect(setMainWindowRef).toHaveBeenCalledWith(candidate)
  })

  it('falls back to the last active managed window', () => {
    const fallback = createWindow(22)
    const setMainWindowRef = mock()

    syncOfficeMainWindowRef(
      {
        getWindowByWebContentsId: () => null,
        getLastActiveWindow: () => fallback,
      },
      setMainWindowRef,
      createWindow(99),
    )

    expect(setMainWindowRef).toHaveBeenCalledWith(fallback)
  })

  it('does nothing when no managed window is available', () => {
    const setMainWindowRef = mock()

    syncOfficeMainWindowRef(
      {
        getWindowByWebContentsId: () => null,
        getLastActiveWindow: () => null,
      },
      setMainWindowRef,
    )

    expect(setMainWindowRef).not.toHaveBeenCalled()
  })
})
