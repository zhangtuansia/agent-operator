/**
 * ImportSkillDialog
 *
 * Dialog component for importing skills from URL or raw content.
 */

import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { Download, Link, FileText } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/LanguageContext'
import { useRegisterModal } from '@/context/ModalContext'
import { cn } from '@/lib/utils'

export interface ImportSkillDialogProps {
  workspaceId: string
  trigger?: React.ReactNode
  onSuccess?: (skillSlug: string) => void
  /** Controlled mode: open state */
  open?: boolean
  /** Controlled mode: open state change handler */
  onOpenChange?: (open: boolean) => void
}

type ImportMode = 'url' | 'content'

export function ImportSkillDialog({
  workspaceId,
  trigger,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ImportSkillDialogProps) {
  const { t } = useLanguage()
  const [internalOpen, setInternalOpen] = useState(false)

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen
  const [mode, setMode] = useState<ImportMode>('url')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Register with modal context so X button / Cmd+W closes this dialog first
  useRegisterModal(open, () => setOpen(false))

  const resetForm = () => {
    setUrl('')
    setContent('')
    setError(null)
    setLoading(false)
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      resetForm()
    }
  }

  // Focus input after dialog opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (mode === 'url') {
          inputRef.current?.focus()
        } else {
          textareaRef.current?.focus()
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [open, mode])

  const handleImport = async () => {
    setError(null)
    setLoading(true)

    try {
      let result: { success: boolean; skill?: { slug: string }; error?: string }

      if (mode === 'url') {
        if (!url.trim()) {
          setError(t('skills.import.errorEmptyUrl'))
          setLoading(false)
          return
        }
        result = await window.electronAPI.importSkillFromUrl(workspaceId, url.trim())
      } else {
        if (!content.trim()) {
          setError(t('skills.import.errorEmptyContent'))
          setLoading(false)
          return
        }
        result = await window.electronAPI.importSkillFromContent(workspaceId, content.trim())
      }

      if (result.success && result.skill) {
        setOpen(false)
        resetForm()
        onSuccess?.(result.skill.slug)
      } else {
        setError(result.error || t('skills.import.errorUnknown'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skills.import.errorUnknown'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Only render trigger in uncontrolled mode or when trigger is provided */}
      {(!isControlled || trigger) && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              {t('skills.import.button')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[500px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('skills.import.title')}</DialogTitle>
          <DialogDescription>
            {t('skills.import.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Switcher */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('url'); setError(null) }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors border",
                mode === 'url'
                  ? "bg-foreground/5 border-border"
                  : "bg-transparent border-transparent hover:bg-foreground/5"
              )}
            >
              <Link className="h-4 w-4" />
              {t('skills.import.modeUrl')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('content'); setError(null) }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors border",
                mode === 'content'
                  ? "bg-foreground/5 border-border"
                  : "bg-transparent border-transparent hover:bg-foreground/5"
              )}
            >
              <FileText className="h-4 w-4" />
              {t('skills.import.modeContent')}
            </button>
          </div>

          {/* URL Input */}
          {mode === 'url' && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="skill-url">
                {t('skills.import.urlLabel')}
              </label>
              <Input
                ref={inputRef}
                id="skill-url"
                placeholder={t('skills.import.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && url.trim()) {
                    handleImport()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t('skills.import.urlHint')}
              </p>
            </div>
          )}

          {/* Content Input */}
          {mode === 'content' && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="skill-content">
                {t('skills.import.contentLabel')}
              </label>
              <Textarea
                ref={textareaRef}
                id="skill-content"
                placeholder={t('skills.import.contentPlaceholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={loading}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={loading}>
            {loading && <Spinner className="mr-1.5" />}
            {t('skills.import.importButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
