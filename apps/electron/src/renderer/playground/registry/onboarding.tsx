import type { ComponentEntry } from './types'
import { WelcomeStep } from '@/components/onboarding/WelcomeStep'
import { APISetupStep } from '@/components/onboarding/APISetupStep'
import { CredentialsStep } from '@/components/onboarding/CredentialsStep'
import { CompletionStep } from '@/components/onboarding/CompletionStep'
import { GitBashWarning, type GitBashStatus } from '@/components/onboarding/GitBashWarning'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import type { OnboardingState } from '@/components/onboarding/OnboardingWizard'

const createOnboardingState = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  step: 'welcome',
  loginStatus: 'idle',
  credentialStatus: 'idle',
  completionStatus: 'complete',
  apiSetupMethod: null,
  isExistingUser: false,
  gitBashStatus: { found: false, path: null, platform: 'win32' },
  isRecheckingGitBash: false,
  isCheckingGitBash: false,
  ...overrides,
})

const noopHandler = () => console.log('[Playground] Action triggered')

export const onboardingComponents: ComponentEntry[] = [
  {
    id: 'welcome-step',
    name: 'WelcomeStep',
    category: 'Onboarding',
    description: 'Initial welcome screen',
    component: WelcomeStep,
    props: [
      {
        name: 'isExistingUser',
        description: 'Show update settings mode',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'isLoading',
        description: 'Loading state for continue',
        control: { type: 'boolean' },
        defaultValue: false,
      },
    ],
    variants: [
      { name: 'New User', props: { isExistingUser: false } },
      { name: 'Existing User', props: { isExistingUser: true } },
      { name: 'Loading', props: { isLoading: true } },
    ],
    mockData: () => ({
      onContinue: noopHandler,
    }),
  },
  {
    id: 'api-setup-step',
    name: 'APISetupStep',
    category: 'Onboarding',
    description: 'Choose API setup method',
    component: APISetupStep,
    props: [
      {
        name: 'selectedMethod',
        description: 'Selected method',
        control: {
          type: 'select',
          options: [
            { label: 'None', value: '' },
            { label: 'Claude OAuth', value: 'claude_oauth' },
            { label: 'Anthropic API Key', value: 'anthropic_api_key' },
            { label: 'ChatGPT OAuth', value: 'chatgpt_oauth' },
            { label: 'OpenAI API Key', value: 'openai_api_key' },
            { label: 'Copilot OAuth', value: 'copilot_oauth' },
          ],
        },
        defaultValue: '',
      },
      {
        name: 'initialSegment',
        description: 'Initial provider segment',
        control: {
          type: 'select',
          options: [
            { label: 'Anthropic', value: 'anthropic' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'Copilot', value: 'copilot' },
          ],
        },
        defaultValue: 'anthropic',
      },
    ],
    variants: [
      { name: 'Anthropic', props: { selectedMethod: null, initialSegment: 'anthropic' } },
      { name: 'OpenAI', props: { selectedMethod: null, initialSegment: 'openai' } },
      { name: 'Copilot', props: { selectedMethod: null, initialSegment: 'copilot' } },
    ],
    mockData: () => ({
      onSelect: (method: string) => console.log('[Playground] Selected method:', method),
      onContinue: noopHandler,
      onBack: noopHandler,
    }),
  },
  {
    id: 'credentials-step-api-key',
    name: 'Credentials - API Key',
    category: 'Onboarding',
    description: 'API key flow',
    component: CredentialsStep,
    props: [
      {
        name: 'status',
        description: 'Credential status',
        control: {
          type: 'select',
          options: [
            { label: 'Idle', value: 'idle' },
            { label: 'Validating', value: 'validating' },
            { label: 'Success', value: 'success' },
            { label: 'Error', value: 'error' },
          ],
        },
        defaultValue: 'idle',
      },
      {
        name: 'errorMessage',
        description: 'Error message',
        control: { type: 'string', placeholder: 'Error message' },
        defaultValue: '',
      },
    ],
    variants: [
      { name: 'Idle', props: { apiSetupMethod: 'anthropic_api_key', status: 'idle' } },
      { name: 'Validating', props: { apiSetupMethod: 'anthropic_api_key', status: 'validating' } },
      { name: 'Success', props: { apiSetupMethod: 'anthropic_api_key', status: 'success' } },
      { name: 'Error', props: { apiSetupMethod: 'anthropic_api_key', status: 'error', errorMessage: 'Invalid API key.' } },
    ],
    mockData: () => ({
      apiSetupMethod: 'anthropic_api_key',
      onSubmit: (data: { apiKey: string; baseUrl?: string; connectionDefaultModel?: string; models?: string[] }) => console.log('[Playground] Submitted:', data),
      onStartOAuth: noopHandler,
      onBack: noopHandler,
    }),
  },
  {
    id: 'credentials-step-oauth',
    name: 'Credentials - Claude OAuth',
    category: 'Onboarding',
    description: 'Claude OAuth flow',
    component: CredentialsStep,
    props: [
      {
        name: 'status',
        description: 'OAuth status',
        control: {
          type: 'select',
          options: [
            { label: 'Idle', value: 'idle' },
            { label: 'Validating', value: 'validating' },
            { label: 'Success', value: 'success' },
            { label: 'Error', value: 'error' },
          ],
        },
        defaultValue: 'idle',
      },
      {
        name: 'isWaitingForCode',
        description: 'Auth code step',
        control: { type: 'boolean' },
        defaultValue: false,
      },
    ],
    variants: [
      { name: 'Idle', props: { apiSetupMethod: 'claude_oauth', status: 'idle' } },
      { name: 'Waiting', props: { apiSetupMethod: 'claude_oauth', status: 'idle', isWaitingForCode: true } },
      { name: 'Error', props: { apiSetupMethod: 'claude_oauth', status: 'error', errorMessage: 'Authorization failed.' } },
    ],
    mockData: () => ({
      apiSetupMethod: 'claude_oauth',
      onSubmit: noopHandler,
      onStartOAuth: noopHandler,
      onBack: noopHandler,
      onSubmitAuthCode: (code: string) => console.log('[Playground] Code:', code),
      onCancelOAuth: noopHandler,
    }),
  },
  {
    id: 'credentials-step-copilot',
    name: 'Credentials - Copilot OAuth',
    category: 'Onboarding',
    description: 'Copilot device flow',
    component: CredentialsStep,
    props: [
      {
        name: 'status',
        description: 'OAuth status',
        control: {
          type: 'select',
          options: [
            { label: 'Idle', value: 'idle' },
            { label: 'Validating', value: 'validating' },
            { label: 'Success', value: 'success' },
            { label: 'Error', value: 'error' },
          ],
        },
        defaultValue: 'idle',
      },
    ],
    variants: [
      { name: 'Idle', props: { apiSetupMethod: 'copilot_oauth', status: 'idle' } },
      { name: 'Device Code', props: { apiSetupMethod: 'copilot_oauth', status: 'validating', copilotDeviceCode: { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' } } },
      { name: 'Success', props: { apiSetupMethod: 'copilot_oauth', status: 'success' } },
    ],
    mockData: () => ({
      apiSetupMethod: 'copilot_oauth',
      onSubmit: noopHandler,
      onStartOAuth: noopHandler,
      onBack: noopHandler,
    }),
  },
  {
    id: 'completion-step',
    name: 'CompletionStep',
    category: 'Onboarding',
    description: 'Onboarding completion',
    component: CompletionStep,
    props: [
      {
        name: 'status',
        description: 'Completion status',
        control: {
          type: 'select',
          options: [
            { label: 'Saving', value: 'saving' },
            { label: 'Complete', value: 'complete' },
          ],
        },
        defaultValue: 'complete',
      },
    ],
    variants: [
      { name: 'Saving', props: { status: 'saving' } },
      { name: 'Complete', props: { status: 'complete' } },
    ],
    mockData: () => ({
      onFinish: noopHandler,
    }),
  },
  {
    id: 'git-bash-warning',
    name: 'GitBashWarning',
    category: 'Onboarding',
    description: 'Git Bash missing warning',
    component: GitBashWarning,
    props: [],
    variants: [
      { name: 'Default', props: { status: { found: false, path: null, platform: 'win32' } as GitBashStatus } },
      { name: 'Rechecking', props: { status: { found: false, path: null, platform: 'win32' } as GitBashStatus, isRechecking: true } },
    ],
    mockData: () => ({
      status: { found: false, path: null, platform: 'win32' } as GitBashStatus,
      onBrowse: async () => 'C:\\Program Files\\Git\\bin\\bash.exe',
      onUsePath: (path: string) => console.log('[Playground] Use path:', path),
      onRecheck: noopHandler,
      onBack: noopHandler,
      onClearError: noopHandler,
    }),
  },
  {
    id: 'onboarding-wizard',
    name: 'OnboardingWizard',
    category: 'Onboarding',
    description: 'Full onboarding flow',
    component: OnboardingWizard,
    props: [],
    variants: [
      { name: 'Welcome', props: { state: createOnboardingState({ step: 'welcome' }) } },
      { name: 'API Setup', props: { state: createOnboardingState({ step: 'api-setup' }) } },
      { name: 'Credentials', props: { state: createOnboardingState({ step: 'credentials', apiSetupMethod: 'anthropic_api_key' }) } },
      { name: 'Complete', props: { state: createOnboardingState({ step: 'complete', completionStatus: 'complete' }) } },
    ],
    mockData: () => ({
      state: createOnboardingState(),
      className: 'min-h-0 h-full',
      onContinue: noopHandler,
      onBack: noopHandler,
      onSelectApiSetupMethod: (method: string) => console.log('[Playground] Method:', method),
      onSubmitCredential: (data: { apiKey: string; baseUrl?: string; connectionDefaultModel?: string; models?: string[] }) => console.log('[Playground] Submitted:', data),
      onStartOAuth: noopHandler,
      onFinish: noopHandler,
      onBrowseGitBash: async () => 'C:\\Program Files\\Git\\bin\\bash.exe',
      onUseGitBashPath: (path: string) => console.log('[Playground] Git Bash path:', path),
      onRecheckGitBash: noopHandler,
      onClearError: noopHandler,
    }),
  },
]
