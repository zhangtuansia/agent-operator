/**
 * DAZI Bridge — WebSocket connection to the pixel-agents-server.
 *
 * Replaces VS Code's postMessage API for standalone mode.
 * Receives agent lifecycle events from the server and dispatches them
 * as window 'message' events so useExtensionMessages works unchanged.
 *
 * Also intercepts outgoing vscode.postMessage calls and routes them
 * over WebSocket when appropriate.
 */

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;

const RECONNECT_DELAY_MS = 2000;

/**
 * Initialize the WebSocket connection to the pixel-agents-server.
 * Should be called once during app startup, after browserMock has
 * dispatched initial asset messages.
 */
export function initDaziBridge(): void {
  connect();
}

function connect(): void {
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  console.log(`[DaziBridge] Connecting to ${wsUrl}...`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[DaziBridge] Connected');
    isConnected = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Tell the server we're ready
    sendToServer({ type: 'webviewReady' });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      // Dispatch as a window 'message' event so useExtensionMessages picks it up
      window.dispatchEvent(new MessageEvent('message', { data: msg }));
    } catch (err) {
      console.error('[DaziBridge] Failed to parse message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[DaziBridge] Disconnected');
    isConnected = false;
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('[DaziBridge] WebSocket error:', err);
    // onclose will fire after onerror, which will trigger reconnect
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    console.log('[DaziBridge] Attempting reconnect...');
    connect();
  }, RECONNECT_DELAY_MS);
}

/**
 * Send a message to the pixel-agents-server via WebSocket.
 * Used by the vscodeApi shim for outgoing messages.
 */
export function sendToServer(msg: unknown): void {
  if (ws && isConnected) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Check if the WebSocket is currently connected.
 */
export function isBridgeConnected(): boolean {
  return isConnected;
}
