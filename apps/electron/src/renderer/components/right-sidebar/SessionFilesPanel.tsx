/**
 * SessionFilesPanel - File preview panel for the right sidebar
 *
 * Features:
 * - Displays file content with syntax highlighting for code
 * - Renders markdown files
 * - Shows images inline
 * - File tree navigation when no file is selected
 * - Breadcrumb navigation for selected files
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '../app-shell/PanelHeader'
import { SessionFilesSection } from './SessionFilesSection'
import { Markdown, MarkdownExcalidrawBlock } from '@/components/markdown'
import { Spinner } from '@agent-operator/ui'
import { ArrowLeft, FileText, Image as ImageIcon, Code, File, ExternalLink, Copy, Check, Eye, FileCode, FolderOpen, MoreHorizontal, PenTool } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

export interface SessionFilesPanelProps {
  /** Session ID for file tree */
  sessionId?: string
  /** Optional file path to display */
  filePath?: string
  /** Close button for the panel header */
  closeButton?: React.ReactNode
  /** Callback when a file is selected */
  onFileSelect?: (path: string | undefined) => void
  /** Hide the panel header (useful when embedded in another panel) */
  hideHeader?: boolean
}

/** File type detection based on extension */
type FileType = 'code' | 'markdown' | 'image' | 'text' | 'binary' | 'html' | 'excalidraw'

/** Check if file is HTML */
function isHtmlFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ['html', 'htm'].includes(ext)
}

/** Check if file is Excalidraw */
function isExcalidrawFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith('.excalidraw') || lower.endsWith('.excalidraw.json')
}

/** Get file type from extension */
function getFileType(filename: string): FileType {
  if (isExcalidrawFile(filename)) {
    return 'excalidraw'
  }

  const ext = filename.split('.').pop()?.toLowerCase() || ''

  // HTML files (can be previewed)
  if (['html', 'htm'].includes(ext)) {
    return 'html'
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
    return 'image'
  }

  // Markdown
  if (['md', 'markdown', 'mdx'].includes(ext)) {
    return 'markdown'
  }

  // Code files
  if ([
    'ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php',
    'css', 'scss', 'less', 'sass',
    'sh', 'bash', 'zsh', 'fish',
    'sql', 'graphql', 'prisma',
    'toml', 'ini', 'env', 'conf', 'config',
    'xml', 'plist', 'lock'
  ].includes(ext)) {
    return 'code'
  }

  // Plain text
  if (['txt', 'log', 'csv', 'tsv', 'gitignore', 'dockerignore', 'editorconfig'].includes(ext)) {
    return 'text'
  }

  // Binary (non-previewable)
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'tar', 'gz', 'rar', '7z', 'exe', 'dmg', 'pkg', 'deb', 'rpm'].includes(ext)) {
    return 'binary'
  }

  // Default to text for unknown extensions (try to display)
  return 'text'
}

/** Get language hint for syntax highlighting */
function getLanguageHint(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    xml: 'xml',
    toml: 'toml',
    ini: 'ini',
    prisma: 'prisma',
  }

  return langMap[ext] || 'text'
}

/** Get icon for file type */
function getFileTypeIcon(type: FileType) {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-4 w-4" />
    case 'markdown':
      return <FileText className="h-4 w-4" />
    case 'code':
      return <Code className="h-4 w-4" />
    case 'html':
      return <FileCode className="h-4 w-4" />
    case 'excalidraw':
      return <PenTool className="h-4 w-4" />
    default:
      return <File className="h-4 w-4" />
  }
}

/** View mode for HTML files */
type ViewMode = 'code' | 'preview'

/**
 * File content viewer component
 */
