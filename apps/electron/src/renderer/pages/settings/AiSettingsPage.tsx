/**
 * AiSettingsPage
 *
 * Unified AI settings page that consolidates all LLM-related configuration:
 * - Default connection, model, and thinking level
 * - Per-workspace overrides
 * - Connection management (add/edit/delete)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCcw,
} from 'lucide-react'
import type {
  CredentialHealthIssue,
  LlmConnection,
  LlmConnectionWithStatus,
  ThinkingLevel,
  WorkspaceSettings,
  Workspace,
} from '../../../shared/types'
import { Spinner } from '@agent-operator/ui'
import { motion, AnimatePresence } from 'motion/react'
import { DEFAULT_THINKING_LEVEL, THINKING_LEVELS } from '@agent-operator/shared/agent/thinking-levels'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import { cn } from '@/lib/utils'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsMenuSelectRow,
  SettingsInput,
  SettingsSecretInput,
  SettingsTextarea,
} from '@/components/settings'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkspaceIcon } from '@/hooks/useWorkspaceIcon'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLanguage } from '@/context/LanguageContext'
import { getModelShortName, type ModelDefinition } from '@config/models'
import {
  getModelsForProviderType,
  getDefaultModelsForConnection,
  getDefaultModelForConnection,
  generateSlug,
  isValidProviderAuthCombination,
  type LlmProviderType,
  type LlmAuthType,
} from '@config/llm-connections'

/**
 * Derive model dropdown options from a connection's models array,
 * falling back to registry models for the connection's provider type.
 */
function getModelOptionsForConnection(
  connection: LlmConnectionWithStatus | undefined,
): Array<{ value: string; label: string; description: string }> {
  if (!connection) return []

  if (connection.models && connection.models.length > 0) {
    return connection.models.map((m) => {
      if (typeof m === 'string') {
        return { value: m, label: getModelShortName(m), description: '' }
      }
      const def = m as ModelDefinition
      return { value: def.id, label: def.name, description: def.description }
    })
  }

  const registryModels = getModelsForProviderType(connection.providerType)
  return registryModels.map((m) => ({
    value: m.id,
    label: m.name,
    description: m.description,
  }))
}

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'api',
}

type ValidationState = 'idle' | 'validating' | 'success' | 'error'

const PROVIDER_TYPES: LlmProviderType[] = [
  'anthropic',
  'openai',
  'copilot',
  'anthropic_compat',
  'openai_compat',
  'bedrock',
  'vertex',
]

const AUTH_TYPE_ORDER: LlmAuthType[] = [
  'api_key',
  'api_key_with_endpoint',
  'oauth',
  'bearer_token',
  'environment',
  'none',
  'iam_credentials',
  'service_account_file',
]

function getProviderLabel(provider: string, t: (key: string) => string): string {
  switch (provider) {
    case 'anthropic':
      return t('apiSettings.providerAnthropic')
    case 'anthropic_compat':
      return t('apiSettings.aiPage.providerAnthropicCompat')
    case 'openai':
      return t('apiSettings.aiPage.providerOpenAI')
    case 'openai_compat':
      return t('apiSettings.aiPage.providerOpenAICompat')
    case 'copilot':
      return t('apiSettings.aiPage.providerCopilot')
    case 'bedrock':
      return t('apiSettings.providerBedrock')
    case 'vertex':
      return t('apiSettings.aiPage.providerVertex')
    default:
      return t('apiSettings.aiPage.unknownProvider')
  }
}

function getProviderDescription(provider: string, t: (key: string) => string): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic API'
    case 'anthropic_compat':
      return t('apiSettings.aiPage.providerAnthropicCompat')
    case 'openai':
      return 'OpenAI API'
    case 'openai_compat':
      return t('apiSettings.aiPage.providerOpenAICompat')
    case 'copilot':
      return 'GitHub Copilot'
    case 'bedrock':
      return 'AWS Bedrock'
    case 'vertex':
      return 'Google Vertex'
    default:
      return t('apiSettings.aiPage.unknownProvider')
  }
}

function getAuthTypeLabel(authType: LlmAuthType, t: (key: string) => string): string {
  switch (authType) {
    case 'api_key':
      return t('apiSettings.aiPage.authApiKey')
    case 'api_key_with_endpoint':
      return t('apiSettings.aiPage.authApiKeyWithEndpoint')
    case 'oauth':
      return t('apiSettings.aiPage.authOAuth')
    case 'bearer_token':
      return t('apiSettings.aiPage.authBearerToken')
    case 'environment':
      return t('apiSettings.aiPage.authEnvironment')
    case 'none':
      return t('apiSettings.aiPage.authNone')
    case 'iam_credentials':
      return t('apiSettings.aiPage.authIamCredentials')
    case 'service_account_file':
      return t('apiSettings.aiPage.authServiceAccountFile')
    default:
      return authType
  }
}

