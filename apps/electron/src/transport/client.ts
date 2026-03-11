interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
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

type IncomingEnvelope = HandshakeAckEnvelope | ResponseEnvelope | ErrorEnvelope | EventEnvelope

export interface WsRpcClientOptions {
  token?: string
  workspaceId?: string
  webContentsId?: number
  requestTimeout?: number
  autoReconnect?: boolean
  connectTimeout?: number
  maxReconnectDelay?: number
}

export class WsRpcClient {
  private socket: WebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private resolveConnect: (() => void) | null = null
  private rejectConnect: ((error: Error) => void) | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private clientId: string | null = null
  private connected = false
  private readonly pending = new Map<string, PendingRequest>()
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  private serverChannels: Set<string> | null = null

  constructor(
    private readonly url: string,
    private readonly options: WsRpcClientOptions = {},
  ) {}

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve()
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve
      this.rejectConnect = reject
    })

    const socket = new WebSocket(this.url)
    this.socket = socket
    const connectTimeout = setTimeout(() => {
      if (!this.connected) {
        socket.close()
        this.failConnect(new Error('WS transport handshake timeout'))
      }
    }, this.options.connectTimeout ?? 10_000)

    socket.addEventListener('open', () => {
      const handshake: HandshakeEnvelope = {
        type: 'handshake',
        token: this.options.token,
        webContentsId: this.options.webContentsId,
        workspaceId: this.options.workspaceId,
      }
      socket.send(JSON.stringify(handshake))
    })

    socket.addEventListener('message', (event) => {
      let envelope: IncomingEnvelope
      try {
        envelope = JSON.parse(String(event.data)) as IncomingEnvelope
      } catch {
        return
      }

      if (envelope.type === 'handshake_ack') {
        clearTimeout(connectTimeout)
        this.connected = true
        this.clientId = envelope.clientId
        this.serverChannels = new Set(envelope.channels)
        this.reconnectAttempt = 0
        this.resolveConnect?.()
        this.resolveConnect = null
        this.rejectConnect = null
        this.connectPromise = null
        return
      }

      if (envelope.type === 'response') {
        const pending = this.pending.get(envelope.id)
        if (!pending) return
        clearTimeout(pending.timeout)
        this.pending.delete(envelope.id)
        pending.resolve(envelope.result)
        return
      }

      if (envelope.type === 'error') {
        if (envelope.id) {
          const pending = this.pending.get(envelope.id)
          if (!pending) return
          clearTimeout(pending.timeout)
          this.pending.delete(envelope.id)
          pending.reject(new Error(envelope.error.message))
          return
        }
        if (!this.connected) {
          this.failConnect(new Error(envelope.error.message))
        }
        return
      }

      if (envelope.type === 'event') {
        const listeners = this.listeners.get(envelope.channel)
        if (!listeners) return
        for (const listener of listeners) {
          listener(...envelope.args)
        }
      }
    })

    socket.addEventListener('close', () => {
      clearTimeout(connectTimeout)
      const wasConnected = this.connected
      this.connected = false
      this.clientId = null
      this.socket = null

      if (!wasConnected) {
        this.failConnect(new Error('WS transport closed before handshake'))
        return
      }

      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error(`WS transport disconnected during request '${id}'`))
      }
      this.pending.clear()

      if (this.options.autoReconnect === false) return
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (!this.connected) {
        this.failConnect(new Error('WS transport connection failed'))
      }
    })

    return this.connectPromise
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    await this.connect()

    if (!this.socket || !this.connected) {
      throw new Error(`WS transport is not connected for '${channel}'`)
    }

    const id = globalThis.crypto.randomUUID()
    const request: RequestEnvelope = {
      id,
      type: 'request',
      channel,
      args,
    }

    return await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timeout: ${channel}`))
      }, this.options.requestTimeout ?? 30_000)

      this.pending.set(id, { resolve, reject, timeout })
      this.socket!.send(JSON.stringify(request))
    })
  }

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    let listeners = this.listeners.get(channel)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(channel, listeners)
    }
    listeners.add(callback)
    return () => {
      listeners!.delete(callback)
      if (listeners!.size === 0) {
        this.listeners.delete(channel)
      }
    }
  }

  isChannelAvailable(channel: string): boolean {
    if (!this.serverChannels) return true
    return this.serverChannels.has(channel)
  }

  private failConnect(error: Error): void {
    this.connected = false
    this.clientId = null
    this.socket = null
    this.rejectConnect?.(error)
    this.resolveConnect = null
    this.rejectConnect = null
    this.connectPromise = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = Math.min(30_000, (this.options.maxReconnectDelay ?? 30_000), 1_000 * 2 ** this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect().catch(() => {})
    }, delay)
  }
}