function FileViewer({
  sessionId,
  filePath,
  onBack,
}: {
  sessionId?: string
  filePath: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('preview') // Default to preview for HTML
  const contentScrollRef = React.useRef<HTMLDivElement | null>(null)

  const filename = filePath.split('/').pop() || filePath
  const fileType = getFileType(filename)

  const loadFile = useCallback(
    async (options?: { showLoading?: boolean; preserveScroll?: boolean }) => {
      const { showLoading = true, preserveScroll = false } = options ?? {}
      const previousScroll = preserveScroll && contentScrollRef.current
        ? {
            top: contentScrollRef.current.scrollTop,
            left: contentScrollRef.current.scrollLeft,
          }
        : null

      if (showLoading) {
        setIsLoading(true)
      }
      setError(null)

      try {
        if (fileType === 'binary') {
          // Don't try to load binary files
          setContent(null)
          return
        }

        const result = await window.electronAPI.readFile(filePath)
        setContent(result)

        if (previousScroll) {
          requestAnimationFrame(() => {
            if (!contentScrollRef.current) return
            contentScrollRef.current.scrollTop = previousScroll.top
            contentScrollRef.current.scrollLeft = previousScroll.left
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('fileViewer.failedToLoad'))
      } finally {
        if (showLoading) {
          setIsLoading(false)
        }
      }
    },
    [filePath, fileType, t],
  )

  // Load file content
  useEffect(() => {
    void loadFile()
  }, [loadFile])

  // Hot refresh currently opened file when it changes on disk
  useEffect(() => {
    if (!sessionId) return

    const normalizePath = (path: string) => path.replace(/\\/g, '/')
    const currentPath = normalizePath(filePath)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const unsubscribe = window.electronAPI.onSessionFilesChanged((event) => {
      if (event.sessionId !== sessionId) return
      // fs.watch may occasionally emit null filename; treat that as a generic
      // change and refresh the currently opened file.
      if (event.changedPath && normalizePath(event.changedPath) !== currentPath) return

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      // Debounce bursts from editors that save via temp files/rename.
      debounceTimer = setTimeout(() => {
        void loadFile({ showLoading: false, preserveScroll: true })
      }, 200)
    })

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      unsubscribe()
    }
  }, [sessionId, filePath, loadFile])

  // Handle copy content
  const handleCopy = useCallback(async () => {
    if (!content) return

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content])

  // Handle open with default app
  const handleOpenWithApp = useCallback(() => {
    window.electronAPI.openFile(filePath)
  }, [filePath])

  // Handle show in Finder
  const handleShowInFinder = useCallback(() => {
    window.electronAPI.showInFolder(filePath)
  }, [filePath])

  // Render loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={false}
        />
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={false}
        />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">{t('fileViewer.errorLoading')}</p>
            <p className="text-xs mt-1 opacity-60">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  // Render binary file (can't preview)
  if (fileType === 'binary') {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
        />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <File className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('fileViewer.binaryFile')}</p>
            <button
              onClick={handleOpenWithApp}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t('fileViewer.openWithDefault')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render image
  if (fileType === 'image') {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
        />
        <div ref={contentScrollRef} className="flex-1 overflow-auto p-4 flex items-center justify-center bg-foreground/[0.02]">
          <img
            src={`file://${filePath}`}
            alt={filename}
            className="max-w-full max-h-full object-contain rounded-md shadow-sm"
          />
        </div>
      </div>
    )
  }

  // Render Excalidraw
  if (fileType === 'excalidraw' && content) {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
        />
        <div ref={contentScrollRef} className="flex-1 overflow-auto px-4 py-3">
          <MarkdownExcalidrawBlock code={content} className="my-1" />
        </div>
      </div>
    )
  }

  // Render markdown
  if (fileType === 'markdown' && content) {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
        />
        <div ref={contentScrollRef} className="flex-1 overflow-auto px-4 py-3">
          <Markdown mode="full">{content}</Markdown>
        </div>
      </div>
    )
  }

  // Render HTML with preview toggle
  if (fileType === 'html' && content) {
    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showViewModeToggle={true}
        />
        {viewMode === 'preview' ? (
          // HTML Preview using iframe
          <div className="flex-1 overflow-hidden bg-white">
            <iframe
              srcDoc={content}
              title={filename}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          // Code view with syntax highlighting
          <div ref={contentScrollRef} className="flex-1 overflow-auto text-sm">
            <Markdown mode="full">{`\`\`\`html\n${content}\n\`\`\``}</Markdown>
          </div>
        )}
      </div>
    )
  }

  // Render code with syntax highlighting
  if (fileType === 'code' && content) {
    const lang = getLanguageHint(filename)
    const codeBlock = `\`\`\`${lang}\n${content}\n\`\`\``

    return (
      <div className="h-full flex flex-col">
        <FileViewerHeader
          filename={filename}
          fileType={fileType}
          onBack={onBack}
          onCopy={handleCopy}
          onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
          copied={copied}
          showActions={true}
        />
        <div ref={contentScrollRef} className="flex-1 overflow-auto text-sm">
          <Markdown mode="full">{codeBlock}</Markdown>
        </div>
      </div>
    )
  }

  // Render plain text
  return (
    <div className="h-full flex flex-col">
      <FileViewerHeader
        filename={filename}
        fileType={fileType}
        onBack={onBack}
        onCopy={handleCopy}
        onOpenWithApp={handleOpenWithApp}
          onShowInFinder={handleShowInFinder}
        copied={copied}
        showActions={true}
      />
      <div ref={contentScrollRef} className="flex-1 overflow-auto p-4">
        <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground/80">
          {content}
        </pre>
      </div>
    </div>
  )
}

