/**
 * IM Cowork Handler
 *
 * Adapter that maps IM conversations to OperatorAgent sessions.
 * Handles session lifecycle, message accumulation, and permission confirmations.
 * Adapted from LobsterAI imCoworkHandler.ts.
 *
 * Flow:
 *   IM message → getOrCreateSession → send to Agent → accumulate reply → return
 *
 * The handler is designed to work with any SessionManager implementation.
 * In Electron, the real SessionManager wraps CoworkRunner.
 */

import { EventEmitter } from 'events';
import type { IMMessage, IMPlatform, IMMediaAttachment, IMReplyFn } from './types.ts';
import * as imStorage from './storage.ts';

// ============================================================
// Session Manager Interface
// ============================================================

/**
 * Interface that the Electron SessionManager must implement
 * for the IM handler to create/manage agent sessions.
 */
export interface IMSessionManager {
  /** Create a new agent session, returns session ID */
  createSession(options: {
    title: string;
    workingDirectory: string;
    systemPrompt?: string;
  }): Promise<string>;

  /** Send a message to an existing session */
  sendMessage(sessionId: string, content: string): Promise<void>;

  /** Check if a session is currently active/running */
  isSessionActive(sessionId: string): boolean;

  /** Check if a session exists */
  sessionExists(sessionId: string): boolean;

  /** Stop/cancel a session */
  stopSession(sessionId: string): void;

  /**
   * Subscribe to session events. Returns an unsubscribe function.
   * Events: 'message', 'complete', 'error', 'permissionRequest'
   */
  onSessionEvent(
    sessionId: string,
    event: string,
    callback: (...args: any[]) => void
  ): () => void;

  /** Respond to a permission request */
  respondToPermission(requestId: string, result: PermissionResponse): void;
}

export interface PermissionResponse {
  behavior: 'allow' | 'deny';
  message?: string;
  updatedInput?: Record<string, unknown>;
}

// ============================================================
// Types
// ============================================================

interface MessageAccumulator {
  parts: string[];
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  unsubscribers: Array<() => void>;
}

interface PendingPermission {
  key: string;
  sessionId: string;
  requestId: string;
  toolName: string;
  conversationId: string;
  platform: IMPlatform;
  createdAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// ============================================================
// Constants
// ============================================================

const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes for agent response
const PERMISSION_TIMEOUT_MS = 60_000; // 60 seconds for user to confirm
const IM_ALLOW_RE = /^(允许|同意|yes|y)$/i;
const IM_DENY_RE = /^(拒绝|不同意|no|n)$/i;

// ============================================================
// Cowork Handler
// ============================================================

export class IMCoworkHandler extends EventEmitter {
  private sessionManager: IMSessionManager;
  private workspaceId: string;
  private workingDirectory: string;
  private getSystemPrompt?: () => string;

  // Active accumulators keyed by sessionId
  private accumulators: Map<string, MessageAccumulator> = new Map();

  // Track IM-created sessions
  private imSessionIds: Set<string> = new Set();
  private sessionConversationMap: Map<string, { conversationId: string; platform: IMPlatform }> = new Map();
  private pendingPermissions: Map<string, PendingPermission> = new Map();

  constructor(options: {
    sessionManager: IMSessionManager;
    workspaceId: string;
    workingDirectory: string;
    getSystemPrompt?: () => string;
  }) {
    super();
    this.sessionManager = options.sessionManager;
    this.workspaceId = options.workspaceId;
    this.workingDirectory = options.workingDirectory;
    this.getSystemPrompt = options.getSystemPrompt;
  }

  // ---- Main Entry Point ----

