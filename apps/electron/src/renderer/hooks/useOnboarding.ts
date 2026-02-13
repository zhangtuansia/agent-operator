import { useState, useCallback, useEffect } from 'react'
import type {
  OnboardingState,
  OnboardingStep,
  ApiSetupMethod,
} from '@/components/onboarding'
import type { ApiKeySubmitData } from '@/components/apisetup'
import type { SetupNeeds, GitBashStatus, LlmConnectionSetup } from '../../shared/types'

interface UseOnboardingOptions {
  onComplete: () => void
  initialSetupNeeds?: SetupNeeds
  initialStep?: OnboardingStep
  initialApiSetupMethod?: ApiSetupMethod
  onDismiss?: () => void
  onConfigSaved?: () => void
}

interface UseOnboardingReturn {
  state: OnboardingState
  handleContinue: () => void
  handleBack: () => void
  handleSelectApiSetupMethod: (method: ApiSetupMethod) => void
  handleSubmitCredential: (data: ApiKeySubmitData) => void
  handleStartOAuth: (methodOverride?: ApiSetupMethod) => void
  isWaitingForCode: boolean
  handleSubmitAuthCode: (code: string) => void
  handleCancelOAuth: () => void
  copilotDeviceCode?: { userCode: string; verificationUri: string }
  handleBrowseGitBash: () => Promise<string | null>
  handleUseGitBashPath: (path: string) => void
  handleRecheckGitBash: () => void
  handleClearError: () => void
  handleFinish: () => void
  handleCancel: () => void
  reset: () => void
}

function getPlatform(): GitBashStatus['platform'] {
  const value = navigator.platform.toLowerCase()
  if (value.includes('win')) return 'win32'
  if (value.includes('mac')) return 'darwin'
  return 'linux'
}

function apiSetupMethodToConnectionSetup(
  method: ApiSetupMethod,
  options: { credential?: string; baseUrl?: string; connectionDefaultModel?: string; models?: string[] }
): LlmConnectionSetup {
  switch (method) {
    case 'anthropic_api_key':
      return {
        slug: 'anthropic-api',
        credential: options.credential,
        baseUrl: options.baseUrl,
        defaultModel: options.connectionDefaultModel,
        models: options.models,
      }
    case 'claude_oauth':
      return {
        slug: 'claude-max',
        credential: options.credential,
      }
    case 'chatgpt_oauth':
      return {
        slug: 'codex',
        credential: options.credential,
      }
    case 'openai_api_key':
      return {
        slug: 'codex-api',
        credential: options.credential,
        baseUrl: options.baseUrl,
        defaultModel: options.connectionDefaultModel,
        models: options.models,
      }
    case 'copilot_oauth':
      return {
        slug: 'copilot',
        credential: options.credential,
      }
    case 'deepseek_api_key':
    case 'glm_api_key':
    case 'minimax_api_key':
      return {
        slug: 'anthropic-api',
        credential: options.credential,
        baseUrl: options.baseUrl,
        defaultModel: options.connectionDefaultModel,
        models: options.models,
      }
  }
}

