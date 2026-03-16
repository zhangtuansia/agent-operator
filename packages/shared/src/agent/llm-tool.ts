/**
 * LLM Tool (call_llm)
 *
 * Session-scoped tool that enables the main agent to invoke secondary LLM calls
 * for specialized subtasks like summarization, classification, extraction, and analysis.
 *
 * All calls are delegated to the current session/backend query callback.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'node:path';
import { z } from 'zod';
import { getModelById, MODEL_REGISTRY, SUMMARIZATION_MODEL } from '../config/models.ts';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const MAX_FILE_LINES = 2000;
const MAX_FILE_BYTES = 500_000;
const MAX_ATTACHMENTS = 20;
const MAX_TOTAL_CONTENT_BYTES = 2_000_000;

export interface LLMQueryRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  outputSchema?: Record<string, unknown>;
}

export interface LLMQueryResult {
  text: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export const LLM_QUERY_TIMEOUT_MS = 120000;

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!));
}

export const OUTPUT_FORMATS = {
  summary: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Concise summary' },
      key_points: { type: 'array', items: { type: 'string' }, description: 'Main points' },
      word_count: { type: 'number', description: 'Approximate word count of source' },
    },
    required: ['summary', 'key_points'],
  },
  classification: {
    type: 'object' as const,
    properties: {
      category: { type: 'string', description: 'Primary category' },
      confidence: { type: 'number', description: 'Confidence 0-1' },
      reasoning: { type: 'string', description: 'Why this classification' },
    },
    required: ['category', 'confidence', 'reasoning'],
  },
  extraction: {
    type: 'object' as const,
    properties: {
      items: { type: 'array', items: { type: 'object' }, description: 'Extracted items' },
      count: { type: 'number', description: 'Number of items found' },
    },
    required: ['items', 'count'],
  },
  analysis: {
    type: 'object' as const,
    properties: {
      findings: { type: 'array', items: { type: 'string' }, description: 'Key findings' },
      issues: { type: 'array', items: { type: 'string' }, description: 'Problems found' },
      recommendations: { type: 'array', items: { type: 'string' }, description: 'Suggested actions' },
    },
    required: ['findings'],
  },
  comparison: {
    type: 'object' as const,
    properties: {
      similarities: { type: 'array', items: { type: 'string' } },
      differences: { type: 'array', items: { type: 'string' } },
      verdict: { type: 'string', description: 'Overall comparison result' },
    },
    required: ['similarities', 'differences', 'verdict'],
  },
  validation: {
    type: 'object' as const,
    properties: {
      valid: { type: 'boolean', description: 'Whether input is valid' },
      errors: { type: 'array', items: { type: 'string' }, description: 'Validation errors' },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Warnings' },
    },
    required: ['valid', 'errors', 'warnings'],
  },
};

function errorResponse(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

function summarizeSection(lines: string[], start: number, end: number): string {
  const section = lines.slice(start, Math.min(end, lines.length));
  if (section.length === 0) return '(empty)';

  const patterns = {
    imports: /^(import|from|require|use)\b/,
    exports: /^export\b/,
    functions: /^(async\s+)?(function|const\s+\w+\s*=.*=>|def\s+|fn\s+)/,
    classes: /^(class|struct|interface|type)\s+/,
    tests: /^(describe|it|test|def test_)\b/,
    comments: /^(\/\/|\/\*|#|"""|''')/,
    config: /^[\s]*["']?\w+["']?\s*[:=]/,
  };

  const found: string[] = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    if (section.some(line => pattern.test(line.trim()))) {
      found.push(name);
    }
  }
  return found.length ? found.join(', ') : 'code/text';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isBinaryContent(content: string): boolean {
  const checkLength = Math.min(content.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

interface AttachmentInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

type AttachmentResult =
  | { type: 'text'; content: string; filename: string; bytes: number }
  | { type: 'image'; base64: string; mediaType: string }
  | { type: 'error'; message: string };

export async function processAttachment(
  input: string | AttachmentInput,
  index: number,
  basePath?: string,
): Promise<AttachmentResult> {
  const attachment: AttachmentInput = typeof input === 'string' ? { path: input } : input;

  let { path: filePath, startLine, endLine } = attachment;
  if (basePath && filePath && !path.isAbsolute(filePath) && !filePath.startsWith('~')) {
    filePath = path.resolve(basePath, filePath);
  }

  const filename = filePath.split('/').pop() || filePath;
  const safeFilename = escapeXml(filename);

  if (!filePath || typeof filePath !== 'string') {
    return { type: 'error', message: `Attachment ${index + 1}: Invalid path (got ${typeof filePath})` };
  }
  if (!existsSync(filePath)) {
    return { type: 'error', message: `Attachment ${index + 1}: File not found: ${filePath}` };
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('EACCES') || err.message.includes('permission')) {
        return { type: 'error', message: `Attachment ${index + 1}: Permission denied reading "${safeFilename}". Check file permissions.` };
      }
      if (err.message.includes('ENOENT') || err.message.includes('ELOOP')) {
        return { type: 'error', message: `Attachment ${index + 1}: Broken symlink or file moved: ${filePath}` };
      }
      return { type: 'error', message: `Attachment ${index + 1}: Cannot access "${safeFilename}": ${err.message}` };
    }
    return { type: 'error', message: `Attachment ${index + 1}: Cannot access "${safeFilename}"` };
  }

  if (stats.isDirectory()) {
    return { type: 'error', message: `Attachment ${index + 1}: "${safeFilename}" is a directory, not a file. Use Glob to find files in directories.` };
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const isImage = IMAGE_EXTENSIONS.includes(ext);

  if ((startLine !== undefined || endLine !== undefined) && isImage) {
    return { type: 'error', message: `Attachment ${index + 1}: Line ranges not supported for images. Remove startLine/endLine.` };
  }
  if (startLine !== undefined && (typeof startLine !== 'number' || startLine < 1 || !Number.isInteger(startLine))) {
    return { type: 'error', message: `Attachment ${index + 1}: startLine must be a positive integer (got ${startLine})` };
  }
  if (endLine !== undefined && (typeof endLine !== 'number' || endLine < 1 || !Number.isInteger(endLine))) {
    return { type: 'error', message: `Attachment ${index + 1}: endLine must be a positive integer (got ${endLine})` };
  }
  if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
    return { type: 'error', message: `Attachment ${index + 1}: startLine (${startLine}) cannot be greater than endLine (${endLine})` };
  }
  if (startLine !== undefined && endLine !== undefined) {
    const rangeSize = endLine - startLine + 1;
    if (rangeSize > MAX_FILE_LINES) {
      return { type: 'error', message: `Attachment ${index + 1}: Line range too large (${rangeSize} lines, max ${MAX_FILE_LINES}). Reduce the range or split into multiple calls.` };
    }
  }

  if (isImage) {
    const maxImageBytes = 5_000_000;
    if (stats.size > maxImageBytes) {
      const sizeMB = (stats.size / 1_000_000).toFixed(1);
      return { type: 'error', message: `Attachment ${index + 1}: Image too large (${sizeMB}MB, max ${maxImageBytes / 1_000_000}MB): ${safeFilename}` };
    }
    try {
      const imageData = await readFile(filePath);
      const base64 = imageData.toString('base64');
      const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { type: 'image', base64, mediaType };
    } catch (err) {
      return { type: 'error', message: `Attachment ${index + 1}: Failed to read image "${safeFilename}": ${err instanceof Error ? err.message : err}` };
    }
  }

  if (stats.size > MAX_FILE_BYTES && startLine === undefined && endLine === undefined) {
    const sizeKB = Math.round(stats.size / 1024);
    return {
      type: 'error',
      message: `Attachment ${index + 1}: File too large (${sizeKB}KB, max ${MAX_FILE_BYTES / 1000}KB).\n\nUse a line range to select a portion:\n  { path: "${filePath}", startLine: 1, endLine: 500 }\n\nTip: Try reading a smaller section first to understand the file structure.`,
    };
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    if (isBinaryContent(content)) {
      return { type: 'error', message: `Attachment ${index + 1}: "${safeFilename}" appears to be a binary file, not text. Only text files and images (png, jpg, gif, webp) are supported.` };
    }
    if (content.trim().length === 0) {
      return { type: 'error', message: `Attachment ${index + 1}: "${safeFilename}" is empty or contains only whitespace. Nothing to process.` };
    }

    const lines = content.split('\n');
    const totalLines = lines.length;

    if (startLine !== undefined || endLine !== undefined) {
      const start = (startLine || 1) - 1;
      const end = endLine || lines.length;
      if (start >= lines.length) {
        return { type: 'error', message: `Attachment ${index + 1}: startLine (${startLine}) exceeds file length (${totalLines} lines)` };
      }
      const slice = lines.slice(start, end);
      const rangeNote = `[Lines ${start + 1}-${Math.min(end, totalLines)} of ${totalLines}]`;
      const sliceContent = slice.join('\n');
      return {
        type: 'text',
        content: `${rangeNote}\n${sliceContent}`,
        filename: safeFilename,
        bytes: Buffer.byteLength(sliceContent, 'utf-8'),
      };
    }

    if (lines.length > MAX_FILE_LINES) {
      const sizeInfo = `${totalLines} lines, ${Math.round(content.length / 1024)}KB`;
      const sections: string[] = [];
      const chunkSize = Math.ceil(totalLines / 4);
      for (let i = 0; i < 4 && i * chunkSize < totalLines; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize, totalLines);
        sections.push(`  Lines ${start + 1}-${end}: ${summarizeSection(lines, start, end)}`);
      }

      return {
        type: 'error',
        message: `Attachment ${index + 1}: File too large (${sizeInfo}, max ${MAX_FILE_LINES} lines).\n\nUse a line range to select a portion:\n  { path: "${filePath}", startLine: 1, endLine: 500 }\n\nFile structure (${totalLines} lines total):\n${sections.join('\n')}`,
      };
    }

    return {
      type: 'text',
      content,
      filename: safeFilename,
      bytes: Buffer.byteLength(content, 'utf-8'),
    };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('EACCES') || err.message.includes('permission')) {
        return { type: 'error', message: `Attachment ${index + 1}: Permission denied reading "${safeFilename}". Check file permissions.` };
      }
      return { type: 'error', message: `Attachment ${index + 1}: Failed to read file "${safeFilename}": ${err.message}` };
    }
    return { type: 'error', message: `Attachment ${index + 1}: Failed to read file "${safeFilename}"` };
  }
}

const AttachmentSchema = z.union([
  z.string().describe('Simple file path'),
  z.object({
    path: z.string().describe('File path'),
    startLine: z.number().int().min(1).optional().describe('First line to include (1-indexed)'),
    endLine: z.number().int().min(1).optional().describe('Last line to include (1-indexed)'),
  }).describe('File path with optional line range for large files'),
]);

const OutputSchemaParam = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
}).describe('JSON Schema for structured output');

export interface LLMToolOptions {
  sessionId: string;
  sessionPath?: string;
  getQueryFn: () => ((request: LLMQueryRequest) => Promise<LLMQueryResult>) | undefined;
}

export function createLLMTool(options: LLMToolOptions) {
  const { sessionId: _sessionId } = options;

  return tool(
    'call_llm',
    `Invoke a secondary LLM for focused subtasks. Use for:
- Cost optimization: use a smaller model for simple tasks (summarization, classification)
- Structured output: JSON schema compliance via native backend support
- Parallel processing: call multiple times in one message - all run simultaneously
- Context isolation: process content without polluting main context

Put text/content directly in the 'prompt' parameter. Do NOT pass inline text via attachments.
Only use 'attachments' for existing file paths on disk - the tool loads file content automatically.
For large files (>2000 lines), use {path, startLine, endLine} to select a portion.`,
    {
      prompt: z.string().min(1, 'Prompt cannot be empty').describe('Instructions for the model'),
      attachments: z.array(AttachmentSchema).max(MAX_ATTACHMENTS).optional()
        .describe(`File paths on disk (max ${MAX_ATTACHMENTS}). NOT for inline text — put text in prompt instead. Use {path, startLine, endLine} for large files.`),
      model: z.string().optional().describe('Model ID or short name (e.g., "haiku", "sonnet"). Defaults to a fast model.'),
      systemPrompt: z.string().optional().describe('Optional system prompt'),
      maxTokens: z.number().int().min(1).max(64000).optional().describe('Max output tokens (1-64000). Defaults to 2048'),
      temperature: z.number().min(0).max(1).optional().describe('Sampling temperature 0-1'),
      outputFormat: z.enum(['summary', 'classification', 'extraction', 'analysis', 'comparison', 'validation']).optional()
        .describe('Predefined output format'),
      outputSchema: OutputSchemaParam.optional().describe('Custom JSON Schema for structured output'),
    },
    async args => {
      if (!args.prompt?.trim()) {
        return errorResponse('Prompt is required and cannot be empty.');
      }

      if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
        return errorResponse(`Too many attachments (${args.attachments.length}, max ${MAX_ATTACHMENTS}).`);
      }

      let model = SUMMARIZATION_MODEL;
      if (args.model) {
        const configuredModel =
          getModelById(args.model) ??
          MODEL_REGISTRY.find(candidate => candidate.shortName.toLowerCase() === args.model!.toLowerCase()) ??
          MODEL_REGISTRY.find(candidate => candidate.name.toLowerCase() === args.model!.toLowerCase());
        if (!configuredModel) {
          const availableModels = MODEL_REGISTRY.map(candidate => candidate.shortName).filter(Boolean);
          return errorResponse(`Unknown model '${args.model}'. Available models: ${availableModels.join(', ')}`);
        }
        model = configuredModel.id;
      }

      const queryFn = options.getQueryFn();
      if (!queryFn) {
        return errorResponse('No authentication configured for call_llm.\n\nSign in with your AI provider to use this tool.');
      }

      let prompt = args.prompt;
      if (args.attachments?.length) {
        const textParts: string[] = [];
        let totalBytes = 0;
        for (let i = 0; i < args.attachments.length; i++) {
          const result = await processAttachment(args.attachments[i]!, i, options.sessionPath);
          if (result.type === 'error') {
            return errorResponse(result.message);
          }
          if (result.type === 'image') {
            return errorResponse('Images are not supported in call_llm. Use text files only.');
          }
          totalBytes += result.bytes;
          if (totalBytes > MAX_TOTAL_CONTENT_BYTES) {
            return errorResponse(`Total attachment content too large (${Math.round(totalBytes / 1024)}KB, max ${MAX_TOTAL_CONTENT_BYTES / 1000}KB). Reduce files or use smaller line ranges.`);
          }
          textParts.push(`<file path="${result.filename}">\n${result.content}\n</file>`);
        }
        textParts.push(args.prompt);
        prompt = textParts.join('\n\n');
      }

      const schema =
        args.outputSchema ??
        (args.outputFormat && OUTPUT_FORMATS[args.outputFormat] ? OUTPUT_FORMATS[args.outputFormat] : null);

      const result = await withTimeout(
        queryFn({
          prompt,
          systemPrompt: args.systemPrompt || 'You are a focused assistant. Follow the output format exactly.',
          model,
          maxTokens: args.maxTokens ?? 2048,
          temperature: args.temperature ?? 0,
          outputSchema: schema ?? undefined,
        }),
        LLM_QUERY_TIMEOUT_MS,
        'call_llm timed out after 120000ms',
      );

      const text = result.text.trim() || '(Model returned empty response)';
      return {
        content: [{ type: 'text', text }],
      };
    },
  );
}
