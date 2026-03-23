/**
 * Office Server Manager
 *
 * Manages the Pixel Agents standalone server lifecycle.
 * Starts a Node.js process running Express + WebSocket on a dynamically
 * allocated localhost port, serving the Pixel Agents UI and handling
 * real-time agent events.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { app } from 'electron'

const OFFICE_HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15000

let serverProcess: ChildProcess | null = null
let isStarting = false
let officePort: number | null = null
let startPromise: Promise<string | null> | null = null

/**
 * Check if a port is already in use.
 */
function getOfficeServerUrlForPort(port: number): string {
  return `http://${OFFICE_HOST}:${port}`
}

export function getOfficeServerUrl(): string | null {
  return officePort ? getOfficeServerUrlForPort(officePort) : null
}

export function getOfficeServerOrigin(): string | null {
  return getOfficeServerUrl()
}

function allocateOfficePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, OFFICE_HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to resolve a free office server port'))
        return
      }
      const port = address.port
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }
        resolve(port)
      })
    })
  })
}

async function isOfficeServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) return false
    const payload = await response.json().catch(() => null)
    return payload?.status === 'ok'
  } catch {
    return false
  }
}

/**
 * Find the Pixel Agents server entry point.
 * Looks for the bundled server.mjs in various locations.
 */
function getOfficeServerCommand(): { command: string; args: string[]; cwd?: string } | null {
  const appPath = app.getAppPath()
  const bunCandidates = [
    join(process.resourcesPath || '', 'app', 'vendor', 'bun', 'bun'),
    join(appPath, 'vendor', 'bun', 'bun'),
    'bun',
  ]

  const possiblePaths = [
    // Production: built office bundle in dist/resources
    join(appPath, 'dist', 'resources', 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
    join(process.resourcesPath || '', 'app', 'dist', 'resources', 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
    // Dev mode: built server next to source
    join(appPath, 'src', 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
    // Dev mode: cwd might be monorepo root
    join(process.cwd(), 'apps', 'electron', 'src', 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
    // Production: in resources
    join(process.resourcesPath || '', 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
    // Production: in app.asar
    join(appPath, 'office-backend', 'pixel-agents-server', 'dist', 'server.mjs'),
  ]

  console.log(`[OfficeServer] app.getAppPath() = ${appPath}`)
  console.log(`[OfficeServer] process.cwd() = ${process.cwd()}`)

  for (const serverPath of possiblePaths) {
    if (existsSync(serverPath)) {
      console.log(`[OfficeServer] Found server at: ${serverPath}`)
      const runtimeCommand = bunCandidates.find(candidate => candidate === 'bun' || existsSync(candidate))
      if (!runtimeCommand) {
        console.warn('[OfficeServer] No bundled Bun runtime found for office server')
        return null
      }
      return { command: runtimeCommand, args: [serverPath] }
    }
  }

  // Log what we tried for debugging
  console.warn('[OfficeServer] Could not find Pixel Agents server. Searched:')
  for (const p of possiblePaths) {
    console.warn(`  ${p} → not found`)
  }

  return null
}

/**
 * Start the Pixel Agents backend server.
 */
export async function startOfficeServer(): Promise<string | null> {
  const existingUrl = getOfficeServerUrl()
  if (existingUrl && await isOfficeServerHealthy(existingUrl)) {
    return existingUrl
  }
  if (existingUrl && serverProcess) {
    stopOfficeServer()
  }
  if (existingUrl) {
    officePort = null
  }
  if (startPromise) {
    return await startPromise
  }
  startPromise = startOfficeServerInternal().finally(() => {
    startPromise = null
  })
  return await startPromise
}

async function startOfficeServerInternal(): Promise<string | null> {
  if (isStarting) {
    return getOfficeServerUrl()
  }
  const serverCmd = getOfficeServerCommand()
  if (!serverCmd) {
    console.warn('[OfficeServer] No server executable or script found, skipping')
    return null
  }

  const port = await allocateOfficePort()
  isStarting = true
  console.log(`[OfficeServer] Starting on port ${port}: ${serverCmd.command} ${serverCmd.args.join(' ')}`)

  try {
    serverProcess = spawn(serverCmd.command, serverCmd.args, {
      env: {
        ...process.env,
        OFFICE_PORT: String(port),
        NODE_ENV: process.env.VITE_DEV_SERVER_URL ? 'development' : 'production',
      },
      cwd: serverCmd.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.log(`[OfficeServer] ${line}`)
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.log(`[OfficeServer:err] ${line}`)
    })

    serverProcess.on('close', (code) => {
      console.log(`[OfficeServer] Process exited with code ${code}`)
      serverProcess = null
      officePort = null
    })

    serverProcess.on('error', (err) => {
      console.error('[OfficeServer] Failed to start:', err.message)
      serverProcess = null
      officePort = null
    })

    const url = getOfficeServerUrlForPort(port)
    await waitForServer(url, STARTUP_TIMEOUT_MS)
    officePort = port
    console.log(`[OfficeServer] Ready on ${url}`)
    return url
  } catch (err) {
    console.error('[OfficeServer] Startup failed:', err)
    officePort = null
    return null
  } finally {
    isStarting = false
  }
}

/**
 * Stop the backend.
 */
export function stopOfficeServer(): void {
  if (!serverProcess) return

  console.log('[OfficeServer] Stopping...')
  try {
    serverProcess.kill('SIGTERM')
    // Force kill after 3 seconds
    const forceTimer = setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL')
        serverProcess = null
        officePort = null
      }
    }, 3000)

    serverProcess.once('close', () => {
      clearTimeout(forceTimer)
      serverProcess = null
      officePort = null
      console.log('[OfficeServer] Stopped')
    })
  } catch {
    serverProcess = null
    officePort = null
  }
}

/**
 * Wait for the server to accept connections.
 */
function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    async function tryConnect() {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`))
        return
      }

      if (await isOfficeServerHealthy(baseUrl)) {
        resolve()
        return
      }

      setTimeout(tryConnect, 500)
    }

    void tryConnect()
  })
}
