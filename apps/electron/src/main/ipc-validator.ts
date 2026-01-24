/**
 * IPC Validation Middleware
 *
 * Provides type-safe validation for IPC handlers using Zod schemas.
 * Validates incoming arguments before they reach the handler function.
 */

import type { IpcMainInvokeEvent } from 'electron'
import type { ZodSchema, ZodError } from 'zod'

/**
 * Custom error class for IPC validation failures.
 * Provides structured error information for debugging.
 */
export class IpcValidationError extends Error {
  constructor(
    public readonly zodError: ZodError,
    public readonly channel?: string
  ) {
    const issues = zodError.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    super(`IPC validation failed${channel ? ` for ${channel}` : ''}: ${issues}`)
    this.name = 'IpcValidationError'
  }

  /**
   * Get a user-friendly error message
   */
  get userMessage(): string {
    const firstIssue = this.zodError.issues[0]
    if (firstIssue) {
      return `Invalid ${firstIssue.path.join('.') || 'input'}: ${firstIssue.message}`
    }
    return 'Invalid input'
  }
}

/**
 * Validate IPC arguments against a Zod schema.
 * Throws IpcValidationError if validation fails.
 *
 * @param schema - Zod schema to validate against
 * @param args - Arguments to validate
 * @param channel - Optional channel name for error messages
 * @returns Validated and typed data
 */
export function validateIpcArgs<T>(
  schema: ZodSchema<T>,
  args: unknown,
  channel?: string
): T {
  const result = schema.safeParse(args)

  if (!result.success) {
    throw new IpcValidationError(result.error, channel)
  }

  return result.data
}

/**
 * Create a validated IPC handler that validates arguments before calling the handler.
 *
 * Usage:
 * ```typescript
 * ipcMain.handle('channel', createValidatedHandler(
 *   SessionIdSchema,
 *   async (sessionId) => {
 *     // sessionId is typed and validated
 *   }
 * ))
 * ```
 *
 * @param schema - Zod schema for the single argument
 * @param handler - Handler function that receives validated argument
 * @param channel - Optional channel name for error messages
 */
export function createValidatedHandler<T, R>(
  schema: ZodSchema<T>,
  handler: (arg: T) => Promise<R>,
  channel?: string
): (event: IpcMainInvokeEvent, arg: unknown) => Promise<R> {
  return async (_event: IpcMainInvokeEvent, arg: unknown) => {
    const validated = validateIpcArgs(schema, arg, channel)
    return handler(validated)
  }
}

/**
 * Create a validated IPC handler for handlers that receive multiple arguments.
 * The schema should be a tuple schema matching the expected arguments.
 *
 * Usage:
 * ```typescript
 * ipcMain.handle('channel', createValidatedMultiArgHandler(
 *   z.tuple([SessionIdSchema, MessageSchema]),
 *   async ([sessionId, message]) => {
 *     // Both args are typed and validated
 *   }
 * ))
 * ```
 *
 * @param schema - Zod tuple schema for all arguments
 * @param handler - Handler function that receives validated arguments as array
 * @param channel - Optional channel name for error messages
 */
export function createValidatedMultiArgHandler<T extends unknown[], R>(
  schema: ZodSchema<T>,
  handler: (args: T) => Promise<R>,
  channel?: string
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<R> {
  return async (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const validated = validateIpcArgs(schema, args, channel)
    return handler(validated)
  }
}

/**
 * Create a validated IPC handler with event access.
 * Use this when you need access to the IPC event (e.g., for sender.id).
 *
 * Usage:
 * ```typescript
 * ipcMain.handle('channel', createValidatedHandlerWithEvent(
 *   SessionIdSchema,
 *   async (event, sessionId) => {
 *     const windowId = event.sender.id
 *     // ...
 *   }
 * ))
 * ```
 */
export function createValidatedHandlerWithEvent<T, R>(
  schema: ZodSchema<T>,
  handler: (event: IpcMainInvokeEvent, arg: T) => Promise<R>,
  channel?: string
): (event: IpcMainInvokeEvent, arg: unknown) => Promise<R> {
  return async (event: IpcMainInvokeEvent, arg: unknown) => {
    const validated = validateIpcArgs(schema, arg, channel)
    return handler(event, validated)
  }
}

/**
 * Create a validated multi-arg IPC handler with event access.
 */
export function createValidatedMultiArgHandlerWithEvent<T extends unknown[], R>(
  schema: ZodSchema<T>,
  handler: (event: IpcMainInvokeEvent, args: T) => Promise<R>,
  channel?: string
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<R> {
  return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const validated = validateIpcArgs(schema, args, channel)
    return handler(event, validated)
  }
}

/**
 * Wrap an existing IPC handler with validation.
 * Useful for gradually migrating existing handlers.
 *
 * @param schema - Zod schema for validation
 * @param existingHandler - The existing handler function
 * @param channel - Optional channel name for error messages
 */
export function wrapWithValidation<T, R>(
  schema: ZodSchema<T>,
  existingHandler: (event: IpcMainInvokeEvent, arg: T) => Promise<R>,
  channel?: string
): (event: IpcMainInvokeEvent, arg: unknown) => Promise<R> {
  return async (event: IpcMainInvokeEvent, arg: unknown) => {
    const validated = validateIpcArgs(schema, arg, channel)
    return existingHandler(event, validated)
  }
}
