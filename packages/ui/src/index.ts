/**
 * @agent-operator/ui - Shared React UI components for Cowork
 *
 * This package provides platform-agnostic UI components that work in both:
 * - Electron desktop app (full interactive mode)
 * - Web session viewer (read-only mode)
 *
 * Key components:
 * - SessionViewer: Read-only session transcript viewer (used by web viewer)
 * - TurnCard: Email-like display for assistant turns
 * - Markdown: Customizable markdown renderer with syntax highlighting
 *
 * Platform abstraction:
 * - PlatformProvider/usePlatform: Inject platform-specific actions
 */

// Context
export {
  PlatformProvider,
  usePlatform,
  type PlatformActions,
  type PlatformProviderProps,
  ShikiThemeProvider,
  useShikiTheme,
  type ShikiThemeProviderProps,
} from './context'

// Chat components
export {
  SessionViewer,
  TurnCard,
  TurnCardActionsMenu,
  ResponseCard,
  UserMessageBubble,
  SystemMessage,
  FileTypeIcon,
  getFileTypeLabel,
  type SessionViewerProps,
  type SessionViewerMode,
  type TurnCardProps,
  type TurnCardActionsMenuProps,
  type ResponseCardProps,
  type UserMessageBubbleProps,
  type SystemMessageProps,
  type SystemMessageType,
  type FileTypeIconProps,
  type ActivityItem,
  type ResponseContent,
  type TodoItem,
} from './components/chat'

// Markdown
export {
  Markdown,
  MemoizedMarkdown,
  CodeBlock,
  InlineCode,
  MarkdownDatatableBlock,
  MarkdownSpreadsheetBlock,
  MarkdownExcalidrawBlock,
  CollapsibleMarkdownProvider,
  useCollapsibleMarkdown,
  type MarkdownProps,
  type RenderMode,
  type MarkdownDatatableBlockProps,
  type MarkdownSpreadsheetBlockProps,
} from './components/markdown'

// UI primitives
export {
  Spinner,
  SimpleDropdown,
  SimpleDropdownItem,
  PreviewHeader,
  PreviewHeaderBadge,
  PREVIEW_BADGE_VARIANTS,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuShortcut,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
  StyledDropdownMenuSubTrigger,
  StyledDropdownMenuSubContent,
  type SpinnerProps,
  type SimpleDropdownProps,
  type SimpleDropdownItemProps,
  type PreviewHeaderProps,
  type PreviewHeaderBadgeProps,
  type PreviewBadgeVariant,
} from './components/ui'

// Tooltip
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/tooltip'

// Code viewer components
export {
  ShikiCodeViewer,
  ShikiDiffViewer,
  UnifiedDiffViewer,
  getDiffStats,
  getUnifiedDiffStats,
  DiffViewerControls,
  DiffSplitIcon,
  DiffUnifiedIcon,
  DiffBackgroundIcon,
  LANGUAGE_MAP,
  getLanguageFromPath,
  formatFilePath,
  truncateFilePath,
  type ShikiCodeViewerProps,
  type ShikiDiffViewerProps,
  type UnifiedDiffViewerProps,
  type DiffViewerControlsProps,
} from './components/code-viewer'

// Terminal components
export {
  TerminalOutput,
  parseAnsi,
  stripAnsi,
  isGrepContentOutput,
  parseGrepOutput,
  ANSI_COLORS,
  type TerminalOutputProps,
  type ToolType,
  type AnsiSpan,
  type GrepLine,
} from './components/terminal'

// Overlay components
export {
  // Base overlay components
  FullscreenOverlayBase,
  PreviewOverlay,
  CopyButton,
  type FullscreenOverlayBaseProps,
  type PreviewOverlayProps,
  type BadgeVariant,
  type CopyButtonProps,
  // Specialized overlays
  CodePreviewOverlay,
  DiffPreviewOverlay,
  MultiDiffPreviewOverlay,
  TerminalPreviewOverlay,
  GenericOverlay,
  JSONPreviewOverlay,
  DataTableOverlay,
  DocumentFormattedMarkdownOverlay,
  detectLanguage,
  detectLanguageFromPath,
  type CodePreviewOverlayProps,
  type DiffPreviewOverlayProps,
  type MultiDiffPreviewOverlayProps,
  type FileChange,
  type TerminalPreviewOverlayProps,
  type GenericOverlayProps,
  type JSONPreviewOverlayProps,
  type DataTableOverlayProps,
  type DocumentFormattedMarkdownOverlayProps,
} from './components/overlay'

// Utilities
export { cn } from './lib/utils'

// File classification
export {
  classifyFile,
  type FileClassification,
  type FilePreviewType,
} from './lib/file-classification'

// Layout constants and hooks
export {
  CHAT_LAYOUT,
  CHAT_CLASSES,
  OVERLAY_LAYOUT,
  useOverlayMode,
  type OverlayMode,
} from './lib/layout'

// Tool result parsers
export {
  parseReadResult,
  parseBashResult,
  parseGrepResult,
  parseGlobResult,
  extractOverlayData,
  type ReadResult,
  type BashResult,
  type GrepResult,
  type GlobResult,
  type CodeOverlayData,
  type DiffOverlayData,
  type TerminalOverlayData,
  type GenericOverlayData,
  type JSONOverlayData,
  type DocumentOverlayData,
  type OverlayData,
} from './lib/tool-parsers'

// Turn utilities (pure functions)
export * from './components/chat/turn-utils'

// Action Cards
export {
  ActionCard,
  type ActionCardProps,
  type ActionCardAction,
} from './components/cards/ActionCard'

// Icons
export {
  Icon_Folder,
  Icon_Home,
  Icon_Inbox,
  type IconProps,
} from './components/icons'
