import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRegisterModal } from "@/context/ModalContext"
import { useLanguage } from "@/context/LanguageContext"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutItem[]
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
const cmdKey = isMac ? '⌘' : 'Ctrl'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-muted border border-border rounded shadow-sm">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  // Register with modal context so X button / Cmd+W closes this dialog first
  useRegisterModal(open, () => onOpenChange(false))
  const { t } = useLanguage()

  const sections: ShortcutSection[] = useMemo(() => [
    {
      title: t('keyboardShortcuts.global'),
      shortcuts: [
        { keys: [cmdKey, '1'], description: t('keyboardShortcuts.focusSidebar') },
        { keys: [cmdKey, '2'], description: t('keyboardShortcuts.focusSessionList') },
        { keys: [cmdKey, '3'], description: t('keyboardShortcuts.focusChatInput') },
        { keys: [cmdKey, 'N'], description: t('keyboardShortcuts.newChat') },
        { keys: [cmdKey, 'Shift', 'N'], description: t('keyboardShortcuts.newWindow') },
        { keys: [cmdKey, '\\'], description: t('keyboardShortcuts.toggleSidebar') },
        { keys: [cmdKey, ','], description: t('keyboardShortcuts.openSettings') },
        { keys: [cmdKey, '/'], description: t('keyboardShortcuts.showThisDialog') },
      ],
    },
    {
      title: t('keyboardShortcuts.navigation'),
      shortcuts: [
        { keys: ['Tab'], description: t('keyboardShortcuts.moveToNextZone') },
        { keys: ['Shift', 'Tab'], description: t('keyboardShortcuts.moveToPreviousZone') },
        { keys: ['←', '→'], description: t('keyboardShortcuts.moveBetweenZones') },
        { keys: ['↑', '↓'], description: t('keyboardShortcuts.navigateItems') },
        { keys: ['Home'], description: t('keyboardShortcuts.goToFirstItem') },
        { keys: ['End'], description: t('keyboardShortcuts.goToLastItem') },
        { keys: ['Esc'], description: t('keyboardShortcuts.closeDialogBlur') },
      ],
    },
    {
      title: t('keyboardShortcuts.sessionList'),
      shortcuts: [
        { keys: ['Enter'], description: t('keyboardShortcuts.focusChatInput') },
        { keys: ['Delete'], description: t('keyboardShortcuts.deleteSession') },
        { keys: ['R'], description: t('keyboardShortcuts.renameSession') },
        { keys: ['Right-click'], description: t('keyboardShortcuts.openContextMenu') },
      ],
    },
    {
      title: t('keyboardShortcuts.agentTree'),
      shortcuts: [
        { keys: ['←'], description: t('keyboardShortcuts.collapseFolder') },
        { keys: ['→'], description: t('keyboardShortcuts.expandFolder') },
      ],
    },
    {
      title: t('keyboardShortcuts.chat'),
      shortcuts: [
        { keys: ['Enter'], description: t('keyboardShortcuts.sendMessage') },
        { keys: ['Shift', 'Enter'], description: t('keyboardShortcuts.newLine') },
        { keys: [cmdKey, 'Enter'], description: t('keyboardShortcuts.sendMessage') },
      ],
    },
  ], [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('keyboardShortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <Kbd key={keyIndex}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
