export type BrowserLiveFxPlatform = 'darwin' | 'win32' | 'linux' | 'other'

export interface BrowserLiveFxCornerRadii {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
}

export function getBrowserLiveFxCornerRadii(platform: BrowserLiveFxPlatform): BrowserLiveFxCornerRadii {
  const bottomRadius = platform === 'darwin' ? 16 : platform === 'win32' ? 8 : 6

  return {
    topLeft: '0px',
    topRight: '0px',
    bottomLeft: `${bottomRadius}px`,
    bottomRight: `${bottomRadius}px`,
  }
}