  /**
   * Process an incoming IM message.
   * Maps the conversation to an Agent session, sends the message,
   * and returns the accumulated Agent response.
   */
  async processMessage(message: IMMessage, replyFn: IMReplyFn): Promise<void> {
    // Check if this is a permission confirmation reply
    const permReply = await this.handlePendingPermissionReply(message, replyFn);
    if (permReply !== null) {
      await replyFn(permReply);
      return;
    }

    try {
      const response = await this.processMessageInternal(message, false);
      await replyFn(response);
    } catch (error) {
      // If session not found (stale mapping), recreate
      if (this.isSessionNotFoundError(error)) {
        console.warn(
          `[IMCoworkHandler] Stale session for ${message.platform}:${message.conversationId}, recreating`
        );
        const response = await this.processMessageInternal(message, true);
        await replyFn(response);
      } else {
        throw error;
      }
    }
  }

  private async processMessageInternal(message: IMMessage, forceNew: boolean): Promise<string> {
    const sessionId = await this.getOrCreateSession(
      message.conversationId,
      message.platform,
      forceNew
    );

    this.sessionConversationMap.set(sessionId, {
      conversationId: message.conversationId,
      platform: message.platform,
    });

    const formattedContent = this.formatMessageWithMedia(message);

    // Create accumulator promise that will resolve when agent completes
    const responsePromise = this.createAccumulatorPromise(sessionId);

    // Send message to agent
    const isActive = this.sessionManager.isSessionActive(sessionId);
    try {
      if (isActive) {
        await this.sessionManager.sendMessage(sessionId, formattedContent);
      } else {
        // Session exists but isn't active — send message to start it
        await this.sessionManager.sendMessage(sessionId, formattedContent);
      }
    } catch (error) {
      this.rejectAccumulator(sessionId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    return responsePromise;
  }

  // ---- Session Management ----

  private async getOrCreateSession(
    conversationId: string,
    platform: IMPlatform,
    forceNew: boolean
  ): Promise<string> {
    // Clean up stale mapping if forced
    if (forceNew) {
      const stale = imStorage.getSessionMapping(conversationId, platform);
      if (stale) {
        imStorage.deleteSessionMapping(conversationId, platform);
        this.imSessionIds.delete(stale.sessionId);
        this.sessionConversationMap.delete(stale.sessionId);
        this.clearPendingPermissions(stale.sessionId);
        this.sessionManager.stopSession(stale.sessionId);
      }
    }

    // Check existing mapping
    if (!forceNew) {
      const existing = imStorage.getSessionMapping(conversationId, platform);
      if (existing) {
        if (this.sessionManager.sessionExists(existing.sessionId)) {
          imStorage.updateSessionLastActive(conversationId, platform);
          this.imSessionIds.add(existing.sessionId);
          return existing.sessionId;
        }

        // Stale mapping — clean up
        console.warn(`[IMCoworkHandler] Stale mapping for ${platform}:${conversationId}`);
        imStorage.deleteSessionMapping(conversationId, platform);
        this.imSessionIds.delete(existing.sessionId);
        this.sessionConversationMap.delete(existing.sessionId);
      }
    }

    // Create new session
    const title = `IM-${platform}-${Date.now()}`;
    const systemPrompt = this.getSystemPrompt?.();

    const sessionId = await this.sessionManager.createSession({
      title,
      workingDirectory: this.workingDirectory,
      systemPrompt,
    });

    // Save mapping
    imStorage.createSessionMapping(conversationId, platform, sessionId, this.workspaceId);
    this.imSessionIds.add(sessionId);

    // Note: Do NOT subscribe here — createAccumulatorPromise() handles subscription setup.
    // Subscribing here would cause double event delivery (doubled response text) and leaked
    // listeners because the accumulator doesn't exist yet to store unsubscribers.

    return sessionId;
  }

  // ---- Event Subscriptions ----

  private subscribeToSession(sessionId: string): void {
    const unsubs: Array<() => void> = [];

    // Listen for assistant messages
    unsubs.push(
      this.sessionManager.onSessionEvent(sessionId, 'message', (msg: any) => {
        if (!this.imSessionIds.has(sessionId)) return;
        const acc = this.accumulators.get(sessionId);
        if (acc && msg.type === 'assistant' && msg.content) {
          acc.parts.push(msg.content);
        }
      })
    );

    // Listen for completion
    unsubs.push(
      this.sessionManager.onSessionEvent(sessionId, 'complete', () => {
        if (!this.imSessionIds.has(sessionId)) return;
        this.resolveAccumulator(sessionId);
      })
    );

    // Listen for errors
    unsubs.push(
      this.sessionManager.onSessionEvent(sessionId, 'error', (error: string) => {
        if (!this.imSessionIds.has(sessionId)) return;
        this.rejectAccumulator(sessionId, new Error(error));
      })
    );

    // Listen for permission requests
    unsubs.push(
      this.sessionManager.onSessionEvent(sessionId, 'permissionRequest', (request: any) => {
        if (!this.imSessionIds.has(sessionId)) return;
        this.handlePermissionRequest(sessionId, request);
      })
    );

    // Store unsubscribers in the accumulator if it exists
    const acc = this.accumulators.get(sessionId);
    if (acc) {
      acc.unsubscribers.push(...unsubs);
    }
  }

  // ---- Message Accumulation ----

  private createAccumulatorPromise(sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Replace existing accumulator if any
      const existing = this.accumulators.get(sessionId);
      if (existing) {
        if (existing.timeoutId) clearTimeout(existing.timeoutId);
        for (const unsub of existing.unsubscribers) unsub();
        this.accumulators.delete(sessionId);
        existing.reject(new Error('Replaced by newer IM request'));
      }

      const timeoutId = setTimeout(() => {
        const acc = this.accumulators.get(sessionId);
        if (acc) {
          this.cleanupAccumulator(sessionId);
          this.sessionManager.stopSession(sessionId);
          reject(new Error('Request timed out'));
        }
      }, REQUEST_TIMEOUT_MS);

      this.accumulators.set(sessionId, {
        parts: [],
        resolve,
        reject,
        timeoutId,
        unsubscribers: [],
      });

      // Set up event subscriptions
      this.subscribeToSession(sessionId);
    });
  }

