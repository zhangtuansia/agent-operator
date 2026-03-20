import * as React from 'react'
import JsonView from '@uiw/react-json-view'
import { githubLightTheme } from '@uiw/react-json-view/githubLight'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
import {
  BookOpenText,
  Braces,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileText,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react'
import { ShikiCodeViewer } from '@agent-operator/ui'
import { Markdown } from '@/components/markdown'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import type { DocumentEntry, OpenTargetInfo } from '../../../shared/types'

type PreviewKind =
  | 'markdown'
  | 'json'
  | 'code'
  | 'image'
  | 'html'
  | 'pdf'
  | 'text'
  | 'binary'

type HtmlViewMode = 'preview' | 'code'

interface DocumentsPreviewPaneProps {
  document: DocumentEntry
  sourceDescription: string
}

function detectPreviewKind(filePath: string): PreviewKind {
  const extension = filePath.split('.').pop()?.toLowerCase() || ''

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(extension)) {
    return 'image'
  }

  if (['md', 'markdown', 'mdx'].includes(extension)) {
    return 'markdown'
  }

  if (['json', 'jsonc', 'json5'].includes(extension)) {
    return 'json'
  }

  if (['html', 'htm'].includes(extension)) {
    return 'html'
  }

  if (extension === 'pdf') {
    return 'pdf'
  }

  if ([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
    'c', 'cpp', 'h', 'hpp', 'cs', 'php',
    'css', 'scss', 'less', 'sass',
    'sh', 'bash', 'zsh', 'fish',
    'sql', 'graphql', 'prisma',
    'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'config',
    'xml', 'plist', 'lock',
  ].includes(extension)) {
    return 'code'
  }

  if (['txt', 'log', 'csv', 'tsv', 'jsonl', 'rtf'].includes(extension)) {
    return 'text'
  }

  if (['zip', 'tar', 'gz', 'rar', '7z', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'dmg', 'pkg'].includes(extension)) {
    return 'binary'
  }

  return 'text'
}

function getLanguageHint(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || ''

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    jsonl: 'json',
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

  return languageMap[extension] || 'text'
}

function getPreviewMeta(kind: PreviewKind): {
  label: string
  variant: 'default' | 'blue' | 'orange' | 'green' | 'purple' | 'gray'
  icon: React.ComponentType<{ className?: string }>
  frameTitle: string
} {
  switch (kind) {
    case 'markdown':
      return { label: 'Markdown', variant: 'green', icon: BookOpenText, frameTitle: 'Markdown' }
    case 'json':
      return { label: 'JSON', variant: 'blue', icon: Braces, frameTitle: 'JSON' }
    case 'code':
      return { label: 'Code', variant: 'blue', icon: Code2, frameTitle: 'Code' }
    case 'image':
      return { label: 'Image', variant: 'purple', icon: FileImage, frameTitle: 'Image' }
    case 'html':
      return { label: 'HTML', variant: 'orange', icon: FileCode2, frameTitle: 'HTML' }
    case 'pdf':
      return { label: 'PDF', variant: 'orange', icon: FileText, frameTitle: 'PDF' }
    case 'text':
      return { label: 'Text', variant: 'gray', icon: FileText, frameTitle: 'Text' }
    case 'binary':
      return { label: 'File', variant: 'gray', icon: File, frameTitle: 'File' }
  }
}

function deepParseJson(value: unknown): unknown {
  if (value == null) return value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return deepParseJson(JSON.parse(trimmed))
      } catch {
        return value
      }
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepParseJson)
  }

  if (typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      next[key] = deepParseJson(nested)
    }
    return next
  }

  return value
}

function HeaderIconButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors',
        'hover:bg-foreground/4 hover:text-foreground',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      {children}
    </button>
  )
}

function OpenTargetIcon({
  target,
  className,
}: {
  target: OpenTargetInfo | null
  className?: string
}) {
  if (!target?.iconDataUrl) {
    return (
      <div
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-[4px] bg-foreground/8 text-[9px] font-semibold uppercase text-foreground/70',
          className,
        )}
      >
        {(target?.label || '?').slice(0, 1)}
      </div>
    )
  }

  return (
    <img
      src={target.iconDataUrl}
      alt={target.label}
      className={cn('h-4 w-4 rounded-[4px] object-cover', className)}
      draggable={false}
    />
  )
}

function FileKindBadge({
  label,
  icon: Icon,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-[8px] border border-foreground/8 bg-foreground/[0.03] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  )
}

