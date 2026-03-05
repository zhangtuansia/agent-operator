/**
 * Google Search tool — uses native Gemini Search grounding via a separate API call.
 *
 * The Gemini API doesn't allow combining `googleSearch` grounding with function
 * calling (tool declarations) in the same request. So instead of injecting it into
 * the main session's API calls, we expose it as an explicit tool that makes a
 * separate grounded Gemini request using `gemini-2.0-flash`.
 *
 * Only used when the Pi auth provider is `google` — replaces the DuckDuckGo
 * `web_search` tool.
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';

const schema = Type.Object({
  query: Type.String({ description: 'The search query' }),
});

const GROUNDING_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  searchEntryPoint?: { renderedContent?: string };
  webSearchQueries?: string[];
}

export function createGoogleSearchTool(apiKey: string): AgentTool<typeof schema> {
  return {
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web using Google Search. Returns a grounded answer with sources. Use for current information, documentation lookups, news, weather, or fact-checking.',
    parameters: schema,
    async execute(toolCallId, params): Promise<AgentToolResult<typeof schema>> {
      const { query } = params;

      try {
        const url = `${API_BASE}/${GROUNDING_MODEL}:generateContent`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: query }] }],
            tools: [{ googleSearch: {} }],
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [{ type: 'text', text: `Google Search failed (HTTP ${response.status}): ${errorText}` }],
            details: { isError: true },
          };
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate?.content?.parts?.length) {
          return {
            content: [{ type: 'text', text: `Google Search returned no results for "${query}".` }],
            details: {},
          };
        }

        // Extract the grounded text response
        const text = candidate.content.parts
          .map((p: any) => p.text || '')
          .join('')
          .trim();

        // Extract source citations from grounding metadata
        const metadata: GroundingMetadata | undefined = candidate.groundingMetadata;
        const sources = metadata?.groundingChunks
          ?.filter((c: GroundingChunk) => c.web?.uri)
          .map((c: GroundingChunk, i: number) => `${i + 1}. [${c.web!.title || c.web!.uri}](${c.web!.uri})`)
          .join('\n') || '';

        const result = sources
          ? `${text}\n\n**Sources:**\n${sources}`
          : text;

        return {
          content: [{ type: 'text', text: result }],
          details: {},
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Google Search failed for "${query}": ${msg}` }],
          details: { isError: true },
        };
      }
    },
  };
}
