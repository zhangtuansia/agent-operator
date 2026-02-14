import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { ProviderLogo } from "../icons/ProviderLogo"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import { DEEPSEEK_MODELS, GLM_MODELS, MINIMAX_MODELS, DOUBAO_MODELS, KIMI_MODELS } from '@agent-operator/shared/config/models'
import { useTranslation } from "@/i18n"

export type ProviderSegment = 'anthropic' | 'openai' | 'copilot' | 'other'

const SEGMENT_LABELS: Record<ProviderSegment, string> = {
  anthropic: 'Claude',
  openai: 'Codex',
  copilot: 'Copilot',
  other: 'Other',
}

export type ApiSetupMethod =
  | 'anthropic_api_key'
  | 'claude_oauth'
  | 'chatgpt_oauth'
  | 'openai_api_key'
  | 'copilot_oauth'
  | 'deepseek_api_key'
  | 'glm_api_key'
  | 'minimax_api_key'
  | 'doubao_api_key'
  | 'kimi_api_key'

/** Pre-configured provider info for third-party API providers */
export interface ThirdPartyProviderInfo {
  baseUrl: string
  defaultModel: string
  models: string[]
}

/** Get provider info for third-party API methods (returns null for non-third-party methods) */
export function getThirdPartyProviderInfo(method: ApiSetupMethod): ThirdPartyProviderInfo | null {
  switch (method) {
    case 'deepseek_api_key':
      return {
        baseUrl: 'https://api.deepseek.com/anthropic',
        defaultModel: DEEPSEEK_MODELS[0]!.id,
        models: DEEPSEEK_MODELS.map(m => m.id),
      }
    case 'glm_api_key':
      return {
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        defaultModel: GLM_MODELS[0]!.id,
        models: GLM_MODELS.map(m => m.id),
      }
    case 'minimax_api_key':
      return {
        baseUrl: 'https://api.minimaxi.com/anthropic',
        defaultModel: MINIMAX_MODELS[0]!.id,
        models: MINIMAX_MODELS.map(m => m.id),
      }
    case 'doubao_api_key':
      return {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
        defaultModel: DOUBAO_MODELS[0]!.id,
        models: DOUBAO_MODELS.map(m => m.id),
      }
    case 'kimi_api_key':
      return {
        baseUrl: 'https://api.moonshot.ai/anthropic/',
        defaultModel: KIMI_MODELS[0]!.id,
        models: KIMI_MODELS.map(m => m.id),
      }
    default:
      return null
  }
}


interface ApiSetupOption {
  id: ApiSetupMethod
  nameKey: string
  descriptionKey: string
  icon: React.ReactNode
  segment: ProviderSegment
}

const API_SETUP_OPTIONS: ApiSetupOption[] = [
  {
    id: 'claude_oauth',
    nameKey: 'onboarding.optClaudeOAuth',
    descriptionKey: 'onboarding.optClaudeOAuthDesc',
    icon: <ProviderLogo provider="anthropic" size={16} />,
    segment: 'anthropic',
  },
  {
    id: 'anthropic_api_key',
    nameKey: 'onboarding.optAnthropicApiKey',
    descriptionKey: 'onboarding.optAnthropicApiKeyDesc',
    icon: <ProviderLogo provider="api_key" size={16} />,
    segment: 'anthropic',
  },
  {
    id: 'chatgpt_oauth',
    nameKey: 'onboarding.optChatGptOAuth',
    descriptionKey: 'onboarding.optChatGptOAuthDesc',
    icon: <ProviderLogo provider="openai" size={16} />,
    segment: 'openai',
  },
  {
    id: 'openai_api_key',
    nameKey: 'onboarding.optOpenAiApiKey',
    descriptionKey: 'onboarding.optOpenAiApiKeyDesc',
    icon: <ProviderLogo provider="openai" size={16} />,
    segment: 'openai',
  },
  {
    id: 'copilot_oauth',
    nameKey: 'onboarding.optCopilotOAuth',
    descriptionKey: 'onboarding.optCopilotOAuthDesc',
    icon: <ProviderLogo provider="copilot" size={16} />,
    segment: 'copilot',
  },
  {
    id: 'deepseek_api_key',
    nameKey: 'onboarding.optDeepSeek',
    descriptionKey: 'onboarding.optDeepSeekDesc',
    icon: <ProviderLogo provider="deepseek" size={16} />,
    segment: 'other',
  },
  {
    id: 'glm_api_key',
    nameKey: 'onboarding.optGlm',
    descriptionKey: 'onboarding.optGlmDesc',
    icon: <ProviderLogo provider="glm" size={16} />,
    segment: 'other',
  },
  {
    id: 'minimax_api_key',
    nameKey: 'onboarding.optMiniMax',
    descriptionKey: 'onboarding.optMiniMaxDesc',
    icon: <ProviderLogo provider="minimax" size={16} />,
    segment: 'other',
  },
  {
    id: 'doubao_api_key',
    nameKey: 'onboarding.optDoubao',
    descriptionKey: 'onboarding.optDoubaoDesc',
    icon: <ProviderLogo provider="doubao" size={16} />,
    segment: 'other',
  },
  {
    id: 'kimi_api_key',
    nameKey: 'onboarding.optKimi',
    descriptionKey: 'onboarding.optKimiDesc',
    icon: <ProviderLogo provider="kimi" size={16} />,
    segment: 'other',
  },
]

