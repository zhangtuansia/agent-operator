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
  AppWindow,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, isHexColor } from '@/lib/utils'
import { useMenuComponents } from '@/components/ui/menu-context'
import { getStateColor, getStateIcon, type TodoStateId } from '@/config/todo-states'
import type { TodoState } from '@/config/todo-states'
import { useLanguage } from '@/context/LanguageContext'

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

  // Get menu components from context (works with both DropdownMenu and ContextMenu)
  const { MenuItem, Separator, Sub, SubTrigger, SubContent } = useMenuComponents()

  return (
    <>
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
                    applyColor && !isHexColor(state.color) && state.color
                  )}
                  style={applyColor && isHexColor(state.color) ? { color: state.color } : undefined}
                >
                  {state.icon}
                </span>
                <span className="flex-1">{state.label}</span>
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
