/**
 * ShikiDiffViewer - Diff viewer using @pierre/diffs (Shiki-based)
 *
 * Platform-agnostic component for displaying file diffs with:
 * - Unified or split diff view
 * - Syntax highlighting via Shiki
 * - Light/dark theme support
 * - Line-level diff highlighting
 */

import * as React from 'react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { FileDiff, type FileDiffMetadata, type FileDiffProps } from '@pierre/diffs/react'
import { parseDiffFromFile, DIFFS_TAG_NAME, type FileContents } from '@pierre/diffs'
import { cn } from '../../lib/utils'
import { LANGUAGE_MAP } from './language-map'

// Register the diffs-container custom element if not already registered
// This is necessary because the React component renders a custom element
if (typeof HTMLElement !== 'undefined' && !customElements.get(DIFFS_TAG_NAME)) {
  class FileDiffContainer extends HTMLElement {
    constructor() {
      super()
      if (this.shadowRoot != null) return
      this.attachShadow({ mode: 'open' })
    }
  }
  customElements.define(DIFFS_TAG_NAME, FileDiffContainer)
}

export interface ShikiDiffViewerProps {
  /** Original (before) content */
  original: string
  /** Modified (after) content */
  modified: string
  /** File path - used for language detection and display */
  filePath?: string
  /** Language for syntax highlighting (auto-detected from filePath if not provided) */
  language?: string
  /** Diff style: 'unified' (stacked) or 'split' (side-by-side) */
  diffStyle?: 'unified' | 'split'
  /** Theme mode */
  theme?: 'light' | 'dark'
  /** Callback when ready */
  onReady?: () => void
  /** Additional class names */
  className?: string
}

function getLanguageFromPath(filePath: string, explicit?: string): string {
  if (explicit) return explicit
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'text'
}

/**
 * ShikiDiffViewer - Shiki-based diff viewer component
 */
export function ShikiDiffViewer({
  original,
  modified,
  filePath = 'file',
  language,
  diffStyle = 'unified',
  theme = 'light',
  onReady,
  className,
}: ShikiDiffViewerProps) {
  const hasCalledReady = useRef(false)
  const [isReady, setIsReady] = useState(false)

  // Resolve language
  const resolvedLang = useMemo(() => {
    return language || getLanguageFromPath(filePath)
  }, [language, filePath])

  // Create file contents objects for the diff parser
  const oldFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: original,
    lang: resolvedLang as any,
  }), [filePath, original, resolvedLang])

  const newFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: modified,
    lang: resolvedLang as any,
  }), [filePath, modified, resolvedLang])

  // Parse the diff
  const fileDiff: FileDiffMetadata = useMemo(() => {
    return parseDiffFromFile(oldFile, newFile)
  }, [oldFile, newFile])

  // Diff options - use pierre themes for better diff contrast
  const options: FileDiffProps<undefined>['options'] = useMemo(() => ({
    theme: theme === 'dark' ? 'pierre-dark' : 'pierre-light',
    diffStyle,
    diffIndicators: 'bars',
    disableBackground: false,
    lineDiffType: 'word',
    overflow: 'scroll',
    disableFileHeader: true, // We handle headers ourselves
    themeType: theme === 'dark' ? 'dark' : 'light',
  }), [theme, diffStyle])

  // Call onReady after first render
  useEffect(() => {
    if (!hasCalledReady.current && onReady) {
      hasCalledReady.current = true
      // Give Shiki time to highlight
      const timer = setTimeout(() => {
        setIsReady(true)
        onReady()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [onReady, original, modified, fileDiff])

  // Background color to match themes
  const backgroundColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'

  return (
    <div
      className={cn(
        'h-full w-full overflow-auto transition-opacity duration-200',
        className
      )}
      style={{
        backgroundColor,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <FileDiff
        fileDiff={fileDiff}
        options={options}
        className="min-h-full"
      />
    </div>
  )
}
