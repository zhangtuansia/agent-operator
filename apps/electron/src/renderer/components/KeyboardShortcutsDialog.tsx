import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRegisterModal } from "@/context/ModalContext"
import { useLanguage } from "@/context/LanguageContext"
import { actionsByCategory, useActionLabel, type ActionId } from '@/actions'
import type { ActionDefinition } from '@/actions'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ManualShortcutItem {
  keys: string[]
  descriptionKey: string
}

interface ManualShortcutSection {
  titleKey: string
  shortcuts: ManualShortcutItem[]
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

/**
 * A row that auto-generates its label and hotkey from the action registry.
 * Respects user hotkey overrides and i18n labels.
 */
function ActionShortcutRow({ actionId }: { actionId: ActionId }) {
  const { label, description, hotkey } = useActionLabel(actionId)
  const { t } = useLanguage()

  // Try i18n key first, fallback to action definition label
  const i18nKey = `actions.${actionId}`
  const translatedLabel = t(i18nKey)
  const displayLabel = translatedLabel !== i18nKey ? translatedLabel : label

  const descI18nKey = `actions.${actionId}.description`
  const translatedDesc = t(descI18nKey)
  const displayDesc = translatedDesc !== descI18nKey ? translatedDesc : description

  if (!hotkey) return null

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1 min-w-0 pr-3">
        <span className="text-sm">{displayLabel}</span>
        {displayDesc && (
          <span className="text-xs text-muted-foreground ml-1.5">- {displayDesc}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {hotkey.split('').map((char, i) => (
          <Kbd key={i}>{char}</Kbd>
        ))}
      </div>
    </div>
  )
}

/**
 * A row for manually-defined shortcuts (not in action registry).
 */
function ManualShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, keyIndex) => (
          <Kbd key={keyIndex}>{key}</Kbd>
        ))}
      </div>
    </div>
  )
}

/**
 * Category order for display. Categories not listed here will appear after
 * these in alphabetical order.
 */
const CATEGORY_ORDER = ['General', 'Navigation', 'View', 'Session List', 'Chat']

/** Category display name i18n keys */
const CATEGORY_I18N: Record<string, string> = {
  'General': 'keyboardShortcuts.general',
  'Navigation': 'keyboardShortcuts.navigation',
  'View': 'keyboardShortcuts.view',
  'Session List': 'keyboardShortcuts.sessionList',
  'Chat': 'keyboardShortcuts.chat',
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  // Register with modal context so X button / Cmd+W closes this dialog first
  useRegisterModal(open, () => onOpenChange(false))
  const { t } = useLanguage()

  // Build sorted category list from the action registry
  const sortedCategories = useMemo(() => {
    const categories = Object.keys(actionsByCategory)
    return categories.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.localeCompare(b)
    })
  }, [])

  // Supplementary manual shortcuts (not in action registry)
  // These cover contextual and non-hotkey shortcuts users should know about
  const manualSections: ManualShortcutSection[] = useMemo(() => [
    {
      titleKey: 'keyboardShortcuts.agentTree',
      shortcuts: [
        { keys: ['\u2190'], descriptionKey: 'keyboardShortcuts.collapseFolder' },
        { keys: ['\u2192'], descriptionKey: 'keyboardShortcuts.expandFolder' },
      ],
    },
    {
      titleKey: 'keyboardShortcuts.contextActions',
      shortcuts: [
        { keys: ['Enter'], descriptionKey: 'keyboardShortcuts.sendMessage' },
        { keys: ['Shift', 'Enter'], descriptionKey: 'keyboardShortcuts.newLine' },
        { keys: ['Delete'], descriptionKey: 'keyboardShortcuts.deleteSession' },
        { keys: ['R'], descriptionKey: 'keyboardShortcuts.renameSession' },
        { keys: ['Home'], descriptionKey: 'keyboardShortcuts.goToFirstItem' },
        { keys: ['End'], descriptionKey: 'keyboardShortcuts.goToLastItem' },
      ],
    },
  ], [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('keyboardShortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {/* Auto-generated sections from action registry */}
          {sortedCategories.map((category) => {
            const actionsInCategory = actionsByCategory[category] || []
            // Only show actions that have a hotkey
            const withHotkey = actionsInCategory.filter(
              (a: ActionDefinition) => a.defaultHotkey !== null
            )
            if (withHotkey.length === 0) return null

            const titleKey = CATEGORY_I18N[category]
            const title = titleKey ? t(titleKey) : category

            return (
              <div key={category}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {title}
                </h3>
                <div className="space-y-1.5">
                  {withHotkey.map((action: ActionDefinition) => (
                    <ActionShortcutRow
                      key={action.id}
                      actionId={action.id as ActionId}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Manual supplementary sections */}
          {manualSections.map((section) => (
            <div key={section.titleKey}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t(section.titleKey)}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut, index) => (
                  <ManualShortcutRow
                    key={index}
                    keys={shortcut.keys}
                    description={t(shortcut.descriptionKey)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
