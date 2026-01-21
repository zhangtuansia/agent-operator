import { CraftAgentsSymbol } from "@/components/icons/CraftAgentsSymbol"
import { StepFormLayout, ContinueButton } from "./primitives"

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
  return (
    <StepFormLayout
      iconElement={
        <div className="flex size-16 items-center justify-center">
          <CraftAgentsSymbol className="size-10 text-accent" />
        </div>
      }
      title={isExistingUser ? 'Update Settings' : 'Welcome to Cowork'}
      description={
        isExistingUser
          ? 'Update billing or change your setup.'
          : 'Your AI-powered workspace. Connect anything. Organize your sessions. Everything you need to collaborate effectively!'
      }
      actions={
        <ContinueButton onClick={onContinue} className="w-full">
          {isExistingUser ? 'Continue' : 'Get Started'}
        </ContinueButton>
      }
    />
  )
}
