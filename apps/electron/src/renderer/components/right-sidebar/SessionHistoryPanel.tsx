/**
 * SessionHistoryPanel - Timeline view of session activity
 *
 * Displays:
 * - Tool calls with status, duration, and details
 * - Token usage statistics
 * - Session metadata timeline
 */

import * as React from 'react'
import { useState, useMemo } from 'react'
import { PanelHeader } from '../app-shell/PanelHeader'
import { useSession as useSessionData } from '@/context/AppShellContext'
import { ScrollArea } from '../ui/scroll-area'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  FileEdit,
  Search,
  Globe,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronRight,
  Coins,
} from 'lucide-react'
import type { Message } from '../../../shared/types'
import { calculateTokenCost } from '@config/models'

export interface SessionHistoryPanelProps {
  sessionId?: string
  closeButton?: React.ReactNode
  /** Hide the panel header (when tabs are shown externally) */
  hideHeader?: boolean
}

/** Tool call entry extracted from messages */
interface ToolCallEntry {
  id: string
  toolName: string
  displayName: string
  status: 'running' | 'success' | 'error'
  duration?: number
  timestamp: number
  input?: Record<string, unknown>
  result?: string
  isError?: boolean
}

/** Get icon for tool type */
function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase()
  if (name.includes('bash') || name.includes('shell')) {
    return <Terminal className="h-3.5 w-3.5" />
  }
  if (name.includes('edit') || name.includes('write')) {
    return <FileEdit className="h-3.5 w-3.5" />
  }
  if (name.includes('read') || name.includes('glob') || name.includes('grep')) {
    return <Search className="h-3.5 w-3.5" />
  }
  if (name.includes('web') || name.includes('fetch')) {
    return <Globe className="h-3.5 w-3.5" />
  }
  if (name.includes('task') || name.includes('agent')) {
    return <Zap className="h-3.5 w-3.5" />
  }
  return <MessageSquare className="h-3.5 w-3.5" />
}

/** Format duration in human-readable form */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

/** Format timestamp as relative time */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(timestamp).toLocaleDateString()
}

/** Extract tool calls from messages */
function extractToolCalls(messages: Message[]): ToolCallEntry[] {
  const toolCalls: ToolCallEntry[] = []

  for (const msg of messages) {
    if (msg.role === 'tool' && msg.toolName) {
      toolCalls.push({
        id: msg.id,
        toolName: msg.toolName,
        displayName: msg.toolDisplayName || msg.toolName,
        status: msg.toolStatus === 'completed' ? 'success' :
                msg.toolStatus === 'error' ? 'error' :
                msg.isStreaming ? 'running' : 'success',
        duration: msg.toolDuration,
        timestamp: msg.timestamp,
        input: msg.toolInput,
        result: msg.toolResult,
        isError: msg.isError,
      })
    }
  }

  // Sort by timestamp descending (newest first)
  return toolCalls.sort((a, b) => b.timestamp - a.timestamp)
}

