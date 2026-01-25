import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Check } from 'lucide-react'
import { Icon_Folder } from '@agent-operator/ui'

import * as storage from '@/lib/local-storage'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FreeFormInputContextBadge } from './FreeFormInputContextBadge'
import { useTranslation } from '@/i18n'

/**
 * Helper functions for recent directories storage
 */
function getRecentDirs(): string[] {
  return storage.get<string[]>(storage.KEYS.recentWorkingDirs, [])
}

function addRecentDir(path: string): void {
  const recent = getRecentDirs().filter(p => p !== path)
  const updated = [path, ...recent].slice(0, 25)
  storage.set(storage.KEYS.recentWorkingDirs, updated)
}

/**
 * Format path for display, with home directory shortened
 */
function formatPathForDisplay(path: string, homeDir: string): string {
  let displayPath = path
  if (homeDir && path.startsWith(homeDir)) {
    const relativePath = path.slice(homeDir.length)
    displayPath = relativePath || '/'
  }
  return `in ${displayPath}`
}

export interface WorkingDirectoryBadgeProps {
  workingDirectory?: string
  onWorkingDirectoryChange: (path: string) => void
  sessionFolderPath?: string
  isEmptySession?: boolean
}

/**
 * WorkingDirectoryBadge - Context badge for selecting working directory
 * Uses cmdk for filterable folder list when there are more than 5 recent folders.
 */
