/**
 * Pi Backend (Subprocess RPC Client)
 *
 * Minimal integration of the Pi coding stack via a subprocess JSONL bridge.
 * The subprocess runs @mariozechner/pi-coding-agent and streams events back
 * to this process, where we adapt them to AgentEvent for the existing UI.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';

import type { AgentEvent } from '@agent-operator/core/types';
import type { FileAttachment } from '../utils/files.ts';

import type {
  BackendConfig,
  ChatOptions,
  SdkMcpServerConfig,
} from './backend/types.ts';
import { AbortReason } from './backend/types.ts';
import { shouldAllowToolInMode, type PermissionMode } from './mode-manager.ts';

import { getModelById } from '../config/models.ts';
import {
  getPiAuthProviderForConnectionProvider,
  inferPiAuthProviderForModel,
  resolvePiRuntimeModel,
} from '../config/models-pi.ts';
import type { Workspace } from '../config/storage.ts';

import { BaseAgent } from './base-agent.ts';
import { PiEventAdapter } from './backend/pi/event-adapter.ts';
import { PI_TOOL_NAME_MAP } from './backend/pi/constants.ts';
import { EventQueue } from './backend/event-queue.ts';

import { getSystemPrompt } from '../prompts/system.ts';
import { getCredentialManager } from '../credentials/index.ts';
import { refreshChatGptTokens } from '../auth/chatgpt-oauth.ts';
import { refreshClaudeToken } from '../auth/claude-token.ts';
import { getSessionPath, getSessionPlansPath, getSessionDataPath } from '../sessions/storage.ts';
import { parseError, type AgentError } from './errors.ts';
import { expandToolPaths, stripToolMetadata } from './core/pre-tool-use.ts';
import { OperatorMcpClient } from '../mcp/index.ts';
import {
  getPiRegisteredSessionTool,
  getPiSessionToolProxyDefs,
} from './backend/pi/session-tool-defs.ts';
import {
  getPiApiSourceToolProxyDefs,
  getPiRegisteredApiSourceTool,
  type SourceToolProxyDef,
} from './backend/pi/source-tool-defs.ts';

const MINI_COMPLETION_TIMEOUT_MS = 120_000;
const DEFAULT_PI_MODEL = 'pi/claude-sonnet-4-5-20250929';
const PI_TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

type PendingPermission = {
  resolve: (allowed: boolean) => void;
};

type PendingMiniCompletion = {
  resolve: (text: string | null) => void;
  reject: (error: Error) => void;
};

type PendingCompaction = {
  resolve: (result: { summary: string; firstKeptEntryId: string; tokensBefore: number } | null) => void;
  reject: (error: Error) => void;
};

type PendingEnsureSessionReady = {
  resolve: (sessionId: string | null) => void;
  reject: (error: Error) => void;
};

type ProxyToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type SourceProxyRoute =
  | {
      kind: 'api';
      sourceSlug: string;
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }
  | {
      kind: 'mcp';
      sourceSlug: string;
      mcpToolName: string;
    };

type CachedMcpSourceProxy = {
  signature: string;
  client: OperatorMcpClient;
  defs: SourceToolProxyDef[];
};

export class PiAgent extends BaseAgent {
  private static globalRefreshMutex = new Map<string, Promise<void>>();

  private subprocess: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private subprocessReady: Promise<void> | null = null;
  private subprocessReadyResolve: (() => void) | null = null;

  private piSessionId: string | null = null;

  private _isProcessing = false;
  private abortReason?: AbortReason;

  private adapter: PiEventAdapter;
  private eventQueue = new EventQueue();

  private pendingPermissions = new Map<string, PendingPermission>();
  private pendingMiniCompletions = new Map<string, PendingMiniCompletion>();
  private pendingCompactions = new Map<string, PendingCompaction>();
  private pendingEnsureSessionReadies = new Map<string, PendingEnsureSessionReady>();
  private sourceMcpServers: Record<string, SdkMcpServerConfig> = {};
  private sourceApiServers: Record<string, unknown> = {};
  private sourceProxyDefs: ProxyToolDef[] = [];
  private sourceProxyRoutes = new Map<string, SourceProxyRoute>();
  private sourceMcpClients = new Map<string, CachedMcpSourceProxy>();

  private rpcIdCounter = 0;

  onPiAuthRequired: ((reason: string) => void) | null = null;

  constructor(config: BackendConfig) {
    const model = config.model || DEFAULT_PI_MODEL;
    const modelDef = getModelById(model) ?? getModelById(model.replace(/^pi\//, ''));

    super({ ...config, model }, model, modelDef?.contextWindow);

    this.piSessionId = config.session?.sdkSessionId || null;
    this.adapter = new PiEventAdapter();

    if (modelDef?.contextWindow) {
      this.adapter.setContextWindow(modelDef.contextWindow);
    }
    if (config.miniModel) {
      this.adapter.setMiniModel(config.miniModel);
    }

    if (config.session?.id && config.workspace.rootPath) {
      this.adapter.setSessionDir(join(config.workspace.rootPath, 'sessions', config.session.id));
    }

    if (!config.isHeadless) {
      this.startConfigWatcher();
    }
  }

  private get piServerPath(): string {
    if (!this.config.piServerPath) {
      throw new Error('piServerPath not configured. Cannot spawn Pi subprocess.');
    }
    return this.config.piServerPath;
  }

  private get nodePath(): string {
    return this.config.nodePath || process.execPath;
  }

  private get interceptorPath(): string | undefined {
    return this.config.piInterceptorPath;
  }

  private resolvedCwd(): string {
    const wd = this.workingDirectory;
    if (wd.startsWith('~/')) return join(homedir(), wd.slice(2));
    if (wd === '~') return homedir();
    return wd;
  }

  private async getCredential(): Promise<string | null> {
    try {
      const cm = getCredentialManager();
      const slug = this.config.connectionSlug ?? this.config.session?.llmConnection;

      if (this.config.authType === 'oauth' && slug) {
        const oauth = await cm.getLlmOAuth(slug);
        if (oauth?.accessToken) return oauth.accessToken;
      }

      if (slug) {
        const llmApiKey = await cm.getLlmApiKey(slug);
        if (llmApiKey) return llmApiKey;
      }

      const legacyApiKey = await cm.getApiKey();
      return legacyApiKey || null;
    } catch {
      return null;
    }
  }

  private getConnectionSlug(): string | null {
    return this.config.connectionSlug ?? this.config.session?.llmConnection ?? null;
  }

  private getPiAuthProvider(): string | null {
    return (
      getPiAuthProviderForConnectionProvider(this.config.providerType, this.config.authType)
      || inferPiAuthProviderForModel(this._model)
      || inferPiAuthProviderForModel(this.config.miniModel || '')
    );
  }

  private getRuntimeModelPayload(model: string): { model: string; bedrockTemplateModel?: string } {
    return resolvePiRuntimeModel(model, this.config.providerType);
  }

  private async getPiAuth(): Promise<{
    provider: string;
    credential:
      | { type: 'api_key'; key: string }
      | { type: 'oauth'; access: string; refresh: string; expires: number };
  } | null> {
    const provider = this.getPiAuthProvider();
    if (!provider) return null;

    try {
      const cm = getCredentialManager();
      const slug = this.config.connectionSlug ?? this.config.session?.llmConnection;
      if (!slug) return null;

      if (this.config.authType === 'oauth') {
        const oauth = await cm.getLlmOAuth(slug);
        if (oauth?.accessToken) {
          if (oauth.refreshToken) {
            return {
              provider,
              credential: {
                type: 'oauth',
                access: oauth.accessToken,
                refresh: oauth.refreshToken,
                expires: oauth.expiresAt ?? 0,
              },
            };
          }
          return {
            provider,
            credential: { type: 'api_key', key: oauth.accessToken },
          };
        }
      }

      const apiKey = await cm.getLlmApiKey(slug);
      if (apiKey) {
        return {
          provider,
          credential: { type: 'api_key', key: apiKey },
        };
      }
    } catch {
      // Fall through to null
    }

    return null;
  }

  private shouldRefreshOAuthBeforeStart(expiresAt?: number, provider?: string | null): boolean {
    if (provider === 'github-copilot') {
      return !expiresAt || expiresAt < Date.now() + PI_TOKEN_REFRESH_BUFFER_MS;
    }
    return expiresAt !== undefined && expiresAt < Date.now() + PI_TOKEN_REFRESH_BUFFER_MS;
  }

  private shouldAttemptTokenRefresh(message: string): boolean {
    if (this.config.authType !== 'oauth') return false;

    return (
      message.includes('401')
      || message.includes('421')
      || message.includes('unauthorized')
      || message.includes('misdirected')
      || message.includes('authentication')
      || (message.includes('token') && message.includes('expired'))
    );
  }

  private async maybeRefreshTokensBeforeStart(): Promise<void> {
    if (this.config.authType !== 'oauth') return;

    const slug = this.getConnectionSlug();
    if (!slug) return;

    const provider = this.getPiAuthProvider();
    const stored = await getCredentialManager().getLlmOAuth(slug);
    if (!stored?.refreshToken) return;

    if (this.shouldRefreshOAuthBeforeStart(stored.expiresAt, provider)) {
      this.debug(`OAuth token for ${provider || slug} is expired or expiring soon — refreshing before Pi session start`);
      await this.refreshAndPushTokens();
    }
  }

  private async refreshAndPushTokens(): Promise<void> {
    if (this.config.authType !== 'oauth') return;

    const slug = this.getConnectionSlug();
    if (!slug) return;

    const existing = PiAgent.globalRefreshMutex.get(slug);
    if (existing) {
      this.debug(`Waiting on existing Pi token refresh for slug "${slug}"`);
      await existing;
      if (this.subprocess) {
        const piAuth = await this.getPiAuth();
        if (piAuth) {
          this.send({ type: 'token_update', piAuth });
          this.debug('Pushed Pi auth refreshed by sibling instance');
        }
      }
      return;
    }

    const refreshPromise = (async () => {
      const provider = this.getPiAuthProvider();
      const manager = getCredentialManager();
      const stored = await manager.getLlmOAuth(slug);

      if (!stored?.refreshToken) {
        this.debug('No refresh token available for Pi OAuth connection');
        this.onPiAuthRequired?.('No refresh token — please sign in again');
        return;
      }

      try {
        if (provider === 'anthropic') {
          const refreshed = await refreshClaudeToken(stored.refreshToken);
          await manager.setLlmOAuth(slug, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            idToken: stored.idToken,
          });
        } else if (provider === 'openai') {
          const refreshed = await refreshChatGptTokens(stored.refreshToken);
          await manager.setLlmOAuth(slug, {
            accessToken: refreshed.accessToken,
            idToken: refreshed.idToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
          });
        } else if (provider === 'github-copilot') {
          const { refreshGitHubCopilotToken } = await import('@mariozechner/pi-ai/dist/utils/oauth/github-copilot.js');
          const refreshed = await refreshGitHubCopilotToken(stored.refreshToken);
          await manager.setLlmOAuth(slug, {
            accessToken: refreshed.access,
            refreshToken: refreshed.refresh,
            expiresAt: refreshed.expires,
            idToken: stored.idToken,
          });
        } else {
          this.debug(`Pi token refresh not supported for provider: ${provider || '(unknown)'}`);
          return;
        }

        this.debug(`Pi OAuth token refresh successful for provider: ${provider}`);

        if (this.subprocess) {
          const piAuth = await this.getPiAuth();
          if (piAuth) {
            this.send({ type: 'token_update', piAuth });
            this.debug('Pushed refreshed Pi auth to subprocess');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.debug(`Pi token refresh failed: ${message}`);
        this.onPiAuthRequired?.(`Token refresh failed: ${message}`);
      }
    })();

    PiAgent.globalRefreshMutex.set(slug, refreshPromise);

    try {
      await refreshPromise;
    } finally {
      if (PiAgent.globalRefreshMutex.get(slug) === refreshPromise) {
        PiAgent.globalRefreshMutex.delete(slug);
      }
    }
  }

  private send(cmd: Record<string, unknown>): void {
    if (!this.subprocess?.stdin?.writable) return;
    this.subprocess.stdin.write(`${JSON.stringify(cmd)}\n`);
  }

  private async ensureSubprocess(): Promise<void> {
    if (this.subprocess && this.subprocessReady) {
      await this.subprocessReady;
      return;
    }
    await this.spawnSubprocess();
  }

  private async spawnSubprocess(): Promise<void> {
    const cwd = this.resolvedCwd();
    const sessionId = this.config.session?.id || `agent-${Date.now()}`;
    const sessionDir = this.config.session
      ? join(this.config.workspace.rootPath, 'sessions', sessionId)
      : undefined;

    const args = [this.piServerPath];
    if (this.interceptorPath) {
      args.unshift('--require', this.interceptorPath);
    }

    this.subprocessReady = new Promise<void>((resolve) => {
      this.subprocessReadyResolve = resolve;
    });

    const child = spawn(this.nodePath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(sessionDir ? { COWORK_SESSION_DIR: sessionDir } : {}),
        COWORK_DEBUG: (process.argv.includes('--debug') || process.env.COWORK_DEBUG === '1') ? '1' : '0',
      },
    });

    this.subprocess = child;

    this.readline = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    this.readline.on('line', (line) => this.handleLine(line));

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) this.debug(`[subprocess stderr] ${text}`);
    });

    child.on('exit', (code, signal) => this.handleSubprocessExit(code, signal));
    child.on('error', (error) => {
      this.eventQueue.enqueue({ type: 'error', message: `Pi subprocess error: ${error.message}` });
      this.eventQueue.complete();
    });

    await this.maybeRefreshTokensBeforeStart();

    const [apiKey, piAuth] = await Promise.all([
      this.getCredential(),
      this.getPiAuth(),
    ]);
    const workingDirectory = this.config.session?.workingDirectory || cwd;
    const sessionPath = getSessionPath(this.config.workspace.rootPath, sessionId);

    const runtimeModel = this.getRuntimeModelPayload(this._model);

    this.send({
      type: 'init',
      apiKey: apiKey || '',
      model: runtimeModel.model,
      bedrockTemplateModel: runtimeModel.bedrockTemplateModel,
      cwd,
      thinkingLevel: this._thinkingLevel,
      workspaceRootPath: this.config.workspace.rootPath,
      sessionId,
      sessionPath,
      workingDirectory,
      plansFolderPath: getSessionPlansPath(this.config.workspace.rootPath, sessionId),
      miniModel: this.config.miniModel,
      providerType: this.config.providerType,
      authType: this.config.authType,
      workspaceId: this.config.workspace.id,
      piAuth: piAuth || undefined,
      branchFromSdkSessionId: this.config.session?.branchFromSdkSessionId,
      branchFromSessionPath: this.config.session?.branchFromSessionPath,
    });

    await this.subprocessReady;
    await this.syncProxyToolsWithSubprocess();
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      this.debug(`Invalid JSONL from Pi subprocess: ${line.slice(0, 200)}`);
      return;
    }

    const type = msg.type as string;
    switch (type) {
      case 'ready': {
        if (typeof msg.sessionId === 'string' && msg.sessionId) {
          this.piSessionId = msg.sessionId;
          this.config.onSdkSessionIdUpdate?.(msg.sessionId);
        }
        this.subprocessReadyResolve?.();
        break;
      }

      case 'session_id_update': {
        if (typeof msg.sessionId === 'string' && msg.sessionId) {
          this.piSessionId = msg.sessionId;
          this.config.onSdkSessionIdUpdate?.(msg.sessionId);
        }
        break;
      }

      case 'event': {
        this.handleSubprocessEvent(msg.event as Record<string, unknown>);
        break;
      }

      case 'pre_tool_use_request': {
        void this.handlePreToolUseRequest({
          requestId: String(msg.requestId || ''),
          toolName: String(msg.toolName || ''),
          input: (msg.input as Record<string, unknown>) || {},
        });
        break;
      }

      case 'tool_execute_request': {
        void this.handleToolExecuteRequest({
          requestId: String(msg.requestId || ''),
          toolName: String(msg.toolName || ''),
          args: (msg.args as Record<string, unknown>) || {},
        });
        break;
      }

      case 'mini_completion_result': {
        const id = String(msg.id || '');
        const pending = this.pendingMiniCompletions.get(id);
        if (pending) {
          this.pendingMiniCompletions.delete(id);
          pending.resolve((msg.text as string | null) ?? null);
        }
        break;
      }

      case 'compact_result': {
        this.handleCompactResult(msg);
        break;
      }

      case 'ensure_session_ready_result': {
        const id = String(msg.id || '');
        const pending = this.pendingEnsureSessionReadies.get(id);
        if (pending) {
          this.pendingEnsureSessionReadies.delete(id);
          const sessionId = typeof msg.sessionId === 'string' && msg.sessionId.length > 0
            ? msg.sessionId
            : null;
          pending.resolve(sessionId);
        }
        break;
      }

      case 'error': {
        const errorMessage = String(msg.message || 'Unknown Pi subprocess error');
        if (this.shouldAttemptTokenRefresh(errorMessage.toLowerCase())) {
          this.debug('Pi subprocess reported an auth error — attempting OAuth token refresh');
          this.refreshAndPushTokens().catch((error) => {
            this.debug(`Pi token refresh after subprocess auth error failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
        for (const [, pending] of this.pendingMiniCompletions) {
          pending.reject(new Error(errorMessage));
        }
        this.pendingMiniCompletions.clear();

        for (const [, pending] of this.pendingCompactions) {
          pending.reject(new Error(errorMessage));
        }
        this.pendingCompactions.clear();

        for (const [, pending] of this.pendingEnsureSessionReadies) {
          pending.reject(new Error(errorMessage));
        }
        this.pendingEnsureSessionReadies.clear();

        this.eventQueue.enqueue({ type: 'error', message: `Pi subprocess error: ${errorMessage}` });
        break;
      }

      default:
        break;
    }
  }

  private handleSubprocessEvent(event: Record<string, unknown>): void {
    for (const agentEvent of this.adapter.adaptEvent(event as any)) {
      this.eventQueue.enqueue(agentEvent);
    }

    if (event.type === 'agent_end') {
      this.eventQueue.complete();
    }
  }

  private getSessionProxyDefs(): ProxyToolDef[] {
    return getPiSessionToolProxyDefs(this._sessionId, this.config.workspace.rootPath);
  }

  private async syncProxyToolsWithSubprocess(): Promise<void> {
    if (!this.subprocess) return;

    const defs = [
      ...this.getSessionProxyDefs(),
      ...this.sourceProxyDefs,
    ];

    this.send({
      type: 'sync_tools',
      tools: defs,
    });
    this.debug(`Synced ${defs.length} Pi proxy tools (${this.sourceProxyDefs.length} source tools)`);
  }

  private getMcpSourceSignature(config: SdkMcpServerConfig): string {
    return JSON.stringify(config);
  }

  private async getOrCreateMcpSourceProxy(
    sourceSlug: string,
    config: SdkMcpServerConfig,
  ): Promise<CachedMcpSourceProxy> {
    const signature = this.getMcpSourceSignature(config);
    const cached = this.sourceMcpClients.get(sourceSlug);
    if (cached && cached.signature === signature) {
      return cached;
    }

    if (cached) {
      await cached.client.close().catch(() => undefined);
    }

    const client = config.type === 'stdio'
      ? new OperatorMcpClient({
          transport: 'stdio',
          command: config.command,
          args: config.args,
          env: config.env,
        })
      : new OperatorMcpClient({
          transport: 'http',
          url: config.url,
          headers: config.headers,
        });

    const tools = await client.listTools();
    const defs = tools.map((tool) => ({
      name: `mcp__${sourceSlug}__${tool.name}`,
      description: tool.description || tool.name,
      inputSchema: (
        tool.inputSchema
        && typeof tool.inputSchema === 'object'
        ? tool.inputSchema as Record<string, unknown>
        : { type: 'object', properties: {}, additionalProperties: true }
      ),
    }));

    const next = {
      signature,
      client,
      defs,
    };
    this.sourceMcpClients.set(sourceSlug, next);
    return next;
  }

  private async rebuildSourceProxyRegistry(): Promise<void> {
    const nextDefs: ProxyToolDef[] = [];
    const nextRoutes = new Map<string, SourceProxyRoute>();
    const activeMcpSlugs = new Set(Object.keys(this.sourceMcpServers));

    for (const [sourceSlug, cached] of this.sourceMcpClients.entries()) {
      if (!activeMcpSlugs.has(sourceSlug)) {
        await cached.client.close().catch(() => undefined);
        this.sourceMcpClients.delete(sourceSlug);
      }
    }

    for (const [sourceSlug, apiServer] of Object.entries(this.sourceApiServers)) {
      const defs = getPiApiSourceToolProxyDefs(sourceSlug, apiServer);
      for (const def of defs) {
        const tool = getPiRegisteredApiSourceTool(sourceSlug, apiServer, def.name);
        if (!tool?.handler) continue;
        nextDefs.push(def);
        nextRoutes.set(def.name, {
          kind: 'api',
          sourceSlug,
          handler: tool.handler,
        });
      }
    }

    for (const [sourceSlug, config] of Object.entries(this.sourceMcpServers)) {
      try {
        const cached = await this.getOrCreateMcpSourceProxy(sourceSlug, config);
        nextDefs.push(...cached.defs);
        for (const def of cached.defs) {
          const prefix = `mcp__${sourceSlug}__`;
          const mcpToolName = def.name.startsWith(prefix)
            ? def.name.slice(prefix.length)
            : def.name;
          nextRoutes.set(def.name, {
            kind: 'mcp',
            sourceSlug,
            mcpToolName,
          });
        }
      } catch (error) {
        this.debug(
          `Failed to register Pi MCP source tools for ${sourceSlug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.sourceProxyDefs = nextDefs;
    this.sourceProxyRoutes = nextRoutes;
  }

  private async handleToolExecuteRequest(request: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<void> {
    try {
      const result = await this.routeToolCall(request.toolName, request.args);
      this.send({
        type: 'tool_execute_response',
        requestId: request.requestId,
        result,
      });
    } catch (error) {
      this.send({
        type: 'tool_execute_response',
        requestId: request.requestId,
        result: {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        },
      });
    }
  }

  private async routeToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; isError: boolean }> {
    const tool = getPiRegisteredSessionTool(this._sessionId, this.config.workspace.rootPath, toolName);
    if (tool?.handler) {
      const result = await tool.handler(args);
      return this.serializeToolResult(toolName, result);
    }

    const sourceRoute = this.sourceProxyRoutes.get(toolName);
    if (!sourceRoute) {
      return {
        content: `Unknown proxy tool: ${toolName}`,
        isError: true,
      };
    }

    if (sourceRoute.kind === 'api') {
      const result = await sourceRoute.handler(args);
      return this.serializeToolResult(toolName, result);
    }

    const cached = this.sourceMcpClients.get(sourceRoute.sourceSlug);
    if (!cached) {
      return {
        content: `MCP source client unavailable: ${sourceRoute.sourceSlug}`,
        isError: true,
      };
    }

    const result = await cached.client.callTool(sourceRoute.mcpToolName, args);
    return this.serializeToolResult(toolName, result);
  }

  private async serializeToolResult(
    toolName: string,
    result: unknown,
  ): Promise<{ content: string; isError: boolean }> {
    const payload = result as {
      content?: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      >;
      isError?: boolean;
    } | null;

    const lines: string[] = [];
    for (const block of payload?.content || []) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        lines.push(block.text);
        continue;
      }
      if (
        block.type === 'image'
        && typeof block.data === 'string'
        && typeof block.mimeType === 'string'
      ) {
        const savedPath = this.saveToolImage(toolName, block.data, block.mimeType);
        if (savedPath) {
          lines.push(
            `Saved screenshot: ${savedPath}`,
            '',
            '```image-preview',
            JSON.stringify({
              src: savedPath,
              title: 'Browser Screenshot',
            }, null, 2),
            '```',
          );
        } else {
          lines.push(`Captured image output for ${toolName}, but failed to save it locally.`);
        }
      }
    }

    return {
      content: lines.join('\n'),
      isError: !!payload?.isError,
    };
  }

  private saveToolImage(toolName: string, base64Data: string, mimeType: string): string | null {
    try {
      const dataDir = getSessionDataPath(this.config.workspace.rootPath, this._sessionId);
      mkdirSync(dataDir, { recursive: true });

      const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const safeToolName = toolName.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'tool';
      const filename = `${safeToolName}-${Date.now()}.${ext}`;
      const filePath = join(dataDir, filename);

      writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      return filePath;
    } catch {
      return null;
    }
  }

  private async handlePreToolUseRequest(req: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
  }): Promise<void> {
    const mode = this.permissionManager.getPermissionMode();
    const normalizedToolName = PI_TOOL_NAME_MAP[req.toolName] || req.toolName;

    let nextInput: Record<string, unknown> = req.input;

    const expanded = expandToolPaths(normalizedToolName, nextInput);
    if (expanded.modified) nextInput = expanded.input;

    const stripped = stripToolMetadata(normalizedToolName, nextInput);
    if (stripped.modified) nextInput = stripped.input;

    const inputChanged = nextInput !== req.input;

    if (mode === 'ask' && this.onPermissionRequest) {
      const permissionRequestId = `pi-permission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const permissionType = this.mapPermissionType(normalizedToolName);
      const command = typeof nextInput.command === 'string' ? nextInput.command : undefined;
      const description = command
        ? `${normalizedToolName}: ${command}`
        : `Allow tool ${normalizedToolName}`;

      const allowed = await new Promise<boolean>((resolve) => {
        this.pendingPermissions.set(permissionRequestId, { resolve });
        this.onPermissionRequest?.({
          requestId: permissionRequestId,
          toolName: normalizedToolName,
          command,
          description,
          type: permissionType,
        });
      });

      this.pendingPermissions.delete(permissionRequestId);

      if (!allowed) {
        this.send({
          type: 'pre_tool_use_response',
          requestId: req.requestId,
          action: 'block',
          reason: 'Permission denied by user.',
        });
        return;
      }

      this.send({
        type: 'pre_tool_use_response',
        requestId: req.requestId,
        action: inputChanged ? 'modify' : 'allow',
        ...(inputChanged ? { input: nextInput } : {}),
      });
      return;
    }

    const check = shouldAllowToolInMode(
      normalizedToolName,
      nextInput,
      mode,
      {
        plansFolderPath: getSessionPlansPath(this.config.workspace.rootPath, this._sessionId),
        dataFolderPath: getSessionDataPath(this.config.workspace.rootPath, this._sessionId),
      },
    );

    if (!check.allowed) {
      this.send({
        type: 'pre_tool_use_response',
        requestId: req.requestId,
        action: 'block',
        reason: check.reason || 'Tool blocked by permission mode.',
      });
      return;
    }

    this.send({
      type: 'pre_tool_use_response',
      requestId: req.requestId,
      action: inputChanged ? 'modify' : 'allow',
      ...(inputChanged ? { input: nextInput } : {}),
    });
  }

  private mapPermissionType(toolName: string): 'bash' | 'file_write' | 'mcp_mutation' | 'api_mutation' | undefined {
    if (toolName === 'Bash') return 'bash';
    if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
      return 'file_write';
    }
    if (toolName.startsWith('mcp__')) return 'mcp_mutation';
    return undefined;
  }

  private handleCompactResult(msg: Record<string, unknown>): void {
    const id = String(msg.id || '');
    const pending = this.pendingCompactions.get(id);
    if (!pending) return;

    this.pendingCompactions.delete(id);

    if (!msg.success) {
      pending.reject(new Error(String(msg.errorMessage || 'Compaction failed')));
      return;
    }

    const raw = msg.result as Record<string, unknown> | undefined;
    if (!raw) {
      pending.resolve(null);
      return;
    }

    pending.resolve({
      summary: String(raw.summary || ''),
      firstKeptEntryId: String(raw.firstKeptEntryId || ''),
      tokensBefore: Number(raw.tokensBefore || 0),
    });
  }

  private async requestEnsureSessionReady(): Promise<string | null> {
    await this.ensureSubprocess();

    const id = `ensure-session-ready-${++this.rpcIdCounter}`;
    const timeoutMs = 15000;

    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingEnsureSessionReadies.delete(id);
        reject(new Error(`ensure_session_ready timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingEnsureSessionReadies.set(id, {
        resolve: (sessionId) => {
          clearTimeout(timer);
          resolve(sessionId);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({ type: 'ensure_session_ready', id });
    });
  }

  private handleSubprocessExit(code: number | null, signal: string | null): void {
    this.subprocess = null;
    this.readline = null;
    this.subprocessReady = null;
    this.subprocessReadyResolve = null;

    const reason = signal ? `signal ${signal}` : `code ${code}`;

    for (const [, pending] of this.pendingMiniCompletions) {
      pending.reject(new Error(`Pi subprocess exited (${reason})`));
    }
    this.pendingMiniCompletions.clear();

    for (const [, pending] of this.pendingCompactions) {
      pending.reject(new Error(`Pi subprocess exited (${reason})`));
    }
    this.pendingCompactions.clear();

    for (const [, pending] of this.pendingEnsureSessionReadies) {
      pending.reject(new Error(`Pi subprocess exited (${reason})`));
    }
    this.pendingEnsureSessionReadies.clear();

    if (this._isProcessing) {
      this.eventQueue.enqueue({
        type: 'error',
        message: `Pi subprocess exited unexpectedly (${reason})`,
      });
      this.eventQueue.complete();
    }
  }

  private killSubprocess(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.subprocess) {
      try {
        this.send({ type: 'shutdown' });
      } catch {
        // ignore
      }
      this.subprocess.kill('SIGTERM');
      this.subprocess = null;
    }

    this.subprocessReady = null;
    this.subprocessReadyResolve = null;
  }

  private async requestCompact(customInstructions?: string): Promise<{ summary: string; firstKeptEntryId: string; tokensBefore: number } | null> {
    await this.ensureSubprocess();

    const id = `compact-${++this.rpcIdCounter}`;
    const timeoutMs = 60_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCompactions.delete(id);
        reject(new Error(`compact timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingCompactions.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({ type: 'compact', id, customInstructions });
    });
  }

  async *chat(
    messageParam: string,
    attachments?: FileAttachment[],
    _options?: ChatOptions,
  ): AsyncGenerator<AgentEvent> {
    let message = messageParam;

    this._isProcessing = true;
    this.abortReason = undefined;
    this.eventQueue.reset();
    this.adapter.startTurn();

    try {
      await this.ensureSubprocess();

      const trimmedMessage = message.trim();
      const compactMatch = trimmedMessage.match(/^\/compact(?:\s+([\s\S]+))?$/i);
      if (compactMatch) {
        const customInstructions = compactMatch[1]?.trim() || undefined;
        const compactResult = await this.requestCompact(customInstructions);
        if (compactResult) {
          yield {
            type: 'info',
            message: `Compacted context to fit within limits (from ~${compactResult.tokensBefore.toLocaleString()} tokens)`,
          };
        } else {
          yield { type: 'info', message: 'Compacted context to fit within limits' };
        }
        yield { type: 'complete' };
        return;
      }

      const systemPrompt = getSystemPrompt(
        undefined,
        this.config.debugMode,
        this.config.workspace.rootPath,
        this.config.session?.workingDirectory,
        this.config.systemPromptPreset,
      );

      const sourceContext = this.sourceManager.formatSourceState();
      const contextParts = this.promptBuilder.buildContextParts(
        { plansFolderPath: getSessionPlansPath(this.config.workspace.rootPath, this._sessionId) },
        sourceContext,
      );

      const attachmentParts: string[] = [];
      const images: Array<{ type: 'image'; data: string; mimeType: string }> = [];

      for (const att of attachments || []) {
        if (att.mimeType?.startsWith('image/') && att.base64) {
          images.push({
            type: 'image',
            data: att.base64,
            mimeType: att.mimeType,
          });
        } else if (att.storedPath || att.path) {
          attachmentParts.push(`[Attached file: ${att.name}]\n[Stored at: ${att.storedPath || att.path}]`);
        }
      }

      const fullSystemPrompt = [systemPrompt, ...contextParts].filter(Boolean).join('\n\n');
      const userMessage = [...attachmentParts, message].filter(Boolean).join('\n\n');

      this.send({
        type: 'prompt',
        id: `turn-${++this.rpcIdCounter}`,
        message: userMessage,
        systemPrompt: fullSystemPrompt,
        images: images.length > 0 ? images : undefined,
      });

      yield* this.eventQueue.drain();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const typedError = this.parsePiError(errorObj);

      if (typedError.code !== 'unknown_error') {
        yield { type: 'typed_error', error: typedError };
      } else {
        yield { type: 'error', message: errorObj.message };
      }

      yield { type: 'complete' };
    } finally {
      this._isProcessing = false;
    }
  }

  respondToPermission(requestId: string, allowed: boolean, _alwaysAllow?: boolean): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;

    this.pendingPermissions.delete(requestId);
    pending.resolve(allowed);
  }

  async runMiniCompletion(prompt: string): Promise<string | null> {
    await this.ensureSubprocess();

    const id = `mini-${++this.rpcIdCounter}`;
    const resultPromise = new Promise<string | null>((resolve, reject) => {
      this.pendingMiniCompletions.set(id, { resolve, reject });
    });

    this.send({ type: 'mini_completion', id, prompt });

    const timeout = new Promise<string | null>((resolve) => {
      setTimeout(() => {
        if (!this.pendingMiniCompletions.has(id)) return;
        this.pendingMiniCompletions.delete(id);
        resolve(null);
      }, MINI_COMPLETION_TIMEOUT_MS);
    });

    return Promise.race([resultPromise, timeout]);
  }

  override setModel(model: string): void {
    const previous = this.getModel();
    super.setModel(model);

    if (this.subprocess) {
      const runtimeModel = this.getRuntimeModelPayload(model);
      this.debug(`Forwarding model change: ${previous} -> ${model} (runtime=${runtimeModel.model})`);
      this.send({
        type: 'set_model',
        model: runtimeModel.model,
        bedrockTemplateModel: runtimeModel.bedrockTemplateModel,
      });
    }
  }

  override async setSourceServers(
    mcpServers: Record<string, SdkMcpServerConfig>,
    apiServers: Record<string, unknown>,
    intendedSlugs?: string[],
  ): Promise<void> {
    this.sourceMcpServers = mcpServers;
    this.sourceApiServers = apiServers;
    await super.setSourceServers(mcpServers, apiServers, intendedSlugs);
    await this.rebuildSourceProxyRegistry();
    await this.syncProxyToolsWithSubprocess();
  }

  isProcessing(): boolean {
    return this._isProcessing;
  }

  async abort(_reason?: string): Promise<void> {
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve(false);
    }
    this.pendingPermissions.clear();

    this._isProcessing = false;
    this.send({ type: 'abort' });
    this.eventQueue.complete();
  }

  forceAbort(reason: AbortReason): void {
    this.abortReason = reason;
    this._isProcessing = false;

    for (const [, pending] of this.pendingPermissions) {
      pending.resolve(false);
    }
    this.pendingPermissions.clear();

    this.eventQueue.complete();

    if (reason !== AbortReason.PlanSubmitted && reason !== AbortReason.AuthRequest) {
      this.send({ type: 'abort' });
    }
  }

  getSessionId(): string | null {
    return this.piSessionId;
  }

  override async ensureBranchReady(): Promise<void> {
    const isBranchedSession = !!this.config.session?.branchFromMessageId;
    if (!isBranchedSession) return;

    if (!this.config.session?.branchFromSessionPath) {
      throw new Error('Pi branch preflight failed: missing branchFromSessionPath metadata');
    }

    const sessionId = await this.requestEnsureSessionReady();
    if (!sessionId) {
      throw new Error('Pi branch preflight failed: subprocess did not provide a session ID');
    }

    if (this.piSessionId !== sessionId) {
      this.piSessionId = sessionId;
      this.config.onSdkSessionIdUpdate?.(sessionId);
    }
  }

  setSessionId(sessionId: string | null): void {
    this.piSessionId = sessionId;
  }

  override setWorkspace(workspace: Workspace): void {
    super.setWorkspace(workspace);
    this.piSessionId = null;
    for (const cached of this.sourceMcpClients.values()) {
      void cached.client.close().catch(() => undefined);
    }
    this.sourceMcpClients.clear();
    this.sourceMcpServers = {};
    this.sourceApiServers = {};
    this.sourceProxyDefs = [];
    this.sourceProxyRoutes.clear();
    this.killSubprocess();
  }

  override clearHistory(): void {
    this.piSessionId = null;
    this.killSubprocess();
    super.clearHistory();
  }

  async reconnect(): Promise<void> {
    this.killSubprocess();
  }

  override destroy(): void {
    for (const cached of this.sourceMcpClients.values()) {
      void cached.client.close().catch(() => undefined);
    }
    this.sourceMcpClients.clear();
    this.killSubprocess();
    super.destroy();
  }

  private parsePiError(error: Error): AgentError {
    const message = error.message.toLowerCase();

    if (
      message.includes('api key')
      || message.includes('unauthorized')
      || message.includes('401')
      || message.includes('authentication')
    ) {
      return {
        code: 'invalid_api_key',
        title: 'Invalid API Key',
        message: 'Your API key was rejected. Check your credentials in Settings.',
        actions: [{ key: 's', label: 'Update API key', command: '/settings', action: 'settings' }],
        canRetry: false,
        originalError: error.message,
      };
    }

    if (message.includes('rate') || message.includes('429')) {
      return {
        code: 'rate_limited',
        title: 'Rate Limited',
        message: 'Too many requests. Please wait a moment before trying again.',
        actions: [{ key: 'r', label: 'Retry', action: 'retry' }],
        canRetry: true,
        retryDelayMs: 5_000,
        originalError: error.message,
      };
    }

    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('overloaded')) {
      return {
        code: 'service_error',
        title: 'Service Error',
        message: 'The AI service is temporarily unavailable. Please try again.',
        actions: [{ key: 'r', label: 'Retry', action: 'retry' }],
        canRetry: true,
        retryDelayMs: 2_000,
        originalError: error.message,
      };
    }

    if (message.includes('network') || message.includes('econnrefused') || message.includes('fetch failed')) {
      return {
        code: 'network_error',
        title: 'Connection Error',
        message: 'Could not connect to the server. Check your internet connection.',
        actions: [{ key: 'r', label: 'Retry', action: 'retry' }],
        canRetry: true,
        retryDelayMs: 1_000,
        originalError: error.message,
      };
    }

    return parseError(error);
  }

  protected override debug(message: string): void {
    this.onDebug?.(`[pi] ${message}`);
  }
}

export { PiAgent as PiBackend };
