declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;

    readonly readyState: 0 | 1 | 2 | 3;

    close(code?: number, data?: string | Buffer): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: any, cb?: (err?: Error) => void): void;
    send(data: any, options: Record<string, any>, cb?: (err?: Error) => void): void;
    terminate(): void;

    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options?: Record<string, any>, callback?: () => void);

    address(): { port: number; family: string; address: string } | string;
    close(cb?: (err?: Error) => void): void;

    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