export function WorkingDirectoryBadge({
  workingDirectory,
  onWorkingDirectoryChange,
  sessionFolderPath,
  isEmptySession = false,
}: WorkingDirectoryBadgeProps) {
  const { t } = useTranslation()
  const [recentDirs, setRecentDirs] = React.useState<string[]>([])
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [homeDir, setHomeDir] = React.useState<string>('')
  const [filter, setFilter] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load home directory and recent directories on mount
  React.useEffect(() => {
    setRecentDirs(getRecentDirs())
    window.electronAPI?.getHomeDir?.().then((dir: string) => {
      if (dir) setHomeDir(dir)
    })
  }, [])

  // Reset filter and focus input when popover opens
  React.useEffect(() => {
    if (popoverOpen) {
      setFilter('')
      // Focus input after popover animation completes (only if filter is shown)
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [popoverOpen])

  const handleChooseFolder = async () => {
    if (!window.electronAPI) return
    setPopoverOpen(false)
    const selectedPath = await window.electronAPI.openFolderDialog()
    if (selectedPath) {
      addRecentDir(selectedPath)
      setRecentDirs(getRecentDirs())
      onWorkingDirectoryChange(selectedPath)
    }
  }

  const handleSelectRecent = (path: string) => {
    addRecentDir(path) // Move to top of recent list
    setRecentDirs(getRecentDirs())
    onWorkingDirectoryChange(path)
    setPopoverOpen(false)
  }

  const handleReset = () => {
    if (sessionFolderPath) {
      onWorkingDirectoryChange(sessionFolderPath)
      setPopoverOpen(false)
    }
  }

  // Filter out current directory from recent list and sort alphabetically by folder name
  const filteredRecent = recentDirs
    .filter(p => p !== workingDirectory)
    .sort((a, b) => {
      const nameA = (a.split('/').pop() || '').toLowerCase()
      const nameB = (b.split('/').pop() || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
  // Show filter input only when more than 5 recent folders
  const showFilter = filteredRecent.length > 5

  // Determine label - "Work in Folder" if not set or at session root, otherwise folder name
  const hasFolder = !!workingDirectory && workingDirectory !== sessionFolderPath
  const folderName = hasFolder ? (workingDirectory.split('/').pop() || 'Folder') : t('input.workInFolder')

  // Show reset option when a folder is selected and it differs from session folder
  const showReset = hasFolder && sessionFolderPath && sessionFolderPath !== workingDirectory

  // Styles matching todo-filter-menu.tsx for consistency
  const MENU_CONTAINER_STYLE = 'min-w-[200px] max-w-[400px] overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small p-0'
  const MENU_LIST_STYLE = 'max-h-[200px] overflow-y-auto p-1 [&_[cmdk-list-sizer]]:space-y-px'
  const MENU_ITEM_STYLE = 'flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] outline-none'

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <span>
          <FreeFormInputContextBadge
            icon={<Icon_Folder className="h-4 w-4" strokeWidth={1.75} />}
            label={folderName}
            isExpanded={isEmptySession}
            hasSelection={hasFolder}
            showChevron={true}
            isOpen={popoverOpen}
            tooltip={
              hasFolder ? (
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{t('input.workInFolder')}</span>
                  <span className="text-xs opacity-70">{formatPathForDisplay(workingDirectory, homeDir)}</span>
                </span>
              ) : t('input.chooseWorkingDir')
            }
          />
        </span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className={MENU_CONTAINER_STYLE}>
        <CommandPrimitive shouldFilter={showFilter}>
          {/* Filter input - only shown when more than 5 recent folders */}
          {showFilter && (
            <div className="border-b border-border/50 px-3 py-2">
              <CommandPrimitive.Input
                ref={inputRef}
                value={filter}
                onValueChange={setFilter}
                placeholder={t('input.filterFolders')}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          <CommandPrimitive.List className={MENU_LIST_STYLE}>
            {/* Current Folder Display - shown at top with checkmark */}
            {hasFolder && (
              <CommandPrimitive.Item
                value={`current-${workingDirectory}`}
                className={cn(MENU_ITEM_STYLE, 'pointer-events-none bg-foreground/5')}
                disabled
              >
                <Icon_Folder className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="flex-1 min-w-0 truncate">
                  <span>{folderName}</span>
                  <span className="text-muted-foreground ml-1.5">{formatPathForDisplay(workingDirectory, homeDir)}</span>
                </span>
                <Check className="h-4 w-4 shrink-0" />
              </CommandPrimitive.Item>
            )}

            {/* Separator after current folder */}
            {hasFolder && filteredRecent.length > 0 && (
              <div className="h-px bg-border my-1 mx-1" />
            )}

            {/* Recent Directories - filterable (current directory already filtered out via filteredRecent) */}
            {filteredRecent.map((path) => {
              const recentFolderName = path.split('/').pop() || 'Folder'
              return (
                <CommandPrimitive.Item
                  key={path}
                  value={`${recentFolderName} ${path}`}
                  onSelect={() => handleSelectRecent(path)}
                  className={cn(MENU_ITEM_STYLE, 'data-[selected=true]:bg-foreground/5')}
                >
                  <Icon_Folder className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="flex-1 min-w-0 truncate">
                    <span>{recentFolderName}</span>
                    <span className="text-muted-foreground ml-1.5">{formatPathForDisplay(path, homeDir)}</span>
                  </span>
                </CommandPrimitive.Item>
              )
            })}

            {/* Empty state when filtering */}
            {showFilter && (
              <CommandPrimitive.Empty className="py-3 text-center text-sm text-muted-foreground">
                {t('input.noFoldersFound')}
              </CommandPrimitive.Empty>
            )}
          </CommandPrimitive.List>

          {/* Bottom actions - always visible, outside scrollable area */}
          <div className="border-t border-border/50 p-1">
            <button
              type="button"
              onClick={handleChooseFolder}
              className={cn(MENU_ITEM_STYLE, 'w-full hover:bg-foreground/5')}
            >
              {t('input.chooseFolder')}
            </button>
            {showReset && (
              <button
                type="button"
                onClick={handleReset}
                className={cn(MENU_ITEM_STYLE, 'w-full hover:bg-foreground/5')}
              >
                {t('input.reset')}
              </button>
            )}
          </div>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  )
}

// Re-export helper functions for use by slash command menu
export { getRecentDirs, addRecentDir }