function defaultAuthForProvider(providerType: LlmProviderType): LlmAuthType {
  switch (providerType) {
    case 'anthropic':
      return 'api_key'
    case 'anthropic_compat':
      return 'api_key_with_endpoint'
    case 'openai':
      return 'api_key'
    case 'openai_compat':
      return 'api_key_with_endpoint'
    case 'copilot':
      return 'oauth'
    case 'bedrock':
      return 'environment'
    case 'vertex':
      return 'environment'
    default:
      return 'api_key'
  }
}

function defaultBaseUrlForProvider(providerType: LlmProviderType): string {
  switch (providerType) {
    case 'anthropic':
      return 'https://api.anthropic.com'
    case 'openai':
      return 'https://api.openai.com'
    default:
      return ''
  }
}

function modelsToMultiline(models: Array<ModelDefinition | string> | undefined): string {
  if (!models || models.length === 0) return ''
  return models
    .map((m) => (typeof m === 'string' ? m : m.id))
    .filter(Boolean)
    .join('\n')
}

function parseModelsFromMultiline(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function authRequiresApiKey(authType: LlmAuthType): boolean {
  return authType === 'api_key' || authType === 'api_key_with_endpoint' || authType === 'bearer_token'
}

function getHealthIssueMessage(issue: CredentialHealthIssue, t: (key: string) => string): string {
  switch (issue.type) {
    case 'file_corrupted':
      return t('apiSettings.aiPage.credentialFileCorrupted')
    case 'decryption_failed':
      return t('apiSettings.aiPage.credentialDifferentMachine')
    case 'no_default_credentials':
      return t('apiSettings.aiPage.credentialNoDefault')
    default:
      return issue.message || t('apiSettings.aiPage.credentialIssueFallback')
  }
}

interface CredentialHealthBannerProps {
  issues: CredentialHealthIssue[]
  onReauthenticate: () => void
  t: (key: string) => string
}

function CredentialHealthBanner({ issues, onReauthenticate, t }: CredentialHealthBannerProps) {
  if (issues.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {t('apiSettings.aiPage.credentialIssueDetected')}
          </h4>
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-300/80">
            {getHealthIssueMessage(issues[0], t)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onReauthenticate}
          className="flex-shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
        >
          {t('apiSettings.aiPage.reauthenticate')}
        </Button>
      </div>
    </div>
  )
}

interface ConnectionRowProps {
  connection: LlmConnectionWithStatus
  isLastConnection: boolean
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onValidate: () => void
  onReauthenticate: () => void
  validationState: ValidationState
  validationError?: string
  t: (key: string) => string
}

function ConnectionRow({
  connection,
  isLastConnection,
  onEdit,
  onDelete,
  onSetDefault,
  onValidate,
  onReauthenticate,
  validationState,
  validationError,
  t,
}: ConnectionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const getDescription = () => {
    if (validationState === 'validating') return t('apiSettings.aiPage.validating')
    if (validationState === 'success') return t('apiSettings.aiPage.connectionValid')
    if (validationState === 'error') return validationError || t('apiSettings.aiPage.validationFailed')

    const parts: string[] = []
    const provider = connection.providerType || connection.type
    parts.push(getProviderDescription(provider || '', t))

    if (connection.authType !== 'oauth') {
      let endpoint = connection.baseUrl
      if (!endpoint) {
        if (provider === 'anthropic') endpoint = 'https://api.anthropic.com'
        else if (provider === 'openai') endpoint = 'https://api.openai.com'
      }
      if (endpoint) {
        try {
          parts.push(new URL(endpoint).host)
        } catch {
          parts.push(endpoint)
        }
      }
    }

    if (!connection.isAuthenticated) {
      parts.push(t('apiSettings.aiPage.notAuthenticated'))
    }

    return parts.join(' · ')
  }

  return (
    <SettingsRow
      label={(
        <div className="flex items-center gap-1.5">
          <span>{connection.name}</span>
          {connection.isDefault && (
            <span className="inline-flex items-center h-5 px-2 text-[11px] font-medium rounded-[4px] bg-background shadow-minimal text-foreground/60">
              {t('common.default')}
            </span>
          )}
        </div>
      )}
      description={getDescription()}
    >
      <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1.5 rounded-md hover:bg-foreground/[0.05] data-[state=open]:bg-foreground/[0.05] transition-colors"
            data-state={menuOpen ? 'open' : 'closed'}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="end">
          <StyledDropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            <span>{t('common.edit')}</span>
          </StyledDropdownMenuItem>
          {!connection.isDefault && (
            <StyledDropdownMenuItem onClick={onSetDefault}>
              <Star className="h-3.5 w-3.5" />
              <span>{t('apiSettings.aiPage.actionSetAsDefault')}</span>
            </StyledDropdownMenuItem>
          )}
          <StyledDropdownMenuItem onClick={onReauthenticate}>
            <RefreshCcw className="h-3.5 w-3.5" />
            <span>{t('apiSettings.aiPage.actionReauthenticate')}</span>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuItem
            onClick={onValidate}
            disabled={validationState === 'validating'}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{t('apiSettings.aiPage.actionValidateConnection')}</span>
          </StyledDropdownMenuItem>
          <StyledDropdownMenuSeparator />
          <StyledDropdownMenuItem
            onClick={onDelete}
            variant="destructive"
            disabled={isLastConnection}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('common.delete')}</span>
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>
    </SettingsRow>
  )
}

