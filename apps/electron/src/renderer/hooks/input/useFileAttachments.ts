/**
 * useFileAttachments Hook
 *
 * Manages file attachment state and operations for the FreeFormInput component.
 * Handles file selection, drag-drop, clipboard paste, and attachment storage.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { FileAttachment, StoredAttachment } from '../../../shared/types'

interface UseFileAttachmentsOptions {
  /** Session ID for storing attachments */
  sessionId?: string
  /** Maximum number of attachments allowed */
  maxAttachments?: number
  /** Callback when attachments change */
  onAttachmentsChange?: (attachments: FileAttachment[]) => void
  /** Translation function */
  t?: (key: string) => string
}

interface UseFileAttachmentsResult {
  /** Current attachments */
  attachments: FileAttachment[]
  /** Whether file is being loaded */
  isLoading: boolean
  /** Add attachment from file picker */
  addFromFile: () => Promise<void>
  /** Add attachment from file path */
  addFromPath: (path: string) => Promise<FileAttachment | null>
  /** Add attachment from clipboard */
  addFromClipboard: () => Promise<void>
  /** Add attachment directly */
  addAttachment: (attachment: FileAttachment) => void
  /** Remove attachment at index */
  removeAttachment: (index: number) => void
  /** Clear all attachments */
  clearAttachments: () => void
  /** Store attachment to disk (for persistence) */
  storeAttachment: (attachment: FileAttachment) => Promise<StoredAttachment | null>
  /** Handle file drop */
  handleFileDrop: (files: FileList | File[]) => Promise<void>
}

/**
 * Hook for managing file attachments in chat input
 */
export function useFileAttachments({
  sessionId,
  maxAttachments = 20,
  onAttachmentsChange,
  t = (key) => key,
}: UseFileAttachmentsOptions = {}): UseFileAttachmentsResult {
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const addAttachment = useCallback((attachment: FileAttachment) => {
    setAttachments(prev => {
      if (prev.length >= maxAttachments) {
        toast.error(t('input.maxAttachmentsReached'))
        return prev
      }
      const newAttachments = [...prev, attachment]
      onAttachmentsChange?.(newAttachments)
      return newAttachments
    })
  }, [maxAttachments, onAttachmentsChange, t])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => {
      const newAttachments = prev.filter((_, i) => i !== index)
      onAttachmentsChange?.(newAttachments)
      return newAttachments
    })
  }, [onAttachmentsChange])

  const clearAttachments = useCallback(() => {
    setAttachments([])
    onAttachmentsChange?.([])
  }, [onAttachmentsChange])

  const addFromPath = useCallback(async (path: string): Promise<FileAttachment | null> => {
    try {
      setIsLoading(true)
      const attachment = await window.electronAPI.readFileAttachment(path)
      if (attachment) {
        addAttachment(attachment)
        return attachment
      }
      return null
    } catch (error) {
      console.error('Failed to read file attachment:', error)
      toast.error(t('input.fileReadError'))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [addAttachment, t])

  const addFromFile = useCallback(async () => {
    try {
      const paths = await window.electronAPI.openFileDialog()
      if (paths.length === 0) return

      setIsLoading(true)
      for (const path of paths) {
        await addFromPath(path)
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error)
      toast.error(t('input.fileDialogError'))
    } finally {
      setIsLoading(false)
    }
  }, [addFromPath, t])

  const addFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        // Check for image types
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const buffer = await blob.arrayBuffer()
            const base64 = btoa(
              new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            )

            // Get file extension from mime type
            const ext = type.split('/')[1] || 'png'
            const name = `clipboard-${Date.now()}.${ext}`

            const attachment: FileAttachment = {
              type: 'image',
              path: '',
              name,
              mimeType: type,
              base64,
              size: buffer.byteLength,
            }

            // Generate thumbnail
            try {
              const thumbnail = await window.electronAPI.generateThumbnail(base64, type)
              if (thumbnail) {
                attachment.thumbnailBase64 = thumbnail
              }
            } catch (e) {
              console.warn('Failed to generate thumbnail:', e)
            }

            addAttachment(attachment)
            break
          }
        }
      }
    } catch (error) {
      // Clipboard API may not be available or permission denied
      console.warn('Clipboard paste failed:', error)
    }
  }, [addAttachment])

  const handleFileDrop = useCallback(async (files: FileList | File[]) => {
    setIsLoading(true)
    try {
      for (const file of Array.from(files)) {
        // For files from drag-drop, we need to read them as base64
        const reader = new FileReader()

        const result = await new Promise<FileAttachment | null>((resolve) => {
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1]
            if (!base64) {
              resolve(null)
              return
            }

            // Determine file type
            let type: FileAttachment['type'] = 'unknown'
            if (file.type.startsWith('image/')) type = 'image'
            else if (file.type === 'application/pdf') type = 'pdf'
            else if (file.type.includes('text') || file.name.match(/\.(txt|md|json|js|ts|tsx|jsx|py|css|html|xml|yaml|yml)$/i)) type = 'text'
            else if (file.type.includes('officedocument') || file.name.match(/\.(docx|xlsx|pptx|doc|xls|ppt)$/i)) type = 'office'

            const attachment: FileAttachment = {
              type,
              path: '',
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              base64: type !== 'text' ? base64 : undefined,
              text: type === 'text' ? atob(base64) : undefined,
              size: file.size,
            }

            // Generate thumbnail for images
            if (type === 'image') {
              try {
                const thumbnail = await window.electronAPI.generateThumbnail(base64, file.type)
                if (thumbnail) {
                  attachment.thumbnailBase64 = thumbnail
                }
              } catch (e) {
                console.warn('Failed to generate thumbnail:', e)
              }
            }

            resolve(attachment)
          }

          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })

        if (result) {
          addAttachment(result)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [addAttachment])

  const storeAttachment = useCallback(async (attachment: FileAttachment): Promise<StoredAttachment | null> => {
    if (!sessionId) {
      console.warn('Cannot store attachment: no session ID')
      return null
    }

    try {
      const stored = await window.electronAPI.storeAttachment(sessionId, attachment)
      return stored as StoredAttachment
    } catch (error) {
      console.error('Failed to store attachment:', error)
      toast.error(t('input.attachmentStoreError'))
      return null
    }
  }, [sessionId, t])

  return {
    attachments,
    isLoading,
    addFromFile,
    addFromPath,
    addFromClipboard,
    addAttachment,
    removeAttachment,
    clearAttachments,
    storeAttachment,
    handleFileDrop,
  }
}
