import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

export interface SpawnSessionRequest {
  prompt: string
  name?: string
  llmConnection?: string
  model?: string
  enabledSourceSlugs?: string[]
  permissionMode?: 'safe' | 'ask' | 'allow-all'
  labels?: string[]
  workingDirectory?: string
  attachments?: Array<{ path: string; name?: string }>
}

export interface SpawnSessionResult {
  sessionId: string
  name: string
  status: 'started'
  connection?: string
  model?: string
}

export interface SpawnSessionHelpResult {
  connections: Array<{
    slug: string
    name: string
    isDefault: boolean
    providerType: string
    models: string[]
    defaultModel?: string
  }>
  sources: Array<{
    slug: string
    name: string
    type: string
    enabled: boolean
  }>
  defaults: {
    defaultConnection: string | null
    permissionMode: string
  }
}

export type SpawnSessionFn = (
  input: Record<string, unknown>,
) => Promise<SpawnSessionResult | SpawnSessionHelpResult>

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function errorResponse(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

export interface SpawnSessionToolOptions {
  sessionId: string
  getSpawnSessionFn: () => SpawnSessionFn | undefined
}

export function createSpawnSessionTool(options: SpawnSessionToolOptions) {
  return tool(
    'spawn_session',
    `Create a new session that runs independently with its own prompt, connection, model, and sources.

Use this to delegate tasks to parallel sessions for research, analysis, or drafts.

Call with help=true first to discover available connections, models, and sources.
When spawning, the 'prompt' parameter is required.

The spawned session appears in the session list and runs fire-and-forget.
Only use 'attachments' for existing file paths on disk.`,
    {
      help: z.boolean().optional()
        .describe('If true, returns available connections, models, and sources instead of creating a session'),
      prompt: z.string().optional()
        .describe('Instructions for the new session (required when not in help mode)'),
      name: z.string().optional()
        .describe('Session name'),
      llmConnection: z.string().optional()
        .describe('Connection slug'),
      model: z.string().optional()
        .describe('Model ID override'),
      enabledSourceSlugs: z.array(z.string()).optional()
        .describe('Source slugs to enable in the new session'),
      permissionMode: z.enum(['safe', 'ask', 'allow-all']).optional()
        .describe('Permission mode for the new session'),
      labels: z.array(z.string()).optional()
        .describe('Labels for the new session'),
      workingDirectory: z.string().optional()
        .describe('Working directory for the new session'),
      attachments: z.array(z.object({
        path: z.string().describe('Absolute file path on disk'),
        name: z.string().optional().describe('Display name'),
      })).optional()
        .describe('Files to include with the prompt'),
    },
    async (args) => {
      const spawnFn = options.getSpawnSessionFn()
      if (!spawnFn) {
        return errorResponse('spawn_session is not available in this context.')
      }

      try {
        const result = await spawnFn(args as Record<string, unknown>)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      } catch (error) {
        if (error instanceof Error) {
          return errorResponse(`spawn_session failed: ${error.message}`)
        }
        throw error
      }
    },
  )
}
