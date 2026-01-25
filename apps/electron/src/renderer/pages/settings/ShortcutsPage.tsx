/**
 * ShortcutsPage
 *
 * Displays keyboard shortcuts reference.
 */

import * as React from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsSection, SettingsCard, SettingsRow } from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import { useLanguage } from '@/context/LanguageContext'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'shortcuts',
}

interface ShortcutItem {
  keys: string[]
  descriptionKey: keyof typeof import('@/i18n/en').en.shortcuts
}

interface ShortcutSection {
  titleKey: keyof typeof import('@/i18n/en').en.shortcuts
  shortcuts: ShortcutItem[]
}

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0
const cmdKey = isMac ? '⌘' : 'Ctrl'

const sections: ShortcutSection[] = [
  {
    titleKey: 'global',
    shortcuts: [
      { keys: [cmdKey, '1'], descriptionKey: 'focusSidebar' },
      { keys: [cmdKey, '2'], descriptionKey: 'focusSessionList' },
      { keys: [cmdKey, '3'], descriptionKey: 'focusChatInput' },
      { keys: [cmdKey, 'N'], descriptionKey: 'newChat' },
      { keys: [cmdKey, 'B'], descriptionKey: 'toggleSidebar' },
      { keys: [cmdKey, ','], descriptionKey: 'openSettings' },
    ],
  },
  {
    titleKey: 'navigation',
    shortcuts: [
      { keys: ['Tab'], descriptionKey: 'moveToNextZone' },
      { keys: ['Shift', 'Tab'], descriptionKey: 'moveToPrevZone' },
      { keys: ['←', '→'], descriptionKey: 'moveBetweenZones' },
      { keys: ['↑', '↓'], descriptionKey: 'navigateItems' },
      { keys: ['Home'], descriptionKey: 'goToFirst' },
      { keys: ['End'], descriptionKey: 'goToLast' },
      { keys: ['Esc'], descriptionKey: 'closeDialog' },
    ],
  },
  {
    titleKey: 'sessionList',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'focusChatInputEnter' },
      { keys: ['Delete'], descriptionKey: 'deleteSession' },
    ],
  },
  {
    titleKey: 'chat',
    shortcuts: [
      { keys: [cmdKey, 'Enter'], descriptionKey: 'sendMessage' },
      { keys: ['Enter'], descriptionKey: 'newLine' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

export default function ShortcutsPage() {
  const { t } = useLanguage()

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('shortcuts.title')} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto space-y-6">
            {sections.map((section) => (
              <SettingsSection key={section.titleKey} title={t(`shortcuts.${section.titleKey}`)}>
                <SettingsCard>
                  {section.shortcuts.map((shortcut, index) => (
                    <SettingsRow key={index} label={t(`shortcuts.${shortcut.descriptionKey}`)}>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <Kbd key={keyIndex}>{key}</Kbd>
                        ))}
                      </div>
                    </SettingsRow>
                  ))}
                </SettingsCard>
              </SettingsSection>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
