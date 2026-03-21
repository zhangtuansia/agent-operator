/**
 * ShortcutsPage
 *
 * Displays keyboard shortcuts reference, auto-generated from the action
 * registry with supplementary manual shortcuts for context-specific actions.
 *
 * This follows the Craft pattern of deriving shortcuts from the action
 * registry (actionsByCategory) so the page is always in sync with the
 * actual hotkey bindings -- including any user overrides.
 */

import * as React from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { useLanguage } from '@/context/LanguageContext'
import { actionsByCategory, useActionLabel, type ActionId } from '@/actions'
import type { ActionDefinition } from '@/actions'

interface ManualShortcutItem {
  keys: string[]
  descriptionKey: string
}

interface ManualShortcutSection {
  titleKey: string
  shortcuts: ManualShortcutItem[]
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-muted border border-border rounded shadow-sm ${className || ''}`}>
      {children}
    </kbd>
  )
}

/**
 * A row auto-generated from the action registry.
 */
function ActionShortcutRow({ actionId }: { actionId: ActionId }) {
  const { label, description, hotkey } = useActionLabel(actionId)
  const { t } = useLanguage()

  // Try i18n key first, fallback to action definition label
  const i18nKey = `actions.${actionId}`
  const translatedLabel = t(i18nKey)
  const displayLabel = translatedLabel !== i18nKey ? translatedLabel : label

  if (!hotkey) return null

  return (
    <div className="group flex items-center justify-between py-1.5">
      <span className="text-sm">{displayLabel}</span>
      <div className="flex-1 mx-3 h-px bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_8px)] opacity-0 group-hover:opacity-15" />
      <div className="flex items-center gap-0.5 shrink-0">
        {hotkey.split('').map((char, i) => (
          <Kbd key={i} className="group-hover:bg-foreground/10 group-hover:border-foreground/20">{char}</Kbd>
        ))}
      </div>
    </div>
  )
}

/** Category order for display */
const CATEGORY_ORDER = ['General', 'Navigation', 'View', 'Session List', 'Chat']

/** Category display name i18n keys */
const CATEGORY_I18N: Record<string, string> = {
  'General': 'shortcuts.global',
  'Navigation': 'shortcuts.navigation',
  'View': 'shortcuts.view',
  'Session List': 'shortcuts.sessionList',
  'Chat': 'shortcuts.chat',
}

/**
 * Manual shortcuts that are context-specific and not in the action registry.
 */
const manualSections: ManualShortcutSection[] = [
  {
    titleKey: 'shortcuts.agentTree',
    shortcuts: [
      { keys: ['\u2190'], descriptionKey: 'shortcuts.collapseFolder' },
      { keys: ['\u2192'], descriptionKey: 'shortcuts.expandFolder' },
    ],
  },
  {
    titleKey: 'shortcuts.contextActions',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'shortcuts.sendMessage' },
      { keys: ['Shift', 'Enter'], descriptionKey: 'shortcuts.newLine' },
      { keys: ['Delete'], descriptionKey: 'shortcuts.deleteSession' },
      { keys: ['R'], descriptionKey: 'shortcuts.renameSession' },
      { keys: ['Home'], descriptionKey: 'shortcuts.goToFirst' },
      { keys: ['End'], descriptionKey: 'shortcuts.goToLast' },
      { keys: ['Right-click'], descriptionKey: 'shortcuts.openContextMenu' },
    ],
  },
]

export default function ShortcutsPage() {
  const { t } = useLanguage()

  const sortedCategories = React.useMemo(() => {
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

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('shortcuts.title')} actions={<HeaderMenu route={routes.view.settings('shortcuts')} />} />
      <Separator />
      <ScrollArea className="flex-1">
        <div className="px-5 py-4">
          <div className="space-y-6">
            {/* Auto-generated from action registry */}
            {sortedCategories.map((category) => {
              const actionsInCategory = actionsByCategory[category] || []
              const withHotkey = actionsInCategory.filter(
                (a: ActionDefinition) => a.defaultHotkey !== null
              )
              if (withHotkey.length === 0) return null

              const titleKey = CATEGORY_I18N[category]
              const title = titleKey ? t(titleKey) : category

              return (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1.5 border-b border-border/50">
                    {title}
                  </h3>
                  <div className="space-y-0.5">
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
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1.5 border-b border-border/50">
                  {t(section.titleKey)}
                </h3>
                <div className="space-y-0.5">
                  {section.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="group flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm">{t(shortcut.descriptionKey)}</span>
                      <div className="flex-1 mx-3 h-px bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_8px)] opacity-0 group-hover:opacity-15" />
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <Kbd key={keyIndex} className="group-hover:bg-foreground/10 group-hover:border-foreground/20">{key}</Kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
