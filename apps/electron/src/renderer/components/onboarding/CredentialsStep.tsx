import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from "lucide-react"
import { Spinner } from "@agent-operator/ui"
import type { BillingMethod } from "./BillingMethodStep"
import { StepFormLayout, BackButton, ContinueButton, type StepIconVariant } from "./primitives"

export type CredentialStatus = 'idle' | 'validating' | 'success' | 'error'

export type ApiFormat = 'anthropic' | 'openai'

export interface ProviderCredentials {
  apiKey: string
  baseURL: string
  apiFormat: ApiFormat
}

// Provider default configurations
export const PROVIDER_DEFAULTS: Record<string, {
  name: string
  baseURL: string
  docsUrl: string
  apiFormat: ApiFormat
  placeholder: string
}> = {
  api_key: {
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    docsUrl: 'console.anthropic.com',
    apiFormat: 'anthropic',
    placeholder: 'sk-ant-...',
  },
  minimax: {
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    docsUrl: 'platform.minimaxi.com',
    apiFormat: 'anthropic',
    placeholder: 'eyJhbG...',
  },
  glm: {
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    docsUrl: 'open.bigmodel.cn',
    apiFormat: 'anthropic',
    placeholder: 'your-api-key',
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    docsUrl: 'platform.deepseek.com',
    apiFormat: 'openai',
    placeholder: 'sk-...',
  },
  custom: {
    name: 'Custom Endpoint',
    baseURL: '',
    docsUrl: '',
    apiFormat: 'anthropic',
    placeholder: 'your-api-key',
  },
}

interface CredentialsStepProps {
  billingMethod: BillingMethod
  status: CredentialStatus
  errorMessage?: string
  onSubmit: (credential: string) => void
  onSubmitProvider?: (credentials: ProviderCredentials) => void
  onStartOAuth?: () => void
  onBack: () => void
  // Claude OAuth specific
  existingClaudeToken?: string | null
  isClaudeCliInstalled?: boolean
  onUseExistingClaudeToken?: () => void
  // Two-step OAuth flow
  isWaitingForCode?: boolean
  onSubmitAuthCode?: (code: string) => void
  onCancelOAuth?: () => void
}

function getOAuthIcon(status: CredentialStatus): React.ReactNode {
  switch (status) {
    case 'idle': return undefined
    case 'validating': return <Spinner className="text-2xl" />
    case 'success': return <CheckCircle2 />
    case 'error': return <XCircle />
  }
}

function getOAuthIconVariant(status: CredentialStatus): StepIconVariant {
  switch (status) {
    case 'idle': return 'primary'
    case 'validating': return 'loading'
    case 'success': return 'success'
    case 'error': return 'error'
  }
}

const OAUTH_STATUS_CONTENT: Record<CredentialStatus, { title: string; description: string }> = {
  idle: {
    title: 'Connect Claude Account',
    description: 'Use your Claude subscription to power multi-agent workflows.',
  },
  validating: {
    title: 'Connecting...',
    description: 'Waiting for authentication to complete...',
  },
  success: {
    title: 'Connected!',
    description: 'Your Claude account is connected.',
  },
  error: {
    title: 'Connection failed',
    description: '', // Will use errorMessage prop
  },
}

/**
 * CredentialsStep - Enter API key or start OAuth flow
 *
 * For API Key: Shows input field with validation
 * For Claude OAuth: Shows button to start OAuth flow
 */
