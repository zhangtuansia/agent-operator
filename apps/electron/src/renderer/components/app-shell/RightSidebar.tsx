/**
 * RightSidebar - Content router for right sidebar panels
 *
 * Routes to different panel types based on RightSidebarPanel discriminated union.
 * Similar to how MainContentPanel routes between different page types.
 */

import * as React from 'react'
import type { RightSidebarPanel } from '../../../shared/types'
import { SessionMetadataPanel } from '../right-sidebar/SessionMetadataPanel'
import { SessionFilesPanel } from '../right-sidebar/SessionFilesPanel'
import { SessionHistoryPanel } from '../right-sidebar/SessionHistoryPanel'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { Info, History, FolderOpen } from 'lucide-react'

export interface RightSidebarProps {
  /** Current panel configuration */
  panel: RightSidebarPanel
  /** Session ID (required for session-specific panels) */
  sessionId?: string
  /** Close button to display in panel header */
  closeButton?: React.ReactNode
  /** Callback when file selection changes in files panel */
  onFileSelect?: (path: string | undefined) => void
  /** Callback when panel is switched */
  onSwitchPanel?: (panel: RightSidebarPanel) => void
}

/** Panel tab configuration */
const PANEL_TABS: { type: RightSidebarPanel['type']; icon: React.ReactNode; labelKey: string }[] = [
  { type: 'sessionMetadata', icon: <Info className="h-3.5 w-3.5" />, labelKey: 'rightSidebar.info' },
  { type: 'history', icon: <History className="h-3.5 w-3.5" />, labelKey: 'rightSidebar.activity' },
  { type: 'files', icon: <FolderOpen className="h-3.5 w-3.5" />, labelKey: 'rightSidebar.files' },
]

/**
 * Routes right sidebar content based on panel type
 */
export function RightSidebar({ panel, sessionId, closeButton, onFileSelect, onSwitchPanel }: RightSidebarProps) {
  const { t } = useTranslation()

  // Render tab bar for panel switching
  const tabBar = onSwitchPanel ? (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50">
      {PANEL_TABS.map((tab) => {
        const isActive = panel.type === tab.type || (tab.type === 'files' && panel.type === 'files')
        return (
          <button
            key={tab.type}
            onClick={() => onSwitchPanel({ type: tab.type } as RightSidebarPanel)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              isActive
                ? "bg-foreground/[0.08] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
            )}
          >
            {tab.icon}
            <span>{t(tab.labelKey)}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      {closeButton}
    </div>
  ) : null

  // Render panel content
  const content = (() => {
    switch (panel.type) {
      case 'sessionMetadata':
        return <SessionMetadataPanel sessionId={sessionId} closeButton={onSwitchPanel ? undefined : closeButton} hideHeader={!!onSwitchPanel} />

      case 'files':
        return (
          <SessionFilesPanel
            sessionId={sessionId}
            filePath={panel.path}
            closeButton={onSwitchPanel ? undefined : closeButton}
            onFileSelect={onFileSelect}
            hideHeader={!!onSwitchPanel}
          />
        )

      case 'history':
        return <SessionHistoryPanel sessionId={sessionId} closeButton={onSwitchPanel ? undefined : closeButton} hideHeader={!!onSwitchPanel} />

      case 'none':
      default:
        return null
    }
  })()

  if (!onSwitchPanel) {
    return content
  }

  return (
    <div className="h-full flex flex-col">
      {tabBar}
      <div className="flex-1 overflow-hidden">
        {content}
      </div>
    </div>
  )
}
