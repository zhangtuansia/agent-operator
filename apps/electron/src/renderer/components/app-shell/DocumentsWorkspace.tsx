import * as React from 'react'
import {
  ChevronRight,
  Code2,
  File,
  FileCode2,
  FileImage,
  Folder,
  FolderOpen,
  NotebookPen,
  Search,
} from 'lucide-react'

import { useLanguage } from '@/context/LanguageContext'
import { useActiveWorkspace } from '@/context/AppShellContext'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { Panel } from './Panel'
import { DocumentsPreviewPane } from './DocumentsPreviewPane'
import { navigate, routes } from '@/lib/navigate'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

import type { NavigationState } from '@/contexts/NavigationContext'
import type { DocumentEntry, DocumentKind } from '../../../shared/types'

interface DocumentsWorkspaceProps {
  isFocusedMode?: boolean
  navState: NavigationState
}

type DocumentTreeNode = {
  key: string
  name: string
  type: 'directory' | 'file'
  children: DocumentTreeNode[]
  document?: DocumentEntry
  count: number
}

function getDocumentFileIcon(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() || ''

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(extension)) {
    return <FileImage className="h-3.5 w-3.5 text-muted-foreground" />
  }

  if (['md', 'markdown', 'mdx', 'txt', 'rtf'].includes(extension)) {
    return <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" />
  }

  if (['html', 'htm', 'xml'].includes(extension)) {
    return <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
  }

  if ([
    'ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml', 'py', 'rb', 'go', 'rs', 'java', 'kt',
    'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'css', 'scss', 'less', 'sass', 'sh',
    'bash', 'zsh', 'fish', 'sql', 'graphql', 'prisma', 'toml', 'ini', 'env', 'conf',
  ].includes(extension)) {
    return <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
  }

  return <File className="h-3.5 w-3.5 text-muted-foreground" />
}

function createDirectoryNode(key: string, name: string): DocumentTreeNode {
  return { key, name, type: 'directory', children: [], count: 0 }
}

function createFileNode(document: DocumentEntry): DocumentTreeNode {
  return {
    key: document.id,
    name: document.name,
    type: 'file',
    children: [],
    document,
    count: 1,
  }
}

function ensureDirectory(parent: DocumentTreeNode, key: string, name: string): DocumentTreeNode {
  const existing = parent.children.find((child) => child.type === 'directory' && child.key === key)
  if (existing) return existing

  const next = createDirectoryNode(key, name)
  parent.children.push(next)
  return next
}

function insertDocument(parent: DocumentTreeNode, segments: string[], document: DocumentEntry): void {
  if (segments.length === 0) {
    parent.children.push(createFileNode(document))
    return
  }

  let current = parent
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const key = `${current.key}/${segment}`
    current = ensureDirectory(current, key, segment)
  }

  current.children.push(createFileNode(document))
}

function finalizeTree(node: DocumentTreeNode): number {
  if (node.type === 'file') {
    node.count = 1
    return 1
  }

  let count = 0
  for (const child of node.children) {
    count += finalizeTree(child)
  }

  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  node.count = count
  return count
}

function toWorkspaceRelativePath(rootPath: string | undefined, path: string): string {
  if (!rootPath) return path
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedPath = path.replace(/\\/g, '/')
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return path
  return normalizedPath.slice(normalizedRoot.length + 1)
}

function getArtifactFolderName(kind: DocumentKind, t: (key: string) => string): string {
  switch (kind) {
    case 'download':
      return t('documents.downloads')
    case 'attachment':
      return t('documents.attachments')
    case 'plan':
      return t('documents.plans')
    case 'data':
      return t('documents.data')
    case 'longResponse':
      return t('documents.longResponses')
    case 'note':
      return t('documents.notes')
    case 'workspace':
      return t('documents.workspaceFiles')
  }
}

function getSessionArtifactRelativeSegments(document: DocumentEntry): string[] {
  if (document.kind === 'note') {
    return [document.name]
  }

  const dirName = (() => {
    switch (document.kind) {
      case 'download':
        return 'downloads'
      case 'attachment':
        return 'attachments'
      case 'plan':
        return 'plans'
      case 'data':
        return 'data'
      case 'longResponse':
        return 'long_responses'
      case 'note':
      case 'workspace':
        return null
    }
  })()

  if (!dirName) return [document.name]

  const normalizedPath = document.path.replace(/\\/g, '/')
  const marker = `/${dirName}/`
  const markerIndex = normalizedPath.lastIndexOf(marker)
  if (markerIndex === -1) return [document.name]

  return normalizedPath
    .slice(markerIndex + marker.length)
    .split('/')
    .filter(Boolean)
}