function EmptyPreviewState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-[520px] rounded-[20px] border border-foreground/6 bg-background px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/4">
          <File className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-base font-semibold text-foreground">{title}</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function DocumentsPreviewPane({
  document,
  sourceDescription,
}: DocumentsPreviewPaneProps) {
  const { t } = useTranslation()
  const { isDark, shikiTheme } = useTheme()
  const [content, setContent] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [htmlViewMode, setHtmlViewMode] = React.useState<HtmlViewMode>('preview')
  const [openTargets, setOpenTargets] = React.useState<OpenTargetInfo[]>([])
  const [defaultTargetId, setDefaultTargetId] = React.useState<string | null>(null)

  const previewKind = React.useMemo(() => detectPreviewKind(document.path), [document.path])
  const meta = React.useMemo(() => getPreviewMeta(previewKind), [previewKind])
  const fileUrl = React.useMemo(() => `file://${encodeURI(document.path)}`, [document.path])

  React.useEffect(() => {
    let cancelled = false

    if (previewKind === 'image' || previewKind === 'pdf' || previewKind === 'binary') {
      setContent(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setContent(null)

    window.electronAPI.readFile(document.path)
      .then((nextContent) => {
        if (cancelled) return
        setContent(nextContent)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('fileViewer.failedToLoad'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [document.path, previewKind, t])

  React.useEffect(() => {
    let cancelled = false

    window.electronAPI.listOpenTargets(document.path)
      .then((result) => {
        if (cancelled) return
        setOpenTargets(result.targets)
        setDefaultTargetId(result.defaultTargetId)
      })
      .catch(() => {
        if (cancelled) return
        setOpenTargets([])
        setDefaultTargetId(null)
      })

    return () => {
      cancelled = true
    }
  }, [document.path])

  const jsonData = React.useMemo(() => {
    if (previewKind !== 'json' || !content) return null

    try {
      return deepParseJson(JSON.parse(content))
    } catch {
      return null
    }
  }, [content, previewKind])

  const handleCopyContent = React.useCallback(async () => {
    if (!content) return
    await navigator.clipboard.writeText(content)
    toast.success(t('actions.copied'))
  }, [content, t])

  const handleCopyPath = React.useCallback(async () => {
    await navigator.clipboard.writeText(document.path)
    toast.success(t('sessionMenu.pathCopied'))
  }, [document.path, t])

  const defaultOpenTarget = React.useMemo(
    () => openTargets.find(target => target.id === defaultTargetId) ?? null,
    [defaultTargetId, openTargets],
  )

  const handleOpen = React.useCallback(() => {
    const request = defaultTargetId
      ? window.electronAPI.openFileWithTarget(defaultTargetId, document.path)
      : window.electronAPI.openFile(document.path)

    void request.catch((err) => {
      toast.error(err instanceof Error ? err.message : t('fileViewer.failedToLoad'))
    })
  }, [defaultTargetId, document.path, t])

  const handleOpenWithTarget = React.useCallback(async (targetId: string) => {
    try {
      await window.electronAPI.openFileWithTarget(targetId, document.path)
      await window.electronAPI.setOpenTargetPreference(targetId)
      setDefaultTargetId(targetId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('fileViewer.failedToLoad'))
    }
  }, [document.path, t])

  const handleReveal = React.useCallback(() => {
    void window.electronAPI.showInFolder(document.path)
  }, [document.path])

  const headerActions = (
    <>
      {previewKind === 'html' && (
        <div className="flex items-center gap-0.5 rounded-[8px] border border-foreground/8 bg-background/80 p-0.5">
          <button
            type="button"
            onClick={() => setHtmlViewMode('preview')}
            title={t('fileViewer.preview')}
            className={cn(
              'rounded-[5px] p-1.5 transition-colors',
              htmlViewMode === 'preview'
                ? 'bg-foreground/5 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setHtmlViewMode('code')}
            title="Code"
            className={cn(
              'rounded-[5px] p-1.5 transition-colors',
              htmlViewMode === 'code'
                ? 'bg-foreground/5 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Code2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {openTargets.length > 0 ? (
        <div className="flex items-center overflow-hidden rounded-[10px] border border-foreground/8 bg-background/90">
          <button
            type="button"
            onClick={handleOpen}
            title={defaultOpenTarget ? t('fileViewer.openWithTarget', { target: defaultOpenTarget.label }) : t('fileViewer.openWithDefaultApp')}
            className={cn(
              'flex h-8 w-8 items-center justify-center text-sm text-foreground transition-colors',
              'hover:bg-foreground/4 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          >
            <OpenTargetIcon target={defaultOpenTarget} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t('fileViewer.openWith')}
                className={cn(
                  'flex h-8 w-7 items-center justify-center border-l border-foreground/8 text-muted-foreground transition-colors',
                  'hover:bg-foreground/4 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuLabel>
                {defaultOpenTarget
                  ? t('fileViewer.openWithTarget', { target: defaultOpenTarget.label })
                  : t('fileViewer.openWith')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={defaultTargetId ?? ''}>
                {openTargets.map((target) => (
                  <DropdownMenuRadioItem
                    key={target.id}
                    value={target.id}
                    onSelect={() => { void handleOpenWithTarget(target.id) }}
                    className="gap-2"
                  >
                    <OpenTargetIcon target={target} />
                    <span>{target.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <HeaderIconButton title={t('fileViewer.openWithDefaultApp')} onClick={handleOpen}>
          <ExternalLink className="h-4 w-4" />
        </HeaderIconButton>
      )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
          <HeaderIconButton title={t('fileViewer.openOptions')}>
            <MoreHorizontal className="h-4 w-4" />
          </HeaderIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          {content && (
            <DropdownMenuItem onClick={() => { void handleCopyContent() }} className="gap-2">
              <Copy className="h-4 w-4" />
              <span>{t('actions.copy')}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => { void handleCopyPath() }} className="gap-2">
            <Copy className="h-4 w-4" />
            <span>{t('sessionMenu.copyPath')}</span>
          </DropdownMenuItem>
          {openTargets.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('fileViewer.openWith')}</DropdownMenuLabel>
              {openTargets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => { void handleOpenWithTarget(target.id) }}
                  className="gap-2"
                >
                  <OpenTargetIcon target={target} />
                  <span>{t('fileViewer.openWithTarget', { target: target.label })}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuItem onClick={handleReveal} className="gap-2">
            <FolderOpen className="h-4 w-4" />
            <span>{t('fileViewer.showInFinder')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  const renderBody = () => {
    if (isLoading) {
      return (
        <EmptyPreviewState
          title={t('documents.loading')}
          description={t('documents.workspaceScopeDescription')}
        />
      )
    }

    if (error) {
      return (
        <EmptyPreviewState
          title={t('documents.failedToLoad')}
          description={error}
        />
      )
    }

    if (previewKind === 'binary') {
      return (
        <EmptyPreviewState
          title={t('fileViewer.binaryFile')}
          description={sourceDescription}
        />
      )
    }

    if (previewKind === 'image') {
      return (
        <div className="grid min-h-full place-items-center bg-foreground/[0.015] p-8">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[18px] border border-foreground/6 bg-background">
            <img
              src={fileUrl}
              alt={document.name}
              className="max-h-[calc(100vh-220px)] max-w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      )
    }

    if (previewKind === 'pdf') {
      return (
        <div className="h-full bg-foreground/[0.015] p-4">
          <div className="h-full overflow-hidden rounded-[16px] border border-foreground/6 bg-background">
            <iframe
              src={fileUrl}
              title={document.name}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )
    }

    if (previewKind === 'markdown' && content != null) {
      return (
        <div className="h-full overflow-auto bg-background">
          <article className="mx-auto w-full max-w-[940px] px-10 py-10">
            <div className="mb-8 border-b border-foreground/6 pb-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {meta.label}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{sourceDescription}</div>
            </div>
            <div className="text-sm">
              <Markdown mode="full">{content}</Markdown>
            </div>
          </article>
        </div>
      )
    }

    if (previewKind === 'json' && jsonData != null) {
      return (
        <div className="h-full overflow-auto bg-background">
          <div className="px-6 py-5">
            <JsonView
              value={jsonData as object}
              style={isDark ? {
                ...vscodeTheme,
                '--w-rjv-font-family': 'var(--font-mono, ui-monospace, monospace)',
                '--w-rjv-background-color': 'transparent',
              } : {
                ...githubLightTheme,
                '--w-rjv-font-family': 'var(--font-mono, ui-monospace, monospace)',
                '--w-rjv-background-color': 'transparent',
              }}
              collapsed={false}
              enableClipboard={true}
              displayDataTypes={false}
              shortenTextAfterLength={100}
            />
          </div>
        </div>
      )
    }

    if ((previewKind === 'code' || previewKind === 'text' || previewKind === 'json') && content != null) {
      return (
        <div className="h-full border-t border-foreground/5 bg-background">
          <ShikiCodeViewer
            code={content}
            filePath={document.path}
            language={previewKind === 'text' ? 'text' : getLanguageHint(document.path)}
            theme={isDark ? 'dark' : 'light'}
            shikiTheme={shikiTheme}
            className="h-full"
          />
        </div>
      )
    }

    if (previewKind === 'html' && content != null) {
      if (htmlViewMode === 'preview') {
        return (
          <div className="h-full overflow-hidden bg-background p-4">
            <div className="h-full overflow-hidden rounded-[16px] border border-foreground/6 bg-white">
              <iframe
                srcDoc={content}
                title={document.name}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        )
      }

      return (
        <div className="h-full border-t border-foreground/5 bg-background">
          <ShikiCodeViewer
            code={content}
            filePath={document.path}
            language="html"
            theme={isDark ? 'dark' : 'light'}
            shikiTheme={shikiTheme}
            className="h-full"
          />
        </div>
      )
    }

    return (
      <EmptyPreviewState
        title={t('fileViewer.noFileSelected')}
        description={sourceDescription}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="border-b border-foreground/5 bg-background/95">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="shrink-0 pt-0.5">
              <FileKindBadge
                icon={meta.icon}
                label={meta.label}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-foreground" title={document.name}>
                {document.name}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground" title={sourceDescription}>
                {sourceDescription}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {renderBody()}
      </div>
    </div>
  )
}
