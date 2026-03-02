/**
 * SessionViewer - Read-only session transcript viewer
 *
 * Platform-agnostic component for viewing session transcripts.
 * Used by the web viewer app. For interactive chat, Electron uses ChatDisplay.
 *
 * Renders a session's messages as turn cards with gradient fade at top/bottom.
 */

import type { ReactNode } from 'react'
import { useMemo, useState, useCallback } from 'react'
import type { StoredSession } from '@agent-operator/core'
import { cn } from '../../lib/utils'
import { CHAT_LAYOUT, CHAT_CLASSES } from '../../lib/layout'
import { PlatformProvider, type PlatformActions } from '../../context'
import { TurnCard } from './TurnCard'
import { UserMessageBubble } from './UserMessageBubble'
import { SystemMessage } from './SystemMessage'
import {
  groupMessagesByTurn,
  storedToMessage,
  type AssistantTurn,
  type ActivityItem,
} from './turn-utils'

export type SessionViewerMode = 'interactive' | 'readonly'

export interface SessionViewerProps {
  /** Session data to display */
  session: StoredSession
  /** View mode - 'readonly' for web viewer, 'interactive' for Electron */
  mode?: SessionViewerMode
  /** Platform-specific actions (file opening, URL handling, etc.) */
  platformActions?: PlatformActions
  /** Additional className for the container */
  className?: string
  /** Callback when a turn is clicked */
  onTurnClick?: (turnId: string) => void
  /** Callback when an activity is clicked */
  onActivityClick?: (activity: ActivityItem) => void
  /** Default expanded state for turns (true for readonly, false for interactive) */
  defaultExpanded?: boolean
  /** Custom header content */
  header?: ReactNode
  /** Custom footer content (input area for interactive mode) */
  footer?: ReactNode
  /** Optional session folder path for stripping from file paths in tool display */
  sessionFolderPath?: string
}

/**
 * CoworkLogo - Pixel art "COWORK" text logo for branding
 */
function CoworkLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 408 66"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.0722656,65.9453125 L15.0722656,52.9453125 L0,52.9453125 L0,13.9453125 L15.0722656,13.9453125 L15.0722656,0.9453125 L75.8613281,0.9453125 L75.8613281,26.9453125 L45.716,26.9453125 L45.716,39.9453125 L75.8613281,39.9453125 L75.8613281,65.9453125 L15.0722656,65.9453125 Z M158.758789,52.9453125 L158.758789,65.9453125 L128.114258,65.9453125 L128.114258,52.9453125 L113.541992,52.9453125 L113.541992,65.9453125 L82.8974609,65.9453125 L82.8974609,0.9453125 L151.222656,0.9453125 L151.222461,13.9453125 L158.758789,13.9453125 L158.758789,39.9453125 L143.686461,39.9453125 L143.686523,52.9453125 L158.758789,52.9453125 Z M241.65625,65.9453125 L211.011719,65.9453125 L211.011719,52.9453125 L196.439453,52.9453125 L196.439453,65.9453125 L165.794922,65.9453125 L165.794922,13.9453125 L180.867188,13.9453125 L180.867188,0.9453125 L226.583984,0.9453125 L226.583922,13.9453125 L241.65625,13.9453125 L241.65625,65.9453125 Z M324.553711,0.9453125 L324.553711,13.9453125 L317.017578,13.9453125 L317.017578,26.9453125 L309.481383,26.9453125 L309.481445,39.9453125 L301.945312,39.9453125 L301.945312,52.9453125 L286.873047,52.9453125 L286.873047,65.9453125 L248.692383,65.9453125 L248.692383,0.9453125 L324.553711,0.9453125 Z M392.378906,65.9453125 L346.662109,65.9453125 L346.661844,39.9453125 L331.589844,39.9453125 L331.589844,0.9453125 L407.451172,0.9453125 L407.451172,39.9453125 L392.378844,39.9453125 L392.378906,65.9453125 Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  )
}

/**
 * SessionViewer - Read-only session transcript viewer component
 */
