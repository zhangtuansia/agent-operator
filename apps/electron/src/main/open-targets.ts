import { app, nativeImage } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type OpenTargetKind = 'editor' | 'terminal' | 'fileManager'

export interface OpenTargetInfo {
  id: string
  label: string
  kind: OpenTargetKind
  iconDataUrl: string | null
}

interface OpenTargetDefinition {
  id: string
  label: string
  kind: OpenTargetKind
  bundleId?: string
  candidatePaths: string[]
}

interface ResolvedOpenTarget extends OpenTargetDefinition {
  bundlePath: string
}

const TARGET_DEFINITIONS: OpenTargetDefinition[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'editor',
    bundleId: 'com.todesktop.230313mzl4w4u92',
    candidatePaths: [
      '/Applications/Cursor.app',
      join(homedir(), 'Applications', 'Cursor.app'),
    ],
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'editor',
    bundleId: 'dev.zed.Zed',
    candidatePaths: [
      '/Applications/Zed.app',
      join(homedir(), 'Applications', 'Zed.app'),
    ],
  },
  {
    id: 'sublime-text',
    label: 'Sublime Text',
    kind: 'editor',
    bundleId: 'com.sublimetext.4',
    candidatePaths: [
      '/Applications/Sublime Text.app',
      join(homedir(), 'Applications', 'Sublime Text.app'),
    ],
  },
  {
    id: 'finder',
    label: 'Finder',
    kind: 'fileManager',
    bundleId: 'com.apple.finder',
    candidatePaths: [
      '/System/Library/CoreServices/Finder.app',
    ],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    kind: 'terminal',
    bundleId: 'com.apple.Terminal',
    candidatePaths: [
      '/System/Applications/Utilities/Terminal.app',
      '/Applications/Utilities/Terminal.app',
    ],
  },
  {
    id: 'ghostty',
    label: 'Ghostty',
    kind: 'terminal',
    bundleId: 'com.mitchellh.ghostty',
    candidatePaths: [
      '/Applications/Ghostty.app',
      join(homedir(), 'Applications', 'Ghostty.app'),
    ],
  },
  {
    id: 'warp',
    label: 'Warp',
    kind: 'terminal',
    bundleId: 'dev.warp.Warp-Stable',
    candidatePaths: [
      '/Applications/Warp.app',
      join(homedir(), 'Applications', 'Warp.app'),
    ],
  },
]

const iconCache = new Map<string, string | null>()

function isUsableAppBundle(bundlePath: string): boolean {
  try {
    return existsSync(bundlePath) && statSync(bundlePath).isDirectory()
  } catch {
    return false
  }
}

function findBundleByMdfind(bundleId: string): string | null {
  try {
    const raw = execFileSync('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == "${bundleId}"`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const match = raw
      .split('\n')
      .map(line => line.trim())
      .find(candidate => candidate.endsWith('.app') && isUsableAppBundle(candidate))
    return match || null
  } catch {
    return null
  }
}

function resolveTarget(definition: OpenTargetDefinition): ResolvedOpenTarget | null {
  for (const candidate of definition.candidatePaths) {
    if (isUsableAppBundle(candidate)) {
      return { ...definition, bundlePath: candidate }
    }
  }

  if (definition.bundleId) {
    const discovered = findBundleByMdfind(definition.bundleId)
    if (discovered) {
      return { ...definition, bundlePath: discovered }
    }
  }

  return null
}

function getBundleIconPath(bundlePath: string): string | null {
  try {
    const infoPath = join(bundlePath, 'Contents', 'Info')
    const iconName = execFileSync('/usr/bin/defaults', ['read', infoPath, 'CFBundleIconFile'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (!iconName) return null

    const normalizedIconName = iconName.endsWith('.icns') ? iconName : `${iconName}.icns`
    const iconPath = join(bundlePath, 'Contents', 'Resources', normalizedIconName)
    return existsSync(iconPath) ? iconPath : null
  } catch {
    return null
  }
}

function convertIcnsToDataUrl(iconPath: string): string | null {
  const tempDir = mkdtempSync(join(tmpdir(), 'dazi-open-target-icon-'))
  const pngPath = join(tempDir, 'icon.png')

  try {
    execFileSync('/usr/bin/sips', ['-s', 'format', 'png', iconPath, '--out', pngPath], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })

    if (!existsSync(pngPath)) return null

    const bytes = readFileSync(pngPath)
    return `data:image/png;base64,${bytes.toString('base64')}`
  } catch {
    return null
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function getTargetIconDataUrl(bundlePath: string): Promise<string | null> {
  if (iconCache.has(bundlePath)) {
    return iconCache.get(bundlePath) ?? null
  }

  try {
    const bundleIconPath = getBundleIconPath(bundlePath)
    if (bundleIconPath) {
      const convertedIcon = convertIcnsToDataUrl(bundleIconPath)
      if (convertedIcon) {
        iconCache.set(bundlePath, convertedIcon)
        return convertedIcon
      }
    }

    const icon = await app.getFileIcon(bundlePath, { size: 'normal' })
    const resized = icon.isEmpty() ? null : icon.resize({ width: 28, height: 28 }).toDataURL()
    iconCache.set(bundlePath, resized)
    return resized
  } catch {
    iconCache.set(bundlePath, null)
    return null
  }
}

export async function listOpenTargets(): Promise<OpenTargetInfo[]> {
  if (process.platform !== 'darwin') {
    return []
  }

  const resolvedTargets = TARGET_DEFINITIONS
    .map(resolveTarget)
    .filter((target): target is ResolvedOpenTarget => target !== null)

  return await Promise.all(
    resolvedTargets.map(async (target) => ({
      id: target.id,
      label: target.label,
      kind: target.kind,
      iconDataUrl: await getTargetIconDataUrl(target.bundlePath),
    })),
  )
}

function getResolvedTarget(targetId: string): ResolvedOpenTarget {
  const definition = TARGET_DEFINITIONS.find(target => target.id === targetId)
  if (!definition) {
    throw new Error(`Unknown open target: ${targetId}`)
  }

  const resolvedTarget = resolveTarget(definition)
  if (!resolvedTarget) {
    throw new Error(`Open target is not available on this machine: ${definition.label}`)
  }

  return resolvedTarget
}

function runOpen(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('open', args, {
      stdio: 'ignore',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`open exited with code ${code}`))
    })
  })
}

export async function openPathWithTarget(targetId: string, path: string): Promise<void> {
  const absolutePath = resolve(path)
  const target = getResolvedTarget(targetId)

  if (target.kind === 'fileManager') {
    await runOpen(['-R', absolutePath])
    return
  }

  if (target.kind === 'terminal') {
    const terminalPath = existsSync(absolutePath) && statSync(absolutePath).isDirectory()
      ? absolutePath
      : dirname(absolutePath)
    await runOpen(['-a', target.bundlePath, terminalPath])
    return
  }

  await runOpen(['-a', target.bundlePath, absolutePath])
}
