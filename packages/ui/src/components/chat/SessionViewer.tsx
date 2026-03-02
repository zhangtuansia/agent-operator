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
      viewBox="0 0 485 66"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15,1L60,1L60,14L15,14Z M0,14L15,14L15,27L0,27Z M60,14L75,14L75,27L60,27Z M0,27L15,27L15,40L0,40Z M0,40L15,40L15,53L0,53Z M60,40L75,40L75,53L60,53Z M15,53L60,53L60,66L15,66Z M97,1L142,1L142,14L97,14Z M82,14L97,14L97,27L82,27Z M142,14L157,14L157,27L142,27Z M82,27L97,27L97,40L82,40Z M142,27L157,27L157,40L142,40Z M82,40L97,40L97,53L82,53Z M142,40L157,40L157,53L142,53Z M97,53L142,53L142,66L97,66Z M164,1L179,1L179,14L164,14Z M224,1L239,1L239,14L224,14Z M164,14L179,14L179,27L164,27Z M224,14L239,14L239,27L224,27Z M164,27L179,27L179,40L164,40Z M194,27L209,27L209,40L194,40Z M224,27L239,27L239,40L224,40Z M164,40L179,40L179,53L164,53Z M194,40L209,40L209,53L194,53Z M224,40L239,40L239,53L224,53Z M179,53L194,53L194,66L179,66Z M209,53L224,53L224,66L209,66Z M261,1L306,1L306,14L261,14Z M246,14L261,14L261,27L246,27Z M306,14L321,14L321,27L306,27Z M246,27L261,27L261,40L246,40Z M306,27L321,27L321,40L306,40Z M246,40L261,40L261,53L246,53Z M306,40L321,40L321,53L306,53Z M261,53L306,53L306,66L261,66Z M328,1L388,1L388,14L328,14Z M328,14L343,14L343,27L328,27Z M388,14L403,14L403,27L388,27Z M328,27L388,27L388,40L328,40Z M328,40L343,40L343,53L328,53Z M373,40L388,40L388,53L373,53Z M328,53L343,53L343,66L328,66Z M388,53L403,53L403,66L388,66Z M410,1L425,1L425,14L410,14Z M470,1L485,1L485,14L470,14Z M410,14L425,14L425,27L410,27Z M455,14L470,14L470,27L455,27Z M410,27L455,27L455,40L410,40Z M410,40L425,40L425,53L410,53Z M455,40L470,40L470,53L455,53Z M410,53L425,53L425,66L410,66Z M470,53L485,53L485,66L470,66Z"
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
