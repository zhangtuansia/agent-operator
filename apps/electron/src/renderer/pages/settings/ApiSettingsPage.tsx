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
import { Eye, EyeOff, Check, RefreshCw } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsMenuSelectRow,
  SettingsInput,
} from '@/components/settings'

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

export default function ApiSettingsPage() {
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

        // Load stored config for baseURL
        // We need to read the config file to get the baseURL
        const config = await window.electronAPI.getStoredConfig?.()
        if (config?.providerConfig?.baseURL) {
          setBaseURL(config.providerConfig.baseURL)
        } else if (billingInfo.provider) {
          const providerConfig = PROVIDERS.find(p => p.id === billingInfo.provider)
          if (providerConfig) {
            setBaseURL(providerConfig.baseURL)
          }
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
      if (apiKey.trim()) {
        await window.electronAPI.updateBillingMethod('api_key', apiKey.trim())
        setHasExistingKey(true)
        setApiKey('')
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)

      // Emit event to notify FreeFormInput to reload provider
      window.dispatchEvent(new CustomEvent('craft:provider-changed', {
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
        <PanelHeader title="API Configuration" actions={<HeaderMenu route={routes.view.settings('api')} />} />
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title="API Configuration" actions={<HeaderMenu route={routes.view.settings('api')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-6">
              {/* Provider Selection */}
              <SettingsSection title="Provider">
                <SettingsCard>
                  <SettingsMenuSelectRow
                    label="API Provider"
                    description="Select your AI provider"
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

              {/* API Configuration */}
              <SettingsSection title="Configuration">
                <SettingsCard>
                  {/* Base URL */}
                  <SettingsRow
                    label="Base URL"
                    description="API endpoint URL"
                  >
                    <Input
                      value={baseURL}
                      onChange={(e) => setBaseURL(e.target.value)}
                      placeholder="https://api.example.com"
                      className="font-mono text-sm max-w-md"
                    />
                  </SettingsRow>

                  {/* API Format - only show for custom provider */}
                  {currentProvider === 'custom' && (
                    <SettingsMenuSelectRow
                      label="API Format"
                      description="API compatibility format"
                      value={apiFormat}
                      onValueChange={(v) => setApiFormat(v as ApiFormat)}
                      options={[
                        { value: 'anthropic', label: 'Anthropic', description: 'Anthropic Messages API format' },
                        { value: 'openai', label: 'OpenAI', description: 'OpenAI Chat Completions format' },
                      ]}
                    />
                  )}

                  {/* API Key */}
                  <SettingsRow
                    label="API Key"
                    description={hasExistingKey ? 'Key is configured' : 'Enter your API key'}
                  >
                    <div className="flex items-center gap-2 max-w-md">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={hasExistingKey ? '••••••••••••••••' : 'Enter API key...'}
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
                      Saving...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <Check className="size-4 mr-1.5" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Check className="size-4 mr-1.5" />
                      Save Changes
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Changes will take effect on next session
                </p>
              </div>

              {/* Help Section */}
              <SettingsSection title="Help" description="Provider-specific notes">
                <SettingsCard>
                  <div className="p-4 text-sm text-muted-foreground space-y-3">
                    <div>
                      <strong className="text-foreground">Anthropic:</strong> Use your API key from{' '}
                      <a href="https://console.anthropic.com" className="text-foreground hover:underline" onClick={(e) => { e.preventDefault(); window.electronAPI?.openUrl('https://console.anthropic.com') }}>
                        console.anthropic.com
                      </a>
                    </div>
                    <div>
                      <strong className="text-foreground">GLM (智谱):</strong> Uses Anthropic-compatible endpoint. Claude model names are automatically mapped to GLM models (e.g., Sonnet → GLM-4.7)
                    </div>
                    <div>
                      <strong className="text-foreground">Custom:</strong> For other providers that support Anthropic or OpenAI API format
                    </div>
                  </div>
                </SettingsCard>
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