interface WorkspaceOverrideCardProps {
  workspace: Workspace
  llmConnections: LlmConnectionWithStatus[]
  onSettingsChange: () => void
  t: (key: string) => string
}

function WorkspaceOverrideCard({ workspace, llmConnections, onSettingsChange, t }: WorkspaceOverrideCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const iconUrl = useWorkspaceIcon(workspace)

  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return
      setIsLoading(true)
      try {
        const ws = await window.electronAPI.getWorkspaceSettings(workspace.id)
        setSettings(ws)
      } catch (error) {
        console.error('Failed to load workspace settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadSettings()
  }, [workspace.id])

  const updateSetting = useCallback(async <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.updateWorkspaceSetting(workspace.id, key, value)
      setSettings(prev => prev ? { ...prev, [key]: value } : null)
      onSettingsChange()
    } catch (error) {
      console.error(`Failed to save ${key}:`, error)
    }
  }, [workspace.id, onSettingsChange])

  const handleConnectionChange = useCallback((slug: string) => {
    updateSetting('defaultLlmConnection', slug === 'global' ? undefined : slug)
  }, [updateSetting])

  const handleModelChange = useCallback((model: string) => {
    updateSetting('model', model === 'global' ? undefined : model)
  }, [updateSetting])

  const handleThinkingChange = useCallback((level: string) => {
    updateSetting('thinkingLevel', level === 'global' ? undefined : level as ThinkingLevel)
  }, [updateSetting])

  const hasOverrides = settings && (
    settings.defaultLlmConnection ||
    settings.model ||
    settings.thinkingLevel
  )

  const currentConnection = settings?.defaultLlmConnection || 'global'
  const currentModel = settings?.model || 'global'
  const currentThinking = settings?.thinkingLevel || 'global'

  const workspaceEffectiveConnection = useMemo(() => {
    const connSlug = settings?.defaultLlmConnection
    return connSlug ? llmConnections.find(c => c.slug === connSlug) : llmConnections.find(c => c.isDefault)
  }, [settings?.defaultLlmConnection, llmConnections])

  const getSummary = () => {
    if (!hasOverrides) return t('apiSettings.aiPage.workspaceUsingDefaults')
    const parts: string[] = []
    if (settings?.defaultLlmConnection) {
      const conn = llmConnections.find(c => c.slug === settings.defaultLlmConnection)
      parts.push(conn?.name || settings.defaultLlmConnection)
    }
    if (settings?.model) {
      parts.push(getModelShortName(settings.model))
    }
    if (settings?.thinkingLevel) {
      const level = THINKING_LEVELS.find(l => l.id === settings.thinkingLevel)
      parts.push(level?.name || settings.thinkingLevel)
    }
    return parts.join(' · ')
  }

  return (
    <SettingsCard>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-foreground/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-6 h-6 rounded-full overflow-hidden bg-foreground/5 flex items-center justify-center',
              'ring-1 ring-border/50'
            )}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                {workspace.name?.charAt(0)?.toUpperCase() || 'W'}
              </span>
            )}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium">{workspace.name}</div>
            <div className="text-xs text-muted-foreground">
              {isLoading ? t('apiSettings.aiPage.workspaceLoading') : getSummary()}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-4 py-2">
              <SettingsMenuSelectRow
                label={t('apiSettings.aiPage.connection')}
                description={t('apiSettings.aiPage.connectionDescription')}
                value={currentConnection}
                onValueChange={handleConnectionChange}
                options={[
                  {
                    value: 'global',
                    label: t('apiSettings.aiPage.useDefault'),
                    description: t('apiSettings.aiPage.inheritFromAppSettings'),
                  },
                  ...llmConnections.map((conn) => ({
                    value: conn.slug,
                    label: conn.name,
                    description: getProviderDescription(conn.providerType, t),
                  })),
                ]}
              />
              <SettingsMenuSelectRow
                label={t('workspaceSettings.model')}
                description={t('workspaceSettings.defaultModelDescription')}
                value={currentModel}
                onValueChange={handleModelChange}
                options={[
                  {
                    value: 'global',
                    label: t('apiSettings.aiPage.useDefault'),
                    description: t('apiSettings.aiPage.inheritFromAppSettings'),
                  },
                  ...getModelOptionsForConnection(workspaceEffectiveConnection),
                ]}
              />
              <SettingsMenuSelectRow
                label={t('workspaceSettings.thinkingLevel')}
                description={t('workspaceSettings.thinkingLevelDescription')}
                value={currentThinking}
                onValueChange={handleThinkingChange}
                options={[
                  {
                    value: 'global',
                    label: t('apiSettings.aiPage.useDefault'),
                    description: t('apiSettings.aiPage.inheritFromAppSettings'),
                  },
                  ...THINKING_LEVELS.map(({ id, name, description }) => ({
                    value: id,
                    label: name,
                    description,
                  })),
                ]}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingsCard>
  )
}

