/**
 * CodexAgent - OpenAI Codex integration for Cowork
 *
 * Wraps the @openai/codex-sdk to provide the same interface as OperatorAgent,
 * allowing users to choose between Claude (Anthropic) and Codex (OpenAI) as their AI backend.
 */

import { Codex, type Thread } from '@openai/codex-sdk';
import type { AgentEvent, AgentEventUsage } from '@agent-operator/core/types';
import { debug } from '../utils/debug.ts';

/**
 * Configuration for CodexAgent
 */
export interface CodexAgentConfig {
  /** Working directory for the agent */
  workingDirectory: string;
  /** Session ID for persistence */
  sessionId?: string;
  /** Whether to skip git repo check */
  skipGitRepoCheck?: boolean;
}

/**
 * Codex SDK event types (based on JSONL output)
 */
interface CodexEvent {
  type: string;
  thread_id?: string;
  item?: CodexItem;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens?: number;
  };
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Codex item types (matching @openai/codex-sdk types)
 */
interface CodexItem {
  id: string;
  type: 'agent_message' | 'command_execution' | 'file_change' | 'reasoning' | 'mcp_tool_call' | 'web_search' | 'todo_list' | 'error';
  status?: 'in_progress' | 'completed' | 'failed';
  // For agent_message
  text?: string;
  // For command_execution
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  // For file_change
  changes?: Array<{ path: string; kind: 'add' | 'delete' | 'update' }>;
  // For mcp_tool_call
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: { content?: unknown[]; structured_content?: unknown };
  error?: { message: string };
  // For web_search
  query?: string;
}

/**
 * CodexAgent provides the same interface as OperatorAgent but uses OpenAI's Codex SDK.
 */
export class CodexAgent {
  private config: CodexAgentConfig;
  private codex: Codex;
  private thread: Thread | null = null;
  private currentAbortController: AbortController | null = null;
  private threadId: string | null = null;

  // Callbacks matching OperatorAgent interface
  public onPermissionRequest: ((request: { requestId: string; toolName: string; command: string; description: string; type?: 'bash' }) => void) | null = null;
  public onDebug: ((message: string) => void) | null = null;
  public onThreadIdUpdate: ((threadId: string) => void) | null = null;

  constructor(config: CodexAgentConfig) {
    this.config = config;
    this.threadId = config.sessionId ?? null;

    // Initialize Codex SDK
    // SDK automatically reads credentials from ~/.codex/auth.json
    this.codex = new Codex();

    debug('[CodexAgent] Initialized with config:', {
      workingDirectory: config.workingDirectory,
      sessionId: config.sessionId,
    });
  }

  /**
   * Get the current thread ID for session persistence
   */
  getThreadId(): string | null {
    return this.threadId;
  }

