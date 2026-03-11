import { z } from 'zod';

export interface SourceToolProxyDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type RegisteredSourceTool = {
  description?: string;
  inputSchema?: unknown;
  enabled?: boolean;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
};

function getRegisteredApiTools(apiServer: unknown): Record<string, RegisteredSourceTool> {
  const server = apiServer as {
    instance?: { _registeredTools?: Record<string, RegisteredSourceTool> };
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

export function getPiApiSourceToolProxyDefs(
  sourceSlug: string,
  apiServer: unknown,
): SourceToolProxyDef[] {
  return Object.entries(getRegisteredApiTools(apiServer))
    .filter(([, tool]) => tool.enabled !== false && typeof tool.handler === 'function')
    .map(([name, tool]) => ({
      name: `mcp__${sourceSlug}__${name}`,
      description: tool.description || name,
      inputSchema: toJsonSchema(tool.inputSchema),
    }));
}

export function getPiRegisteredApiSourceTool(
  sourceSlug: string,
  apiServer: unknown,
  toolName: string,
): RegisteredSourceTool | null {
  const prefix = `mcp__${sourceSlug}__`;
  const strippedName = toolName.startsWith(prefix)
    ? toolName.slice(prefix.length)
    : toolName;

  return getRegisteredApiTools(apiServer)[strippedName] ?? null;
}
