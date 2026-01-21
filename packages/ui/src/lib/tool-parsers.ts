/**
 * Tool Result Parsers
 *
 * Shared utilities for parsing tool results from Claude Code SDK tools.
 * Used by both Electron and viewer apps for consistent overlay display.
 */

import type { ActivityItem } from '../components/chat/TurnCard'
import type { ToolType } from '../components/terminal/TerminalOutput'

// ============================================================================
// Individual Tool Parsers
// ============================================================================

export interface ReadResult {
  content: string
  numLines?: number
  startLine?: number
  totalLines?: number
}

/**
 * Parse Read tool JSON result to extract file content and metadata.
 */
export function parseReadResult(rawContent: string): ReadResult {
  try {
    const parsed = JSON.parse(rawContent)
    if (parsed.file) {
      return {
        content: parsed.file.content || '',
        numLines: parsed.file.numLines,
        startLine: parsed.file.startLine,
        totalLines: parsed.file.totalLines,
      }
    }
  } catch {
    // Not JSON, use as plain text
  }
  return { content: rawContent }
}

export interface BashResult {
  output: string
  exitCode?: number
}

/**
 * Parse Bash tool JSON result to extract output and exit code.
 */
export function parseBashResult(rawContent: string): BashResult {
  try {
    const parsed = JSON.parse(rawContent)
    if (parsed.stdout !== undefined || parsed.stderr !== undefined) {
      const stdout = parsed.stdout || ''
      const stderr = parsed.stderr || ''
      return {
        output: stdout + (stderr ? `\n${stderr}` : ''),
        exitCode: parsed.interrupted ? 130 : parsed.exitCode,
      }
    }
  } catch {
    // Not JSON, try to extract exit code from text
    const exitMatch = rawContent.match(/Exit code: (\d+)/)
    if (exitMatch && exitMatch[1]) {
      return { output: rawContent, exitCode: parseInt(exitMatch[1], 10) }
    }
  }
  return { output: rawContent }
}

export interface GrepResult {
  output: string
  description: string
  command: string
}

/**
 * Parse Grep tool JSON result to extract search results.
 */
export function parseGrepResult(
  rawContent: string,
  pattern: string,
  searchPath: string,
  outputMode: string
): GrepResult {
  let output = rawContent
  let description = `Search for "${pattern}"`

  try {
    const parsed = JSON.parse(rawContent)
    if (parsed.content !== undefined) {
      output = parsed.content || ''
      if (parsed.numFiles !== undefined) {
        description = `Search for "${pattern}" (${parsed.numFiles} files, ${parsed.numLines || 0} lines)`
      }
    } else if (parsed.filenames) {
      // files_with_matches mode returns filenames array
      output = parsed.filenames.join('\n')
      description = `Search for "${pattern}" (${parsed.filenames.length} files)`
    }
  } catch {
    // Not JSON, use as plain text
  }

  const command = `grep "${pattern}" ${searchPath} --${outputMode}`
  return { output, description, command }
}

export interface GlobResult {
  output: string
  description: string
  command: string
}

/**
 * Parse Glob tool JSON result to extract file list.
 */
export function parseGlobResult(
  rawContent: string,
  pattern: string,
  searchPath: string
): GlobResult {
  let output = rawContent
  let description = `Find files matching "${pattern}"`

  try {
    const parsed = JSON.parse(rawContent)
    if (parsed.filenames && Array.isArray(parsed.filenames)) {
      // Standard Glob result format: { filenames: [...], numFiles, durationMs, truncated }
      output = parsed.filenames.join('\n')
      const truncated = parsed.truncated ? ' (truncated)' : ''
      description = `Find files matching "${pattern}" (${parsed.numFiles || parsed.filenames.length} files${truncated})`
    } else if (Array.isArray(parsed)) {
      // Simple array format
      output = parsed.join('\n')
      description = `Find files matching "${pattern}" (${parsed.length} matches)`
    }
  } catch {
    // Not JSON, use as plain text
  }

  const command = `glob "${pattern}" in ${searchPath}`
  return { output, description, command }
}

// ============================================================================
// Overlay Data Types
// ============================================================================