  private resolveAccumulator(sessionId: string): void {
    const acc = this.accumulators.get(sessionId);
    if (!acc) return;

    const text = acc.parts.join('\n\n') || '处理完成，但没有生成回复。';
    this.cleanupAccumulator(sessionId);
    acc.resolve(text);
  }

  private rejectAccumulator(sessionId: string, error: Error): void {
    const acc = this.accumulators.get(sessionId);
    if (!acc) return;
    this.cleanupAccumulator(sessionId);
    acc.reject(error);
  }

  private cleanupAccumulator(sessionId: string): void {
    const acc = this.accumulators.get(sessionId);
    if (!acc) return;

    if (acc.timeoutId) clearTimeout(acc.timeoutId);
    for (const unsub of acc.unsubscribers) unsub();
    this.accumulators.delete(sessionId);
  }

  // ---- Permission Handling ----

  private handlePermissionRequest(sessionId: string, request: any): void {
    const conversation = this.sessionConversationMap.get(sessionId);
    if (!conversation) {
      this.sessionManager.respondToPermission(request.requestId, {
        behavior: 'deny',
        message: 'IM session mapping missing.',
      });
      return;
    }

    const key = `${conversation.platform}:${conversation.conversationId}`;

    // Clear any existing pending permission for this conversation
    const existing = this.pendingPermissions.get(key);
    if (existing) {
      if (existing.timeoutId) clearTimeout(existing.timeoutId);
      this.pendingPermissions.delete(key);
      this.sessionManager.respondToPermission(existing.requestId, {
        behavior: 'deny',
        message: 'Superseded by newer permission request.',
      });
    }

    // Set timeout for auto-deny
    const timeoutId = setTimeout(() => {
      const current = this.pendingPermissions.get(key);
      if (current?.requestId === request.requestId) {
        this.pendingPermissions.delete(key);
        this.sessionManager.respondToPermission(request.requestId, {
          behavior: 'deny',
          message: 'Permission request timed out after 60s.',
        });
      }
    }, PERMISSION_TIMEOUT_MS);

    this.pendingPermissions.set(key, {
      key,
      sessionId,
      requestId: request.requestId,
      toolName: request.toolName,
      conversationId: conversation.conversationId,
      platform: conversation.platform,
      createdAt: Date.now(),
      timeoutId,
    });

    // Resolve the current accumulator with a confirmation prompt
    const acc = this.accumulators.get(sessionId);
    if (acc) {
      const prompt = [
        `检测到需要安全确认的操作（工具: ${request.toolName}）。`,
        '请在 60 秒内回复"允许"或"拒绝"。',
      ].join('\n');
      this.cleanupAccumulator(sessionId);
      acc.resolve(prompt);
    }
  }

