declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage, Server as HttpServer } from 'http';
  import { Server as HttpsServer } from 'https';
  import { Duplex } from 'stream';

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    readonly readyState: 0 | 1 | 2 | 3;
    readonly protocol: string;
    readonly url: string;

    constructor(address: string | URL, options?: WebSocket.ClientOptions);
    constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions);

    close(code?: number, data?: string | Buffer): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: any, cb?: (err?: Error) => void): void;
    send(data: any, options: { compress?: boolean; binary?: boolean; fin?: boolean; mask?: boolean }, cb?: (err?: Error) => void): void;
    terminate(): void;

    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  namespace WebSocket {
    interface ClientOptions {
      [key: string]: any;
    }
    interface ServerOptions {
      host?: string;
      port?: number;
      server?: HttpServer | HttpsServer;
      noServer?: boolean;
      path?: string;
      [key: string]: any;
    }
  }

  class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocket.ServerOptions, callback?: () => void);

    address(): { port: number; family: string; address: string } | string;
    close(cb?: (err?: Error) => void): void;
    handleUpgrade(request: IncomingMessage, socket: Duplex, upgradeHead: Buffer, callback: (client: WebSocket, request: IncomingMessage) => void): void;

    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