interface ConnectionFormState {
  name: string
  providerType: LlmProviderType
  authType: LlmAuthType
  baseUrl: string
  defaultModel: string
  modelsText: string
  awsRegion: string
  codexPath: string
  apiKey: string
}

function createConnectionForm(connection?: LlmConnectionWithStatus): ConnectionFormState {
  const providerType = connection?.providerType ?? 'anthropic'
  const authType = connection?.authType ?? defaultAuthForProvider(providerType)
  const defaultModel = connection?.defaultModel ?? getDefaultModelForConnection(providerType)
  const modelsText = connection?.models
    ? modelsToMultiline(connection.models)
    : modelsToMultiline(getDefaultModelsForConnection(providerType))

  return {
    name: connection?.name ?? '',
    providerType,
    authType,
    baseUrl: connection?.baseUrl ?? defaultBaseUrlForProvider(providerType),
    defaultModel,
    modelsText,
    awsRegion: connection?.awsRegion ?? '',
    codexPath: connection?.codexPath ?? '',
    apiKey: '',
  }
}

export default function AiSettingsPage() {
  const { t } = useLanguage()
  const { llmConnections, refreshLlmConnections } = useAppShellContext()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [defaultThinking, setDefaultThinking] = useState<ThinkingLevel>(DEFAULT_THINKING_LEVEL)
  const [validationStates, setValidationStates] = useState<Record<string, {
    state: ValidationState
    error?: string
  }>>({})
  const [credentialHealthIssues, setCredentialHealthIssues] = useState<CredentialHealthIssue[]>([])

  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<LlmConnectionWithStatus | null>(null)
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>(createConnectionForm())
  const [connectionFormError, setConnectionFormError] = useState<string | null>(null)
  const [isSavingConnection, setIsSavingConnection] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      try {
        const ws = await window.electronAPI.getWorkspaces()
        setWorkspaces(ws)

        const health = await window.electronAPI.getCredentialHealth()
        if (!health.healthy) {
          setCredentialHealthIssues(health.issues)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    load()
  }, [])

  const closeConnectionDialog = useCallback(() => {
    setConnectionDialogOpen(false)
    setEditingConnection(null)
    setConnectionFormError(null)
    setIsSavingConnection(false)
  }, [])

  const openCreateConnectionDialog = useCallback(() => {
    setEditingConnection(null)
    setConnectionForm(createConnectionForm())
    setConnectionFormError(null)
    setConnectionDialogOpen(true)
  }, [])

  const openEditConnectionDialog = useCallback((connection: LlmConnectionWithStatus) => {
    setEditingConnection(connection)
    setConnectionForm(createConnectionForm(connection))
    setConnectionFormError(null)
    setConnectionDialogOpen(true)
  }, [])

  const getUniqueSlug = useCallback((baseSlug: string) => {
    const normalizedBase = baseSlug || 'connection'
    const existingSlugs = new Set(llmConnections.map(c => c.slug))
    if (!existingSlugs.has(normalizedBase)) return normalizedBase

    let index = 2
    while (existingSlugs.has(`${normalizedBase}-${index}`)) {
      index += 1
    }
    return `${normalizedBase}-${index}`
  }, [llmConnections])

  const handleProviderTypeChange = useCallback((providerType: LlmProviderType) => {
    setConnectionForm((prev) => {
      const nextAuthType = isValidProviderAuthCombination(providerType, prev.authType)
        ? prev.authType
        : defaultAuthForProvider(providerType)

      return {
        ...prev,
        providerType,
        authType: nextAuthType,
        baseUrl: defaultBaseUrlForProvider(providerType),
        defaultModel: getDefaultModelForConnection(providerType),
        modelsText: modelsToMultiline(getDefaultModelsForConnection(providerType)),
        awsRegion: providerType === 'bedrock' ? (prev.awsRegion || 'us-east-1') : '',
      }
    })
  }, [])

  const handleAuthTypeChange = useCallback((authType: LlmAuthType) => {
    setConnectionForm((prev) => ({ ...prev, authType }))
  }, [])

  const handleSaveConnection = useCallback(async () => {
    if (!window.electronAPI) return

    const trimmedName = connectionForm.name.trim()
    const trimmedDefaultModel = connectionForm.defaultModel.trim()
    const trimmedBaseUrl = connectionForm.baseUrl.trim()
    const trimmedApiKey = connectionForm.apiKey.trim()

    if (!trimmedName) {
      setConnectionFormError(t('apiSettings.aiPage.validationConnectionNameRequired'))
      return
    }

    if (!trimmedDefaultModel) {
      setConnectionFormError(t('apiSettings.aiPage.validationModelRequired'))
      return
    }

    if (connectionForm.authType === 'api_key_with_endpoint' && !trimmedBaseUrl) {
      setConnectionFormError(t('apiSettings.aiPage.validationBaseUrlRequired'))
      return
    }

    if (trimmedBaseUrl) {
      try {
        new URL(trimmedBaseUrl)
      } catch {
        setConnectionFormError(t('apiSettings.aiPage.validationInvalidBaseUrl'))
        return
      }
    }

    const requiresApiKey = authRequiresApiKey(connectionForm.authType)
    if (requiresApiKey && !trimmedApiKey && !editingConnection?.isAuthenticated) {
      setConnectionFormError(t('apiSettings.aiPage.validationApiKeyRequired'))
      return
    }

    setIsSavingConnection(true)
    setConnectionFormError(null)

    try {
      const slug = editingConnection?.slug ?? getUniqueSlug(generateSlug(trimmedName) || 'connection')

      const isCompatProvider =
        connectionForm.providerType === 'anthropic_compat' || connectionForm.providerType === 'openai_compat'
      let models: Array<ModelDefinition | string> | undefined

      if (isCompatProvider) {
        let compatModels = parseModelsFromMultiline(connectionForm.modelsText)
        if (compatModels.length === 0) {
          compatModels = getDefaultModelsForConnection(connectionForm.providerType)
            .map((m) => (typeof m === 'string' ? m : m.id))
        }
        if (!compatModels.includes(trimmedDefaultModel)) {
          compatModels = [trimmedDefaultModel, ...compatModels]
        }
        models = compatModels
      } else if (
        editingConnection?.providerType === connectionForm.providerType &&
        editingConnection.models &&
        editingConnection.models.length > 0
      ) {
        models = editingConnection.models
      } else {
        const defaults = getDefaultModelsForConnection(connectionForm.providerType)
        models = defaults.length > 0 ? defaults : undefined
      }

      const payload: LlmConnection = {
        slug,
        name: trimmedName,
        providerType: connectionForm.providerType,
        authType: connectionForm.authType,
        baseUrl: trimmedBaseUrl || undefined,
        models,
        defaultModel: trimmedDefaultModel,
        codexPath: connectionForm.codexPath.trim() || undefined,
        awsRegion: connectionForm.providerType === 'bedrock'
          ? (connectionForm.awsRegion.trim() || undefined)
          : undefined,
        createdAt: editingConnection?.createdAt ?? Date.now(),
        lastUsedAt: editingConnection?.lastUsedAt,
      }

      const saveResult = await window.electronAPI.saveLlmConnection(payload)
      if (!saveResult.success) {
        setConnectionFormError(saveResult.error || t('common.error'))
        return
      }

      if (requiresApiKey && trimmedApiKey) {
        const keyResult = await window.electronAPI.setLlmConnectionApiKey(slug, trimmedApiKey)
        if (!keyResult.success) {
          setConnectionFormError(keyResult.error || t('common.error'))
          return
        }
      }

      await refreshLlmConnections?.()
      closeConnectionDialog()
    } catch (error) {
      setConnectionFormError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSavingConnection(false)
    }
  }, [
    closeConnectionDialog,
    connectionForm,
    editingConnection,
    getUniqueSlug,
    refreshLlmConnections,
    t,
  ])

  const handleReauthenticate = useCallback(() => {
    const defaultConn = llmConnections.find(c => c.isDefault) || llmConnections[0]
    if (defaultConn) {
      openEditConnectionDialog(defaultConn)
    } else {
      openCreateConnectionDialog()
    }
  }, [llmConnections, openCreateConnectionDialog, openEditConnectionDialog])

  const handleEditConnection = useCallback((slug: string) => {
    const connection = llmConnections.find(c => c.slug === slug)
    if (!connection) return
    openEditConnectionDialog(connection)
  }, [llmConnections, openEditConnectionDialog])

  const handleReauthenticateConnection = useCallback(async (connection: LlmConnectionWithStatus) => {
    if (!window.electronAPI) return

    if (connection.providerType === 'copilot' && connection.authType === 'oauth') {
      try {
        await window.electronAPI.startCopilotOAuth(connection.slug)
        await refreshLlmConnections?.()
      } catch (error) {
        console.error('Failed to start Copilot OAuth:', error)
      }
      return
    }

    openEditConnectionDialog(connection)
  }, [openEditConnectionDialog, refreshLlmConnections])

  const handleDeleteConnection = useCallback(async (slug: string) => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.deleteLlmConnection(slug)
      if (result.success) {
        refreshLlmConnections?.()
      } else {
        console.error('Failed to delete connection:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  }, [refreshLlmConnections])

  const handleValidateConnection = useCallback(async (slug: string) => {
    if (!window.electronAPI) return

    setValidationStates(prev => ({ ...prev, [slug]: { state: 'validating' } }))

    try {
      const result = await window.electronAPI.testLlmConnection(slug)

      if (result.success) {
        setValidationStates(prev => ({ ...prev, [slug]: { state: 'success' } }))
        setTimeout(() => {
          setValidationStates(prev => ({ ...prev, [slug]: { state: 'idle' } }))
        }, 3000)
      } else {
        setValidationStates(prev => ({
          ...prev,
          [slug]: { state: 'error', error: result.error }
        }))
        setTimeout(() => {
          setValidationStates(prev => ({ ...prev, [slug]: { state: 'idle' } }))
        }, 5000)
      }
    } catch {
      setValidationStates(prev => ({
        ...prev,
        [slug]: { state: 'error', error: t('apiSettings.aiPage.validationFailed') }
      }))
      setTimeout(() => {
        setValidationStates(prev => ({ ...prev, [slug]: { state: 'idle' } }))
      }, 5000)
    }
  }, [t])

  const handleSetDefaultConnection = useCallback(async (slug: string) => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.setDefaultLlmConnection(slug)
      if (result.success) {
        refreshLlmConnections?.()
      } else {
        console.error('Failed to set default connection:', result.error)
      }
    } catch (error) {
      console.error('Failed to set default connection:', error)
    }
  }, [refreshLlmConnections])

  const defaultConnection = useMemo(() => {
    return llmConnections.find(c => c.isDefault)
  }, [llmConnections])

  const defaultModel = defaultConnection?.defaultModel ?? ''

  const handleDefaultModelChange = useCallback(async (model: string) => {
    if (!window.electronAPI || !defaultConnection) return
    const updated = { ...defaultConnection, defaultModel: model }
    const { isAuthenticated: _a, authError: _b, isDefault: _c, ...connectionData } = updated
    await window.electronAPI.saveLlmConnection(connectionData as LlmConnection)
    await refreshLlmConnections()
  }, [defaultConnection, refreshLlmConnections])

  const handleDefaultThinkingChange = useCallback(async (level: ThinkingLevel) => {
    setDefaultThinking(level)
  }, [])

  const handleWorkspaceSettingsChange = useCallback(() => {
    refreshLlmConnections?.()
  }, [refreshLlmConnections])

  const connectionDialogAuthOptions = useMemo(() => {
    return AUTH_TYPE_ORDER
      .filter((authType) => isValidProviderAuthCombination(connectionForm.providerType, authType))
      .map((authType) => ({
        value: authType,
        label: getAuthTypeLabel(authType, t),
        description: getAuthTypeLabel(authType, t),
      }))
  }, [connectionForm.providerType, t])

  const connectionDialogProviderOptions = useMemo(() => {
    return PROVIDER_TYPES.map((providerType) => ({
      value: providerType,
      label: getProviderLabel(providerType, t),
      description: getProviderDescription(providerType, t),
    }))
  }, [t])

  const showModelListEditor = connectionForm.providerType === 'anthropic_compat' || connectionForm.providerType === 'openai_compat'

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('workspaceSettings.ai')} actions={<HeaderMenu route={routes.view.settings('api')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <CredentialHealthBanner
              issues={credentialHealthIssues}
              onReauthenticate={handleReauthenticate}
              t={t}
            />

            <div className="space-y-8">
              {llmConnections.length > 0 && (
                <SettingsSection
                  title={t('apiSettings.aiPage.sectionDefaultTitle')}
                  description={t('apiSettings.aiPage.sectionDefaultDescription')}
                >
                  <SettingsCard>
                    <SettingsMenuSelectRow
                      label={t('apiSettings.aiPage.connection')}
                      description={t('apiSettings.aiPage.connectionDescription')}
                      value={defaultConnection?.slug || ''}
                      onValueChange={handleSetDefaultConnection}
                      options={llmConnections.map((conn) => ({
                        value: conn.slug,
                        label: conn.name,
                        description: getProviderDescription(conn.providerType, t),
                      }))}
                    />
                    <SettingsMenuSelectRow
                      label={t('workspaceSettings.model')}
                      description={t('workspaceSettings.defaultModelDescription')}
                      value={defaultModel}
                      onValueChange={handleDefaultModelChange}
                      options={getModelOptionsForConnection(defaultConnection)}
                    />
                    <SettingsMenuSelectRow
                      label={t('workspaceSettings.thinkingLevel')}
                      description={t('workspaceSettings.thinkingLevelDescription')}
                      value={defaultThinking}
                      onValueChange={(v) => handleDefaultThinkingChange(v as ThinkingLevel)}
                      options={THINKING_LEVELS.map(({ id, name, description }) => ({
                        value: id,
                        label: name,
                        description,
                      }))}
                    />
                  </SettingsCard>
                </SettingsSection>
              )}

              {workspaces.length > 0 && llmConnections.length > 0 && (
                <SettingsSection
                  title={t('apiSettings.aiPage.sectionWorkspaceOverridesTitle')}
                  description={t('apiSettings.aiPage.sectionWorkspaceOverridesDescription')}
                >
                  <div className="space-y-2">
                    {workspaces.map((workspace) => (
                      <WorkspaceOverrideCard
                        key={workspace.id}
                        workspace={workspace}
                        llmConnections={llmConnections}
                        onSettingsChange={handleWorkspaceSettingsChange}
                        t={t}
                      />
                    ))}
                  </div>
                </SettingsSection>
              )}

              <SettingsSection
                title={t('apiSettings.aiPage.sectionConnectionsTitle')}
                description={t('apiSettings.aiPage.sectionConnectionsDescription')}
              >
                <SettingsCard>
                  {llmConnections.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('apiSettings.aiPage.noConnectionsConfigured')}
                    </div>
                  ) : (
                    [...llmConnections]
                      .sort((a, b) => {
                        if (a.isDefault && !b.isDefault) return -1
                        if (!a.isDefault && b.isDefault) return 1
                        return a.name.localeCompare(b.name)
                      })
                      .map((conn) => (
                        <ConnectionRow
                          key={conn.slug}
                          connection={conn}
                          isLastConnection={llmConnections.length === 1}
                          onEdit={() => handleEditConnection(conn.slug)}
                          onDelete={() => handleDeleteConnection(conn.slug)}
                          onSetDefault={() => handleSetDefaultConnection(conn.slug)}
                          onValidate={() => handleValidateConnection(conn.slug)}
                          onReauthenticate={() => handleReauthenticateConnection(conn)}
                          validationState={validationStates[conn.slug]?.state || 'idle'}
                          validationError={validationStates[conn.slug]?.error}
                          t={t}
                        />
                      ))
                  )}
                </SettingsCard>
                <div className="pt-0">
                  <button
                    onClick={openCreateConnectionDialog}
                    className="inline-flex items-center h-8 px-3 text-sm rounded-lg bg-background shadow-minimal hover:bg-foreground/[0.02] transition-colors"
                  >
                    + {t('apiSettings.aiPage.addConnection')}
                  </button>
                </div>
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={connectionDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeConnectionDialog()
            return
          }
          setConnectionDialogOpen(true)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingConnection
                ? t('apiSettings.aiPage.editConnectionTitle')
                : t('apiSettings.aiPage.addConnectionTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? t('apiSettings.aiPage.editConnection')
                : t('apiSettings.aiPage.addConnection')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <SettingsCard>
              <SettingsInput
                label={t('apiSettings.aiPage.connectionName')}
                placeholder={t('apiSettings.aiPage.connectionNamePlaceholder')}
                value={connectionForm.name}
                onChange={(value) => setConnectionForm(prev => ({ ...prev, name: value }))}
                inCard={true}
              />

              <SettingsMenuSelectRow
                label={t('apiSettings.aiPage.providerType')}
                description={t('apiSettings.aiPage.providerTypeDescription')}
                value={connectionForm.providerType}
                onValueChange={(value) => handleProviderTypeChange(value as LlmProviderType)}
                options={connectionDialogProviderOptions}
              />

              <SettingsMenuSelectRow
                label={t('apiSettings.aiPage.authType')}
                description={t('apiSettings.aiPage.authTypeDescription')}
                value={connectionForm.authType}
                onValueChange={(value) => handleAuthTypeChange(value as LlmAuthType)}
                options={connectionDialogAuthOptions}
              />

              <SettingsInput
                label={t('apiSettings.aiPage.baseUrl')}
                description={t('apiSettings.aiPage.baseUrlDescription')}
                placeholder={t('apiSettings.aiPage.baseUrlPlaceholder')}
                value={connectionForm.baseUrl}
                onChange={(value) => setConnectionForm(prev => ({ ...prev, baseUrl: value }))}
                inCard={true}
              />

              <SettingsInput
                label={t('apiSettings.aiPage.defaultModel')}
                description={t('apiSettings.aiPage.defaultModelDescription')}
                placeholder={t('apiSettings.aiPage.defaultModelPlaceholder')}
                value={connectionForm.defaultModel}
                onChange={(value) => setConnectionForm(prev => ({ ...prev, defaultModel: value }))}
                inCard={true}
              />

              {showModelListEditor && (
                <SettingsTextarea
                  label={t('apiSettings.aiPage.customModels')}
                  description={t('apiSettings.aiPage.customModelsDescription')}
                  placeholder={t('apiSettings.aiPage.customModelsPlaceholder')}
                  value={connectionForm.modelsText}
                  onChange={(value) => setConnectionForm(prev => ({ ...prev, modelsText: value }))}
                  rows={5}
                  inCard={true}
                />
              )}

              {connectionForm.providerType === 'bedrock' && (
                <SettingsInput
                  label={t('apiSettings.aiPage.awsRegion')}
                  description={t('apiSettings.aiPage.awsRegionDescription')}
                  value={connectionForm.awsRegion}
                  onChange={(value) => setConnectionForm(prev => ({ ...prev, awsRegion: value }))}
                  inCard={true}
                />
              )}

              {connectionForm.providerType === 'openai' && (
                <SettingsInput
                  label={t('apiSettings.aiPage.codexPath')}
                  description={t('apiSettings.aiPage.codexPathDescription')}
                  value={connectionForm.codexPath}
                  onChange={(value) => setConnectionForm(prev => ({ ...prev, codexPath: value }))}
                  inCard={true}
                />
              )}

              {authRequiresApiKey(connectionForm.authType) && (
                <SettingsSecretInput
                  label={t('apiSettings.aiPage.apiKey')}
                  description={t('apiSettings.aiPage.apiKeyDescription')}
                  placeholder={t('apiSettings.aiPage.apiKeyPlaceholder')}
                  value={connectionForm.apiKey}
                  onChange={(value) => setConnectionForm(prev => ({ ...prev, apiKey: value }))}
                  hasExistingValue={Boolean(editingConnection?.isAuthenticated)}
                  inCard={true}
                />
              )}
            </SettingsCard>

            {connectionFormError && (
              <p className="text-sm text-destructive">{connectionFormError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeConnectionDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveConnection} disabled={isSavingConnection}>
              {isSavingConnection ? (
                <>
                  <Spinner className="size-4 mr-2" />
                  {t('apiSettings.aiPage.savingConnection')}
                </>
              ) : (
                t('apiSettings.aiPage.saveConnection')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
