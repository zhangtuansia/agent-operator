import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveBundledThemesDir } from '../workspace'
import type { PlatformServices } from '../../../runtime/platform'

const createdDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dazi-theme-paths-'))
  createdDirs.push(dir)
  return dir
}

function createPlatform(overrides: Partial<PlatformServices>): PlatformServices {
  return {
    appRootPath: '/app',
    resourcesPath: '/resources',
    isPackaged: false,
    appVersion: '0.0.0',
    imageProcessor: {
      async getMetadata() {
        return null
      },
      async process() {
        return Buffer.alloc(0)
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    isDebugMode: false,
    ...overrides,
  }
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('resolveBundledThemesDir', () => {
  it('prefers the Electron source resources directory in dev', () => {
    const root = createTempDir()
    const sourceThemesDir = join(root, 'apps/electron/resources/themes')
    mkdirSync(sourceThemesDir, { recursive: true })

    const result = resolveBundledThemesDir(createPlatform({
      appRootPath: root,
      isPackaged: false,
    }))

    expect(result).toBe(sourceThemesDir)
  })

  it('falls back to packaged dist resources themes directory', () => {
    const root = createTempDir()
    const packagedThemesDir = join(root, 'dist/resources/themes')
    mkdirSync(packagedThemesDir, { recursive: true })

    const result = resolveBundledThemesDir(createPlatform({
      appRootPath: root,
      resourcesPath: join(root, 'Contents/Resources'),
      isPackaged: true,
    }))

    expect(result).toBe(packagedThemesDir)
  })
})
