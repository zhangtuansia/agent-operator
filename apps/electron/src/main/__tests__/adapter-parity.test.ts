import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

const WINDOW_MANAGER_FILE = path.resolve(import.meta.dir, '../window-manager.ts')
const OAUTH_FLOW_STORE_FILE = path.resolve(import.meta.dir, '../../../../../packages/shared/src/auth/oauth-flow-store.ts')
const BROWSER_PANE_MANAGER_FILE = path.resolve(import.meta.dir, '../browser-pane-manager.ts')

describe('Electron adapter parity', () => {
  it('WindowManager explicitly implements the core window interface', () => {
    const source = readFileSync(WINDOW_MANAGER_FILE, 'utf8')
    expect(source).toContain('implements IWindowManager')
  })

  it('OAuthFlowStore explicitly implements the core oauth flow store interface', () => {
    const source = readFileSync(OAUTH_FLOW_STORE_FILE, 'utf8')
    expect(source).toContain('implements IOAuthFlowStore')
  })

  it('BrowserPaneManager explicitly implements the browser pane interface', () => {
    const source = readFileSync(BROWSER_PANE_MANAGER_FILE, 'utf8')
    expect(source).toContain('implements IBrowserPaneManager')
  })
})
