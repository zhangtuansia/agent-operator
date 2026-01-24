/**
 * CustomModelItem
 *
 * Displays a single custom model in the list with edit/delete actions.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, GripVertical } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { CustomModel } from '../../../shared/types'

export interface CustomModelItemProps {
  /** The model to display */
  model: CustomModel
  /** Callback when edit is clicked */
  onEdit: (model: CustomModel) => void
  /** Callback when delete is clicked */
  onDelete: (modelId: string) => void
  /** Whether drag handle should be shown */
  showDragHandle?: boolean
  /** Drag handle props (for drag-and-drop) */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export function CustomModelItem({
  model,
  onEdit,
  onDelete,
  showDragHandle = false,
  dragHandleProps,
}: CustomModelItemProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors',
        'border-b border-border last:border-b-0'
      )}
    >
      {/* Drag handle (optional) */}
      {showDragHandle && (
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </div>
      )}

      {/* Model info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium truncate">{model.name}</span>
          {model.shortName && model.shortName !== model.name && (
            <span className="text-xs text-muted-foreground">({model.shortName})</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <code className="text-xs text-muted-foreground font-mono truncate">{model.id}</code>
          {model.description && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground truncate">{model.description}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onEdit(model)}
          title={t('common.edit')}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(model.id)}
          title={t('common.delete')}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