interface APISetupStepProps {
  selectedMethod: ApiSetupMethod | null
  onSelect: (method: ApiSetupMethod) => void
  onContinue: () => void
  onBack: () => void
  initialSegment?: ProviderSegment
}

function OptionButton({
  option,
  isSelected,
  onSelect,
  t,
}: {
  option: ApiSetupOption
  isSelected: boolean
  onSelect: (method: ApiSetupMethod) => void
  t: (key: string) => string
}) {
  return (
    <button
      onClick={() => onSelect(option.id)}
      className={cn(
        "flex w-full items-start gap-4 rounded-xl p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "hover:bg-foreground/[0.02] shadow-minimal",
        isSelected ? "bg-background" : "bg-foreground-2"
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          isSelected ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {option.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{t(option.nameKey)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(option.descriptionKey)}
        </p>
      </div>

      <div
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isSelected
            ? "border-foreground bg-foreground text-background"
            : "border-muted-foreground/20"
        )}
      >
        {isSelected && <Check className="size-3" strokeWidth={3} />}
      </div>
    </button>
  )
}

function BetaBadge({ t }: { t: (key: string) => string }) {
  return (
    <span className="inline px-1.5 pt-[2px] pb-[3px] text-[10px] font-accent font-bold rounded-[4px] bg-accent text-background ml-1 relative -top-[1px]">
      {t('onboarding.beta')}
    </span>
  )
}

function ProviderSegmentedControl({
  activeSegment,
  onSegmentChange,
  t,
}: {
  activeSegment: ProviderSegment
  onSegmentChange: (segment: ProviderSegment) => void
  t: (key: string) => string
}) {
  const segments: ProviderSegment[] = ['anthropic', 'openai', 'copilot', 'other']

  return (
    <div className="flex rounded-xl bg-foreground/[0.03] p-1 mb-4">
      {segments.map((segment) => (
        <button
          key={segment}
          onClick={() => onSegmentChange(segment)}
          className={cn(
            "flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all",
            activeSegment === segment
              ? "bg-background shadow-minimal text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {segment === 'other' ? t('onboarding.segmentOther') : SEGMENT_LABELS[segment]}
        </button>
      ))}
    </div>
  )
}

const SEGMENT_DESC_KEYS: Record<ProviderSegment, { main: string; sub: string; hasBeta?: boolean }> = {
  anthropic: { main: 'onboarding.segmentDescClaude', sub: 'onboarding.segmentDescClaudeSub' },
  openai: { main: 'onboarding.segmentDescCodex', sub: 'onboarding.segmentDescCodexSub', hasBeta: true },
  copilot: { main: 'onboarding.segmentDescCopilot', sub: 'onboarding.segmentDescCopilotSub', hasBeta: true },
  other: { main: 'onboarding.segmentDescOther', sub: 'onboarding.segmentDescOtherSub' },
}

export function APISetupStep({
  selectedMethod,
  onSelect,
  onContinue,
  onBack,
  initialSegment = 'anthropic',
}: APISetupStepProps) {
  const { t } = useTranslation()
  const [activeSegment, setActiveSegment] = useState<ProviderSegment>(initialSegment)
  const filteredOptions = API_SETUP_OPTIONS.filter(o => o.segment === activeSegment)

  const handleSegmentChange = (segment: ProviderSegment) => {
    setActiveSegment(segment)
  }

  const descKeys = SEGMENT_DESC_KEYS[activeSegment]

  return (
    <StepFormLayout
      title={t('onboarding.setupAgent')}
      description={<>{t('onboarding.setupAgentDescription')}<br />{t('onboarding.setupAgentDescriptionMore')}</>}
      actions={
        <>
          <BackButton onClick={onBack}>{t('onboarding.back')}</BackButton>
          <ContinueButton onClick={onContinue} disabled={!selectedMethod}>{t('onboarding.continue')}</ContinueButton>
        </>
      }
    >
      <ProviderSegmentedControl
        activeSegment={activeSegment}
        onSegmentChange={handleSegmentChange}
        t={t}
      />

      <div className="bg-foreground-2 rounded-[8px] p-4 mb-3">
        <p className="text-sm text-muted-foreground text-center">
          {t(descKeys.main)}{descKeys.hasBeta && <BetaBadge t={t} />}<br />{t(descKeys.sub)}
        </p>
      </div>

      <div className="space-y-3 min-h-[180px]">
        {filteredOptions.map((option) => (
          <OptionButton
            key={option.id}
            option={option}
            isSelected={option.id === selectedMethod}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </div>
    </StepFormLayout>
  )
}
