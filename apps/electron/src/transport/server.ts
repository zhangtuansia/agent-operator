import { createServer, type Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket as WsSocket } from 'ws'

export interface RequestContext {
  clientId?: string
  webContentsId?: number
  workspaceId?: string
}

export type HandlerFn = (ctx: RequestContext, ...args: any[]) => unknown | Promise<unknown>

export interface RpcServer {
  handle(channel: string, handler: HandlerFn): void
  push(channel: string, target: { to: 'all' } | { webContentsId: number }, ...args: unknown[]): void
}

interface ClientRecord {
  clientId: string
  socket: WsSocket
  webContentsId?: number
  workspaceId?: string
}

interface HandshakeEnvelope {
  type: 'handshake'
  token?: string
  webContentsId?: number
  workspaceId?: string
}

interface HandshakeAckEnvelope {
  type: 'handshake_ack'
  clientId: string
  channels: string[]
}

interface RequestEnvelope {
  id: string
  type: 'request'
  channel: string
  args: unknown[]
}

interface ResponseEnvelope {
  id: string
  type: 'response'
  result: unknown
}

interface ErrorEnvelope {
  id?: string
  type: 'error'
  error: {
    message: string
  }
}

interface EventEnvelope {
  type: 'event'
  channel: string
  args: unknown[]
}

type IncomingEnvelope = HandshakeEnvelope | RequestEnvelope
type OutgoingEnvelope = HandshakeAckEnvelope | ResponseEnvelope | ErrorEnvelope | EventEnvelope

export interface WsRpcServerOptions {
  host?: string
  port?: number
  requireAuth?: boolean
  validateToken?: (token: string | undefined) => boolean | Promise<boolean>
  serverId?: string
  onClientConnected?: (client: { clientId: string; webContentsId?: number; workspaceId?: string }) => void
  onClientDisconnected?: (clientId: string) => void
}

function serializeEnvelope(envelope: OutgoingEnvelope): string {
  return JSON.stringify(envelope)
}

function deserializeEnvelope(raw: string): IncomingEnvelope {
  return JSON.parse(raw) as IncomingEnvelope
}

function sendEnvelope(socket: WsSocket, envelope: OutgoingEnvelope): void {
  if (socket.readyState !== 1) return
  socket.send(serializeEnvelope(envelope))
}

export function pushTyped(
  server: RpcServer,
  channel: string,
  target: { to: 'all' } | { webContentsId: number },
  ...args: unknown[]
): void {
  server.push(channel, target, ...args)
}

export class WsRpcServer implements RpcServer {
  public port = 0

  private readonly handlers = new Map<string, HandlerFn>()
  private readonly clients = new Map<string, ClientRecord>()
  private httpServer: HttpServer | null = null
  private wsServer: WebSocketServer | null = null

  constructor(private readonly options: WsRpcServerOptions = {}) {}

  handle(channel: string, handler: HandlerFn): void {
    this.handlers.set(channel, handler)
  }

  push(channel: string, target: { to: 'all' } | { webContentsId: number }, ...args: unknown[]): void {
    const event: EventEnvelope = {
      type: 'event',
      channel,
      args,
    }

    if ('to' in target && target.to === 'all') {
      for (const client of this.clients.values()) {
        sendEnvelope(client.socket, event)
      }
      return
    }

    for (const client of this.clients.values()) {
      if (client.webContentsId === target.webContentsId) {
        sendEnvelope(client.socket, event)
      }
    }
  }

  async listen(): Promise<void> {
    if (this.httpServer || this.wsServer) return

    const host = this.options.host ?? '127.0.0.1'
    const requestedPort = this.options.port ?? 0
    this.httpServer = createServer()
    this.wsServer = new WebSocketServer({ server: this.httpServer })

    this.wsServer.on('connection', (socket) => {
      let clientId: string | null = null
      let handshaken = false

      const handshakeTimer = setTimeout(() => {
        if (!handshaken) {
          socket.close(4408, 'handshake_timeout')
        }
      }, 5_000)

      socket.on('message', async (data) => {
        let envelope: IncomingEnvelope
        try {
          envelope = deserializeEnvelope(String(data))
        } catch {
          sendEnvelope(socket, {
            type: 'error',
            error: { message: 'Invalid transport envelope' },
          })
          return
        }

        if (!handshaken) {
          if (envelope.type !== 'handshake') {
            socket.close(4400, 'handshake_required')
            return
          }

          const isValid = !this.options.requireAuth || await this.options.validateToken?.(envelope.token)
          if (!isValid) {
            socket.close(4401, 'unauthorized')
            return
          }

          clientId = randomUUID()
          handshaken = true
          clearTimeout(handshakeTimer)

          const record: ClientRecord = {
            clientId,
            socket,
            webContentsId: envelope.webContentsId,
            workspaceId: envelope.workspaceId,
          }
          this.clients.set(clientId, record)
          this.options.onClientConnected?.({
            clientId,
            webContentsId: envelope.webContentsId,
            workspaceId: envelope.workspaceId,
          })

          sendEnvelope(socket, {
            type: 'handshake_ack',
            clientId,
            channels: Array.from(this.handlers.keys()),
          })
          return
        }

        if (envelope.type !== 'request') return

        const handler = this.handlers.get(envelope.channel)
        if (!handler) {
          sendEnvelope(socket, {
            id: envelope.id,
            type: 'error',
            error: { message: `No handler registered for '${envelope.channel}'` },
          })
          return
        }

        try {
          const result = await handler(
            {
              clientId: clientId ?? undefined,
              webContentsId: this.clients.get(clientId!)?.webContentsId,
              workspaceId: this.clients.get(clientId!)?.workspaceId,
            },
            ...(envelope.args ?? []),
          )
          sendEnvelope(socket, {
            id: envelope.id,
            type: 'response',
            result,
          })
        } catch (error) {
          sendEnvelope(socket, {
            id: envelope.id,
            type: 'error',
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          })
        }
      })

      socket.on('close', () => {
        clearTimeout(handshakeTimer)
        if (!clientId) return
        this.clients.delete(clientId)
        this.options.onClientDisconnected?.(clientId)
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject)
      this.httpServer!.listen(requestedPort, host, () => {
        this.httpServer!.off('error', reject)
        const address = this.httpServer!.address()
        this.port = typeof address === 'object' && address ? address.port : requestedPort
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        client.socket.close()
      } catch {
        // Best effort
      }
    }
    this.clients.clear()

    await new Promise<void>((resolve) => {
      if (!this.wsServer) {
        resolve()
        return
      }
      this.wsServer.close(() => resolve())
    })

    await new Promise<void>((resolve) => {
      if (!this.httpServer) {
        resolve()
        return
      }
      this.httpServer.close(() => resolve())
    })

    this.wsServer = null
    this.httpServer = null
  }
}
