import { app } from 'electron'
import { mkdir } from 'fs/promises'
import { existsSync } from 'node:fs'
import { execSync, spawn, spawnSync } from 'child_process'
import { join, delimiter } from 'path'
import { ipcLog } from './logger'
import type { EnsureGwsInstalledResult } from '../shared/types'

interface CommandRunResult {
  code: number | null
  stdout: string
  stderr: string
  error?: string
  timedOut?: boolean
}

interface GwsRuntimeCandidate {
  command: string
  argsPrefix?: string[]
  env?: Record<string, string>
  installed: boolean
}

const GWS_MCP_COMPATIBLE_VERSION = '0.7.0'
const GWS_MCP_UNSUPPORTED_ERROR =
  `Installed Google Workspace CLI does not support MCP. ` +
  `The latest @googleworkspace/cli removed \`gws mcp\`; use @googleworkspace/cli@${GWS_MCP_COMPATIBLE_VERSION} or a bundled compatible build.`

function resolveUserShellPath(): string | null {
  if (process.platform === 'win32') return null

  try {
    const shellPath = process.env.SHELL || '/bin/bash'
    const result = execSync(`${shellPath} -ilc 'echo __PATH__=$PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env },
    })
    const match = result.match(/__PATH__=(.+)/)
    return match ? match[1].trim() : null
  } catch (error) {
    ipcLog.warn('[gws] Failed to resolve user shell PATH:', error)
    return null
  }
}

function buildGwsInstallEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }

  if (app.isPackaged) {
    if (!env.HOME) {
      env.HOME = app.getPath('home')
    }

    const userPath = resolveUserShellPath()
    if (userPath) {
      env.PATH = userPath
    } else if (process.platform !== 'win32') {
      const commonPaths = [
        env.PATH,
        '/usr/local/bin',
        '/opt/homebrew/bin',
        env.HOME ? `${env.HOME}/.nvm/current/bin` : undefined,
        env.HOME ? `${env.HOME}/.volta/bin` : undefined,
        env.HOME ? `${env.HOME}/.fnm/current/bin` : undefined,
      ].filter(Boolean)
      env.PATH = commonPaths.join(delimiter)
    }
  }

  return env
}

function findCommandInPath(commands: string[], env: NodeJS.ProcessEnv): string | null {
  const checker = process.platform === 'win32' ? 'where' : 'which'

  for (const command of commands) {
    if ((command.includes('/') || command.includes('\\')) && existsSync(command)) {
      return command
    }

    const result = spawnSync(checker, [command], {
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (result.status === 0) {
      const resolved = result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
}

function getBundledGwsRunScriptPath(): string | null {
  const relativeSegments = ['resources', 'vendor', 'gws-cli', 'node_modules', '@googleworkspace', 'cli', 'run-gws.js']
  const candidates = [
    join(__dirname, ...relativeSegments),
    join(app.getAppPath(), 'dist', ...relativeSegments),
    join(app.getAppPath(), ...relativeSegments),
    join(process.cwd(), 'apps', 'electron', 'dist', ...relativeSegments),
    join(process.cwd(), 'dist', ...relativeSegments),
  ]

  return candidates.find(candidate => existsSync(candidate)) ?? null
}

function buildBundledGwsResult(runScriptPath: string, installed: boolean): EnsureGwsInstalledResult {
  return {
    success: true,
    command: process.execPath,
    argsPrefix: [runScriptPath],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    installed,
  }
}

function toGwsCandidate(result: EnsureGwsInstalledResult): GwsRuntimeCandidate | null {
  if (!result.success || !result.command) return null
  return {
    command: result.command,
    argsPrefix: result.argsPrefix,
    env: result.env,
    installed: !!result.installed,
  }
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
  } = {},
): Promise<CommandRunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const finish = (result: CommandRunResult): void => {
      if (settled) return
      settled = true
      resolvePromise(result)
    }

    const timeoutId = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, options.timeoutMs)
      : null

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)
      finish({
        code: null,
        stdout,
        stderr,
        error: error.message,
        timedOut,
      })
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      finish({
        code,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

export async function ensureGwsInstalled(): Promise<EnsureGwsInstalledResult> {
  const installEnv = buildGwsInstallEnv()
  const validateCandidate = async (candidate: GwsRuntimeCandidate): Promise<boolean> => {
    const result = await runCommand(
      candidate.command,
      [...(candidate.argsPrefix ?? []), 'mcp', '--help'],
      {
        cwd: app.getAppPath(),
        env: {
          ...installEnv,
          ...candidate.env,
        },
        timeoutMs: 15000,
      },
    )

    if (result.code === 0) return true

    const output = `${result.stderr}\n${result.stdout}\n${result.error ?? ''}`.toLowerCase()
    if (output.includes("unknown service 'mcp'") || output.includes('remove `mcp` command')) {
      return false
    }

    return false
  }

  const bundledRunScript = getBundledGwsRunScriptPath()
  if (bundledRunScript) {
    const bundled = buildBundledGwsResult(bundledRunScript, false)
    const bundledCandidate = toGwsCandidate(bundled)
    if (bundledCandidate && await validateCandidate(bundledCandidate)) {
      return bundled
    }
  }

  const systemCommand = findCommandInPath(
    process.platform === 'win32' ? ['gws.cmd', 'gws'] : ['gws'],
    installEnv,
  )
  if (systemCommand) {
    const systemResult: EnsureGwsInstalledResult = {
      success: true,
      command: systemCommand,
      installed: false,
    }
    const systemCandidate = toGwsCandidate(systemResult)
    if (systemCandidate && await validateCandidate(systemCandidate)) {
      return systemResult
    }
  }

  const npmCommand = findCommandInPath(
    process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'],
    installEnv,
  )
  if (!npmCommand) {
    return {
      success: false,
      error: 'npm not found, and no bundled or system gws installation is available.',
    }
  }

  const runtimeDir = join(app.getPath('userData'), 'vendor', 'gws-cli')
  await mkdir(runtimeDir, { recursive: true })

  const installResult = await runCommand(
    npmCommand,
    [
      'install',
      '--prefix',
      runtimeDir,
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      `@googleworkspace/cli@${GWS_MCP_COMPATIBLE_VERSION}`,
    ],
    {
      cwd: app.getAppPath(),
      env: {
        ...installEnv,
        npm_config_update_notifier: 'false',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
      },
      timeoutMs: 120000,
    },
  )

  if (installResult.code !== 0) {
    const errorMessage = installResult.error
      || installResult.stderr.trim()
      || installResult.stdout.trim()
      || 'npm install failed'
    return {
      success: false,
      error: errorMessage.slice(0, 500),
    }
  }

  const runtimeRunScript = join(
    runtimeDir,
    'node_modules',
    '@googleworkspace',
    'cli',
    'run-gws.js',
  )

  if (!existsSync(runtimeRunScript)) {
    return {
      success: false,
      error: 'Google Workspace CLI installed, but run-gws.js was not found.',
    }
  }

  const runtimeResult = buildBundledGwsResult(runtimeRunScript, true)
  const runtimeCandidate = toGwsCandidate(runtimeResult)
  if (runtimeCandidate && await validateCandidate(runtimeCandidate)) {
    return runtimeResult
  }

  return {
    success: false,
    error: GWS_MCP_UNSUPPORTED_ERROR,
  }
}
