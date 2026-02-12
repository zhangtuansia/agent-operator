/**
 * SessionMenu - Shared menu content for session actions
 *
 * Used by:
 * - SessionList (dropdown via "..." button, context menu via right-click)
 * - ChatPage (title dropdown menu)
 *
 * Uses MenuComponents context to render with either DropdownMenu or ContextMenu
 * primitives, allowing the same component to work in both scenarios.
 *
 * Provides consistent session actions:
 * - Share / Shared submenu
 * - Status submenu
 * - Flag/Unflag
 * - Mark as Unread
 * - Rename
 * - Open in New Window
 * - View in Finder
 * - Delete
 */

import * as React from 'react'
import {
  Trash2,
  Pencil,
  Flag,
  FlagOff,
  MailOpen,
  FolderOpen,
  Copy,
  Link2Off,
  AppWindow,
  CloudUpload,
  Globe,
  RefreshCw,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, isHexColor } from '@/lib/utils'
import { useMenuComponents } from '@/components/ui/menu-context'
import { getStateColor, getStateIcon, type TodoStateId } from '@/config/todo-states'
import type { TodoState } from '@/config/todo-states'
import { useLanguage } from '@/context/LanguageContext'
import type { LabelConfig } from '@agent-operator/shared/labels'
import { extractLabelId } from '@agent-operator/shared/labels'
import { LabelMenuItems } from './SessionMenuParts'

// Built-in status IDs that have translations
const BUILT_IN_STATUS_IDS = ['backlog', 'todo', 'needs-review', 'done', 'cancelled'] as const

export interface SessionMenuProps {
  /** Session ID */
  sessionId: string
  /** Session name for rename dialog */
  sessionName: string
  /** Whether session is flagged */
  isFlagged: boolean
  /** Shared URL if session is shared */
  sharedUrl?: string | null
  /** Whether session has messages */
  hasMessages: boolean
  /** Whether session has unread messages */
  hasUnreadMessages: boolean
  /** Current todo state */
  currentTodoState: TodoStateId
  /** Available todo states */
  todoStates: TodoState[]
  /** Current labels applied to this session (e.g. ["bug", "priority::3"]) */
  sessionLabels?: string[]
  /** All available label configs (tree structure) for the labels submenu */
  labels?: LabelConfig[]
  /** Callback when labels are toggled (receives full updated labels array) */
  onLabelsChange?: (labels: string[]) => void
  /** Callbacks */
  onRename: () => void
  onFlag: () => void
  onUnflag: () => void
  onMarkUnread: () => void
  onTodoStateChange: (state: TodoStateId) => void
  onOpenInNewWindow: () => void
  onDelete: () => void
}

/**
 * SessionMenu - Renders the menu items for session actions
 * This is the content only, not wrapped in a DropdownMenu
 */
