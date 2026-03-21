/**
 * Office Server Manager
 *
 * Manages the Pixel Agents standalone server lifecycle.
 * Starts a Node.js process running Express + WebSocket on port 19000,
 * serving the Pixel Agents UI and handling real-time agent events.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { app } from 'electron'

const OFFICE_PORT = 19000
const OFFICE_HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15000

let serverProcess: ChildProcess | null = null
let isStarting = false

/**
 * Check if a port is already in use.
 */
function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      resolve(false)
    })
  })
}

/**
 * Find the Pixel Agents server entry point.
 * Looks for the bundled server.mjs in various locations.
 */
function getOfficeServerCommand(): { command: string; args: string[]; cwd?: string } | null {
  const appPath = app.getAppPath()

  const possiblePaths = [
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
      return { command: 'node', args: [serverPath] }
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
export async function startOfficeServer(): Promise<void> {
  if (isStarting || serverProcess) return

  const serverCmd = getOfficeServerCommand()
  if (!serverCmd) {
    console.warn('[OfficeServer] No server executable or script found, skipping')
    return
  }

  // Check if port is already in use (maybe from a previous run)
  const portBusy = await isPortInUse(OFFICE_PORT, OFFICE_HOST)
  if (portBusy) {
    console.log(`[OfficeServer] Port ${OFFICE_PORT} already in use, assuming server is running`)
    return
  }

  isStarting = true
  console.log(`[OfficeServer] Starting: ${serverCmd.command} ${serverCmd.args.join(' ')}`)

  try {
    serverProcess = spawn(serverCmd.command, serverCmd.args, {
      env: {
        ...process.env,
        OFFICE_PORT: String(OFFICE_PORT),
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
    })

    serverProcess.on('error', (err) => {
      console.error('[OfficeServer] Failed to start:', err.message)
      serverProcess = null
    })

    // Wait for server to be ready (poll port)
    await waitForServer(OFFICE_PORT, OFFICE_HOST, STARTUP_TIMEOUT_MS)
    console.log(`[OfficeServer] Ready on http://${OFFICE_HOST}:${OFFICE_PORT}`)
  } catch (err) {
    console.error('[OfficeServer] Startup failed:', err)
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
      }
    }, 3000)

    serverProcess.once('close', () => {
      clearTimeout(forceTimer)
      serverProcess = null
      console.log('[OfficeServer] Stopped')
    })
  } catch {
    serverProcess = null
  }
}

/**
 * Wait for the server to accept connections.
 */
function waitForServer(port: number, host: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    function tryConnect() {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`))
        return
      }

      const socket = createConnection({ port, host })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        setTimeout(tryConnect, 500)
      })
    }

    tryConnect()
  })
}
