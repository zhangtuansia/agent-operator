import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, Settings, ChevronDown, ChevronUp } from "lucide-react"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import { useLanguage } from "@/context/LanguageContext"
import { ProviderLogo } from "@/components/icons/ProviderLogo"

export type BillingMethod =
  | 'api_key'
  | 'claude_oauth'
  | 'codex'
  | 'minimax'
  | 'glm'
  | 'deepseek'
  | 'custom'

interface BillingOption {
  id: BillingMethod
  nameKey: string
  useLogo?: boolean // Use ProviderLogo instead of icon
  icon?: React.ReactNode // Fallback icon if no logo
  recommended?: boolean
}

const PRIMARY_OPTIONS: BillingOption[] = [
  {
    id: 'claude_oauth',
    nameKey: 'billingMethods.claudeProMax',
    useLogo: true,
    recommended: true,
  },
  {
    id: 'codex',
    nameKey: 'billingMethods.codex',
    useLogo: true,
  },
]

const MORE_OPTIONS: BillingOption[] = [
  {
    id: 'api_key',
    nameKey: 'billingMethods.anthropicApiKey',
    useLogo: true,
  },
  {
    id: 'minimax',
    nameKey: 'billingMethods.minimax',
    useLogo: true,
  },
  {
    id: 'glm',
    nameKey: 'billingMethods.glm',
    useLogo: true,
  },
  {
    id: 'deepseek',
    nameKey: 'billingMethods.deepseek',
    useLogo: true,
  },
  {
    id: 'custom',
    nameKey: 'billingMethods.customEndpoint',
    icon: <Settings className="size-4" />,
  },
]

interface BillingMethodStepProps {
  selectedMethod: BillingMethod | null
  onSelect: (method: BillingMethod) => void
  onContinue: () => void
  onBack: () => void
}

function OptionButton({
  option,
  isSelected,
  onSelect,
  t,
}: {
  option: BillingOption
  isSelected: boolean
  onSelect: () => void
  t: (key: string) => string
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "hover:bg-foreground/[0.02] shadow-minimal",
        isSelected ? "bg-background" : "bg-foreground-2"
      )}
    >
      {/* Icon / Logo */}
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          isSelected ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {option.useLogo ? (
          <ProviderLogo provider={option.id} size={24} />
        ) : (
          option.icon
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{t(option.nameKey)}</span>
          {option.recommended && (
            <span className="bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
              {t('billingMethods.recommended')}
            </span>
          )}
        </div>
      </div>

      {/* Check */}
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

/**
 * BillingMethodStep - Choose how to pay for AI usage
 *
 * Primary options:
 * - Claude Pro/Max (recommended) - Uses Claude subscription
 * - API Key - Pay-as-you-go via Anthropic
 *
 * More options (expandable):
 * - MiniMax, 智谱 GLM, DeepSeek, Custom Endpoint
 */
export function BillingMethodStep({
  selectedMethod,
  onSelect,
  onContinue,
  onBack
}: BillingMethodStepProps) {
  const { t } = useLanguage()
  const [showMore, setShowMore] = useState(false)

  // Auto-expand if a "more" option is selected
  const isMoreOptionSelected = MORE_OPTIONS.some(opt => opt.id === selectedMethod)
  const shouldShowMore = showMore || isMoreOptionSelected

  return (
    <StepFormLayout
      title={t('billingMethods.chooseBillingMethod')}
      description={t('billingMethods.selectHowToPower')}
      actions={
        <>
          <BackButton onClick={onBack} />
          <ContinueButton onClick={onContinue} disabled={!selectedMethod} />
        </>
      }
    >
      {/* Primary Options */}
      <div className="space-y-3">
        {PRIMARY_OPTIONS.map((option) => (
          <OptionButton
            key={option.id}
            option={option}
            isSelected={option.id === selectedMethod}
            onSelect={() => onSelect(option.id)}
            t={t}
          />
        ))}
      </div>

      {/* More Options Toggle */}
      <button
        onClick={() => setShowMore(!shouldShowMore)}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2",
          "text-sm text-muted-foreground hover:text-foreground transition-colors"
        )}
      >
        <span>{t('billingMethods.moreOptions')}</span>
        {shouldShowMore ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </button>

      {/* Expanded Options */}
      {shouldShowMore && (
        <div className="mt-3 space-y-3">
          {MORE_OPTIONS.map((option) => (
            <OptionButton
              key={option.id}
              option={option}
              isSelected={option.id === selectedMethod}
              onSelect={() => onSelect(option.id)}
              t={t}
            />
          ))}
        </div>
      )}
    </StepFormLayout>
  )
}
