/**
 * Pixel Agents Standalone Server
 *
 * Serves the Pixel Agents UI as static files and provides:
 * 1. WebSocket server for real-time communication with the UI
 * 2. REST API endpoints for DAZI to push agent lifecycle events
 *
 * Port: 19000 (configurable via OFFICE_PORT env var)
 *
 * Architecture:
 *   DAZI Main Process --[REST API]--> This Server --[WebSocket]--> Pixel Agents UI (iframe)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, join, extname, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

const PORT = parseInt(process.env.OFFICE_PORT || '19000', 10);
const HOST = '127.0.0.1';

// ── Static file serving ─────────────────────────────────────────────────────

// Find the built UI directory
function findStaticDir(): string {
  const candidates = [
    // Built UI relative to this script (when bundled next to it)
    join(__dirname, 'ui'),
    // Development: relative to server source
    join(__dirname, '..', 'pixel-agents-ui', 'dist'),
    // Alternative dev path
    resolve(__dirname, '..', '..', '..', 'office-backend', 'pixel-agents-ui', 'dist'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return dir;
    }
  }

  // Fallback: use the first candidate and hope for the best
  console.warn('[PixelServer] Could not find built UI, tried:', candidates);
  return candidates[0];
}

const STATIC_DIR = findStaticDir();
console.log(`[PixelServer] Serving static files from: ${STATIC_DIR}`);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function getCacheControl(filePath: string, ext: string): string {
  if (ext === '.html') return 'no-cache';

  const fileName = basename(filePath);
  const hasBundledHash = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(fileName);

  return hasBundledHash ? 'public, max-age=31536000, immutable' : 'no-cache';
}

function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  let urlPath = req.url || '/';

  // Strip query string
  const qIdx = urlPath.indexOf('?');
  if (qIdx !== -1) urlPath = urlPath.substring(0, qIdx);

  // Default to index.html
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // Security: prevent directory traversal
  const filePath = join(STATIC_DIR, urlPath);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback: serve index.html for non-file routes
    const indexPath = join(STATIC_DIR, 'index.html');
    if (existsSync(indexPath) && !urlPath.startsWith('/api/')) {
      const content = readFileSync(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
      return true;
    }
    return false;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    const cacheControl = getCacheControl(filePath, ext);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// ── WebSocket management ────────────────────────────────────────────────────

const wsClients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const client of wsClients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(data);
    }
  }
}

// ── Agent state tracking ────────────────────────────────────────────────────

interface AgentInfo {
  id: number;
  sessionId: string;
  sessionName: string;
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

// Map sessionId -> agent info
const activeAgents = new Map<string, AgentInfo>();
let nextAgentId = 1;

function getOrCreateAgentId(sessionId: string, sessionName: string): AgentInfo {
  const existing = activeAgents.get(sessionId);
  if (existing) {
    // Update name if changed
    existing.sessionName = sessionName;
    return existing;
  }

  const info: AgentInfo = {
    id: nextAgentId++,
    sessionId,
    sessionName,
  };
  activeAgents.set(sessionId, info);
  return info;
}

function ensureAgent(
  sessionId: string,
  sessionName = 'Agent',
): { agent: AgentInfo; created: boolean } {
  const existing = activeAgents.get(sessionId);
  if (existing) {
    existing.sessionName = sessionName;
    return { agent: existing, created: false };
  }

  const agent = getOrCreateAgentId(sessionId, sessionName);
  broadcast({
    type: 'agentCreated',
    id: agent.id,
    folderName: agent.sessionName,
  });
  return { agent, created: true };
}

// ── REST API handling ───────────────────────────────────────────────────────

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Strip query string for matching
  const path = url.split('?')[0];

  if (method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (!path.startsWith('/api/')) return false;

  setCorsHeaders(res);

  // Health check
  if (path === '/api/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      agents: activeAgents.size,
      wsClients: wsClients.size,
    }));
    return true;
  }

  // All POST endpoints need body
  if (method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  try {
    const body = JSON.parse(await readBody(req));

    switch (path) {
      case '/api/agent-created': {
        const { sessionId, sessionName = 'Agent' } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const { agent, created } = ensureAgent(sessionId, sessionName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agentId: agent.id, created }));
        return true;
      }

      case '/api/agent-closed': {
        const { sessionId } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const agent = activeAgents.get(sessionId);
        if (agent) {
          broadcast({ type: 'agentClosed', id: agent.id });
          activeAgents.delete(sessionId);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      case '/api/agent-tool-start': {
        const { sessionId, sessionName = 'Agent', toolName = 'unknown', toolId } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const { agent } = ensureAgent(sessionId, sessionName);
        // Map DAZI tool names to Pixel Agents status format
        const status = toolNameToStatus(toolName);
        const tid = toolId || `tool-${Date.now()}`;
        broadcast({
          type: 'agentToolStart',
          id: agent.id,
          toolId: tid,
          status,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      case '/api/agent-tool-done': {
        const { sessionId, toolId } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const agent = activeAgents.get(sessionId);
        if (agent && toolId) {
          broadcast({
            type: 'agentToolDone',
            id: agent.id,
            toolId,
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      case '/api/agent-tools-clear': {
        const { sessionId } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const agent = activeAgents.get(sessionId);
        if (agent) {
          broadcast({ type: 'agentToolsClear', id: agent.id });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      case '/api/agent-status': {
        const { sessionId, sessionName = 'Agent', status } = body;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return true;
        }
        const { agent } = ensureAgent(sessionId, sessionName);
        broadcast({
          type: 'agentStatus',
          id: agent.id,
          status: status || 'active',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      case '/api/bulk-sync': {
        // Sync all active sessions at once (e.g., on startup)
        const { sessions } = body as {
          sessions: Array<{
            sessionId: string;
            sessionName: string;
            isActive?: boolean;
            currentTool?: string;
          }>;
        };

        if (!Array.isArray(sessions)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sessions array required' }));
          return true;
        }

        // Clear all existing agents
        const oldIds = [...activeAgents.values()].map(a => a.id);
        for (const id of oldIds) {
          broadcast({ type: 'agentClosed', id });
        }
        activeAgents.clear();
        nextAgentId = 1;

        // Create agents for all sessions
        const agentIds: Record<string, number> = {};
        for (const session of sessions) {
          const agent = getOrCreateAgentId(session.sessionId, session.sessionName);
          agentIds[session.sessionId] = agent.id;
        }

        // Send existingAgents message (used by useExtensionMessages to buffer
        // agents until layout is loaded)
        const agentList = [...activeAgents.values()];
        const folderNames: Record<number, string> = {};
        for (const a of agentList) {
          folderNames[a.id] = a.sessionName;
        }
        broadcast({
          type: 'existingAgents',
          agents: agentList.map(a => a.id),
          agentMeta: {},
          folderNames,
        });

        // After a short delay, set active/tool states
        setTimeout(() => {
          for (const session of sessions) {
            const agent = activeAgents.get(session.sessionId);
            if (!agent) continue;
            if (session.isActive && session.currentTool) {
              const status = toolNameToStatus(session.currentTool);
              broadcast({
                type: 'agentToolStart',
                id: agent.id,
                toolId: `tool-sync-${Date.now()}`,
                status,
              });
            }
          }
        }, 100);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agentIds }));
        return true;
      }

      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return true;
    }
  } catch (err) {
    console.error('[PixelServer] API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
    return true;
  }
}

// ── Tool name mapping ───────────────────────────────────────────────────────

function toolNameToStatus(toolName: string): string {
  // Map DAZI tool names to Pixel Agents status format
  // These status strings are parsed by extractToolName() in the UI
  const mapping: Record<string, string> = {
    'Read': 'Reading file',
    'Grep': 'Searching codebase',
    'Glob': 'Globbing files',
    'WebFetch': 'Fetching URL',
    'WebSearch': 'Searching web',
    'Write': 'Writing file',
    'Edit': 'Editing file',
    'Bash': 'Running command',
    'Task': 'Task delegation',
    'NotebookEdit': 'Editing notebook',
  };
  return mapping[toolName] || `Running ${toolName}`;
}

// ── HTTP + WebSocket Server ─────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  // Try API first
  const handled = await handleApi(req, res);
  if (handled) return;

  // Then try static files
  const staticServed = serveStatic(req, res);
  if (staticServed) return;

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  console.log(`[PixelServer] WebSocket client connected (total: ${wsClients.size + 1})`);
  wsClients.add(ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Handle messages from the webview
      if (msg.type === 'webviewReady') {
        console.log('[PixelServer] Webview ready, sending existing agents');
        // Send existing agents to the newly connected client
        if (activeAgents.size > 0) {
          const agentList = [...activeAgents.values()];
          const folderNames: Record<number, string> = {};
          for (const a of agentList) {
            folderNames[a.id] = a.sessionName;
          }
          const payload = JSON.stringify({
            type: 'existingAgents',
            agents: agentList.map(a => a.id),
            agentMeta: {},
            folderNames,
          });
          ws.send(payload);
        }
      } else if (msg.type === 'saveLayout') {
        // Layout save — could persist to userData directory
        console.log('[PixelServer] Layout save requested (not persisted yet)');
      } else if (msg.type === 'saveAgentSeats') {
        // Agent seat persistence
        console.log('[PixelServer] Agent seats save requested');
      }
      // Other messages (focusAgent, closeAgent, etc.) are VS Code specific
      // and can be ignored in standalone mode
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[PixelServer] WebSocket client disconnected (remaining: ${wsClients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[PixelServer] WebSocket error:', err.message);
    wsClients.delete(ws);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[PixelServer] Ready on http://${HOST}:${PORT}`);
  console.log(`[PixelServer] WebSocket on ws://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[PixelServer] Shutting down...');
  for (const client of wsClients) {
    try { client.close(); } catch { /* ignore */ }
  }
  httpServer.close(() => {
    console.log('[PixelServer] Stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  process.emit('SIGTERM' as NodeJS.Signals);
});