export function CredentialsStep({
  billingMethod,
  status,
  errorMessage,
  onSubmit,
  onSubmitProvider,
  onStartOAuth,
  onBack,
  existingClaudeToken,
  isClaudeCliInstalled,
  onUseExistingClaudeToken,
  // Two-step OAuth flow
  isWaitingForCode,
  onSubmitAuthCode,
  onCancelOAuth,
}: CredentialsStepProps) {
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [authCode, setAuthCode] = useState('')

  // Provider-specific state
  const providerConfig = PROVIDER_DEFAULTS[billingMethod]
  const [baseURL, setBaseURL] = useState(providerConfig?.baseURL || '')
  const [apiFormat, setApiFormat] = useState<ApiFormat>(providerConfig?.apiFormat || 'anthropic')

  const isApiKey = billingMethod === 'api_key'
  const isOAuth = billingMethod === 'claude_oauth'
  const isProvider = ['minimax', 'glm', 'deepseek', 'custom'].includes(billingMethod)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      onSubmit(value.trim())
    }
  }

  const handleProviderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim() && baseURL.trim() && onSubmitProvider) {
      onSubmitProvider({
        apiKey: value.trim(),
        baseURL: baseURL.trim(),
        apiFormat,
      })
    }
  }

  // Handle auth code submission
  const handleAuthCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (authCode.trim() && onSubmitAuthCode) {
      onSubmitAuthCode(authCode.trim())
    }
  }

  // OAuth flow
  if (isOAuth) {
    const content = OAUTH_STATUS_CONTENT[status]

    // Check if we have existing token from keychain
    const hasExistingToken = !!existingClaudeToken

    // Waiting for authorization code entry
    if (isWaitingForCode) {
      return (
        <StepFormLayout
          title="Enter Authorization Code"
          description="Copy the code from the browser page and paste it below."
          actions={
            <>
              <BackButton onClick={onCancelOAuth} disabled={status === 'validating'}>Cancel</BackButton>
              <ContinueButton
                type="submit"
                form="auth-code-form"
                disabled={!authCode.trim()}
                loading={status === 'validating'}
                loadingText="Connecting..."
              />
            </>
          }
        >
          <form id="auth-code-form" onSubmit={handleAuthCodeSubmit}>
            <div className="space-y-2">
              <Label htmlFor="auth-code">Authorization Code</Label>
              <div className={cn(
                "relative rounded-md shadow-minimal transition-colors",
                "bg-foreground-2 focus-within:bg-background"
              )}>
                <Input
                  id="auth-code"
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste your authorization code here"
                  className={cn(
                    "border-0 bg-transparent shadow-none font-mono text-sm",
                    status === 'error' && "focus-visible:ring-destructive"
                  )}
                  disabled={status === 'validating'}
                  autoFocus
                />
              </div>
              {status === 'error' && errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
            </div>
          </form>
        </StepFormLayout>
      )
    }

    const actions = (
      <>
        {status === 'idle' && (
          <>
            <BackButton onClick={onBack} />
            {hasExistingToken ? (
              <ContinueButton onClick={onUseExistingClaudeToken} className="gap-2">
                <CheckCircle2 className="size-4" />
                Use Existing Token
              </ContinueButton>
            ) : (
              <ContinueButton onClick={onStartOAuth} className="gap-2">
                <ExternalLink className="size-4" />
                Sign in with Claude
              </ContinueButton>
            )}
          </>
        )}

        {status === 'validating' && (
          <BackButton onClick={onBack} className="w-full">Cancel</BackButton>
        )}

        {status === 'error' && (
          <>
            <BackButton onClick={onBack} />
            <ContinueButton onClick={hasExistingToken ? onUseExistingClaudeToken : onStartOAuth}>
              Try Again
            </ContinueButton>
          </>
        )}
      </>
    )

    // Dynamic description based on state
    let description = content.description
    if (status === 'idle') {
      if (hasExistingToken && existingClaudeToken) {
        // Show preview of detected token (first 20 chars)
        const tokenPreview = existingClaudeToken.length > 20
          ? `${existingClaudeToken.slice(0, 20)}...`
          : existingClaudeToken
        description = `Found existing token: ${tokenPreview}`
      } else {
        description = 'Click below to sign in with your Claude Pro or Max subscription.'
      }
    }

    return (
      <StepFormLayout
        icon={getOAuthIcon(status)}
        iconVariant={getOAuthIconVariant(status)}
        title={content.title}
        description={status === 'error' ? (errorMessage || 'Something went wrong. Please try again.') : description}
        actions={actions}
      >
        {/* Show secondary option if we have an existing token */}
        {status === 'idle' && hasExistingToken && (
          <div className="text-center">
            <button
              onClick={onStartOAuth}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Or sign in with a different account
            </button>
          </div>
        )}
      </StepFormLayout>
    )
  }

  // Provider flow (MiniMax, GLM, DeepSeek, Custom)
  if (isProvider && providerConfig) {
    const isCustom = billingMethod === 'custom'

    return (
      <StepFormLayout
        title={providerConfig.name}
        description={
          providerConfig.docsUrl ? (
            <>
              Get your API key from{' '}
              <a
                href={`https://${providerConfig.docsUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                {providerConfig.docsUrl}
              </a>
            </>
          ) : (
            'Enter your API endpoint and key'
          )
        }
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'} />
            <ContinueButton
              type="submit"
              form="provider-form"
              disabled={!value.trim() || !baseURL.trim()}
              loading={status === 'validating'}
              loadingText="Validating..."
            />
          </>
        }
      >
        <form id="provider-form" onSubmit={handleProviderSubmit}>
          <div className="space-y-4">
            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="provider-key">API Key</Label>
              <div className={cn(
                "relative rounded-md shadow-minimal transition-colors",
                "bg-foreground-2 focus-within:bg-background"
              )}>
                <Input
                  id="provider-key"
                  type={showValue ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={providerConfig.placeholder}
                  className={cn(
                    "pr-10 border-0 bg-transparent shadow-none",
                    status === 'error' && "focus-visible:ring-destructive"
                  )}
                  disabled={status === 'validating'}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showValue ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label htmlFor="provider-url">API Base URL</Label>
              <div className={cn(
                "relative rounded-md shadow-minimal transition-colors",
                "bg-foreground-2 focus-within:bg-background"
              )}>
                <Input
                  id="provider-url"
                  type="text"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="border-0 bg-transparent shadow-none font-mono text-sm"
                  disabled={status === 'validating'}
                />
              </div>
            </div>

            {/* API Format (only for custom) */}
            {isCustom && (
              <div className="space-y-2">
                <Label>API Format</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="api-format"
                      checked={apiFormat === 'anthropic'}
                      onChange={() => setApiFormat('anthropic')}
                      className="size-4"
                      disabled={status === 'validating'}
                    />
                    <span className="text-sm">Anthropic Compatible</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="api-format"
                      checked={apiFormat === 'openai'}
                      onChange={() => setApiFormat('openai')}
                      className="size-4"
                      disabled={status === 'validating'}
                    />
                    <span className="text-sm">OpenAI Compatible</span>
                  </label>
                </div>
              </div>
            )}

            {status === 'error' && errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
        </form>
      </StepFormLayout>
    )
  }

  // API Key flow (Anthropic)
  return (
    <StepFormLayout
      title="Enter API Key"
      description={
        <>
          Get your API key from{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            console.anthropic.com
          </a>
        </>
      }
      actions={
        <>
          <BackButton onClick={onBack} disabled={status === 'validating'} />
          <ContinueButton
            type="submit"
            form="api-key-form"
            disabled={!value.trim()}
            loading={status === 'validating'}
            loadingText="Validating..."
          />
        </>
      }
    >
      <form id="api-key-form" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="api-key">Anthropic API Key</Label>
          <div className={cn(
            "relative rounded-md shadow-minimal transition-colors",
            "bg-foreground-2 focus-within:bg-background"
          )}>
            <Input
              id="api-key"
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-ant-..."
              className={cn(
                "pr-10 border-0 bg-transparent shadow-none",
                status === 'error' && "focus-visible:ring-destructive"
              )}
              disabled={status === 'validating'}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showValue ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {status === 'error' && errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
      </form>
    </StepFormLayout>
  )
}
