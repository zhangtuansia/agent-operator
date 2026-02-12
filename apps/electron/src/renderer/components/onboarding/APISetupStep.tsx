import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, CreditCard, Key, Cpu } from "lucide-react"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import type { LlmAuthType, LlmProviderType } from "@agent-operator/shared/config/llm-connections"

export type ProviderSegment = 'anthropic' | 'openai' | 'copilot'

const SEGMENT_LABELS: Record<ProviderSegment, string> = {
  anthropic: 'Claude',
  openai: 'Codex',
  copilot: 'GitHub Copilot',
}

const BetaBadge = () => (
  <span className="inline px-1.5 pt-[2px] pb-[3px] text-[10px] font-accent font-bold rounded-[4px] bg-accent text-background ml-1 relative -top-[1px]">
    Beta
  </span>
)

const SEGMENT_DESCRIPTIONS: Record<ProviderSegment, React.ReactNode> = {
  anthropic: <>Use Claude Agent SDK as the main agent.<br />Configure with your Claude subscription or API key.</>,
  openai: <>Use Codex CLI as the main agent.<BetaBadge /><br />Configure with your ChatGPT subscription or OpenAI API key.</>,
  copilot: <>Use Copilot Agent as the main agent.<BetaBadge /><br />Configure with your GitHub Copilot subscription.</>,
}

export type ApiSetupMethod = 'anthropic_api_key' | 'claude_oauth' | 'chatgpt_oauth' | 'openai_api_key' | 'copilot_oauth'

export function apiSetupMethodToConnectionTypes(method: ApiSetupMethod): {
  providerType: LlmProviderType;
  authType: LlmAuthType;
} {
  switch (method) {
    case 'claude_oauth':
      return { providerType: 'anthropic', authType: 'oauth' }
    case 'anthropic_api_key':
      return { providerType: 'anthropic', authType: 'api_key' }
    case 'chatgpt_oauth':
      return { providerType: 'openai', authType: 'oauth' }
    case 'openai_api_key':
      return { providerType: 'openai', authType: 'api_key' }
    case 'copilot_oauth':
      return { providerType: 'copilot', authType: 'oauth' }
  }
}

interface ApiSetupOption {
  id: ApiSetupMethod
  name: string
  description: string
  icon: React.ReactNode
  providerType: LlmProviderType
}

const API_SETUP_OPTIONS: ApiSetupOption[] = [
  {
    id: 'claude_oauth',
    name: 'Claude Pro/Max',
    description: 'Use your Claude subscription for unlimited access.',
    icon: <CreditCard className="size-4" />,
    providerType: 'anthropic',
  },
  {
    id: 'anthropic_api_key',
    name: 'Anthropic API Key',
    description: 'Pay-as-you-go via Anthropic, OpenRouter, or compatible APIs.',
    icon: <Key className="size-4" />,
    providerType: 'anthropic',
  },
  {
    id: 'chatgpt_oauth',
    name: 'Codex · ChatGPT Plus/Pro',
    description: 'Use your ChatGPT Plus or Pro subscription with Codex.',
    icon: <Cpu className="size-4" />,
    providerType: 'openai',
  },
  {
    id: 'openai_api_key',
    name: 'Codex · OpenAI API Key',
    description: 'Pay-as-you-go via the OpenAI Platform API.',
    icon: <Key className="size-4" />,
    providerType: 'openai',
  },
  {
    id: 'copilot_oauth',
    name: 'Copilot · GitHub',
    description: 'Use your GitHub Copilot subscription.',
    icon: <Cpu className="size-4" />,
    providerType: 'copilot',
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
}: {
  option: ApiSetupOption
  isSelected: boolean
  onSelect: (method: ApiSetupMethod) => void
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
          <span className="font-medium text-sm">{option.name}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {option.description}
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

function ProviderSegmentedControl({
  activeSegment,
  onSegmentChange,
}: {
  activeSegment: ProviderSegment
  onSegmentChange: (segment: ProviderSegment) => void
}) {
  const segments: ProviderSegment[] = ['anthropic', 'openai', 'copilot']

  return (
    <div className="flex rounded-xl bg-foreground/[0.03] p-1 mb-4">
      {segments.map((segment) => (
        <button
          key={segment}
          onClick={() => onSegmentChange(segment)}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all",
            activeSegment === segment
              ? "bg-background shadow-minimal text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {SEGMENT_LABELS[segment]}
        </button>
      ))}
    </div>
  )
}

export function APISetupStep({
  selectedMethod,
  onSelect,
  onContinue,
  onBack,
  initialSegment = 'anthropic',
}: APISetupStepProps) {
  const [activeSegment, setActiveSegment] = useState<ProviderSegment>(initialSegment)
  const filteredOptions = API_SETUP_OPTIONS.filter(o => o.providerType === activeSegment)

  const handleSegmentChange = (segment: ProviderSegment) => {
    setActiveSegment(segment)
  }

  return (
    <StepFormLayout
      title="Set up your Agent"
      description={<>Select how you'd like to power your AI agents.<br />You can add more connections later.</>}
      actions={
        <>
          <BackButton onClick={onBack} />
          <ContinueButton onClick={onContinue} disabled={!selectedMethod} />
        </>
      }
    >
      <ProviderSegmentedControl
        activeSegment={activeSegment}
        onSegmentChange={handleSegmentChange}
      />

      <div className="bg-foreground-2 rounded-[8px] p-4 mb-3">
        <p className="text-sm text-muted-foreground text-center">
          {SEGMENT_DESCRIPTIONS[activeSegment]}
        </p>
      </div>

      <div className="space-y-3 min-h-[180px]">
        {filteredOptions.map((option) => (
          <OptionButton
            key={option.id}
            option={option}
            isSelected={option.id === selectedMethod}
            onSelect={onSelect}
          />
        ))}
      </div>
    </StepFormLayout>
  )
}
