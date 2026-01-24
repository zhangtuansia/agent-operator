/**
 * Type Guards Utility
 *
 * Runtime type checking utilities for common types.
 * Use these to safely validate unknown data before use.
 */

import type { SessionEvent, Session, Message, FileAttachment, PermissionRequest, CredentialRequest } from '../../shared/types'

// =============================================================================
// Basic Type Guards
// =============================================================================

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

// =============================================================================
// Session Event Type Guards
// =============================================================================

/**
 * Check if value has basic session event structure
 */
export function isSessionEvent(value: unknown): value is SessionEvent {
  if (!isObject(value)) return false
  if (!('type' in value) || typeof value.type !== 'string') return false
  if (!('sessionId' in value) || typeof value.sessionId !== 'string') return false
  return true
}

/**
 * Check if session event is a text delta
 */
export function isTextDeltaEvent(event: SessionEvent): event is SessionEvent & { type: 'text_delta'; delta: string } {
  return event.type === 'text_delta' && 'delta' in event && typeof event.delta === 'string'
}

/**
 * Check if session event is a text complete
 */
export function isTextCompleteEvent(event: SessionEvent): event is SessionEvent & { type: 'text_complete'; text: string } {
  return event.type === 'text_complete' && 'text' in event && typeof event.text === 'string'
}

/**
 * Check if session event is a tool start
 */
export function isToolStartEvent(event: SessionEvent): event is SessionEvent & { type: 'tool_start'; toolName: string; toolUseId: string } {
  return event.type === 'tool_start' && 'toolName' in event && 'toolUseId' in event
}

/**
 * Check if session event is a tool result
 */
export function isToolResultEvent(event: SessionEvent): event is SessionEvent & { type: 'tool_result'; toolUseId: string; result: string } {
  return event.type === 'tool_result' && 'toolUseId' in event && 'result' in event
}

/**
 * Check if session event is an error
 */
export function isErrorEvent(event: SessionEvent): event is SessionEvent & { type: 'error'; error: string } {
  return event.type === 'error' && 'error' in event && typeof event.error === 'string'
}

/**
 * Check if session event is a completion
 */
export function isCompleteEvent(event: SessionEvent): event is SessionEvent & { type: 'complete' } {
  return event.type === 'complete'
}

/**
 * Check if session event is a permission request
 */
export function isPermissionRequestEvent(event: SessionEvent): event is SessionEvent & { type: 'permission_request'; request: PermissionRequest } {
  return event.type === 'permission_request' && 'request' in event && isObject(event.request)
}

/**
 * Check if session event is a credential request
 */
export function isCredentialRequestEvent(event: SessionEvent): event is SessionEvent & { type: 'credential_request'; request: CredentialRequest } {
  return event.type === 'credential_request' && 'request' in event && isObject(event.request)
}

// =============================================================================
// Message Type Guards
// =============================================================================

/**
 * Check if value is a valid message
 */
export function isMessage(value: unknown): value is Message {
  if (!isObject(value)) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('role' in value) || typeof value.role !== 'string') return false
  if (!('content' in value) || typeof value.content !== 'string') return false
  return true
}

/**
 * Check if message is from user
 */
export function isUserMessage(message: Message): message is Message & { role: 'user' } {
  return message.role === 'user'
}

/**
 * Check if message is from assistant
 */
export function isAssistantMessage(message: Message): message is Message & { role: 'assistant' } {
  return message.role === 'assistant'
}

// =============================================================================
// File Attachment Type Guards
// =============================================================================

/**
 * Check if value is a valid file attachment
 */
export function isFileAttachment(value: unknown): value is FileAttachment {
  if (!isObject(value)) return false
  if (!('type' in value) || typeof value.type !== 'string') return false
  if (!('path' in value) || typeof value.path !== 'string') return false
  if (!('name' in value) || typeof value.name !== 'string') return false
  if (!('mimeType' in value) || typeof value.mimeType !== 'string') return false
  if (!('size' in value) || typeof value.size !== 'number') return false
  return true
}

/**
 * Check if attachment is an image
 */
export function isImageAttachment(attachment: FileAttachment): attachment is FileAttachment & { type: 'image' } {
  return attachment.type === 'image'
}

/**
 * Check if attachment is a text file
 */
export function isTextAttachment(attachment: FileAttachment): attachment is FileAttachment & { type: 'text' } {
  return attachment.type === 'text'
}

/**
 * Check if attachment is a PDF
 */
export function isPdfAttachment(attachment: FileAttachment): attachment is FileAttachment & { type: 'pdf' } {
  return attachment.type === 'pdf'
}

// =============================================================================
// Session Type Guards
// =============================================================================

/**
 * Check if value is a valid session
 */
export function isSession(value: unknown): value is Session {
  if (!isObject(value)) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('workspaceId' in value) || typeof value.workspaceId !== 'string') return false
  if (!('workspaceName' in value) || typeof value.workspaceName !== 'string') return false
  if (!('messages' in value) || !Array.isArray(value.messages)) return false
  return true
}

// =============================================================================
// Permission Type Guards
// =============================================================================

/**
 * Check if value is a valid permission mode
 */
export function isPermissionMode(value: unknown): value is 'safe' | 'ask' | 'allow-all' {
  return value === 'safe' || value === 'ask' || value === 'allow-all'
}

/**
 * Check if value is a valid thinking level
 */
export function isThinkingLevel(value: unknown): value is 'off' | 'think' | 'max' {
  return value === 'off' || value === 'think' || value === 'max'
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that a value is not null or undefined
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(value: T | null | undefined, message = 'Value is null or undefined'): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}

/**
 * Assert that a condition is true
 * @throws Error if condition is false
 */
export function assert(condition: boolean, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
