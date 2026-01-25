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
import { useTranslation } from '@/i18n'

export interface RightSidebarProps {
  /** Current panel configuration */
  panel: RightSidebarPanel
  /** Session ID (required for session-specific panels) */
  sessionId?: string
  /** Close button to display in panel header */
  closeButton?: React.ReactNode
  /** Callback when file selection changes in files panel */
  onFileSelect?: (path: string | undefined) => void
}

/**
 * Routes right sidebar content based on panel type
 */
export function RightSidebar({ panel, sessionId, closeButton, onFileSelect }: RightSidebarProps) {
  const { t } = useTranslation()

  switch (panel.type) {
    case 'sessionMetadata':
      return <SessionMetadataPanel sessionId={sessionId} closeButton={closeButton} />

    case 'files':
      return (
        <SessionFilesPanel
          sessionId={sessionId}
          filePath={panel.path}
          closeButton={closeButton}
          onFileSelect={onFileSelect}
        />
      )

    case 'history':
      // TODO: Implement SessionHistoryPanel
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <p className="text-sm">{t('chatInfo.historyPanelComingSoon')}</p>
        </div>
      )

    case 'none':
    default:
      return null
  }
}
