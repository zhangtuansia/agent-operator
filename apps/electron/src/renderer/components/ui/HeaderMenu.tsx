/**
 * HeaderMenu
 *
 * A "..." dropdown menu for panel headers with built-in Open in New Window action.
 * Pass page-specific menu items as children; they appear above the separator.
 */

import * as React from 'react'
import { MoreHorizontal, AppWindow } from 'lucide-react'
import { HeaderIconButton } from './HeaderIconButton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from './dropdown-menu'
import {
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from './styled-dropdown'
import { useTranslation } from '@/i18n'

interface HeaderMenuProps {
  /** Route string for Open in New Window action */
  route: string
  /** Page-specific menu items (rendered before Open in New Window) */
  children?: React.ReactNode
}

export function HeaderMenu({ route, children }: HeaderMenuProps) {
  const { t } = useTranslation()

  const handleOpenInNewWindow = async () => {
    const separator = route.includes('?') ? '&' : '?'
    const url = `agentoperator://${route}${separator}window=focused`
    console.log('[HeaderMenu] Opening in new window:', { route, url })
    try {
      await window.electronAPI?.openUrl(url)
      console.log('[HeaderMenu] openUrl completed successfully')
    } catch (error) {
      console.error('[HeaderMenu] openUrl failed:', error)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HeaderIconButton icon={<MoreHorizontal className="h-4 w-4" />} />
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="end">
        {children}
        {children && <StyledDropdownMenuSeparator />}
        <StyledDropdownMenuItem onClick={handleOpenInNewWindow}>
          <AppWindow className="h-3.5 w-3.5" />
          <span className="flex-1">{t('common.openInNewWindow')}</span>
        </StyledDropdownMenuItem>
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}
