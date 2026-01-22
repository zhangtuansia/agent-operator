/**
 * ShortcutsPage
 *
 * Displays keyboard shortcuts reference.
 */

import * as React from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { useLanguage } from '@/context/LanguageContext'

interface ShortcutItem {
  keys: string[]
  descriptionKey: string
}

interface ShortcutSection {
  titleKey: string
  shortcuts: ShortcutItem[]
}

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0
const cmdKey = isMac ? '⌘' : 'Ctrl'

const sections: ShortcutSection[] = [
  {
    titleKey: 'shortcuts.global',
    shortcuts: [
      { keys: [cmdKey, '1'], descriptionKey: 'shortcuts.focusSidebar' },
      { keys: [cmdKey, '2'], descriptionKey: 'shortcuts.focusSessionList' },
      { keys: [cmdKey, '3'], descriptionKey: 'shortcuts.focusChatInput' },
      { keys: [cmdKey, 'N'], descriptionKey: 'shortcuts.newChat' },
      { keys: [cmdKey, 'B'], descriptionKey: 'shortcuts.toggleSidebar' },
      { keys: [cmdKey, ','], descriptionKey: 'shortcuts.openSettings' },
      { keys: [cmdKey, '/'], descriptionKey: 'shortcuts.showShortcuts' },
    ],
  },
  {
    titleKey: 'shortcuts.navigation',
    shortcuts: [
      { keys: ['Tab'], descriptionKey: 'shortcuts.moveToNextZone' },
      { keys: ['Shift', 'Tab'], descriptionKey: 'shortcuts.moveToPrevZone' },
      { keys: ['←', '→'], descriptionKey: 'shortcuts.moveBetweenZones' },
      { keys: ['↑', '↓'], descriptionKey: 'shortcuts.navigateItems' },
      { keys: ['Home'], descriptionKey: 'shortcuts.goToFirst' },
      { keys: ['End'], descriptionKey: 'shortcuts.goToLast' },
      { keys: ['Esc'], descriptionKey: 'shortcuts.closeDialog' },
    ],
  },
  {
    titleKey: 'shortcuts.sessionList',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'shortcuts.focusChatInputEnter' },
      { keys: ['Delete'], descriptionKey: 'shortcuts.deleteSession' },
      { keys: ['R'], descriptionKey: 'shortcuts.renameSession' },
      { keys: ['Right-click'], descriptionKey: 'shortcuts.openContextMenu' },
    ],
  },
  {
    titleKey: 'shortcuts.agentTree',
    shortcuts: [
      { keys: ['←'], descriptionKey: 'shortcuts.collapseFolder' },
      { keys: ['→'], descriptionKey: 'shortcuts.expandFolder' },
    ],
  },
  {
    titleKey: 'shortcuts.chat',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'shortcuts.sendMessage' },
      { keys: ['Shift', 'Enter'], descriptionKey: 'shortcuts.newLine' },
      { keys: [cmdKey, 'Enter'], descriptionKey: 'shortcuts.sendMessage' },
      { keys: ['Esc'], descriptionKey: 'shortcuts.stopAgent' },
    ],
  },
]

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-muted border border-border rounded shadow-sm ${className || ''}`}>
      {children}
    </kbd>
  )
}

export default function ShortcutsPage() {
  const { t } = useLanguage()

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('shortcuts.title')} actions={<HeaderMenu route={routes.view.settings('shortcuts')} />} />
      <Separator />
      <ScrollArea className="flex-1">
        <div className="px-5 py-4">
          <div className="space-y-6">
            {sections.map((section) => (
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
