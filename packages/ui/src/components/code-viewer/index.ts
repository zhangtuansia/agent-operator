/**
 * Code viewer components for syntax highlighting and diff display.
 */

export { ShikiCodeViewer, type ShikiCodeViewerProps } from './ShikiCodeViewer'
export { ShikiDiffViewer, type ShikiDiffViewerProps } from './ShikiDiffViewer'
export { LANGUAGE_MAP, getLanguageFromPath, formatFilePath, truncateFilePath } from './language-map'
export { DiffSplitIcon, DiffUnifiedIcon, DiffBackgroundIcon } from './DiffIcons'
export { DiffViewerControls, type DiffViewerControlsProps } from './DiffViewerControls'
