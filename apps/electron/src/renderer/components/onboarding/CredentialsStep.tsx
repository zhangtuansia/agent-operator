import { useEffect, useState } from "react"
import { Check, ExternalLink } from "lucide-react"
import type { ApiSetupMethod } from "./APISetupStep"
import { getThirdPartyProviderInfo } from "./APISetupStep"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import {
  ApiKeyInput,
  type ApiKeyStatus,
  type ApiKeySubmitData,
  OAuthConnect,
  type OAuthStatus,
} from "../apisetup"
import { useTranslation } from "@/i18n"

export type CredentialStatus = ApiKeyStatus | OAuthStatus

interface CredentialsStepProps {
  apiSetupMethod: ApiSetupMethod
  status: CredentialStatus
  errorMessage?: string
  onSubmit: (data: ApiKeySubmitData) => void
  onStartOAuth?: (methodOverride?: ApiSetupMethod) => void
  onBack: () => void
  isWaitingForCode?: boolean
  onSubmitAuthCode?: (code: string) => void
  onCancelOAuth?: () => void
  copilotDeviceCode?: { userCode: string; verificationUri: string }
}

export function CredentialsStep({
  apiSetupMethod,
  status,
  errorMessage,
  onSubmit,
  onStartOAuth,
  onBack,
  isWaitingForCode,
  onSubmitAuthCode,
  onCancelOAuth,
  copilotDeviceCode,
}: CredentialsStepProps) {
  const { t } = useTranslation()
  const isClaudeOAuth = apiSetupMethod === 'claude_oauth'
  const isChatGptOAuth = apiSetupMethod === 'chatgpt_oauth'
  const isCopilotOAuth = apiSetupMethod === 'copilot_oauth'
  const isAnthropicApiKey = apiSetupMethod === 'anthropic_api_key'
  const isOpenAiApiKey = apiSetupMethod === 'openai_api_key'
  const thirdPartyInfo = getThirdPartyProviderInfo(apiSetupMethod)
  const isThirdParty = !!thirdPartyInfo
  const isApiKey = isAnthropicApiKey || isOpenAiApiKey || isThirdParty

  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    if (copilotDeviceCode?.userCode) {
      navigator.clipboard.writeText(copilotDeviceCode.userCode).then(() => {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      }).catch(() => {
        // noop
      })
    }
  }, [copilotDeviceCode?.userCode])

  const handleCopyCode = () => {
    if (!copilotDeviceCode?.userCode) return
    navigator.clipboard.writeText(copilotDeviceCode.userCode).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }).catch(() => {
      // noop
    })
  }

  if (isChatGptOAuth) {
    return (
      <StepFormLayout
        title={t('onboarding.connectChatGpt')}
        description={t('onboarding.connectChatGptDesc')}
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'}>{t('onboarding.back')}</BackButton>
            <ContinueButton
              onClick={() => onStartOAuth?.()}
              className="gap-2"
              loading={status === 'validating'}
              loadingText={t('onboarding.connectingDots')}
            >
              <ExternalLink className="size-4" />
              {t('onboarding.signInWithChatGpt')}
            </ContinueButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-foreground-2 p-4 text-sm text-muted-foreground">
            <p>{t('onboarding.chatGptAuthHint')}</p>
          </div>
          {status === 'error' && errorMessage && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3">
              {errorMessage}
            </div>
          )}
          {status === 'success' && (
            <div className="rounded-lg bg-success/10 text-success text-sm p-3">
              {t('onboarding.chatGptConnected')}
            </div>
          )}
        </div>
      </StepFormLayout>
    )
  }

  if (isCopilotOAuth) {
    return (
      <StepFormLayout
        title={t('onboarding.connectCopilot')}
        description={t('onboarding.connectCopilotDesc')}
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'}>{t('onboarding.back')}</BackButton>
            <ContinueButton
              onClick={() => onStartOAuth?.()}
              className="gap-2"
              loading={status === 'validating'}
              loadingText={t('onboarding.waitingForAuth')}
            >
              <ExternalLink className="size-4" />
              {t('onboarding.signInWithGithub')}
            </ContinueButton>
          </>
        }
      >
        <div className="space-y-4">
          {copilotDeviceCode ? (
            <div className="rounded-xl bg-foreground-2 p-4 text-sm space-y-3">
              <p className="text-muted-foreground text-center">
                {t('onboarding.copilotDeviceCodePrompt')}
              </p>
              <div className="flex flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-2xl font-mono font-bold tracking-widest text-foreground px-4 py-2 rounded-lg bg-background border border-border hover:bg-foreground-2 transition-colors cursor-pointer"
                >
                  {copilotDeviceCode.userCode}
                </button>
                <span className={`text-xs text-muted-foreground flex items-center gap-1 transition-opacity ${copiedCode ? 'opacity-100' : 'opacity-0'}`}>
                  <Check className="size-3" />
                  {t('onboarding.copiedToClipboard')}
                </span>
              </div>
              <p className="text-muted-foreground text-xs text-center">
                {t('onboarding.copilotDeviceCodeBrowserHint')}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-foreground-2 p-4 text-sm text-muted-foreground text-center">
              <p>{t('onboarding.copilotAuthHint')}</p>
            </div>
          )}
          {status === 'error' && errorMessage && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3 text-center">
              {errorMessage}
            </div>
          )}
          {status === 'success' && (
            <div className="rounded-lg bg-success/10 text-success text-sm p-3 text-center">
              {t('onboarding.copilotConnected')}
            </div>
          )}
        </div>
      </StepFormLayout>
    )
  }

  if (isClaudeOAuth) {
    if (isWaitingForCode) {
      return (
        <StepFormLayout
          title={t('onboarding.enterAuthCode')}
          description={t('onboarding.enterAuthCodeDesc')}
          actions={
            <>
              <BackButton onClick={onCancelOAuth} disabled={status === 'validating'}>{t('onboarding.cancel')}</BackButton>
              <ContinueButton
                type="submit"
                form="auth-code-form"
                disabled={false}
                loading={status === 'validating'}
                loadingText={t('onboarding.connectingDots')}
              >
                {t('onboarding.continue')}
              </ContinueButton>
            </>
          }
        >
          <OAuthConnect
            status={status as OAuthStatus}
            errorMessage={errorMessage}
            isWaitingForCode={true}
            onStartOAuth={onStartOAuth!}
            onSubmitAuthCode={onSubmitAuthCode}
            onCancelOAuth={onCancelOAuth}
          />
        </StepFormLayout>
      )
    }

    return (
      <StepFormLayout
        title={t('onboarding.connectClaudeAccount')}
        description={t('onboarding.connectClaudeAccountDesc')}
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'}>{t('onboarding.back')}</BackButton>
            <ContinueButton
              onClick={() => onStartOAuth?.()}
              className="gap-2"
              loading={status === 'validating'}
              loadingText={t('onboarding.connectingDots')}
            >
              <ExternalLink className="size-4" />
              {t('onboarding.signInWithClaude')}
            </ContinueButton>
          </>
        }
      >
        <OAuthConnect
          status={status as OAuthStatus}
          errorMessage={errorMessage}
          isWaitingForCode={false}
          onStartOAuth={onStartOAuth!}
          onSubmitAuthCode={onSubmitAuthCode}
          onCancelOAuth={onCancelOAuth}
        />
      </StepFormLayout>
    )
  }

  if (!isApiKey) {
    return null
  }

  const providerType = isOpenAiApiKey ? 'openai' : 'anthropic'
  const apiKeyDescription = isThirdParty
    ? t('onboarding.thirdPartyApiKeyDesc')
    : isOpenAiApiKey
      ? t('onboarding.openAiApiKeyDesc')
      : t('onboarding.anthropicApiKeyDesc')

  return (
    <StepFormLayout
      title={t('onboarding.apiConfiguration')}
      description={apiKeyDescription}
      actions={
        <>
          <BackButton onClick={onBack} disabled={status === 'validating'}>{t('onboarding.back')}</BackButton>
          <ContinueButton
            type="submit"
            form="api-key-form"
            disabled={false}
            loading={status === 'validating'}
            loadingText={t('onboarding.validatingDots')}
          >
            {t('onboarding.continue')}
          </ContinueButton>
        </>
      }
    >
      <ApiKeyInput
        status={status as ApiKeyStatus}
        errorMessage={errorMessage}
        onSubmit={onSubmit}
        providerType={providerType}
        initialBaseUrl={thirdPartyInfo?.baseUrl}
        initialModel={thirdPartyInfo?.models.join(', ')}
      />
    </StepFormLayout>
  )
}