export function useOnboarding({
  onComplete,
  initialSetupNeeds,
  initialStep = 'welcome',
  initialApiSetupMethod,
  onDismiss,
  onConfigSaved,
}: UseOnboardingOptions): UseOnboardingReturn {
  const [state, setState] = useState<OnboardingState>({
    step: initialStep,
    loginStatus: 'idle',
    credentialStatus: 'idle',
    completionStatus: 'saving',
    apiSetupMethod: initialApiSetupMethod ?? null,
    isExistingUser: initialSetupNeeds?.needsBillingConfig ?? false,
    gitBashStatus: undefined,
    isRecheckingGitBash: false,
    isCheckingGitBash: true,
  })

  useEffect(() => {
    const checkGitBash = async () => {
      try {
        const status = await window.electronAPI.checkGitBash()
        setState(s => ({ ...s, gitBashStatus: status, isCheckingGitBash: false }))
      } catch (error) {
        console.error('[Onboarding] Failed to check Git Bash:', error)
        setState(s => ({
          ...s,
          gitBashStatus: { found: true, path: null, platform: getPlatform() },
          isCheckingGitBash: false,
        }))
      }
    }
    checkGitBash()
  }, [])

  const handleSaveConfig = useCallback(async (
    credential?: string,
    options?: { baseUrl?: string; connectionDefaultModel?: string; models?: string[] }
  ) => {
    if (!state.apiSetupMethod) return

    setState(s => ({ ...s, completionStatus: 'saving' }))

    try {
      const setup = apiSetupMethodToConnectionSetup(state.apiSetupMethod, {
        credential,
        baseUrl: options?.baseUrl,
        connectionDefaultModel: options?.connectionDefaultModel,
        models: options?.models,
      })
      const result = await window.electronAPI.setupLlmConnection(setup)

      if (result.success) {
        setState(s => ({ ...s, completionStatus: 'complete' }))
        onConfigSaved?.()
      } else {
        setState(s => ({
          ...s,
          completionStatus: 'complete',
          errorMessage: result.error || 'Failed to save configuration',
        }))
      }
    } catch (error) {
      setState(s => ({
        ...s,
        completionStatus: 'complete',
        errorMessage: error instanceof Error ? error.message : 'Failed to save configuration',
      }))
    }
  }, [state.apiSetupMethod, onConfigSaved])

  const handleContinue = useCallback(async () => {
    switch (state.step) {
      case 'welcome':
        if (state.gitBashStatus?.platform === 'win32' && !state.gitBashStatus?.found) {
          setState(s => ({ ...s, step: 'git-bash' }))
        } else {
          setState(s => ({ ...s, step: 'api-setup' }))
        }
        break
      case 'git-bash':
        setState(s => ({ ...s, step: 'api-setup' }))
        break
      case 'api-setup':
        setState(s => ({ ...s, step: 'credentials' }))
        break
      case 'credentials':
        break
      case 'complete':
        onComplete()
        break
    }
  }, [state.step, state.gitBashStatus, onComplete])

  const handleBack = useCallback(() => {
    if (state.step === initialStep && onDismiss) {
      onDismiss()
      return
    }

    switch (state.step) {
      case 'git-bash':
        setState(s => ({ ...s, step: 'welcome' }))
        break
      case 'api-setup':
        if (state.gitBashStatus?.platform === 'win32' && state.gitBashStatus?.found === false) {
          setState(s => ({ ...s, step: 'git-bash' }))
        } else {
          setState(s => ({ ...s, step: 'welcome' }))
        }
        break
      case 'credentials':
        setState(s => ({ ...s, step: 'api-setup', credentialStatus: 'idle', errorMessage: undefined }))
        break
    }
  }, [state.step, state.gitBashStatus, initialStep, onDismiss])

  const handleSelectApiSetupMethod = useCallback((method: ApiSetupMethod) => {
    setState(s => ({ ...s, apiSetupMethod: method }))
  }, [])

  const handleSubmitCredential = useCallback(async (data: ApiKeySubmitData) => {
    setState(s => ({ ...s, credentialStatus: 'validating', errorMessage: undefined }))

    const isOpenAiFlow = state.apiSetupMethod === 'openai_api_key'

    try {
      if (isOpenAiFlow && !data.apiKey.trim()) {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: 'Please enter a valid OpenAI API key',
        }))
        return
      }

      if (!isOpenAiFlow && !data.apiKey.trim() && !data.baseUrl) {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: 'Please enter a valid API key',
        }))
        return
      }

      const models = data.models ?? (
        data.customModel
          ? data.customModel.split(',').map(m => m.trim()).filter(Boolean)
          : undefined
      )

      const testResult = isOpenAiFlow
        ? await window.electronAPI.testOpenAiConnection(data.apiKey, data.baseUrl, models)
        : await window.electronAPI.testApiConnection(data.apiKey, data.baseUrl, models)

      if (!testResult.success) {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: testResult.error || 'Connection test failed',
        }))
        return
      }

      await handleSaveConfig(data.apiKey, {
        baseUrl: data.baseUrl,
        connectionDefaultModel: data.connectionDefaultModel ?? models?.[0],
        models,
      })

      setState(s => ({
        ...s,
        credentialStatus: 'success',
        step: 'complete',
      }))
    } catch (error) {
      setState(s => ({
        ...s,
        credentialStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Validation failed',
      }))
    }
  }, [handleSaveConfig, state.apiSetupMethod])

  const [isWaitingForCode, setIsWaitingForCode] = useState(false)
  const [copilotDeviceCode, setCopilotDeviceCode] = useState<{ userCode: string; verificationUri: string } | undefined>()

  const handleStartOAuth = useCallback(async (methodOverride?: ApiSetupMethod) => {
    const effectiveMethod = methodOverride ?? state.apiSetupMethod

    if (methodOverride && methodOverride !== state.apiSetupMethod) {
      setState(s => ({
        ...s,
        apiSetupMethod: methodOverride,
        step: 'credentials',
        credentialStatus: 'validating',
        errorMessage: undefined,
      }))
    } else {
      setState(s => ({ ...s, credentialStatus: 'validating', errorMessage: undefined }))
    }

    if (!effectiveMethod) {
      setState(s => ({
        ...s,
        credentialStatus: 'error',
        errorMessage: 'Select an authentication method first.',
      }))
      return
    }

    try {
      if (effectiveMethod === 'chatgpt_oauth') {
        const connectionSlug = apiSetupMethodToConnectionSetup(effectiveMethod, {}).slug
        const result = await window.electronAPI.startChatGptOAuth(connectionSlug)
        if (result.success) {
          await handleSaveConfig(undefined)
          setState(s => ({ ...s, credentialStatus: 'success', step: 'complete' }))
        } else {
          setState(s => ({
            ...s,
            credentialStatus: 'error',
            errorMessage: result.error || 'ChatGPT authentication failed',
          }))
        }
        return
      }

      if (effectiveMethod === 'copilot_oauth') {
        const connectionSlug = apiSetupMethodToConnectionSetup(effectiveMethod, {}).slug
        const cleanup = window.electronAPI.onCopilotDeviceCode((data) => {
          setCopilotDeviceCode(data)
        })

        try {
          const result = await window.electronAPI.startCopilotOAuth(connectionSlug)
          if (result.success) {
            await handleSaveConfig(undefined)
            setState(s => ({ ...s, credentialStatus: 'success', step: 'complete' }))
          } else {
            setState(s => ({
              ...s,
              credentialStatus: 'error',
              errorMessage: result.error || 'GitHub authentication failed',
            }))
          }
        } finally {
          cleanup()
          setCopilotDeviceCode(undefined)
        }
        return
      }

      if (effectiveMethod !== 'claude_oauth') {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: 'This connection uses API keys, not OAuth.',
        }))
        return
      }

      const result = await window.electronAPI.startClaudeOAuth()
      if (result.success) {
        setIsWaitingForCode(true)
        setState(s => ({ ...s, credentialStatus: 'idle' }))
      } else {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: result.error || 'Failed to start OAuth',
        }))
      }
    } catch (error) {
      setState(s => ({
        ...s,
        credentialStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'OAuth failed',
      }))
    }
  }, [state.apiSetupMethod, handleSaveConfig])

  const handleSubmitAuthCode = useCallback(async (code: string) => {
    if (!code.trim()) {
      setState(s => ({
        ...s,
        credentialStatus: 'error',
        errorMessage: 'Please enter the authorization code',
      }))
      return
    }

    setState(s => ({ ...s, credentialStatus: 'validating', errorMessage: undefined }))

    try {
      const connectionSlug = apiSetupMethodToConnectionSetup('claude_oauth', {}).slug
      const result = await window.electronAPI.exchangeClaudeCode(code.trim(), connectionSlug)

      if (result.success && result.token) {
        setIsWaitingForCode(false)
        await handleSaveConfig(result.token)
        setState(s => ({ ...s, credentialStatus: 'success', step: 'complete' }))
      } else {
        setState(s => ({
          ...s,
          credentialStatus: 'error',
          errorMessage: result.error || 'Failed to exchange code',
        }))
      }
    } catch (error) {
      setState(s => ({
        ...s,
        credentialStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to exchange code',
      }))
    }
  }, [handleSaveConfig])

  const handleCancelOAuth = useCallback(async () => {
    setIsWaitingForCode(false)
    setState(s => ({ ...s, credentialStatus: 'idle', errorMessage: undefined }))
    await window.electronAPI.clearClaudeOAuthState()
  }, [])

  const handleBrowseGitBash = useCallback(async () => {
    return window.electronAPI.browseForGitBash()
  }, [])

  const handleUseGitBashPath = useCallback(async (path: string) => {
    const result = await window.electronAPI.setGitBashPath(path)
    if (result.success) {
      setState(s => ({
        ...s,
        gitBashStatus: { ...(s.gitBashStatus ?? { platform: 'win32', found: false, path: null }), found: true, path },
        step: 'api-setup',
      }))
    } else {
      setState(s => ({ ...s, errorMessage: result.error || 'Invalid path' }))
    }
  }, [])

  const handleRecheckGitBash = useCallback(async () => {
    setState(s => ({ ...s, isRecheckingGitBash: true }))
    try {
      const status = await window.electronAPI.checkGitBash()
      setState(s => ({
        ...s,
        gitBashStatus: status,
        isRecheckingGitBash: false,
        step: status.found ? 'api-setup' : s.step,
      }))
    } catch (error) {
      console.error('[Onboarding] Failed to recheck Git Bash:', error)
      setState(s => ({ ...s, isRecheckingGitBash: false }))
    }
  }, [])

  const handleClearError = useCallback(() => {
    setState(s => ({ ...s, errorMessage: undefined }))
  }, [])

  const handleFinish = useCallback(() => {
    onComplete()
  }, [onComplete])

  const handleCancel = useCallback(() => {
    setState(s => ({ ...s, step: 'welcome' }))
  }, [])

  const reset = useCallback(() => {
    setState({
      step: initialStep,
      loginStatus: 'idle',
      credentialStatus: 'idle',
      completionStatus: 'saving',
      apiSetupMethod: initialApiSetupMethod ?? null,
      isExistingUser: false,
      errorMessage: undefined,
      gitBashStatus: undefined,
      isRecheckingGitBash: false,
      isCheckingGitBash: false,
    })
    setIsWaitingForCode(false)
    setCopilotDeviceCode(undefined)
    window.electronAPI.clearClaudeOAuthState().catch(() => {})
  }, [initialStep, initialApiSetupMethod])

  return {
    state,
    handleContinue,
    handleBack,
    handleSelectApiSetupMethod,
    handleSubmitCredential,
    handleStartOAuth,
    isWaitingForCode,
    handleSubmitAuthCode,
    handleCancelOAuth,
    copilotDeviceCode,
    handleBrowseGitBash,
    handleUseGitBashPath,
    handleRecheckGitBash,
    handleClearError,
    handleFinish,
    handleCancel,
    reset,
  }
}
