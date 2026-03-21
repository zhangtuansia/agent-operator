import { sendToServer } from './bridge/DaziBridge';

/**
 * Standalone shim for vscode.postMessage().
 *
 * In the original Pixel Agents, this sends messages to the VS Code extension.
 * In DAZI standalone mode, we route messages through the WebSocket bridge.
 *
 * Messages like 'saveLayout', 'saveAgentSeats', 'webviewReady' are forwarded
 * to the server. UI-only messages like 'focusAgent' are logged but not critical.
 */
export const vscode: { postMessage(msg: unknown): void } = {
  postMessage: (msg: unknown) => {
    // Forward all messages to the server — it can decide what to handle
    sendToServer(msg);
  },
};