/**
 * File viewer header with breadcrumb and actions
 */
function FileViewerHeader({
  filename,
  fileType,
  onBack,
  onCopy,
  onOpenWithApp,
  onShowInFinder,
  copied,
  showActions,
  viewMode,
  onViewModeChange,
  showViewModeToggle = false,
}: {
  filename: string
  fileType: FileType
  onBack: () => void
  onCopy: () => void
  onOpenWithApp: () => void
  onShowInFinder: () => void
  copied: boolean
  showActions: boolean
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  showViewModeToggle?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-foreground/[0.02]">
      {/* Back button */}
      <button
        onClick={onBack}
        className="p-1 rounded-md hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
        title={t('common.back')}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* File icon and name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-muted-foreground shrink-0">
          {getFileTypeIcon(fileType)}
        </span>
        <span className="text-sm font-medium truncate">{filename}</span>
      </div>

      {/* View mode toggle for HTML files */}
      {showViewModeToggle && viewMode && onViewModeChange && (
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-foreground/5">
          <button
            onClick={() => onViewModeChange('preview')}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === 'preview'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t('fileViewer.preview')}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('code')}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === 'code'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t('fileViewer.code')}
          >
            <Code className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-1">
          {/* Copy button */}
          <button
            onClick={onCopy}
            className="p-1.5 rounded-md hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
            title={copied ? t('actions.copied') : t('actions.copy')}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Open menu with dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded-md hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
                title={t('fileViewer.openOptions')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onClick={onOpenWithApp} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                <span>{t('fileViewer.openWithDefaultApp')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowInFinder} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                <span>{t('fileViewer.showInFinder')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

/**
 * Main SessionFilesPanel component
 */
export function SessionFilesPanel({
  sessionId,
  filePath,
  closeButton,
  onFileSelect,
  hideHeader = false,
}: SessionFilesPanelProps) {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<string | undefined>(filePath)

  // Sync with external filePath prop
  useEffect(() => {
    setSelectedPath(filePath)
  }, [filePath])

  // Handle file selection from tree
  const handleFileClick = useCallback((file: { path: string; type: string }) => {
    if (file.type === 'file') {
      setSelectedPath(file.path)
      onFileSelect?.(file.path)
    }
  }, [onFileSelect])

  // Handle back navigation
  const handleBack = useCallback(() => {
    setSelectedPath(undefined)
    onFileSelect?.(undefined)
  }, [onFileSelect])

  // No session selected
  if (!sessionId) {
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && <PanelHeader title={t('chatInfo.files')} actions={closeButton} />}
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
          <p className="text-sm text-center">{t('fileViewer.noFileSelected')}</p>
        </div>
      </div>
    )
  }

  // File selected - show preview
  if (selectedPath) {
    return (
      <div className="h-full flex flex-col">
        {!hideHeader && <PanelHeader title={t('chatInfo.files')} actions={closeButton} />}
        <div className="flex-1 min-h-0 overflow-hidden">
          <FileViewer sessionId={sessionId} filePath={selectedPath} onBack={handleBack} />
        </div>
      </div>
    )
  }

  // No file selected - show file tree
  return (
    <div className="h-full flex flex-col">
      {!hideHeader && <PanelHeader title={t('chatInfo.files')} actions={closeButton} />}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionFilesSectionWithCallback
          sessionId={sessionId}
          onFileClick={handleFileClick}
        />
      </div>
    </div>
  )
}

/**
 * Wrapper for SessionFilesSection to add click callback
 */
function SessionFilesSectionWithCallback({
  sessionId,
  onFileClick,
}: {
  sessionId: string
  onFileClick: (file: { path: string; type: string }) => void
}) {
  return (
    <SessionFilesSection
      sessionId={sessionId}
      onFileClick={onFileClick}
    />
  )
}
