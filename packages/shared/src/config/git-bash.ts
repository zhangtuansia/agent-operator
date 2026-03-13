import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { ensureConfigDir } from './storage.ts'
import { CONFIG_DIR } from './paths.ts'

const GIT_BASH_FILE = join(CONFIG_DIR, 'git-bash.json')

interface GitBashConfig {
  path?: string
}

function readGitBashConfig(): GitBashConfig {
  try {
    if (!existsSync(GIT_BASH_FILE)) return {}
    return JSON.parse(readFileSync(GIT_BASH_FILE, 'utf-8')) as GitBashConfig
  } catch {
    return {}
  }
}

export function getGitBashPath(): string | null {
  return readGitBashConfig().path ?? null
}

export function setGitBashPath(path: string): void {
  ensureConfigDir()
  writeFileSync(GIT_BASH_FILE, JSON.stringify({ path }, null, 2), 'utf-8')
}

export function clearGitBashPath(): void {
  try {
    if (existsSync(GIT_BASH_FILE)) {
      unlinkSync(GIT_BASH_FILE)
    }
  } catch {
    // Best effort cleanup.
  }
}
