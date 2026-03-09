import { existsSync } from 'fs'
import { join } from 'path'

function getResourceDirCandidates(): string[] {
  const candidates = [
    join(__dirname, 'resources'),
    join(__dirname, '../resources'),
  ]

  return [...new Set(candidates)]
}

export function findBundledResourcePath(...segments: string[]): string | undefined {
  for (const resourcesDir of getResourceDirCandidates()) {
    const candidate = join(resourcesDir, ...segments)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

export function getBundledResourceDir(...segments: string[]): string | undefined {
  return findBundledResourcePath(...segments)
}