function buildDocumentTree(
  documents: DocumentEntry[],
  workspaceName: string,
  workspaceRootPath: string | undefined,
  t: (key: string) => string,
): {
  roots: DocumentTreeNode[]
  ancestorMap: Map<string, string[]>
} {
  const workspaceRoot = createDirectoryNode('workspace-root', workspaceName || t('documents.workspaceRoot'))
  const sessionArtifactsRoot = createDirectoryNode('session-artifacts-root', t('documents.sessionArtifacts'))
  const ancestorMap = new Map<string, string[]>()

  for (const document of documents) {
    if (document.scope === 'workspace') {
      const relativePath = toWorkspaceRelativePath(workspaceRootPath, document.path)
      const segments = relativePath.split('/').filter(Boolean)
      insertDocument(workspaceRoot, segments, document)
      ancestorMap.set(document.id, ['workspace-root', ...segments.slice(0, -1).map((_, index) => `workspace-root/${segments.slice(0, index + 1).join('/')}`)])
      continue
    }

    const sessionName = document.sessionName || document.sessionId || t('documents.unknownSession')
    const sessionKey = `session-artifacts-root/${sessionName}::${document.sessionId || 'unknown'}`
    const sessionNode = ensureDirectory(sessionArtifactsRoot, sessionKey, sessionName)

    const artifactFolderName = getArtifactFolderName(document.kind, t)
    const artifactFolderKey = `${sessionKey}/${artifactFolderName}`
    const artifactFolder = ensureDirectory(sessionNode, artifactFolderKey, artifactFolderName)

    const relativeSegments = getSessionArtifactRelativeSegments(document)
    insertDocument(artifactFolder, relativeSegments, document)

    ancestorMap.set(document.id, [
      'session-artifacts-root',
      sessionKey,
      artifactFolderKey,
      ...relativeSegments.slice(0, -1).map((_, index) => `${artifactFolderKey}/${relativeSegments.slice(0, index + 1).join('/')}`),
    ])
  }

  finalizeTree(workspaceRoot)
  finalizeTree(sessionArtifactsRoot)

  const roots = [workspaceRoot, sessionArtifactsRoot].filter((root) => root.children.length > 0)
  return { roots, ancestorMap }
}

function filterTreeNode(node: DocumentTreeNode, query: string): DocumentTreeNode | null {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return node

  if (node.type === 'file') {
    const haystacks = [
      node.name,
      node.document?.path || '',
      node.document?.sessionName || '',
    ]
    return haystacks.some(value => value.toLowerCase().includes(normalizedQuery)) ? node : null
  }

  const filteredChildren = node.children
    .map(child => filterTreeNode(child, normalizedQuery))
    .filter((child): child is DocumentTreeNode => child != null)

  const selfMatches = node.name.toLowerCase().includes(normalizedQuery)
  if (!selfMatches && filteredChildren.length === 0) return null

  return {
    ...node,
    children: selfMatches ? node.children : filteredChildren,
    count: selfMatches
      ? node.count
      : filteredChildren.reduce((sum, child) => sum + child.count, 0),
  }
}

function collectDirectoryKeys(node: DocumentTreeNode, keys: Set<string>): void {
  if (node.type !== 'directory') return
  keys.add(node.key)
  for (const child of node.children) collectDirectoryKeys(child, keys)
}

function getSourceDescription(
  document: DocumentEntry,
  workspaceRootPath: string | undefined,
  t: (key: string) => string,
): string {
  if (document.scope === 'workspace') {
    return toWorkspaceRelativePath(workspaceRootPath, document.path)
  }

  const folder = getArtifactFolderName(document.kind, t)
  const sessionName = document.sessionName || document.sessionId || t('documents.unknownSession')
  return `${sessionName} / ${folder}`
}

interface TreeItemProps {
  node: DocumentTreeNode
  depth: number
  expandedKeys: Set<string>
  onToggleExpand: (key: string) => void
  onSelectDocument: (document: DocumentEntry) => void
  selectedDocumentId: string | null
}

