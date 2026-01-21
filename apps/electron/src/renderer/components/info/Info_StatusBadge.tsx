/**
 * Info_StatusBadge
 *
 * Status badge for permission states using Info_Badge.
 */

import * as React from 'react'
import { Info_Badge, type BadgeColor } from './Info_Badge'
import { useLanguage } from '@/context/LanguageContext'

type PermissionStatus = 'allowed' | 'blocked' | 'requires-permission'

const statusColorConfig: Record<PermissionStatus, BadgeColor> = {
  allowed: 'success',
  blocked: 'destructive',
  'requires-permission': 'warning',
}

export interface Info_StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Status type */
  status?: PermissionStatus | null
  /** Override the default label */
  label?: string
}

export function Info_StatusBadge({
  status,
  label,
  ...props
}: Info_StatusBadgeProps) {
  const { t } = useLanguage()
  const key: PermissionStatus = status ?? 'allowed'
  const color = statusColorConfig[key]

  // Get translated labels
  const statusLabels: Record<PermissionStatus, string> = {
    allowed: t('statusBadge.allowed'),
    blocked: t('statusBadge.blocked'),
    'requires-permission': t('statusBadge.ask'),
  }
  const displayLabel = label ?? statusLabels[key]

  return (
    <Info_Badge {...props} color={color}>
      {displayLabel}
    </Info_Badge>
  )
}
