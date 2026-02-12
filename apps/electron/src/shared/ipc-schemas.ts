/**
 * IPC Schema Definitions using Zod
 *
 * Provides runtime validation for IPC communication between main and renderer processes.
 * These schemas ensure type safety and prevent malformed data from causing crashes.
 */

import { z } from 'zod'

// =============================================================================
// Base Schemas
// =============================================================================

/** Session ID - can be UUID or custom format like "260124-refined-delta" */
export const SessionIdSchema = z.string().min(1).max(100)

/** Workspace ID - can be UUID or slugified name */
export const WorkspaceIdSchema = z.string().min(1).max(200)

/** Message content - reasonable length limit to prevent memory issues */
export const MessageContentSchema = z.string().max(1_000_000)

/** File path - must be an absolute path */
export const FilePathSchema = z.string().min(1).max(4096)

// =============================================================================
// Permission Mode and Thinking Level
// =============================================================================

export const PermissionModeSchema = z.enum(['safe', 'ask', 'allow-all'])

export const ThinkingLevelSchema = z.enum(['off', 'think', 'max'])

// =============================================================================
// File Attachment Schemas
// =============================================================================

export const FileAttachmentTypeSchema = z.enum(['image', 'text', 'pdf', 'office', 'unknown'])

export const FileAttachmentSchema = z.object({
  type: FileAttachmentTypeSchema,
  path: z.string(),
  name: z.string().max(255),
  mimeType: z.string().max(100),
  base64: z.string().optional(),
  text: z.string().optional(),
  size: z.number().int().nonnegative().max(100_000_000), // 100MB max
  thumbnailBase64: z.string().optional(),
})

export const StoredAttachmentSchema = z.object({
  id: z.string().uuid(),
  type: FileAttachmentTypeSchema,
  name: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().nonnegative(),
  originalSize: z.number().int().nonnegative().optional(),
  storedPath: z.string(),
  thumbnailPath: z.string().optional(),
  thumbnailBase64: z.string().optional(),
  markdownPath: z.string().optional(),
  wasResized: z.boolean().optional(),
  resizedBase64: z.string().optional(),
})

// =============================================================================
// Send Message Schemas
// =============================================================================

export const SendMessageOptionsSchema = z.object({
  ultrathinkEnabled: z.boolean().optional(),
  skillSlugs: z.array(z.string()).optional(),
  badges: z.array(z.object({
    type: z.enum(['source', 'skill', 'model']),
    name: z.string(),
    slug: z.string(),
    iconUrl: z.string().optional(),
    iconSvg: z.string().optional(),
    color: z.string().optional(),
  })).optional(),
})

export const SendMessageArgsSchema = z.object({
  sessionId: SessionIdSchema,
  message: MessageContentSchema,
  attachments: z.array(FileAttachmentSchema).optional(),
  storedAttachments: z.array(StoredAttachmentSchema).optional(),
  options: SendMessageOptionsSchema.optional(),
})

// =============================================================================
// Session Command Schemas
// =============================================================================

export const SessionCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flag') }),
  z.object({ type: z.literal('unflag') }),
  z.object({ type: z.literal('rename'), name: z.string().min(1).max(500) }),
  z.object({ type: z.literal('setTodoState'), state: z.string().min(1).max(50) }),
  z.object({ type: z.literal('markRead') }),
  z.object({ type: z.literal('markUnread') }),
  z.object({ type: z.literal('setPermissionMode'), mode: PermissionModeSchema }),
  z.object({ type: z.literal('setThinkingLevel'), level: ThinkingLevelSchema }),
  z.object({ type: z.literal('setConnection'), connectionSlug: z.string().min(1) }),
  z.object({ type: z.literal('updateWorkingDirectory'), dir: z.string() }),
  z.object({ type: z.literal('setSources'), sourceSlugs: z.array(z.string()) }),
  z.object({ type: z.literal('showInFinder') }),
  z.object({ type: z.literal('copyPath') }),
  z.object({ type: z.literal('shareToViewer') }),
  z.object({ type: z.literal('updateShare') }),
  z.object({ type: z.literal('revokeShare') }),
  z.object({ type: z.literal('startOAuth'), requestId: z.string() }),
  z.object({ type: z.literal('refreshTitle') }),
  z.object({ type: z.literal('setPendingPlanExecution'), planPath: z.string() }),
  z.object({ type: z.literal('markCompactionComplete') }),
  z.object({ type: z.literal('clearPendingPlanExecution') }),
])