  /**
   * Chat with Codex agent
   * Returns an async generator of AgentEvents, matching OperatorAgent interface
   */
  async *chat(userMessage: string): AsyncGenerator<AgentEvent> {
    try {
      debug('[CodexAgent] Starting chat:', userMessage.substring(0, 100));

      // Create or resume thread
      if (!this.thread) {
        if (this.threadId) {
          // Resume existing thread
          debug('[CodexAgent] Resuming thread:', this.threadId);
          this.thread = await this.codex.resumeThread(this.threadId);
        } else {
          // Start new thread
          debug('[CodexAgent] Starting new thread');
          this.thread = await this.codex.startThread({
            workingDirectory: this.config.workingDirectory,
            skipGitRepoCheck: this.config.skipGitRepoCheck ?? false,
          });
        }
      }

      // Setup abort controller
      this.currentAbortController = new AbortController();

      // Run with streaming
      const { events } = await this.thread.runStreamed(userMessage);

      // Track tool use IDs for mapping results
      let turnId: string | undefined;
      const toolUseIdCounter = { count: 0 };

      // Process events
      for await (const event of events) {
        // Check for abort
        if (this.currentAbortController?.signal.aborted) {
          debug('[CodexAgent] Aborted');
          break;
        }

        // Convert and yield events
        const agentEvents = this.convertCodexEvent(event as CodexEvent, turnId, toolUseIdCounter);
        for (const agentEvent of agentEvents) {
          // Capture thread ID from thread.started event
          if (event.type === 'thread.started' && (event as CodexEvent).thread_id) {
            const newThreadId = (event as CodexEvent).thread_id!;
            if (newThreadId !== this.threadId) {
              this.threadId = newThreadId;
              // Notify listener so session can persist the thread ID
              this.onThreadIdUpdate?.(newThreadId);
            }
          }

          // Capture turn ID
          if ('turnId' in agentEvent && agentEvent.turnId) {
            turnId = agentEvent.turnId;
          }

          yield agentEvent;
        }
      }

      // Emit complete event
      yield { type: 'complete' };

    } catch (error) {
      debug('[CodexAgent] Error:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for auth errors
      if (errorMessage.includes('auth') || errorMessage.includes('login') || errorMessage.includes('credential')) {
        yield {
          type: 'typed_error',
          error: {
            code: 'invalid_credentials',
            title: 'Codex Authentication Required',
            message: 'Please sign in with your ChatGPT account to use Codex.',
            actions: [
              { key: 's', label: 'Open Settings', action: 'settings' },
            ],
            canRetry: false,
          },
        };
      } else {
        yield { type: 'error', message: errorMessage };
      }

      yield { type: 'complete' };
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Convert Codex SDK events to AgentEvents
   */
  private convertCodexEvent(
    event: CodexEvent,
    turnId: string | undefined,
    toolUseIdCounter: { count: number }
  ): AgentEvent[] {
    const events: AgentEvent[] = [];

    switch (event.type) {
      case 'thread.started':
        debug('[CodexAgent] Thread started:', event.thread_id);
        events.push({ type: 'status', message: 'Connected to Codex' });
        break;

      case 'turn.started':
        debug('[CodexAgent] Turn started');
        break;

      case 'item.started':
        if (event.item) {
          const item = event.item;
          const toolUseId = item.id || `codex-tool-${++toolUseIdCounter.count}`;

          switch (item.type) {
            case 'command_execution':
              events.push({
                type: 'tool_start',
                toolName: 'Bash',
                toolUseId,
                input: { command: item.command || '' },
                turnId,
              });
              break;

            case 'file_change':
              // Determine tool name from first change's kind
              const firstChange = item.changes?.[0];
              const fileToolName = firstChange?.kind === 'add' ? 'Write' :
                                   firstChange?.kind === 'delete' ? 'Bash' : 'Edit';
              events.push({
                type: 'tool_start',
                toolName: fileToolName,
                toolUseId,
                input: { files: item.changes?.map(c => c.path) || [] },
                turnId,
              });
              break;

            case 'mcp_tool_call':
              events.push({
                type: 'tool_start',
                toolName: `${item.server}/${item.tool}` || 'MCP Tool',
                toolUseId,
                input: (item.arguments as Record<string, unknown>) || { _: 'mcp_call' },
                turnId,
              });
              break;

            case 'web_search':
              events.push({
                type: 'tool_start',
                toolName: 'WebSearch',
                toolUseId,
                input: { query: item.query || '' },
                turnId,
              });
              break;
          }
        }
        break;

      case 'item.completed':
        if (event.item) {
          const item = event.item;
          const toolUseId = item.id || `codex-tool-${toolUseIdCounter.count}`;

          switch (item.type) {
            case 'agent_message':
              // Agent text response
              if (item.text) {
                events.push({
                  type: 'text_complete',
                  text: item.text,
                  turnId,
                });
              }
              break;

            case 'command_execution':
              events.push({
                type: 'tool_result',
                toolUseId,
                result: item.aggregated_output || '',
                isError: item.status === 'failed' || (item.exit_code !== undefined && item.exit_code !== 0),
                input: { command: item.command || '' },
                turnId,
              });
              break;

            case 'file_change':
              // Format file changes for display
              const changesDesc = item.changes?.map(c => `${c.kind}: ${c.path}`).join('\n') || 'File changes applied';
              events.push({
                type: 'tool_result',
                toolUseId,
                result: changesDesc,
                isError: item.status === 'failed',
                input: { files: item.changes?.map(c => c.path) || [] },
                turnId,
              });
              break;

            case 'mcp_tool_call':
              // Extract result from MCP response
              const mcpResult = item.error?.message ||
                               (item.result?.content ? JSON.stringify(item.result.content) : '') ||
                               '';
              events.push({
                type: 'tool_result',
                toolUseId,
                result: mcpResult,
                isError: item.status === 'failed' || !!item.error,
                input: (item.arguments as Record<string, unknown>) || { _: 'mcp_call' },
                turnId,
              });
              break;

            case 'reasoning':
              // Reasoning/thinking - could emit as intermediate text
              debug('[CodexAgent] Reasoning:', item.text?.substring(0, 100));
              break;
          }
        }
        break;

      case 'turn.completed':
        if (event.usage) {
          const usage: AgentEventUsage = {
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
            cacheReadTokens: event.usage.cached_input_tokens,
          };
          events.push({ type: 'complete', usage });
        }
        break;

      case 'turn.failed':
      case 'error':
        const errorMsg = event.error?.message || 'Unknown error occurred';
        events.push({ type: 'error', message: errorMsg });
        break;

      default:
        debug('[CodexAgent] Unknown event type:', event.type);
    }

    return events;
  }

  /**
   * Abort the current chat
   */
  abort(): void {
    debug('[CodexAgent] Abort requested');
    this.currentAbortController?.abort();
  }

  /**
   * Force abort with reason (matches OperatorAgent interface)
   */
  forceAbort(_reason?: string): void {
    this.abort();
  }

  /**
   * Respond to a permission request
   * Note: Codex handles permissions internally, this is for interface compatibility
   */
  respondToPermission(_requestId: string, _allowed: boolean): void {
    debug('[CodexAgent] Permission response - Codex handles permissions internally');
  }

  /**
   * Check if Codex is authenticated
   * Attempts to detect existing credentials in ~/.codex/
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      const { homedir } = await import('os');

      const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
      const authFile = join(codexHome, 'auth.json');
      const credentialsFile = join(codexHome, '.credentials.json');

      return existsSync(authFile) || existsSync(credentialsFile);
    } catch {
      return false;
    }
  }

  /**
   * Get the Codex home directory
   */
  static getCodexHome(): string {
    const { join } = require('path');
    const { homedir } = require('os');
    return process.env.CODEX_HOME || join(homedir(), '.codex');
  }
}