/** Tool call item component */
function ToolCallItem({ entry, isExpanded, onToggle }: {
  entry: ToolCallEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()

  const statusIcon = entry.status === 'running' ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />
  ) : entry.status === 'success' ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-destructive" />
  )

  // Get input summary
  const inputSummary = useMemo(() => {
    if (!entry.input) return null
    const keys = Object.keys(entry.input)
    if (keys.length === 0) return null

    // Show first meaningful input value
    for (const key of ['command', 'file_path', 'pattern', 'query', 'url', 'path']) {
      if (entry.input[key]) {
        const value = String(entry.input[key])
        return value.length > 60 ? value.substring(0, 60) + '...' : value
      }
    }
    return null
  }, [entry.input])

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-start gap-2.5 hover:bg-foreground/[0.02] transition-colors text-left"
      >
        {/* Expand/collapse indicator */}
        <span className="mt-0.5 text-muted-foreground/60">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Tool icon */}
        <span className="mt-0.5 text-muted-foreground">
          {getToolIcon(entry.toolName)}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {entry.displayName}
            </span>
            {statusIcon}
          </div>

          {inputSummary && (
            <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
              {inputSummary}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/70">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(entry.timestamp)}
            </span>
            {entry.duration && (
              <span>{formatDuration(entry.duration)}</span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 pl-10 space-y-2">
          {entry.input && Object.keys(entry.input).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {t('history.input')}
              </p>
              <pre className="text-xs bg-foreground/[0.03] rounded-md p-2 overflow-auto max-h-32 font-mono">
                {JSON.stringify(entry.input, null, 2)}
              </pre>
            </div>
          )}
          {entry.result && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {t('history.output')}
              </p>
              <pre className="text-xs bg-foreground/[0.03] rounded-md p-2 overflow-auto max-h-32 font-mono whitespace-pre-wrap">
                {entry.result.length > 500
                  ? entry.result.substring(0, 500) + '...'
                  : entry.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Token usage stats component */
function TokenUsageStats({ session }: { session: { model?: string; tokenUsage?: { inputTokens: number; outputTokens: number; contextWindow?: number } } }) {
  const { t } = useTranslation()

  if (!session.tokenUsage) return null

  const { inputTokens, outputTokens, contextWindow } = session.tokenUsage
  const totalTokens = inputTokens + outputTokens

  // Calculate cost based on model pricing
  const estimatedCost = calculateTokenCost(inputTokens, outputTokens, session.model)

  return (
    <div className="px-4 py-3 border-b border-border/50">
      <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Coins className="h-3.5 w-3.5" />
        {t('history.tokenUsage')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground/70">{t('history.input')}</p>
          <p className="text-sm font-medium">{inputTokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground/70">{t('history.output')}</p>
          <p className="text-sm font-medium">{outputTokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground/70">{t('history.total')}</p>
          <p className="text-sm font-medium">{totalTokens.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground/70">{t('history.estimatedCost')}</p>
          <p className="text-sm font-medium">${estimatedCost.toFixed(4)}</p>
        </div>
      </div>
      {contextWindow && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground/70">{t('history.contextUsed')}</span>
            <span className="text-muted-foreground">
              {Math.round((inputTokens / contextWindow) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-info rounded-full transition-all"
              style={{ width: `${Math.min((inputTokens / contextWindow) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * SessionHistoryPanel - Main component
 */
export function SessionHistoryPanel({ sessionId, closeButton, hideHeader }: SessionHistoryPanelProps) {
  const { t } = useTranslation()
  const session = useSessionData(sessionId || '')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Extract tool calls from messages
  const toolCalls = useMemo(() => {
    if (!session?.messages) return []
    return extractToolCalls(session.messages)
  }, [session?.messages])

  // Toggle item expansion
  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // No session selected
  if (!sessionId) {
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && <PanelHeader title={t('history.title')} actions={closeButton} />}
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
          <p className="text-sm text-center">{t('history.noSessionSelected')}</p>
        </div>
      </div>
    )
  }

  // Session loading
  if (!session) {
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && <PanelHeader title={t('history.title')} actions={closeButton} />}
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
    )
  }

  // Count statistics
  const successCount = toolCalls.filter(t => t.status === 'success').length
  const errorCount = toolCalls.filter(t => t.status === 'error').length

  return (
    <div className="h-full flex flex-col">
      {!hideHeader && <PanelHeader title={t('history.title')} actions={closeButton} />}

      <ScrollArea className="flex-1">
        {/* Token usage stats */}
        <TokenUsageStats session={session} />

        {/* Summary stats */}
        {toolCalls.length > 0 && (
          <div className="px-4 py-3 border-b border-border/50 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{toolCalls.length}</span>
              <span className="text-muted-foreground">{t('history.toolCalls')}</span>
            </div>
            {successCount > 0 && (
              <div className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{successCount}</span>
              </div>
            )}
            {errorCount > 0 && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                <span>{errorCount}</span>
              </div>
            )}
          </div>
        )}

        {/* Tool calls list */}
        {toolCalls.length > 0 ? (
          <div>
            {toolCalls.map(entry => (
              <ToolCallItem
                key={entry.id}
                entry={entry}
                isExpanded={expandedItems.has(entry.id)}
                onToggle={() => toggleItem(entry.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
            <div className="text-center">
              <Terminal className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('history.noToolCalls')}</p>
              <p className="text-xs mt-1 opacity-60">{t('history.noToolCallsHint')}</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
