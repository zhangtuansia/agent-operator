/**
 * ApiSettingsPage
 *
 * API configuration settings for third-party providers.
 *
 * Settings:
 * - Provider selection (Anthropic, GLM, MiniMax, DeepSeek, Custom)
 * - API Base URL
 * - API Key
 * - API Format (Anthropic/OpenAI compatible)
 * - Custom Models (for Custom provider)
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { cn } from '@/lib/utils'
import { routes } from '@/lib/navigate'
import { Eye, EyeOff, Check, Plus } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { CustomModel } from '../../../shared/types'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsMenuSelectRow,
} from '@/components/settings'
import { CustomModelItem } from '@/components/settings/CustomModelItem'
import { CustomModelDialog } from '@/components/settings/CustomModelDialog'
import { useTranslation } from '@/i18n'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'api',
}

// Provider configurations
const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    apiFormat: 'anthropic' as const,
    description: 'Official Anthropic API',
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    baseURL: '',
    apiFormat: 'anthropic' as const,
    description: 'AWS Bedrock (configured via environment variables)',
    readonly: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api',
    apiFormat: 'anthropic' as const,
    description: 'Access multiple AI models through OpenRouter',
    modelHint: 'anthropic/claude-3.5-sonnet',
  },
  {
    id: 'vercel',
    name: 'Vercel AI Gateway',
    baseURL: 'https://ai-gateway.vercel.sh',
    apiFormat: 'anthropic' as const,
    description: 'Vercel AI Gateway proxy',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseURL: 'http://localhost:11434',
    apiFormat: 'openai' as const,
    description: 'Run models locally with Ollama',
    modelHint: 'llama3.2',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    apiFormat: 'anthropic' as const,
    description: 'Zhipu AI GLM models',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    apiFormat: 'anthropic' as const,
    description: 'MiniMax AI models',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    apiFormat: 'openai' as const,
    description: 'DeepSeek AI models',
  },
  {
    id: 'custom',
    name: 'Custom',
    baseURL: '',
    apiFormat: 'anthropic' as const,
    description: 'Custom API endpoint',
  },
]

type ApiFormat = 'anthropic' | 'openai'

interface ProviderConfig {
  provider: string
  baseURL: string
  apiFormat: ApiFormat
}

// Get provider-specific help text
function getProviderHelpText(providerId: string, t: (key: string) => string): string | null {
  switch (providerId) {
    case 'openrouter':
      return t('apiSettings.helpOpenRouter')
    case 'ollama':
      return t('apiSettings.helpOllama')
    case 'vercel':
      return t('apiSettings.helpVercel')
    default:
      return null
  }
}

export default function ApiSettingsPage() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Current config
  const [currentProvider, setCurrentProvider] = useState('anthropic')
  const [baseURL, setBaseURL] = useState('https://api.anthropic.com')
  const [apiFormat, setApiFormat] = useState<ApiFormat>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasExistingKey, setHasExistingKey] = useState(false)

  // Custom models state
  const [customModels, setCustomModels] = useState<CustomModel[]>([])
  const [customModelDialogOpen, setCustomModelDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null)

  // Load current configuration
  useEffect(() => {
    const loadConfig = async () => {
      if (!window.electronAPI) {
        setIsLoading(false)
        return
      }

      try {
        const billingInfo = await window.electronAPI.getBillingMethod()

        if (billingInfo.provider) {
          setCurrentProvider(billingInfo.provider)
          // Find provider config
          const providerConfig = PROVIDERS.find(p => p.id === billingInfo.provider)
          if (providerConfig) {
            setApiFormat(providerConfig.apiFormat)
          }
        }

        setHasExistingKey(billingInfo.hasCredential)

        // Load stored config for baseURL and apiFormat
        // We need to read the config file to get the stored values
        const config = await window.electronAPI.getStoredConfig?.()
        if (config?.providerConfig) {
          // Use stored baseURL if available
          if (config.providerConfig.baseURL) {
            setBaseURL(config.providerConfig.baseURL)
          } else if (billingInfo.provider) {
            const providerConfig = PROVIDERS.find(p => p.id === billingInfo.provider)
            if (providerConfig) {
              setBaseURL(providerConfig.baseURL)
            }
          }
          // Use stored apiFormat if available
          if (config.providerConfig.apiFormat) {
            setApiFormat(config.providerConfig.apiFormat)
          }
        } else if (billingInfo.provider) {
          const providerConfig = PROVIDERS.find(p => p.id === billingInfo.provider)
          if (providerConfig) {
            setBaseURL(providerConfig.baseURL)
          }
        }

        // Load custom models
        const models = await window.electronAPI.getCustomModels?.()
        if (models) {
          setCustomModels(models)
        }
      } catch (error) {
        console.error('Failed to load API config:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  // Handle provider change
  const handleProviderChange = useCallback((providerId: string) => {
    setCurrentProvider(providerId)
    const provider = PROVIDERS.find(p => p.id === providerId)
    if (provider) {
      setBaseURL(provider.baseURL)
      setApiFormat(provider.apiFormat)
    }
  }, [])

  // Custom model handlers
  const handleAddModel = useCallback(() => {
    setEditingModel(null)
    setCustomModelDialogOpen(true)
  }, [])

  const handleEditModel = useCallback((model: CustomModel) => {
    setEditingModel(model)
    setCustomModelDialogOpen(true)
  }, [])

  const handleSaveModel = useCallback(async (model: CustomModel) => {
    if (!window.electronAPI) return

    try {
      let updatedModels: CustomModel[]
      if (editingModel) {
        // Update existing model
        updatedModels = await window.electronAPI.updateCustomModel(model.id, {
          name: model.name,
          shortName: model.shortName,
          description: model.description,
        })
      } else {
        // Add new model
        updatedModels = await window.electronAPI.addCustomModel(model)
      }
      setCustomModels(updatedModels)

      // Emit event to notify model selection to reload
      window.dispatchEvent(new CustomEvent('cowork:provider-changed', {
        detail: { provider: currentProvider }
      }))
    } catch (error) {
      console.error('Failed to save custom model:', error)
    }
  }, [editingModel, currentProvider])

  const handleDeleteModel = useCallback(async (modelId: string) => {
    if (!window.electronAPI) return

    try {
      const updatedModels = await window.electronAPI.deleteCustomModel(modelId)
      setCustomModels(updatedModels)

      // Emit event to notify model selection to reload
      window.dispatchEvent(new CustomEvent('cowork:provider-changed', {
        detail: { provider: currentProvider }
      }))
    } catch (error) {
      console.error('Failed to delete custom model:', error)
    }
  }, [currentProvider])

  // Save configuration
  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      // Update provider config
      await window.electronAPI.updateProviderConfig?.({
        provider: currentProvider,
        baseURL,
        apiFormat,
      })

      // Update API key if provided
      if (apiKey.trim() && !apiKey.startsWith('••••')) {
        await window.electronAPI.updateBillingMethod('api_key', apiKey.trim())
        setHasExistingKey(true)
        // Show masked key to indicate it's saved
        const maskedKey = apiKey.slice(0, 8) + '••••••••' + apiKey.slice(-4)
        setApiKey(maskedKey)
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)

      // Emit event to notify FreeFormInput to reload provider
      window.dispatchEvent(new CustomEvent('cowork:provider-changed', {
        detail: { provider: currentProvider }
      }))
    } catch (error) {
      console.error('Failed to save API config:', error)
    } finally {
      setIsSaving(false)
    }
  }, [currentProvider, baseURL, apiFormat, apiKey])

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader title={t('apiSettings.title')} actions={<HeaderMenu route={routes.view.settings('api')} />} />
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('apiSettings.title')} actions={<HeaderMenu route={routes.view.settings('api')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-6">
              {/* Provider Selection */}
              <SettingsSection title={t('apiSettings.provider')}>
                <SettingsCard>
                  <SettingsMenuSelectRow
                    label={t('apiSettings.provider')}
                    description={t('apiSettings.providerDescription')}
                    value={currentProvider}
                    onValueChange={handleProviderChange}
                    options={PROVIDERS.map(p => ({
                      value: p.id,
                      label: p.name,
                      description: p.description,
                    }))}
                  />
                </SettingsCard>
              </SettingsSection>

              {/* Bedrock Mode Info */}
              {currentProvider === 'bedrock' && (
                <SettingsSection title={t('apiSettings.providerBedrock')}>
                  <SettingsCard>
                    <SettingsRow
                      label={t('apiSettings.bedrockConfiguration')}
                      description={t('apiSettings.bedrockConfigDescription')}
                    >
                      <div className="text-sm text-muted-foreground font-mono space-y-1">
                        <div>CLAUDE_CODE_USE_BEDROCK=1</div>
                        <div>AWS_REGION=us-west-2</div>
                      </div>
                    </SettingsRow>
                  </SettingsCard>
                </SettingsSection>
              )}

              {/* API Configuration - hide for Bedrock */}
              {currentProvider !== 'bedrock' && (
                <>
                  <SettingsSection title={t('apiSettings.baseUrl')}>
                    <SettingsCard>
                      {/* Base URL */}
                      <SettingsRow
                        label={t('apiSettings.baseUrl')}
                        description={t('apiSettings.baseUrlDescription')}
                      >
                        <Input
                          value={baseURL}
                          onChange={(e) => setBaseURL(e.target.value)}
                          placeholder={t('apiSettings.baseUrlPlaceholder')}
                          className="font-mono text-sm max-w-md"
                        />
                      </SettingsRow>

                      {/* Provider-specific help text */}
                      {getProviderHelpText(currentProvider, t) && (
                        <div className="px-4 pb-4 -mt-2">
                          <p className="text-sm text-muted-foreground">
                            {getProviderHelpText(currentProvider, t)}
                          </p>
                        </div>
                      )}

                      {/* API Format - only show for custom provider */}
                      {currentProvider === 'custom' && (
                        <SettingsMenuSelectRow
                          label={t('apiSettings.apiFormat')}
                          description={t('apiSettings.apiFormatDescription')}
                          value={apiFormat}
                          onValueChange={(v) => setApiFormat(v as ApiFormat)}
                          options={[
                            { value: 'anthropic', label: t('apiSettings.apiFormatAnthropic'), description: t('apiSettings.apiFormatAnthropicDesc') },
                            { value: 'openai', label: t('apiSettings.apiFormatOpenAI'), description: t('apiSettings.apiFormatOpenAIDesc') },
                          ]}
                        />
                      )}

                      {/* API Key */}
                      <SettingsRow
                        label={t('apiSettings.apiKeyLabel')}
                        description={hasExistingKey ? t('appSettings.apiKeyConfigured') : t('apiSettings.apiKeyDescription')}
                      >
                        <div className="flex items-center gap-2 max-w-md">
                          <div className="relative flex-1">
                            <Input
                              type={showApiKey ? 'text' : 'password'}
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={hasExistingKey ? '••••••••••••••••' : t('apiSettings.apiKeyPlaceholder')}
                              className="pr-10 font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}
                            >
                              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                        </div>
                      </SettingsRow>
                    </SettingsCard>
                  </SettingsSection>

                  {/* Custom Models Section - only show for custom provider */}
                  {currentProvider === 'custom' && (
                    <SettingsSection
                      title={t('apiSettings.customModels.title')}
                      description={t('apiSettings.customModels.sectionDescription')}
                    >
                      <SettingsCard className="p-0 overflow-hidden">
                        {customModels.length > 0 ? (
                          <div className="divide-y divide-border">
                            {customModels.map((model) => (
                              <CustomModelItem
                                key={model.id}
                                model={model}
                                onEdit={handleEditModel}
                                onDelete={handleDeleteModel}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-8 text-center text-muted-foreground">
                            <p className="text-sm">{t('apiSettings.customModels.emptyState')}</p>
                            <p className="text-xs mt-1">{t('apiSettings.customModels.emptyStateHint')}</p>
                          </div>
                        )}
                        <div className="border-t border-border p-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddModel}
                            className="w-full"
                          >
                            <Plus className="size-4 mr-1.5" />
                            {t('apiSettings.customModels.addModel')}
                          </Button>
                        </div>
                      </SettingsCard>
                    </SettingsSection>
                  )}

                  {/* Save Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="min-w-[120px]"
                    >
                      {isSaving ? (
                        <>
                          <Spinner className="mr-1.5" />
                          {t('apiSettings.saving')}
                        </>
                      ) : saveSuccess ? (
                        <>
                          <Check className="size-4 mr-1.5" />
                          {t('apiSettings.saved')}
                        </>
                      ) : (
                        <>
                          <Check className="size-4 mr-1.5" />
                          {t('apiSettings.saveChanges')}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}

                          </div>
          </div>
        </ScrollArea>
      </div>

      {/* Custom Model Dialog */}
      <CustomModelDialog
        open={customModelDialogOpen}
        onOpenChange={setCustomModelDialogOpen}
        model={editingModel}
        onSave={handleSaveModel}
        existingIds={customModels.map(m => m.id)}
      />
    </div>
  )
}