function TreeItem({
  node,
  depth,
  expandedKeys,
  onToggleExpand,
  onSelectDocument,
  selectedDocumentId,
}: TreeItemProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = isDirectory && expandedKeys.has(node.key)
  const isSelected = !isDirectory && node.document?.id === selectedDocumentId
  const isRoot = depth === 0
  const paddingLeft = 14 + depth * 16

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDirectory) onToggleExpand(node.key)
          else if (node.document) onSelectDocument(node.document)
        }}
        className={cn(
          'group flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] transition-colors',
          isRoot ? 'font-medium text-foreground' : 'text-foreground/90',
          isSelected
            ? 'bg-accent/12 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]'
            : 'hover:bg-foreground/4',
        )}
        style={{ paddingLeft }}
      >
        {isDirectory ? (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="shrink-0 text-muted-foreground">
          {isDirectory
            ? (isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /> : <Folder className="h-3.5 w-3.5 text-muted-foreground" />)
            : getDocumentFileIcon(node.document?.path || node.name)}
        </span>

        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {isDirectory && node.count > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">{node.count}</span>
        )}
      </button>

      {isDirectory && isExpanded && node.children.length > 0 && (
        <div className="space-y-0.5 py-0.5">
          {node.children.map((child) => (
            <TreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              onSelectDocument={onSelectDocument}
              selectedDocumentId={selectedDocumentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DocumentsWorkspace({
  isFocusedMode = false,
  navState,
}: DocumentsWorkspaceProps) {
  const { t } = useLanguage()
  const activeWorkspace = useActiveWorkspace()
  const [documents, setDocuments] = React.useState<DocumentEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(new Set(['workspace-root', 'session-artifacts-root']))

  React.useEffect(() => {
    if (!activeWorkspace?.id) {
      setDocuments([])
      setError(null)
      return
    }

    let cancelled = false
    setDocuments([])
    setIsLoading(true)
    setError(null)

    window.electronAPI.listDocuments(activeWorkspace.id)
      .then((entries) => {
        if (cancelled) return
        setDocuments(entries)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('documents.failedToLoad'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspace?.id, t])

  const selectedDocumentId = navState.details?.type === 'document'
    ? navState.details.documentId
    : null

  const selectedDocument = React.useMemo(
    () => documents.find((entry) => entry.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  )

  const treeState = React.useMemo(
    () => buildDocumentTree(documents, activeWorkspace?.name || t('documents.workspaceRoot'), activeWorkspace?.rootPath, t),
    [activeWorkspace?.name, activeWorkspace?.rootPath, documents, t],
  )

  const filteredRoots = React.useMemo(
    () => treeState.roots
      .map(root => filterTreeNode(root, searchQuery))
      .filter((root): root is DocumentTreeNode => root != null),
    [searchQuery, treeState.roots],
  )

  const effectiveExpandedKeys = React.useMemo(() => {
    if (!searchQuery.trim()) return expandedKeys
    const next = new Set<string>()
    for (const root of filteredRoots) collectDirectoryKeys(root, next)
    return next
  }, [expandedKeys, filteredRoots, searchQuery])

  React.useEffect(() => {
    setExpandedKeys(new Set(['workspace-root', 'session-artifacts-root']))
  }, [activeWorkspace?.id, treeState.roots])

  React.useEffect(() => {
    if (!selectedDocumentId) return
    const ancestors = treeState.ancestorMap.get(selectedDocumentId)
    if (!ancestors?.length) return

    setExpandedKeys((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const key of ancestors) {
        if (!next.has(key)) {
          next.add(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedDocumentId, treeState.ancestorMap])

  const handleToggleExpand = React.useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleDocumentSelect = React.useCallback((document: DocumentEntry) => {
    navigate(routes.view.documents(document.id))
  }, [])

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <Panel variant="shrink" width={320} className="border-r border-foreground/5 bg-background">
        <div className={cn(
          'shrink-0 border-b border-foreground/5',
          isFocusedMode ? 'pt-10' : 'pt-0',
        )}>
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <div className="text-sm font-semibold text-foreground">{t('sidebar.documents')}</div>
            <div className="text-xs tabular-nums text-muted-foreground">{documents.length}</div>
          </div>
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('documents.filterPlaceholder')}
                className="h-9 rounded-[10px] border-foreground/10 bg-foreground/[0.03] pl-9 pr-3 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-1 focus-visible:ring-foreground/15"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-3">
          {isLoading ? (
            <EntityListEmptyScreen
              icon={<FolderOpen className="h-5 w-5" />}
              title={t('documents.loading')}
              description={t('documents.workspaceScopeDescription')}
              className="flex-1"
            />
          ) : error ? (
            <EntityListEmptyScreen
              icon={<FolderOpen className="h-5 w-5" />}
              title={t('documents.failedToLoad')}
              description={error}
              className="flex-1"
            />
          ) : filteredRoots.length === 0 ? (
            <EntityListEmptyScreen
              icon={<FolderOpen className="h-5 w-5" />}
              title={searchQuery.trim() ? t('documents.noMatches') : t('emptyStates.noDocumentsYet')}
              description={searchQuery.trim() ? t('documents.noMatchesDescription') : t('documents.workspaceScopeDescription')}
              className="flex-1"
            />
          ) : (
            <div className="px-2 py-2">
              {filteredRoots.map((root) => (
                <TreeItem
                  key={root.key}
                  node={root}
                  depth={0}
                  expandedKeys={effectiveExpandedKeys}
                  onToggleExpand={handleToggleExpand}
                  onSelectDocument={handleDocumentSelect}
                  selectedDocumentId={selectedDocumentId}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel variant="grow" className="min-w-0 bg-foreground-2">
        {selectedDocument ? (
          <DocumentsPreviewPane
            document={selectedDocument}
            sourceDescription={getSourceDescription(selectedDocument, activeWorkspace?.rootPath, t)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EntityListEmptyScreen
              icon={<NotebookPen className="h-5 w-5" />}
              title={t('documents.selectDocument')}
              description={t('documents.workspaceScopeDescription')}
              className="max-w-md"
            />
          </div>
        )}
      </Panel>
    </div>
  )
}
