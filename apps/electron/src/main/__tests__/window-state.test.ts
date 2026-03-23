import { describe, expect, it } from 'bun:test'
import { sanitizeWindowRestoreUrl } from '../window-state-url'

describe('window state URL sanitization', () => {
  it('converts saved release file URLs into stable app-local restore URLs', () => {
    const result = sanitizeWindowRestoreUrl(
      'file:///Users/yangchen/Downloads/agent-operator-main/apps/electron/release/mac-arm64/Dazi.app/Contents/Resources/app/dist/renderer/index.html?workspaceId=ws-1&route=documents%2Fdocument%2Fabc&sidebar=sessionFiles',
    )

    expect(result).toBe('app://window?workspaceId=ws-1&route=documents%2Fdocument%2Fabc&sidebar=sessionFiles')
  })

  it('drops URLs that do not carry restorable navigation state', () => {
    expect(
      sanitizeWindowRestoreUrl('file:///Users/yangchen/Downloads/agent-operator-main/apps/electron/dist/renderer/index.html'),
    ).toBeUndefined()
  })

  it('preserves app-local restore URLs', () => {
    expect(
      sanitizeWindowRestoreUrl('app://window?workspaceId=ws-1&route=allChats'),
    ).toBe('app://window?workspaceId=ws-1&route=allChats')
  })
})
