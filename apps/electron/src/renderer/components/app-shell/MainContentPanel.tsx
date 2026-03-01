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
import { useState, useEffect, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import {
  useNavigation,
  useNavigationState,
  isChatsNavigation,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
  isAutomationsNavigation,
} from '@/contexts/NavigationContext'
import { routes } from '@/lib/navigate'
import { SourceInfoPage, ChatPage } from '@/pages'
import { getSettingsPageComponent } from '@/pages/settings/settings-pages'
import SkillInfoPage from '@/pages/SkillInfoPage'
import { useLanguage } from '@/context/LanguageContext'
import { AutomationInfoPage } from '@/components/automations/AutomationInfoPage'
import { automationsAtom } from '@/atoms/automations'
import type { ExecutionEntry } from '@/components/automations/types'

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
  const { navigate } = useNavigation()
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

  // Automations navigator - show automation info or empty state
  if (isAutomationsNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <ErrorBoundary level="section" key={navState.details.automationId}>
            <AutomationDetailView automationId={navState.details.automationId} />
          </ErrorBoundary>
        </Panel>
      )
    }
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">{t('emptyStates.selectAutomation') ?? 'Select an automation to view details'}</p>
        </div>
      </Panel>
    )
  }

  // Chats navigator - show chat or empty state
  if (isChatsNavigation(navState)) {
    if (!navState.details && (navState.filter.kind === 'scheduled' || navState.filter.kind === 'scheduledTask')) {
      // Scheduled task management view removed — use Automations navigator instead
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('common.selectSession')}
          </div>
        </Panel>
      )
    }

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
              : navState.filter.kind === 'archived'
                ? t('emptyStates.noArchivedConversations')
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

// ============================================================================
// AutomationDetailView — internal component for automation info page
// ============================================================================

function AutomationDetailView({ automationId }: { automationId: string }) {
  const automations = useAtomValue(automationsAtom)
  const { activeWorkspaceId } = useAppShellContext()
  const [executions, setExecutions] = useState<ExecutionEntry[]>([])

  const automation = automations.find(a => a.id === automationId)

  // Load execution history
  useEffect(() => {
    if (!activeWorkspaceId || !automationId) return
    window.electronAPI.getAutomationHistory(activeWorkspaceId, automationId, 20)
      .then((entries: Array<{ id: string; ts: number; ok: boolean; sessionId?: string; prompt?: string; error?: string }>) => {
        setExecutions(entries.map(e => ({
          id: `${e.id}-${e.ts}`,
          automationId: e.id,
          event: automation?.event ?? 'LabelAdd',
          status: e.ok ? 'success' as const : 'error' as const,
          duration: 0,
          timestamp: e.ts,
          sessionId: e.sessionId,
          actionSummary: e.prompt,
          error: e.error,
        })))
      })
      .catch(() => setExecutions([]))

    // Subscribe to live updates
    const cleanup = window.electronAPI.onAutomationsChanged(() => {
      window.electronAPI.getAutomationHistory(activeWorkspaceId, automationId, 20)
        .then((entries: Array<{ id: string; ts: number; ok: boolean; sessionId?: string; prompt?: string; error?: string }>) => {
          setExecutions(entries.map(e => ({
            id: `${e.id}-${e.ts}`,
            automationId: e.id,
            event: automation?.event ?? 'LabelAdd',
            status: e.ok ? 'success' as const : 'error' as const,
            duration: 0,
            timestamp: e.ts,
            sessionId: e.sessionId,
            actionSummary: e.prompt,
            error: e.error,
          })))
        })
        .catch(() => {})
    })
    return () => { cleanup() }
  }, [activeWorkspaceId, automationId, automation?.event])

  const handleToggleEnabled = useCallback(() => {
    if (!automation || !activeWorkspaceId) return
    window.electronAPI.setAutomationEnabled(
      activeWorkspaceId,
      automation.event,
      automation.matcherIndex,
      !automation.enabled,
    ).catch(() => {})
  }, [automation, activeWorkspaceId])

  const handleTest = useCallback(() => {
    if (!automation || !activeWorkspaceId) return
    window.electronAPI.testAutomation({
      workspaceId: activeWorkspaceId,
      automationId: automation.id,
      actions: automation.actions,
      permissionMode: automation.permissionMode,
      labels: automation.labels,
    }).catch(() => {})
  }, [automation, activeWorkspaceId])

  const handleDuplicate = useCallback(() => {
    if (!automation || !activeWorkspaceId) return
    window.electronAPI.duplicateAutomation(activeWorkspaceId, automation.event, automation.matcherIndex)
      .catch(() => {})
  }, [automation, activeWorkspaceId])

  const handleDelete = useCallback(() => {
    if (!automation || !activeWorkspaceId) return
    window.electronAPI.deleteAutomation(activeWorkspaceId, automation.event, automation.matcherIndex)
      .catch(() => {})
  }, [automation, activeWorkspaceId])

  if (!automation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Automation not found</p>
      </div>
    )
  }

  return (
    <AutomationInfoPage
      automation={automation}
      executions={executions}
      onToggleEnabled={handleToggleEnabled}
      onTest={handleTest}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
    />
  )
}
