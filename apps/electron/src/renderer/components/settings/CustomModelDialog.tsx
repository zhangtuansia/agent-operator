/**
 * CustomModelDialog
 *
 * Dialog for adding or editing custom models for the Custom provider.
 */

import * as React from 'react'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/i18n'
import type { CustomModel } from '../../../shared/types'

export interface CustomModelDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Model to edit (null for new model) */
  model: CustomModel | null
  /** Callback when model is saved */
  onSave: (model: CustomModel) => void
  /** Existing model IDs (for duplicate check) */
  existingIds: string[]
}

export function CustomModelDialog({
  open,
  onOpenChange,
  model,
  onSave,
  existingIds,
}: CustomModelDialogProps) {
  const { t } = useTranslation()
  const isEditing = model !== null

  // Form state
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens or model changes
  useEffect(() => {
    if (open) {
      if (model) {
        setId(model.id)
        setName(model.name)
        setShortName(model.shortName || '')
        setDescription(model.description || '')
      } else {
        setId('')
        setName('')
        setShortName('')
        setDescription('')
      }
      setError(null)
    }
  }, [open, model])

  const handleSave = () => {
    // Validation
    if (!id.trim()) {
      setError(t('apiSettings.customModels.errorIdRequired'))
      return
    }
    if (!name.trim()) {
      setError(t('apiSettings.customModels.errorNameRequired'))
      return
    }
    // Check for duplicate ID (only when adding new model)
    if (!isEditing && existingIds.includes(id.trim())) {
      setError(t('apiSettings.customModels.errorIdDuplicate'))
      return
    }

    onSave({
      id: id.trim(),
      name: name.trim(),
      shortName: shortName.trim() || undefined,
      description: description.trim() || undefined,
    })
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('apiSettings.customModels.editTitle')
              : t('apiSettings.customModels.addTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('apiSettings.customModels.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4" onKeyDown={handleKeyDown}>
          {/* Model ID */}
          <div className="space-y-2">
            <Label htmlFor="model-id">
              {t('apiSettings.customModels.modelId')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="model-id"
              value={id}
              onChange={(e) => {
                setId(e.target.value)
                setError(null)
              }}
              placeholder="gpt-4-turbo"
              disabled={isEditing}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('apiSettings.customModels.modelIdHint')}
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="model-name">
              {t('apiSettings.customModels.displayName')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="model-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="GPT-4 Turbo"
            />
          </div>

          {/* Short Name (optional) */}
          <div className="space-y-2">
            <Label htmlFor="model-short-name">
              {t('apiSettings.customModels.shortName')}
            </Label>
            <Input
              id="model-short-name"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="GPT-4"
            />
            <p className="text-xs text-muted-foreground">
              {t('apiSettings.customModels.shortNameHint')}
            </p>
          </div>

          {/* Description (optional) */}
          <div className="space-y-2">
            <Label htmlFor="model-description">
              {t('apiSettings.customModels.description')}
            </Label>
            <Input
              id="model-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('apiSettings.customModels.descriptionPlaceholder')}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {isEditing ? t('common.save') : t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
