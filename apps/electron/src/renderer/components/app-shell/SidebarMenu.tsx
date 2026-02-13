/**
 * SidebarMenu - Shared menu content for sidebar navigation items
 *
 * Used by:
 * - LeftSidebar (context menu via right-click on nav items)
 * - AppShell (context menu for New Chat button)
 *
 * Uses MenuComponents context to render with either DropdownMenu or ContextMenu
 * primitives, allowing the same component to work in both scenarios.
 *
 * Provides actions based on the sidebar item type:
 * - "Configure Statuses" (for allChats/status/flagged items) - triggers EditPopover callback
 * - "Add Source" (for sources) - triggers EditPopover callback
 * - "Add Skill" (for skills) - triggers EditPopover callback
 * - "Open in New Window" (for newChat only) - uses deep link
 */

import * as React from 'react'
import {
  AppWindow,
  Settings2,
  Plus,
  Trash2,
} from 'lucide-react'
import { useMenuComponents } from '@/components/ui/menu-context'
import { useLanguage } from '@/context/LanguageContext'

export type SidebarMenuType = 'allChats' | 'flagged' | 'status' | 'sources' | 'skills' | 'labels' | 'newChat'

export interface SidebarMenuProps {
  /** Type of sidebar item (determines available menu items) */
  type: SidebarMenuType
  /** Status ID for status items (e.g., 'todo', 'done') - not currently used but kept for future */
  statusId?: string
  /** Label ID — when set, this is an individual label item (enables Delete Label) */
  labelId?: string
  /** Handler for "Configure Statuses" action - only for allChats/status/flagged types */
  onConfigureStatuses?: () => void
  /** Handler for "Add Source" action - only for sources type */
  onAddSource?: () => void
  /** Handler for "Add Skill" action - only for skills type */
  onAddSkill?: () => void
  /** Handler for "Configure Labels" action - receives labelId when triggered from a specific label */
  onConfigureLabels?: (labelId?: string) => void
  /** Handler for "Add New Label" action - creates a label (parentId = labelId if set) */
  onAddLabel?: (parentId?: string) => void
  /** Handler for "Delete Label" action - deletes the label identified by labelId */
  onDeleteLabel?: (labelId: string) => void
}

/**
 * SidebarMenu - Renders the menu items for sidebar navigation actions
 * This is the content only, not wrapped in a DropdownMenu or ContextMenu
 */
export function SidebarMenu({
  type,
  statusId,
  labelId,
  onConfigureStatuses,
  onAddSource,
  onAddSkill,
  onConfigureLabels,
  onAddLabel,
  onDeleteLabel,
}: SidebarMenuProps) {
  // Get menu components from context (works with both DropdownMenu and ContextMenu)
  const { MenuItem, Separator } = useMenuComponents()
  const { t } = useLanguage()

  // New Chat: only shows "Open in New Window"
  if (type === 'newChat') {
    return (
      <MenuItem onClick={() => window.electronAPI.openUrl('agentoperator://action/new-chat?window=focused')}>
        <AppWindow className="h-3.5 w-3.5" />
        <span className="flex-1">{t('common.openInNewWindow')}</span>
      </MenuItem>
    )
  }

  // All Chats / Status / Flagged: show "Configure Statuses"
  if ((type === 'allChats' || type === 'status' || type === 'flagged') && onConfigureStatuses) {
    return (
      <MenuItem onClick={onConfigureStatuses}>
        <Settings2 className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sidebarMenu.configureStatuses')}</span>
      </MenuItem>
    )
  }

  // Sources: show "Add Source"
  if (type === 'sources' && onAddSource) {
    return (
      <MenuItem onClick={onAddSource}>
        <Plus className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sources.addSource')}</span>
      </MenuItem>
    )
  }

  // Skills: show "Add Skill"
  if (type === 'skills' && onAddSkill) {
    return (
      <MenuItem onClick={onAddSkill}>
        <Plus className="h-3.5 w-3.5" />
        <span className="flex-1">{t('skills.addSkill')}</span>
      </MenuItem>
    )
  }

  // Labels: show context-appropriate actions
  // - Header ("Labels" parent): Configure Labels + Add New Label
  // - Individual label items: Add New Label (as child) + Delete Label
  if (type === 'labels') {
    return (
      <>
        {onAddLabel && (
          <MenuItem onClick={() => onAddLabel(labelId)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="flex-1">{t('labelsSettings.addLabel')}</span>
          </MenuItem>
        )}
        {onConfigureLabels && (
          <MenuItem onClick={() => onConfigureLabels(labelId)}>
            <Settings2 className="h-3.5 w-3.5" />
            <span className="flex-1">{t('labelsSettings.editLabels')}</span>
          </MenuItem>
        )}
        {labelId && onDeleteLabel && (
          <>
            <Separator />
            <MenuItem onClick={() => onDeleteLabel(labelId)}>
              <Trash2 className="h-3.5 w-3.5" />
              <span className="flex-1">{t('labelsSettings.deleteLabel')}</span>
            </MenuItem>
          </>
        )}
      </>
    )
  }

  // Fallback: return null if no handler provided (shouldn't happen)
  return null
}