export function SessionMenu({
  sessionId,
  sessionName,
  isFlagged,
  sharedUrl,
  hasMessages,
  hasUnreadMessages,
  currentTodoState,
  todoStates,
  sessionLabels = [],
  labels = [],
  onLabelsChange,
  onRename,
  onFlag,
  onUnflag,
  onMarkUnread,
  onTodoStateChange,
  onOpenInNewWindow,
  onDelete,
}: SessionMenuProps) {
  const { t } = useLanguage()

  const handleShowInFinder = () => {
    window.electronAPI.sessionCommand(sessionId, { type: 'showInFinder' })
  }

  const handleCopyPath = async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'copyPath' }) as { success: boolean; path?: string } | undefined
    if (result?.success && result.path) {
      await navigator.clipboard.writeText(result.path)
      toast.success(t('sessionMenu.pathCopied'))
    }
  }

  const handleRefreshTitle = async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'refreshTitle' }) as { success: boolean; title?: string; error?: string } | undefined
    if (result?.success) {
      toast.success(t('sessionMenu.titleRefreshed'), { description: result.title })
    } else {
      toast.error(t('sessionMenu.failedToRefreshTitle'), { description: result?.error || 'Unknown error' })
    }
  }

  const handleShare = async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'shareToViewer' }) as { success: boolean; url?: string; error?: string } | undefined
    if (result?.success && result.url) {
      await navigator.clipboard.writeText(result.url)
      toast.success(t('sessionMenu.linkCopied'), {
        description: result.url,
        action: {
          label: t('sessionMenu.openInBrowser'),
          onClick: () => window.electronAPI.openUrl(result.url!),
        },
      })
    } else {
      toast.error(t('sessionMenu.failedToShare'), { description: result?.error || 'Unknown error' })
    }
  }

  const handleOpenInBrowser = () => {
    if (sharedUrl) window.electronAPI.openUrl(sharedUrl)
  }

  const handleCopyLink = async () => {
    if (!sharedUrl) return
    await navigator.clipboard.writeText(sharedUrl)
    toast.success(t('sessionMenu.linkCopied'))
  }

  const handleUpdateShare = async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'updateShare' }) as { success?: boolean; error?: string } | undefined
    if (result?.success) {
      toast.success(t('sessionMenu.shareUpdated'))
    } else {
      toast.error(t('sessionMenu.failedToUpdateShare'), { description: result?.error || 'Unknown error' })
    }
  }

  const handleRevokeShare = async () => {
    const result = await window.electronAPI.sessionCommand(sessionId, { type: 'revokeShare' }) as { success?: boolean; error?: string } | undefined
    if (result?.success) {
      toast.success(t('sessionMenu.sharingStopped'))
    } else {
      toast.error(t('sessionMenu.failedToStopSharing'), { description: result?.error || 'Unknown error' })
    }
  }

  // Set of currently applied label IDs (extracted from entries like "priority::3" -> "priority")
  const appliedLabelIds = React.useMemo(
    () => new Set(sessionLabels.map(extractLabelId)),
    [sessionLabels]
  )

  // Toggle a label: add if not applied, remove if applied (by base ID)
  const handleLabelToggle = React.useCallback((labelId: string) => {
    if (!onLabelsChange) return
    const isApplied = appliedLabelIds.has(labelId)
    if (isApplied) {
      const updated = sessionLabels.filter(entry => extractLabelId(entry) !== labelId)
      onLabelsChange(updated)
    } else {
      onLabelsChange([...sessionLabels, labelId])
    }
  }, [sessionLabels, appliedLabelIds, onLabelsChange])

  // Get menu components from context (works with both DropdownMenu and ContextMenu)
  const { MenuItem, Separator, Sub, SubTrigger, SubContent } = useMenuComponents()

  return (
    <>
      {/* Share / Shared submenu */}
      {!sharedUrl ? (
        <MenuItem onClick={handleShare}>
          <CloudUpload className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.share')}</span>
        </MenuItem>
      ) : (
        <Sub>
          <SubTrigger>
            <CloudUpload className="h-3.5 w-3.5" />
            <span className="flex-1">{t('sessionMenu.shared')}</span>
          </SubTrigger>
          <SubContent>
            <MenuItem onClick={handleOpenInBrowser}>
              <Globe className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.openInBrowser')}</span>
            </MenuItem>
            <MenuItem onClick={handleCopyLink}>
              <Copy className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.copyLink')}</span>
            </MenuItem>
            <MenuItem onClick={handleUpdateShare}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.updateShare')}</span>
            </MenuItem>
            <MenuItem onClick={handleRevokeShare} variant="destructive">
              <Link2Off className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.stopSharing')}</span>
            </MenuItem>
          </SubContent>
        </Sub>
      )}
      <Separator />

      {/* Status submenu - includes all statuses plus Flag/Unflag at the bottom */}
      <Sub>
        <SubTrigger>
          <span
            className={cn(
              'shrink-0 flex items-center justify-center -mt-px h-3.5 w-3.5',
              '[&>svg]:w-full [&>svg]:h-full [&>div>svg]:w-full [&>div>svg]:h-full [&>img]:w-full [&>img]:h-full',
              !isHexColor(getStateColor(currentTodoState, todoStates)) &&
                (getStateColor(currentTodoState, todoStates) || 'text-muted-foreground')
            )}
            style={
              isHexColor(getStateColor(currentTodoState, todoStates))
                ? { color: getStateColor(currentTodoState, todoStates) }
                : undefined
            }
          >
            {getStateIcon(currentTodoState, todoStates)}
          </span>
          <span className="flex-1">{t('sessionMenu.status')}</span>
        </SubTrigger>
        <SubContent>
          {todoStates.map((state) => {
            // Only apply color if icon is colorable (uses currentColor)
            const applyColor = state.iconColorable
            return (
              <MenuItem
                key={state.id}
                onClick={() => onTodoStateChange(state.id)}
                className={currentTodoState === state.id ? 'bg-foreground/5' : ''}
              >
                <span
                  className={cn(
                    'shrink-0 flex items-center justify-center -mt-px h-3.5 w-3.5',
                    '[&>svg]:w-full [&>svg]:h-full [&>div>svg]:w-full [&>div>svg]:h-full [&>img]:w-full [&>img]:h-full',
                  )}
                  style={applyColor && state.resolvedColor ? { color: state.resolvedColor } : undefined}
                >
                  {state.icon}
                </span>
                <span className="flex-1">
                  {(BUILT_IN_STATUS_IDS as readonly string[]).includes(state.id)
                    ? t(`statusLabels.${state.id}`)
                    : state.label}
                </span>
              </MenuItem>
            )
          })}

          {/* Separator before Flag/Unflag */}
          <Separator />

          {/* Flag/Unflag at the bottom of status menu */}
          {!isFlagged ? (
            <MenuItem onClick={onFlag}>
              <Flag className="h-3.5 w-3.5 text-info" />
              <span className="flex-1">{t('sessionMenu.flag')}</span>
            </MenuItem>
          ) : (
            <MenuItem onClick={onUnflag}>
              <FlagOff className="h-3.5 w-3.5" />
              <span className="flex-1">{t('sessionMenu.unflag')}</span>
            </MenuItem>
          )}
        </SubContent>
      </Sub>

      {/* Labels submenu */}
      {labels.length > 0 && (
        <Sub>
          <SubTrigger className="pr-2">
            <Tag className="h-3.5 w-3.5" />
            <span className="flex-1">{t('sessionMenu.labels')}</span>
            {sessionLabels.length > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums -mr-2.5">
                {sessionLabels.length}
              </span>
            )}
          </SubTrigger>
          <SubContent>
            <LabelMenuItems
              labels={labels}
              appliedLabelIds={appliedLabelIds}
              onToggle={handleLabelToggle}
              menu={{ MenuItem, Separator, Sub, SubTrigger, SubContent }}
            />
          </SubContent>
        </Sub>
      )}

      {/* Mark as Unread - only show if session has been read */}
      {!hasUnreadMessages && hasMessages && (
        <MenuItem onClick={onMarkUnread}>
          <MailOpen className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.markAsUnread')}</span>
        </MenuItem>
      )}

      <Separator />

      {/* Rename */}
      <MenuItem onClick={onRename}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.rename')}</span>
      </MenuItem>

      {/* Regenerate Title - AI-generate based on recent messages */}
      <MenuItem onClick={handleRefreshTitle}>
        <RefreshCw className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.regenerateTitle')}</span>
      </MenuItem>

      <Separator />

      {/* Open in New Window */}
      <MenuItem onClick={onOpenInNewWindow}>
        <AppWindow className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.openInNewWindow')}</span>
      </MenuItem>

      {/* View in Finder */}
      <MenuItem onClick={handleShowInFinder}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.viewInFinder')}</span>
      </MenuItem>

      {/* Copy Path */}
      <MenuItem onClick={handleCopyPath}>
        <Copy className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.copyPath')}</span>
      </MenuItem>

      <Separator />

      {/* Delete */}
      <MenuItem onClick={onDelete} variant="destructive">
        <Trash2 className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.delete')}</span>
      </MenuItem>
    </>
  )
}
