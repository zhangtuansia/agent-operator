/**
 * MainContentPanel - Right panel component for displaying content
 *
 * Renders content based on the unified NavigationState:
 * - Chats navigator: ChatPage for selected session, or empty state
 * - Sources navigator: SourceInfoPage for selected source, or empty state
 * - Settings navigator: Settings, Preferences, or Shortcuts page
 *
 * The NavigationState is the single source of truth for what to display.
 *
 * In focused mode (single window), wraps content with StoplightProvider
 * so PanelHeader components automatically compensate for macOS traffic lights.
 */

import * as React from 'react'
import { Panel } from './Panel'
import { useAppShellContext } from '@/context/AppShellContext'
import { StoplightProvider } from '@/context/StoplightContext'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import {
  useNavigationState,
  isChatsNavigation,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
} from '@/contexts/NavigationContext'
import { SourceInfoPage, ChatPage } from '@/pages'
import { getSettingsPageComponent } from '@/pages/settings/settings-pages'
import SkillInfoPage from '@/pages/SkillInfoPage'
import { useLanguage } from '@/context/LanguageContext'

export interface MainContentPanelProps {
  /** Whether the app is in focused mode (single chat, no sidebar) */
  isFocusedMode?: boolean
  /** Optional className for the container */
  className?: string
}

export function MainContentPanel({
  isFocusedMode = false,
  className,
}: MainContentPanelProps) {
  const navState = useNavigationState()
  const { activeWorkspaceId } = useAppShellContext()
  const { t } = useLanguage()

  // Wrap content with StoplightProvider so PanelHeaders auto-compensate in focused mode
  const wrapWithStoplight = (content: React.ReactNode) => (
    <StoplightProvider value={isFocusedMode}>
      {content}
    </StoplightProvider>
  )

  // Settings navigator - always has content (subpage determines which page)
  if (isSettingsNavigation(navState)) {
    const SettingsPage = getSettingsPageComponent(navState.subpage)
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <SettingsPage />
      </Panel>
    )
  }

  // Sources navigator - show source info or empty state
  if (isSourcesNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <ErrorBoundary level="section" key={navState.details.sourceSlug}>
            <SourceInfoPage
              sourceSlug={navState.details.sourceSlug}
              workspaceId={activeWorkspaceId || ''}
            />
          </ErrorBoundary>
        </Panel>
      )
    }
    // No source selected - empty state
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">{t('emptyStates.noSourcesConfigured')}</p>
        </div>
      </Panel>
    )
  }

  // Skills navigator - show skill info or empty state
  if (isSkillsNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <ErrorBoundary level="section" key={navState.details.skillSlug}>
            <SkillInfoPage
              skillSlug={navState.details.skillSlug}
              workspaceId={activeWorkspaceId || ''}
            />
          </ErrorBoundary>
        </Panel>
      )
    }
    // No skill selected - empty state
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">{t('emptyStates.noSkillsConfigured')}</p>
        </div>
      </Panel>
    )
  }

  // Chats navigator - show chat or empty state
  if (isChatsNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <ErrorBoundary level="section" key={navState.details.sessionId}>
            <ChatPage sessionId={navState.details.sessionId} />
          </ErrorBoundary>
        </Panel>
      )
    }
    // No session selected - empty state
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">
            {navState.filter.kind === 'flagged'
              ? t('emptyStates.noFlaggedConversations')
              : t('emptyStates.noConversationsYet')}
          </p>
        </div>
      </Panel>
    )
  }

  // Fallback (should not happen with proper NavigationState)
  return wrapWithStoplight(
    <Panel variant="grow" className={className}>
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{t('emptyStates.selectConversation')}</p>
      </div>
    </Panel>
  )
}