// =============================================================================
// Create Session Schema
// =============================================================================

export const CreateSessionOptionsSchema = z.object({
  permissionMode: PermissionModeSchema.optional(),
  workingDirectory: z.union([
    z.string(),
    z.literal('user_default'),
    z.literal('none'),
  ]).optional(),
})

// =============================================================================
// Credential Response Schema
// =============================================================================

export const CredentialResponseSchema = z.object({
  type: z.literal('credential'),
  value: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  cancelled: z.boolean(),
})

// =============================================================================
// Workspace Settings Schema
// =============================================================================

export const WorkspaceSettingKeySchema = z.enum([
  'name',
  'model',
  'enabledSourceSlugs',
  'permissionMode',
  'cyclablePermissionModes',
  'thinkingLevel',
  'workingDirectory',
  'localMcpEnabled',
])

export const WorkspaceSettingValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
])

// =============================================================================
// Provider Config Schema
// =============================================================================

export const ProviderConfigSchema = z.object({
  provider: z.string().min(1).max(50),
  baseURL: z.string().url(),
  apiFormat: z.enum(['anthropic', 'openai']),
})

// =============================================================================
// Custom Model Schema
// =============================================================================

export const CustomModelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  shortName: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
})

// =============================================================================
// Source Config Schema (partial, for creation)
// =============================================================================

export const CreateSourceConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  provider: z.string().max(50).optional(),
  type: z.enum(['mcp', 'api', 'local']).optional(),
  enabled: z.boolean().optional(),
  mcp: z.object({
    url: z.string().optional(),
    transport: z.enum(['http', 'sse', 'stdio']).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    authType: z.enum(['none', 'oauth', 'bearer', 'api-key']).optional(),
  }).optional(),
  api: z.object({
    baseUrl: z.string().optional(),
    authType: z.string().optional(),
  }).optional(),
  local: z.object({
    path: z.string().optional(),
  }).optional(),
})

// =============================================================================
// Auth Type Schema
// =============================================================================

export const AuthTypeSchema = z.enum(['api_key', 'oauth_token', 'bedrock'])

// =============================================================================
// Onboarding Config Schema
// =============================================================================

export const OnboardingConfigSchema = z.object({
  authType: AuthTypeSchema.optional(),
  workspace: z.object({
    name: z.string().min(1).max(200),
    iconUrl: z.string().optional(),
    mcpUrl: z.string().optional(),
  }).optional(),
  credential: z.string().optional(),
  mcpCredentials: z.object({
    accessToken: z.string(),
    clientId: z.string().optional(),
  }).optional(),
  providerConfig: ProviderConfigSchema.optional(),
})

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type FileAttachment = z.infer<typeof FileAttachmentSchema>
export type StoredAttachment = z.infer<typeof StoredAttachmentSchema>
export type SendMessageArgs = z.infer<typeof SendMessageArgsSchema>
export type SendMessageOptions = z.infer<typeof SendMessageOptionsSchema>
export type SessionCommand = z.infer<typeof SessionCommandSchema>
export type CreateSessionOptions = z.infer<typeof CreateSessionOptionsSchema>
export type CredentialResponse = z.infer<typeof CredentialResponseSchema>
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type CustomModel = z.infer<typeof CustomModelSchema>
export type CreateSourceConfig = z.infer<typeof CreateSourceConfigSchema>
export type OnboardingConfig = z.infer<typeof OnboardingConfigSchema>
