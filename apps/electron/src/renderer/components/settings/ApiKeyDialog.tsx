/**
 * ApiKeyDialog
 *
 * Dialog content for entering/updating an API key.
 */

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, Check, ExternalLink } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import { useLanguage } from '@/context/LanguageContext'

export interface ApiKeyDialogProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  hasExistingKey: boolean
  error?: string
}

export function ApiKeyDialogContent({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  hasExistingKey,
  error,
}: ApiKeyDialogProps) {
  const { t } = useLanguage()
  const [showValue, setShowValue] = useState(false)

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t('appSettings.payAsYouGo')}{' '}
        <a
          href="https://console.anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:underline inline-flex items-center gap-0.5"
          onClick={(e) => {
            e.preventDefault()
            window.electronAPI?.openUrl('https://console.anthropic.com')
          }}
        >
          {t('appSettings.getApiKeyFrom')}
          <ExternalLink className="size-3" />
        </a>
      </p>

      {/* Input */}
      <div className="relative">
        <Input
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasExistingKey ? '••••••••••••••••' : 'sk-ant-...'}
          className={cn('pr-10', error && 'border-destructive')}
          disabled={isSaving}
        />
        <button
          type="button"
          onClick={() => setShowValue(!showValue)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {/* Error message */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={onSave} disabled={!value.trim() || isSaving}>
          {isSaving ? (
            <>
              <Spinner className="mr-1.5" />
              {t('misc.validatingKey')}
            </>
          ) : (
            <>
              <Check className="size-3 mr-1.5" />
              {hasExistingKey ? t('misc.updateKey') : t('common.save')}
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
