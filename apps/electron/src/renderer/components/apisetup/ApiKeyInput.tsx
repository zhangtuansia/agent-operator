import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from "@/components/ui/styled-dropdown"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react"

export type ApiKeyStatus = 'idle' | 'validating' | 'success' | 'error'

export interface ApiKeySubmitData {
  apiKey: string
  baseUrl?: string
  connectionDefaultModel?: string
  models?: string[]
  // Legacy field kept for backward compatibility with older callers.
  customModel?: string
}

export interface ApiKeyInputProps {
  status: ApiKeyStatus
  errorMessage?: string
  onSubmit: (data: ApiKeySubmitData) => void
  formId?: string
  disabled?: boolean
  providerType?: 'anthropic' | 'openai'
}

type PresetKey = 'anthropic' | 'openai' | 'openrouter' | 'vercel' | 'ollama' | 'custom'

interface Preset {
  key: PresetKey
  label: string
  url: string
}

const ANTHROPIC_PRESETS: Preset[] = [
  { key: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com' },
  { key: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api' },
  { key: 'vercel', label: 'Vercel AI Gateway', url: 'https://ai-gateway.vercel.sh' },
  { key: 'ollama', label: 'Ollama', url: 'http://localhost:11434' },
  { key: 'custom', label: 'Custom', url: '' },
]

const OPENAI_PRESETS: Preset[] = [
  { key: 'openai', label: 'OpenAI', url: '' },
]

const COMPAT_ANTHROPIC_DEFAULTS = 'anthropic/claude-opus-4.5, anthropic/claude-sonnet-4.5, anthropic/claude-haiku-4.5'
const COMPAT_OPENAI_DEFAULTS = 'openai/gpt-5.3-codex, openai/gpt-5.1-codex-mini'

function getPresetsForProvider(providerType: 'anthropic' | 'openai'): Preset[] {
  return providerType === 'openai' ? OPENAI_PRESETS : ANTHROPIC_PRESETS
}

function getPresetForUrl(url: string, presets: Preset[]): PresetKey {
  const match = presets.find(p => p.key !== 'custom' && p.url === url)
  return match?.key ?? 'custom'
}

function parseModelList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function ApiKeyInput({
  status,
  errorMessage,
  onSubmit,
  formId = "api-key-form",
  disabled,
  providerType = 'anthropic',
}: ApiKeyInputProps) {
  const presets = getPresetsForProvider(providerType)
  const defaultPreset = presets[0]

  const [apiKey, setApiKey] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [baseUrl, setBaseUrl] = useState(defaultPreset.url)
  const [activePreset, setActivePreset] = useState<PresetKey>(defaultPreset.key)
  const [connectionDefaultModel, setConnectionDefaultModel] = useState('')
  const [modelError, setModelError] = useState<string | null>(null)

  const isDisabled = disabled || status === 'validating'
  const isDefaultProviderPreset = activePreset === 'anthropic' || activePreset === 'openai'
  const apiKeyPlaceholder = providerType === 'openai' ? 'sk-...' : 'sk-ant-...'

  const handlePresetSelect = (preset: Preset) => {
    setActivePreset(preset.key)
    if (preset.key === 'custom') {
      setBaseUrl('')
    } else {
      setBaseUrl(preset.url)
    }
    setModelError(null)
    if (preset.key === 'ollama') {
      setConnectionDefaultModel('qwen3-coder')
    } else if (preset.key === 'openrouter' || preset.key === 'vercel' || preset.key === 'custom') {
      setConnectionDefaultModel(providerType === 'openai' ? COMPAT_OPENAI_DEFAULTS : COMPAT_ANTHROPIC_DEFAULTS)
    } else {
      setConnectionDefaultModel('')
    }
  }

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value)
    const presetKey = getPresetForUrl(value, presets)
    setActivePreset(presetKey)
    setModelError(null)
    if (!connectionDefaultModel.trim()) {
      if (presetKey === 'ollama') {
        setConnectionDefaultModel('qwen3-coder')
      } else if (presetKey === 'openrouter' || presetKey === 'vercel' || presetKey === 'custom') {
        setConnectionDefaultModel(providerType === 'openai' ? COMPAT_OPENAI_DEFAULTS : COMPAT_ANTHROPIC_DEFAULTS)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveBaseUrl = baseUrl.trim()
    const parsedModels = parseModelList(connectionDefaultModel)
    const requiresModel = !isDefaultProviderPreset && !!effectiveBaseUrl
    if (requiresModel && parsedModels.length === 0) {
      setModelError('Default model is required for compatible endpoints.')
      return
    }
    const isDefault = isDefaultProviderPreset || !effectiveBaseUrl
    onSubmit({
      apiKey: apiKey.trim(),
      baseUrl: isDefault ? undefined : effectiveBaseUrl,
      connectionDefaultModel: parsedModels[0],
      models: parsedModels.length > 0 ? parsedModels : undefined,
      customModel: connectionDefaultModel.trim() || undefined,
    })
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="api-key">API Key</Label>
        <div className={cn(
          "relative rounded-md shadow-minimal transition-colors",
          "bg-foreground-2 focus-within:bg-background"
        )}>
          <Input
            id="api-key"
            type={showValue ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyPlaceholder}
            className={cn(
              "pr-10 border-0 bg-transparent shadow-none",
              status === 'error' && "focus-visible:ring-destructive"
            )}
            disabled={isDisabled}
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

      {presets.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="base-url">Endpoint</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isDisabled}
                className="flex h-6 items-center gap-1 rounded-[6px] bg-background shadow-minimal pl-2.5 pr-2 text-[12px] font-medium text-foreground/50 hover:bg-foreground/5 hover:text-foreground focus:outline-none"
              >
                {presets.find(p => p.key === activePreset)?.label ?? 'Custom'}
                <ChevronDown className="size-2.5 opacity-50" />
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end" className="z-floating-menu">
                {presets.map((preset) => (
                  <StyledDropdownMenuItem
                    key={preset.key}
                    onClick={() => handlePresetSelect(preset)}
                    className="justify-between"
                  >
                    {preset.label}
                    <Check className={cn("size-3", activePreset === preset.key ? "opacity-100" : "opacity-0")} />
                  </StyledDropdownMenuItem>
                ))}
              </StyledDropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className={cn(
            "rounded-md shadow-minimal transition-colors",
            "bg-foreground-2 focus-within:bg-background"
          )}>
            <Input
              id="base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="border-0 bg-transparent shadow-none"
              disabled={isDisabled}
            />
          </div>
        </div>
      )}

      {!isDefaultProviderPreset && (
        <div className="space-y-2">
          <Label htmlFor="connection-default-model" className="text-muted-foreground font-normal">
            Default Model <span className="text-foreground/30">required</span>
          </Label>
          <div className={cn(
            "rounded-md shadow-minimal transition-colors",
            "bg-foreground-2 focus-within:bg-background"
          )}>
            <Input
              id="connection-default-model"
              type="text"
              value={connectionDefaultModel}
              onChange={(e) => {
                setConnectionDefaultModel(e.target.value)
                if (modelError) setModelError(null)
              }}
              placeholder="provider/model-id[, provider/model-id...]"
              className={cn(
                "border-0 bg-transparent shadow-none",
                modelError && "focus-visible:ring-destructive"
              )}
              disabled={isDisabled}
            />
          </div>
          <p className="text-xs text-foreground/30">
            Use comma-separated model IDs for compatible endpoints.
          </p>
          {modelError && (
            <p className="text-sm text-destructive">{modelError}</p>
          )}
        </div>
      )}

      {status === 'error' && errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </form>
  )
}
