import { CraftAgentsSymbol } from "@/components/icons/CraftAgentsSymbol"
import { StepFormLayout, ContinueButton } from "./primitives"
import { useTranslation } from "@/i18n"

interface WelcomeStepProps {
  onContinue: () => void
  /** Whether this is an existing user updating settings */
  isExistingUser?: boolean
}

/**
 * WelcomeStep - Initial welcome screen for onboarding
 *
 * Shows different messaging for new vs existing users:
 * - New users: Welcome to Cowork
 * - Existing users: Update your billing settings
 */
export function WelcomeStep({
  onContinue,
  isExistingUser = false
}: WelcomeStepProps) {
  const { t } = useTranslation()
  return (
    <StepFormLayout
      iconElement={
        <div className="flex size-16 items-center justify-center">
          <CraftAgentsSymbol className="size-10 text-accent" />
        </div>
      }
      title={isExistingUser ? t('onboarding.updateSettings') : t('onboarding.welcome')}
      description={
        isExistingUser
          ? t('onboarding.updateSettingsDesc')
          : t('onboarding.welcomeDescription')
      }
      actions={
        <ContinueButton onClick={onContinue} className="w-full">
          {isExistingUser ? t('onboarding.continue') : t('onboarding.getStarted')}
        </ContinueButton>
      }
    />
  )
}
