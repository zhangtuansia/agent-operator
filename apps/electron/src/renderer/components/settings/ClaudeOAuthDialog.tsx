/**
 * ClaudeOAuthDialog
 *
 * Dialog content for Claude OAuth authentication flow.
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ExternalLink, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import { useLanguage } from '@/context/LanguageContext'

interface ClaudeOAuthDialogBaseProps {
  existingToken: string | null
  isLoading: boolean
  onUseExisting: () => void
  onStartOAuth: () => void
  onCancel: () => void
  status: 'idle' | 'loading' | 'success' | 'error'
  errorMessage?: string
}

export type ClaudeOAuthDialogProps = ClaudeOAuthDialogBaseProps &
  (
    | { isWaitingForCode: false }
    | {
        isWaitingForCode: true
        authCode: string
        onAuthCodeChange: (code: string) => void
        onSubmitAuthCode: (code: string) => void
      }
  )

export function ClaudeOAuthDialogContent(props: ClaudeOAuthDialogProps) {
  const { t } = useLanguage()
  const {
    existingToken,
    isLoading,
    onUseExisting,
    onStartOAuth,
    onCancel,
    status,
    errorMessage,
  } = props

  if (status === 'success') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" />
          {t('appSettings.claudeConnected')}
        </div>
      </div>
    )
  }

  // Waiting for authorization code entry
  if (props.isWaitingForCode) {
    const { authCode, onAuthCodeChange, onSubmitAuthCode } = props
    const trimmedCode = authCode.trim()

    const handleSubmit = () => {
      if (trimmedCode) {
        onSubmitAuthCode(trimmedCode)
      }
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('auth.enterAuthCodeDesc')}
        </p>
        <div className="space-y-2">
          <Label htmlFor="auth-code">{t('auth.authorizationCode')}</Label>
          <div className="relative rounded-md shadow-minimal transition-colors bg-foreground-2 focus-within:bg-background">
            <Input
              id="auth-code"
              type="text"
              value={authCode}
              onChange={(e) => onAuthCodeChange(e.target.value)}
              placeholder={t('misc.pasteAuthCode')}
              className="border-0 bg-transparent shadow-none font-mono text-sm"
              disabled={status === 'loading'}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit()
                }
              }}
            />
          </div>
          {status === 'error' && errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={status === 'loading'}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!trimmedCode || status === 'loading'}>
            {status === 'loading' ? (
              <>
                <Spinner className="mr-1.5" />
                {t('auth.connecting')}
              </>
            ) : (
              t('auth.connect')
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('appSettings.unlimitedAccess')}
      </p>
      <div className="flex items-center justify-end gap-2 pt-2">
        {existingToken ? (
          <Button onClick={onUseExisting} disabled={isLoading}>
            {status === 'loading' ? (
              <>
                <Spinner className="mr-1.5" />
                {t('auth.connecting')}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3 mr-1.5" />
                {t('auth.useExistingToken')}
              </>
            )}
          </Button>
        ) : (
          <Button onClick={onStartOAuth} disabled={isLoading}>
            {status === 'loading' ? (
              <>
                <Spinner className="mr-1.5" />
                {t('auth.connecting')}
              </>
            ) : (
              <>
                <ExternalLink className="size-3 mr-1.5" />
                {t('auth.signInWithClaude')}
              </>
            )}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
      </div>
      {existingToken && (
        <div className="text-center">
          <Button
            variant="link"
            onClick={onStartOAuth}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('auth.signInDifferentAccount')}
          </Button>
        </div>
      )}
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  )
}
