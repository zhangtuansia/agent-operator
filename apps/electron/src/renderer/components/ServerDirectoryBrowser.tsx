import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRegisterModal } from '@/context/ModalContext'
import { useLanguage } from '@/context/LanguageContext'
import { FolderIcon, FolderOpenIcon } from 'lucide-react'

/**
 * Detect paths that are clearly from the wrong platform.
 * The server directory browser runs against the server's filesystem,
 * so Windows-style paths are invalid when the server is macOS/Linux and vice versa.
 * We infer the server platform from the home directory path.
 */
function isWrongPlatformPath(path: string, serverHomePath: string | null): boolean {
  if (!serverHomePath) return false
  const serverIsUnix = serverHomePath.startsWith('/')
  if (serverIsUnix) {
    // Unix server - reject Windows absolute paths (C:\, D:\, \\server)
    return /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')
  }
  // Server is Windows — reject Unix absolute paths
  return path.startsWith('/')
}

/**
 * Get a user-friendly platform mismatch error message.
 */
function getPlatformMismatchMessage(
  path: string,
  serverHomePath: string | null,
  t: (key: string) => string,
): string | null {
  if (!serverHomePath || !isWrongPlatformPath(path, serverHomePath)) return null
  const serverIsUnix = serverHomePath.startsWith('/')

  if (serverIsUnix) {
    // User entered a Windows path on a Unix server
    return t('serverDirectoryBrowser.wrongPlatformUnix')
  }
  // User entered a Unix path on a Windows server
  return t('serverDirectoryBrowser.wrongPlatformWindows')
}

interface ServerDirectoryBrowserProps {
  open: boolean
  /** 'browse' uses native folder dialog, 'manual' allows typing a path */
  mode: 'browse' | 'manual'
  onSelect: (path: string) => void
  onCancel: () => void
  initialPath?: string
}

/**
 * ServerDirectoryBrowser - Dialog for selecting a directory on the server.
 *
 * Supports two modes:
 * - browse: Opens native folder dialog via electronAPI
 * - manual: Text input for manually entering a path
 *
 * Features:
 * - Cross-platform path validation (detects Windows paths on Mac and vice versa)
 * - Chinese and English translations
 * - Native folder picker integration
 */
export function ServerDirectoryBrowser({
  open,
  mode,
  onSelect,
  onCancel,
  initialPath,
}: ServerDirectoryBrowserProps) {
  useRegisterModal(open, onCancel)
  const { t } = useLanguage()

  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [serverHomePath, setServerHomePath] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch server home dir on open (for platform detection)
  useEffect(() => {
    if (!open) {
      setError(null)
      setPathInput('')
      setServerHomePath(null)
      return
    }

    const init = async () => {
      try {
        const homeDir = await window.electronAPI.getHomeDir()
        setServerHomePath(homeDir)
      } catch {
        // Ignore - platform detection will be unavailable
      }

      if (initialPath && mode === 'manual') {
        setPathInput(initialPath)
      }
    }
    void init()
  }, [open, mode, initialPath])

  // Auto-focus input in manual mode
  useEffect(() => {
    if (open && mode === 'manual') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, mode])

  // Handle native folder dialog (browse mode)
  const handleBrowse = useCallback(async () => {
    try {
      const selectedPath = await window.electronAPI.openFolderDialog()
      if (selectedPath) {
        // Validate platform before accepting
        const mismatch = getPlatformMismatchMessage(selectedPath, serverHomePath, t)
        if (mismatch) {
          setError(mismatch)
          return
        }
        onSelect(selectedPath)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('serverDirectoryBrowser.browseError'))
    }
  }, [onSelect, serverHomePath, t])

  // Handle path input submission
  const handlePathSubmit = useCallback(() => {
    const trimmed = pathInput.trim()
    if (!trimmed) return

    // Client-side rejection of wrong-platform paths
    const mismatch = getPlatformMismatchMessage(trimmed, serverHomePath, t)
    if (mismatch) {
      setError(mismatch)
      return
    }

    setError(null)
    onSelect(trimmed)
  }, [pathInput, onSelect, serverHomePath, t])

  // Handle select action
  const handleSelect = useCallback(() => {
    if (mode === 'browse') {
      void handleBrowse()
    } else {
      handlePathSubmit()
    }
  }, [mode, handleBrowse, handlePathSubmit])

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('serverDirectoryBrowser.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode === 'browse' ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('serverDirectoryBrowser.browseDescription')}
              </p>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-12"
                onClick={handleBrowse}
                aria-label={t('serverDirectoryBrowser.browseButton')}
              >
                <FolderOpenIcon className="h-5 w-5 text-muted-foreground" />
                <span>{t('serverDirectoryBrowser.browseButton')}</span>
              </Button>

              {/* Or enter manually */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-popover px-2 text-muted-foreground">
                    {t('serverDirectoryBrowser.orEnterManually')}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={pathInput}
                  onChange={e => { setPathInput(e.target.value); setError(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handlePathSubmit()
                  }}
                  placeholder={t('serverDirectoryBrowser.pathPlaceholder')}
                  className="flex-1 font-mono text-xs"
                  aria-label={t('serverDirectoryBrowser.pathInputLabel')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePathSubmit}
                  disabled={!pathInput.trim()}
                  aria-label={t('serverDirectoryBrowser.goButton')}
                >
                  {t('serverDirectoryBrowser.goButton')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('serverDirectoryBrowser.manualDescription')}
              </p>
              <div className="flex gap-2">
                <FolderIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-2" />
                <Input
                  ref={inputRef}
                  value={pathInput}
                  onChange={e => { setPathInput(e.target.value); setError(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSelect()
                  }}
                  placeholder={t('serverDirectoryBrowser.pathPlaceholder')}
                  className="font-mono text-xs"
                  autoFocus
                  aria-label={t('serverDirectoryBrowser.pathInputLabel')}
                />
              </div>
            </>
          )}

          {/* Error display */}
          {error && (
            <div className="px-3 py-2 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('serverDirectoryBrowser.cancel')}
          </Button>
          {mode === 'manual' && (
            <Button
              onClick={handleSelect}
              disabled={!pathInput.trim()}
            >
              {t('serverDirectoryBrowser.select')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