  private async handlePendingPermissionReply(
    message: IMMessage,
    _replyFn: IMReplyFn
  ): Promise<string | null> {
    const key = `${message.platform}:${message.conversationId}`;
    const pending = this.pendingPermissions.get(key);
    if (!pending) return null;

    const reply = message.content.trim().replace(/[。！!,.，\s]+$/g, '');
    if (!reply) {
      return '当前有待确认操作，请回复"允许"或"拒绝"（60 秒内）。';
    }

    if (IM_DENY_RE.test(reply)) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      this.pendingPermissions.delete(key);
      this.sessionManager.respondToPermission(pending.requestId, {
        behavior: 'deny',
        message: 'Operation denied by IM user.',
      });
      return '已拒绝本次操作。';
    }

    if (!IM_ALLOW_RE.test(reply)) {
      return '当前有待确认操作，请回复"允许"或"拒绝"（60 秒内）。';
    }

    // Allow
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    this.pendingPermissions.delete(key);

    // Create new accumulator for the continued agent response
    const responsePromise = this.createAccumulatorPromise(pending.sessionId);
    this.sessionManager.respondToPermission(pending.requestId, {
      behavior: 'allow',
    });

    return responsePromise;
  }

  private clearPendingPermissions(sessionId: string): void {
    for (const [key, pending] of this.pendingPermissions) {
      if (pending.sessionId !== sessionId) continue;
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      this.pendingPermissions.delete(key);
    }
  }

  // ---- Helpers ----

  private isSessionNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /^Session\s.+\snot found$/i.test(message.trim());
  }

  /**
   * Format message content with media attachment information
   */
  private formatMessageWithMedia(message: IMMessage): string {
    let content = message.content;

    if (message.attachments && message.attachments.length > 0) {
      const mediaInfo = message.attachments
        .map((att: IMMediaAttachment) => {
          const parts = [`类型: ${att.type}`, `路径: ${att.localPath}`];
          if (att.fileName) parts.push(`文件名: ${att.fileName}`);
          if (att.mimeType) parts.push(`MIME: ${att.mimeType}`);
          if (att.width && att.height) parts.push(`尺寸: ${att.width}x${att.height}`);
          if (att.duration) parts.push(`时长: ${att.duration}秒`);
          if (att.fileSize) parts.push(`大小: ${(att.fileSize / 1024).toFixed(1)}KB`);
          return `- ${parts.join(', ')}`;
        })
        .join('\n');

      content = content
        ? `${content}\n\n[附件信息]\n${mediaInfo}`
        : `[附件信息]\n${mediaInfo}`;
    }

    return content;
  }

  // ---- Cleanup ----

  /**
   * Destroy handler and clean up all resources
   */
  destroy(): void {
    for (const [, acc] of this.accumulators) {
      if (acc.timeoutId) clearTimeout(acc.timeoutId);
      for (const unsub of acc.unsubscribers) unsub();
      acc.reject(new Error('Handler destroyed'));
    }
    this.accumulators.clear();
    this.imSessionIds.clear();
    this.sessionConversationMap.clear();

    for (const [, pending] of this.pendingPermissions) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
    }
    this.pendingPermissions.clear();
  }
}
