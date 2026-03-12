#!/usr/bin/env node
/**
 * Session MCP Server
 *
 * This MCP server provides session-scoped tools to Codex via stdio transport.
 * It uses the shared handlers from @agent-operator/session-tools-core to ensure
 * feature parity with Claude's session-scoped tools.
 *
 * Callback Communication:
 * Tools that need to communicate with the main Electron process (e.g., SubmitPlan
 * triggering a plan display, OAuth triggers pausing execution) send structured
 * JSON messages to stderr with a "__CALLBACK__" prefix. The main process monitors
 * stderr and handles these callbacks.
 *
 * Usage:
 *   node session-mcp-server.js --session-id <id> --workspace-root <path> --plans-folder <path>
 *
 * Arguments:
 *   --session-id: Unique session identifier
 *   --workspace-root: Path to workspace folder (~/.cowork/workspaces/{id})
 *   --plans-folder: Path to session's plans folder
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// Import from session-tools-core
import {
  type SessionToolContext,
  type CallbackMessage,
  type AuthRequest,
  type SourceConfig,
  type LoadedSource,
  type CredentialManagerInterface,
  // Handlers
  handleSubmitPlan,
  handleConfigValidate,
  handleSkillValidate,
  handleMermaidValidate,
  handleSourceTest,
  handleSourceOAuthTrigger,
  handleGoogleOAuthTrigger,
  handleSlackOAuthTrigger,
  handleMicrosoftOAuthTrigger,
  handleCredentialPrompt,
  // Helpers
  loadSourceConfig as loadSourceConfigFromHelpers,
  errorResponse,
} from '@agent-operator/session-tools-core';

// ============================================================
// Types
// ============================================================

interface SessionConfig {
  sessionId: string;
  workspaceRootPath: string;
  plansFolderPath: string;
  callbackPort?: string;
}

const CALLBACK_TOOL_TIMEOUT_MS = 120000;

// ============================================================
// Tool Definitions (inline JSON Schema — no zod-to-json-schema dependency)
// ============================================================

const SESSION_TOOLS: Tool[] = [
  {
    name: 'SubmitPlan',
    description: 'Submit a plan for user review. Call this after writing your plan to a markdown file.',
    inputSchema: {
      type: 'object' as const,
      properties: { planPath: { type: 'string', description: 'Absolute path to the plan markdown file' } },
      required: ['planPath'],
    },
  },
  {
    name: 'config_validate',
    description: 'Validate configuration files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: { type: 'string', enum: ['config', 'sources', 'statuses', 'preferences', 'permissions', 'automations', 'tool-icons', 'all'] },
        sourceSlug: { type: 'string', description: 'Validate a specific source by slug' },
      },
      required: ['target'],
    },
  },
  {
    name: 'skill_validate',
    description: 'Validate a skill\'s SKILL.md file.',
    inputSchema: {
      type: 'object' as const,
      properties: { skillSlug: { type: 'string', description: 'The slug of the skill to validate' } },
      required: ['skillSlug'],
    },
  },
  {
    name: 'mermaid_validate',
    description: 'Validate Mermaid diagram syntax before outputting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'The mermaid diagram code to validate' },
        render: { type: 'boolean', description: 'Also attempt to render' },
      },
      required: ['code'],
    },
  },
  {
    name: 'source_test',
    description: 'Validate and test a source configuration.',
    inputSchema: {
      type: 'object' as const,
      properties: { sourceSlug: { type: 'string', description: 'The slug of the source to test' } },
      required: ['sourceSlug'],
    },
  },
  {
    name: 'source_oauth_trigger',
    description: 'Start OAuth authentication for an MCP source.',
    inputSchema: {
      type: 'object' as const,
      properties: { sourceSlug: { type: 'string', description: 'The slug of the source to authenticate' } },
      required: ['sourceSlug'],
    },
  },
  {
    name: 'source_google_oauth_trigger',
    description: 'Trigger Google OAuth authentication.',
    inputSchema: {
      type: 'object' as const,
      properties: { sourceSlug: { type: 'string', description: 'The slug of the source to authenticate' } },
      required: ['sourceSlug'],
    },
  },
  {
    name: 'source_slack_oauth_trigger',
    description: 'Trigger Slack OAuth authentication.',
    inputSchema: {
      type: 'object' as const,
      properties: { sourceSlug: { type: 'string', description: 'The slug of the source to authenticate' } },
      required: ['sourceSlug'],
    },
  },
  {
    name: 'source_microsoft_oauth_trigger',
    description: 'Trigger Microsoft OAuth authentication.',
    inputSchema: {
      type: 'object' as const,
      properties: { sourceSlug: { type: 'string', description: 'The slug of the source to authenticate' } },
      required: ['sourceSlug'],
    },
  },
  {
    name: 'source_credential_prompt',
    description: 'Prompt the user to enter credentials for a source.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sourceSlug: { type: 'string', description: 'The slug of the source to authenticate' },
        mode: { type: 'string', enum: ['bearer', 'basic', 'header', 'query', 'multi-header'] },
        labels: { type: 'object' },
        description: { type: 'string' },
        hint: { type: 'string' },
        headerNames: { type: 'array', items: { type: 'string' } },
        passwordRequired: { type: 'boolean' },
      },
      required: ['sourceSlug', 'mode'],
    },
  },
  {
    name: 'call_llm',
    description: 'Invoke a secondary LLM for focused subtasks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Instructions for the LLM' },
        attachments: { type: 'array', description: 'File paths on disk to attach' },
        model: { type: 'string', description: 'Model ID or short name' },
        systemPrompt: { type: 'string' },
        maxTokens: { type: 'number' },
        temperature: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'spawn_session',
    description: 'Create a new session that runs independently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        help: { type: 'boolean' },
        prompt: { type: 'string' },
        name: { type: 'string' },
        llmConnection: { type: 'string' },
        model: { type: 'string' },
        permissionMode: { type: 'string', enum: ['safe', 'ask', 'allow-all'] },
      },
    },
  },
];

// Handler registry for tools that have canonical implementations
const TOOL_HANDLERS: Record<string, (ctx: SessionToolContext, args: any) => Promise<any>> = {
  SubmitPlan: handleSubmitPlan,
  config_validate: handleConfigValidate,
  skill_validate: handleSkillValidate,
  mermaid_validate: handleMermaidValidate,
  source_test: handleSourceTest,
  source_oauth_trigger: handleSourceOAuthTrigger,
  source_google_oauth_trigger: handleGoogleOAuthTrigger,
  source_slack_oauth_trigger: handleSlackOAuthTrigger,
  source_microsoft_oauth_trigger: handleMicrosoftOAuthTrigger,
  source_credential_prompt: handleCredentialPrompt,
};

// ============================================================
// Callback Communication
// ============================================================

function sendCallback(callback: CallbackMessage): void {
  console.error(`__CALLBACK__${JSON.stringify(callback)}`);
}

// ============================================================
// Credential Cache Access
// ============================================================

interface CredentialCacheEntry {
  value: string;
  expiresAt?: number;
}

function getCredentialCachePath(workspaceRootPath: string, sourceSlug: string): string {
  return join(workspaceRootPath, 'sources', sourceSlug, '.credential-cache.json');
}

function readCredentialCache(workspaceRootPath: string, sourceSlug: string): string | null {
  const cachePath = getCredentialCachePath(workspaceRootPath, sourceSlug);
  try {
    if (!existsSync(cachePath)) return null;
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content) as CredentialCacheEntry;
    if (cache.expiresAt && Date.now() > cache.expiresAt) return null;
    return cache.value || null;
  } catch {
    return null;
  }
}

function createCredentialManager(workspaceRootPath: string): CredentialManagerInterface {
  return {
    hasValidCredentials: async (source: LoadedSource): Promise<boolean> => {
      return readCredentialCache(workspaceRootPath, source.config.slug) !== null;
    },
    getToken: async (source: LoadedSource): Promise<string | null> => {
      return readCredentialCache(workspaceRootPath, source.config.slug);
    },
    refresh: async (_source: LoadedSource): Promise<string | null> => null,
  };
}

// ============================================================
// Codex Context Factory
// ============================================================

function createCodexContext(config: SessionConfig): SessionToolContext {
  const { sessionId, workspaceRootPath, plansFolderPath } = config;

  const fs = {
    exists: (path: string) => existsSync(path),
    readFile: (path: string) => readFileSync(path, 'utf-8'),
    readFileBuffer: (path: string) => readFileSync(path),
    writeFile: (path: string, content: string) => writeFileSync(path, content, 'utf-8'),
    isDirectory: (path: string) => existsSync(path) && statSync(path).isDirectory(),
    readdir: (path: string) => readdirSync(path),
    stat: (path: string) => {
      const stats = statSync(path);
      return { size: stats.size, isDirectory: () => stats.isDirectory() };
    },
  };

  const callbacks = {
    onPlanSubmitted: (planPath: string) => {
      sendCallback({ __callback__: 'plan_submitted', sessionId, planPath });
    },
    onAuthRequest: (request: AuthRequest) => {
      sendCallback({ __callback__: 'auth_request', ...request });
    },
  };

  const credentialManager = createCredentialManager(workspaceRootPath);
  const sessionsDir = join(workspaceRootPath, 'sessions', sessionId);
  const sessionDataDir = join(sessionsDir, 'data');

  return {
    sessionId,
    workspacePath: workspaceRootPath,
    get sourcesPath() { return join(workspaceRootPath, 'sources'); },
    get skillsPath() { return join(workspaceRootPath, 'skills'); },
    plansFolderPath,
    sessionPath: sessionsDir,
    dataPath: sessionDataDir,
    callbacks,
    fs,
    loadSourceConfig: (sourceSlug: string): SourceConfig | null => {
      return loadSourceConfigFromHelpers(workspaceRootPath, sourceSlug);
    },
    credentialManager,
    updatePreferences: (updates: Record<string, unknown>) => {
      const configDir = join(workspaceRootPath, '..', '..');
      const prefsPath = join(configDir, 'preferences.json');
      try {
        let current: Record<string, unknown> = {};
        if (existsSync(prefsPath)) {
          current = JSON.parse(readFileSync(prefsPath, 'utf-8'));
        }
        const merged = {
          ...current,
          ...updates,
          location: updates.location
            ? { ...(current.location as Record<string, unknown> || {}), ...(updates.location as Record<string, unknown>) }
            : current.location,
          updatedAt: Date.now(),
        };
        writeFileSync(prefsPath, JSON.stringify(merged, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to update preferences:', err);
      }
    },
    submitFeedback: (feedback) => {
      const configDir = process.env.COWORK_CONFIG_DIR || join(workspaceRootPath, '..', '..');
      const feedbackDir = join(configDir, 'feedback');
      mkdirSync(feedbackDir, { recursive: true });
      const filePath = join(feedbackDir, `${feedback.id}.json`);
      writeFileSync(filePath, JSON.stringify(feedback, null, 2), 'utf-8');
    },
  };
}

// ============================================================
// call_llm Handler (backend-specific)
// ============================================================

async function handleCallLlm(
  args: Record<string, unknown>,
  config: SessionConfig,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const precomputed = args?._precomputedResult as string | undefined;

  if (precomputed) {
    try {
      const parsed = JSON.parse(precomputed);
      if (parsed.error) return errorResponse(`call_llm failed: ${parsed.error}`);
      if (parsed.text !== undefined) {
        return { content: [{ type: 'text' as const, text: parsed.text || '(Model returned empty response)' }] };
      }
      return errorResponse('call_llm: _precomputedResult has unexpected format.');
    } catch {
      return errorResponse(`call_llm: Failed to parse _precomputedResult: ${precomputed.slice(0, 200)}`);
    }
  }

  if (config.callbackPort) {
    try {
      const resp = await fetch(`http://127.0.0.1:${config.callbackPort}/call-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(CALLBACK_TOOL_TIMEOUT_MS),
      });
      const result = await resp.json() as { text?: string; error?: string };
      if (result.error) return errorResponse(`call_llm failed: ${result.error}`);
      return { content: [{ type: 'text' as const, text: result.text || '(Model returned empty response)' }] };
    } catch (err) {
      return errorResponse(`call_llm callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errorResponse(
    'call_llm requires either PreToolUse intercept (_precomputedResult) or ' +
    'HTTP callback (COWORK_LLM_CALLBACK_PORT). Neither is available.'
  );
}

// ============================================================
// spawn_session Handler (backend-specific)
// ============================================================

async function handleSpawnSession(
  args: Record<string, unknown>,
  config: SessionConfig,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const precomputed = args?._precomputedResult as string | undefined;

  if (precomputed) {
    try {
      const parsed = JSON.parse(precomputed);
      if (parsed.error) return errorResponse(`spawn_session failed: ${parsed.error}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(parsed, null, 2) }] };
    } catch {
      return errorResponse(`spawn_session: Failed to parse _precomputedResult: ${precomputed.slice(0, 200)}`);
    }
  }

  if (config.callbackPort) {
    try {
      const resp = await fetch(`http://127.0.0.1:${config.callbackPort}/spawn-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(CALLBACK_TOOL_TIMEOUT_MS),
      });
      const result = await resp.json() as Record<string, unknown>;
      if (result.error) return errorResponse(`spawn_session failed: ${result.error}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(`spawn_session callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errorResponse(
    'spawn_session requires either PreToolUse intercept (_precomputedResult) or ' +
    'HTTP callback (COWORK_LLM_CALLBACK_PORT). Neither is available.'
  );
}

// ============================================================
// MCP Server Setup
// ============================================================

function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.error(`Session MCP Server received ${signal}, shutting down gracefully`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection in session MCP server:', reason);
  });
}

async function main() {
  setupSignalHandlers();

  // Parse command line arguments
  const args = process.argv.slice(2);
  let sessionId: string | undefined;
  let workspaceRootPath: string | undefined;
  let plansFolderPath: string | undefined;
  let callbackPort: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session-id' && args[i + 1]) {
      sessionId = args[i + 1]; i++;
    } else if (args[i] === '--workspace-root' && args[i + 1]) {
      workspaceRootPath = args[i + 1]; i++;
    } else if (args[i] === '--plans-folder' && args[i + 1]) {
      plansFolderPath = args[i + 1]; i++;
    } else if (args[i] === '--callback-port' && args[i + 1]) {
      callbackPort = args[i + 1]; i++;
    }
  }

  if (!sessionId || !workspaceRootPath || !plansFolderPath) {
    console.error('Usage: session-mcp-server --session-id <id> --workspace-root <path> --plans-folder <path>');
    process.exit(1);
  }

  const config: SessionConfig = {
    sessionId,
    workspaceRootPath,
    plansFolderPath,
    callbackPort: callbackPort || process.env.COWORK_LLM_CALLBACK_PORT,
  };

  const ctx = createCodexContext(config);

  // Create MCP server
  const server = new Server(
    { name: 'cowork-session', version: '0.3.1' },
    { capabilities: { tools: {} } }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: SESSION_TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;

    try {
      // Backend-specific tools
      if (name === 'call_llm') {
        return await handleCallLlm(toolArgs as Record<string, unknown>, config);
      }
      if (name === 'spawn_session') {
        return await handleSpawnSession(toolArgs as Record<string, unknown>, config);
      }

      // Registry tools with canonical handlers
      const handler = TOOL_HANDLERS[name];
      if (handler) {
        return await handler(ctx, toolArgs);
      }

      return errorResponse(`Unknown tool: ${name}`);
    } catch (error) {
      return errorResponse(
        `Tool '${name}' failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Session MCP Server started for session ${sessionId}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