export function SessionViewer({
  session,
  mode = 'readonly',
  platformActions = {},
  className,
  onTurnClick,
  onActivityClick,
  defaultExpanded = false,
  header,
  footer,
  sessionFolderPath,
}: SessionViewerProps) {
  // Convert StoredMessage[] to Message[] and group into turns
  const turns = useMemo(
    () => groupMessagesByTurn(session.messages.map(storedToMessage)),
    [session.messages]
  )

  // Track expanded turns (for controlled state)
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(() => {
    // Default: all turns collapsed, can override with defaultExpanded prop
    if (defaultExpanded) {
      return new Set(turns.filter(t => t.type === 'assistant').map(t => (t as AssistantTurn).turnId))
    }
    return new Set()
  })

  // Track expanded activity groups
  const [expandedActivityGroups, setExpandedActivityGroups] = useState<Set<string>>(new Set())

  const handleExpandedChange = useCallback((turnId: string, expanded: boolean) => {
    setExpandedTurns(prev => {
      const next = new Set(prev)
      if (expanded) {
        next.add(turnId)
      } else {
        next.delete(turnId)
      }
      return next
    })
  }, [])

  const handleExpandedActivityGroupsChange = useCallback((groups: Set<string>) => {
    setExpandedActivityGroups(groups)
  }, [])

  const handleOpenActivityDetails = useCallback((activity: ActivityItem) => {
    if (onActivityClick) {
      onActivityClick(activity)
    } else if (platformActions.onOpenActivityDetails) {
      platformActions.onOpenActivityDetails(session.id, activity.id)
    }
  }, [onActivityClick, platformActions, session.id])

  const handleOpenTurnDetails = useCallback((turnId: string) => {
    if (onTurnClick) {
      onTurnClick(turnId)
    } else if (platformActions.onOpenTurnDetails) {
      platformActions.onOpenTurnDetails(session.id, turnId)
    }
  }, [onTurnClick, platformActions, session.id])

  return (
    <PlatformProvider actions={platformActions}>
      <div className={cn("flex flex-col h-full", className)}>
        {/* Header */}
        {header && (
          <div className="shrink-0 border-b">
            {header}
          </div>
        )}

        {/* Messages area with gradient fade mask at top/bottom */}
        <div
          className="flex-1 min-h-0"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 32px, black calc(100% - 32px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 32px, black calc(100% - 32px), transparent 100%)'
          }}
        >
          <div className="h-full overflow-y-auto">
            <div className={cn(CHAT_LAYOUT.maxWidth, "mx-auto", CHAT_LAYOUT.containerPadding, CHAT_LAYOUT.messageSpacing)}>
            {turns.map((turn) => {
              if (turn.type === 'user') {
                return (
                  <div key={turn.message.id} className={CHAT_LAYOUT.userMessagePadding}>
                    <UserMessageBubble
                      content={turn.message.content}
                      attachments={turn.message.attachments}
                      badges={turn.message.badges}
                      onUrlClick={platformActions.onOpenUrl}
                      onFileClick={platformActions.onOpenFile}
                    />
                  </div>
                )
              }

              if (turn.type === 'system') {
                const msgType = turn.message.role === 'error' ? 'error' :
                               turn.message.role === 'warning' ? 'warning' :
                               turn.message.role === 'info' ? 'info' : 'system'
                return (
                  <SystemMessage
                    key={turn.message.id}
                    content={turn.message.content}
                    type={msgType}
                  />
                )
              }

              if (turn.type === 'assistant') {
                return (
                  <TurnCard
                    key={turn.turnId}
                    turnId={turn.turnId}
                    activities={turn.activities}
                    response={turn.response}
                    intent={turn.intent}
                    isStreaming={turn.isStreaming}
                    isComplete={turn.isComplete}
                    isExpanded={expandedTurns.has(turn.turnId)}
                    onExpandedChange={(expanded) => handleExpandedChange(turn.turnId, expanded)}
                    onOpenFile={platformActions.onOpenFile}
                    onOpenUrl={platformActions.onOpenUrl}
                    onPopOut={platformActions.onOpenMarkdownPreview}
                    onOpenDetails={() => handleOpenTurnDetails(turn.turnId)}
                    onOpenActivityDetails={handleOpenActivityDetails}
                    todos={turn.todos}
                    expandedActivityGroups={expandedActivityGroups}
                    onExpandedActivityGroupsChange={handleExpandedActivityGroupsChange}
                    hasEditOrWriteActivities={turn.activities.some(a =>
                      a.toolName === 'Edit' || a.toolName === 'Write'
                    )}
                    onOpenMultiFileDiff={platformActions.onOpenMultiFileDiff
                      ? () => platformActions.onOpenMultiFileDiff!(session.id, turn.turnId)
                      : undefined
                    }
                    sessionFolderPath={sessionFolderPath}
                  />
                )
              }

              return null
            })}

            {/* Bottom branding */}
            <div className={CHAT_CLASSES.brandingContainer}>
              <CoworkLogo className="h-5 text-[#9570BE]/40" />
            </div>
            </div>
          </div>
        </div>

        {/* Footer (input area) */}
        {footer && (
          <div className="shrink-0 border-t">
            {footer}
          </div>
        )}
      </div>
    </PlatformProvider>
  )
}
