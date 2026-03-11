import { z } from 'zod';
import { getSessionScopedTools } from '../../session-scoped-tools.ts';

export interface SessionToolProxyDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type RegisteredTool = {
  description?: string;
  inputSchema?: unknown;
  enabled?: boolean;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
};

function getRegisteredTools(sessionId: string, workspaceRootPath: string): Record<string, RegisteredTool> {
  const server = getSessionScopedTools(sessionId, workspaceRootPath) as unknown as {
    instance?: { _registeredTools?: Record<string, RegisteredTool> };
  };
  return server.instance?._registeredTools ?? {};
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) {
    return {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };
  }

  try {
    const jsonSchema = z.toJSONSchema(schema as z.ZodTypeAny) as Record<string, unknown>;
    delete jsonSchema.$schema;
    return jsonSchema;
  } catch {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }
}

export function getPiSessionToolProxyDefs(sessionId: string, workspaceRootPath: string): SessionToolProxyDef[] {
  return Object.entries(getRegisteredTools(sessionId, workspaceRootPath))
    .filter(([, tool]) => tool.enabled !== false && typeof tool.handler === 'function')
    .map(([name, tool]) => ({
      name: `mcp__session__${name}`,
      description: tool.description || name,
      inputSchema: toJsonSchema(tool.inputSchema),
    }));
}

export function getPiRegisteredSessionTool(
  sessionId: string,
  workspaceRootPath: string,
  toolName: string,
): RegisteredTool | null {
  const strippedName = toolName.startsWith('mcp__session__')
    ? toolName.slice('mcp__session__'.length)
    : toolName;
  return getRegisteredTools(sessionId, workspaceRootPath)[strippedName] ?? null;
}