export interface CodeOverlayData {
  type: 'code'
  filePath: string
  content: string
  mode: 'read' | 'write'
  startLine?: number
  totalLines?: number
  numLines?: number
  error?: string
}

export interface DiffOverlayData {
  type: 'diff'
  filePath: string
  original: string
  modified: string
  error?: string
}

export interface TerminalOverlayData {
  type: 'terminal'
  command: string
  output: string
  exitCode?: number
  toolType: ToolType
  description: string
}

export interface GenericOverlayData {
  type: 'generic'
  content: string
  title: string
}

export interface JSONOverlayData {
  type: 'json'
  data: unknown
  rawContent: string
  title: string
  error?: string
}

export type OverlayData = CodeOverlayData | DiffOverlayData | TerminalOverlayData | GenericOverlayData | JSONOverlayData

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract overlay data from an activity item.
 * Returns typed data for rendering the appropriate overlay component.
 */
export function extractOverlayData(activity: ActivityItem): OverlayData | null {
  if (!activity) return null

  const input = activity.toolInput as Record<string, unknown> | undefined
  const rawContent = activity.content || ''
  const toolName = activity.toolName?.toLowerCase() || ''

  // Get file path from various input formats
  const filePath = (input?.file_path as string) || (input?.path as string) || 'file'

  // Read tool → Code overlay (read mode)
  if (toolName === 'read') {
    const parsed = parseReadResult(rawContent)
    return {
      type: 'code',
      filePath,
      content: parsed.content,
      mode: 'read',
      startLine: parsed.startLine,
      totalLines: parsed.totalLines,
      numLines: parsed.numLines,
      error: activity.error,
    }
  }

  // Write tool → Code overlay (write mode)
  if (toolName === 'write') {
    return {
      type: 'code',
      filePath,
      content: (input?.content as string) || rawContent,
      mode: 'write',
      error: activity.error,
    }
  }

  // Edit tool → Diff overlay
  if (toolName === 'edit' || toolName === 'multiedit') {
    return {
      type: 'diff',
      filePath,
      original: (input?.old_string as string) || '',
      modified: (input?.new_string as string) || '',
      error: activity.error,
    }
  }

  // Bash tool → Terminal overlay
  if (toolName === 'bash') {
    const parsed = parseBashResult(rawContent)
    return {
      type: 'terminal',
      command: (input?.command as string) || '',
      output: parsed.output,
      exitCode: parsed.exitCode,
      description: (input?.description as string) || activity.displayName || '',
      toolType: 'bash',
    }
  }

  // Grep tool → Terminal overlay
  if (toolName === 'grep') {
    const pattern = (input?.pattern as string) || ''
    const searchPath = (input?.path as string) || '.'
    const outputMode = (input?.output_mode as string) || 'files_with_matches'
    const parsed = parseGrepResult(rawContent, pattern, searchPath, outputMode)
    return {
      type: 'terminal',
      command: parsed.command,
      output: parsed.output,
      description: parsed.description,
      toolType: 'grep',
    }
  }

  // Glob tool → Terminal overlay
  if (toolName === 'glob') {
    const pattern = (input?.pattern as string) || '*'
    const searchPath = (input?.path as string) || '.'
    const parsed = parseGlobResult(rawContent, pattern, searchPath)
    return {
      type: 'terminal',
      command: parsed.command,
      output: parsed.output,
      description: parsed.description,
      toolType: 'glob',
    }
  }

  // Try to detect JSON content for unknown tools (MCP tools, WebSearch, WebFetch, etc.)
  // JSON objects/arrays get interactive tree viewer, other content falls through to generic
  const trimmedContent = rawContent.trim()
  if ((trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
      (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmedContent)
      return {
        type: 'json',
        data: parsed,
        rawContent: trimmedContent,
        title: activity.displayName || activity.toolName || 'JSON Result',
        error: activity.error,
      }
    } catch {
      // Not valid JSON, fall through to generic
    }
  }

  // Fallback for unknown tools - plain text/markdown content
  return {
    type: 'generic',
    content: rawContent || (input ? JSON.stringify(input, null, 2) : ''),
    title: activity.displayName || activity.toolName || 'Activity',
  }
}
