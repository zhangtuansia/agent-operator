/**
 * FullscreenOverlayBase - Minimal base component for all fullscreen overlays
 *
 * Uses Radix Dialog primitives for proper:
 * - Focus management (blur on open, restore on close)
 * - ESC key handling
 * - Coordination with other Radix components (popovers, dropdowns)
 * - Accessibility (role="dialog", aria-modal)
 *
 * Additionally handles:
 * - macOS traffic light hiding (via PlatformContext)
 *
 * Does NOT impose any layout opinions - consumers provide their own content structure.
 * Used by: PreviewOverlay, DocumentFormattedMarkdownOverlay, WorkspaceCreationScreen
 */

import { useEffect, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { usePlatform } from '../../context/PlatformContext'
import { cn } from '../../lib/utils'

// Z-index for fullscreen overlays - must be above app chrome (z-overlay: 300)
// Uses CSS variable when available, falls back to hardcoded value
const Z_FULLSCREEN = 'var(--z-fullscreen, 350)'

export interface FullscreenOverlayBaseProps {
  /** Whether the overlay is visible */
  isOpen: boolean
  /** Callback when the overlay should close (ESC key triggers this) */
  onClose: () => void
  /** Content to render inside the overlay */
  children: ReactNode
  /** Additional CSS classes for the container */
  className?: string
  /** Accessible title for the overlay (visually hidden) */
  accessibleTitle?: string
}

export function FullscreenOverlayBase({
  isOpen,
  onClose,
  children,
  className,
  accessibleTitle = 'Overlay',
}: FullscreenOverlayBaseProps) {
  const { onSetTrafficLightsVisible } = usePlatform()

  // Hide macOS traffic lights when overlay opens, restore when it closes
  // This prevents accidental clicks on window controls behind the fullscreen overlay
  // Note: Radix Dialog handles focus/ESC/portal, but traffic lights are macOS-specific
  useEffect(() => {
    if (!isOpen) return

    onSetTrafficLightsVisible?.(false)
    return () => onSetTrafficLightsVisible?.(true)
  }, [isOpen, onSetTrafficLightsVisible])

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          className={cn('fixed inset-0 overflow-hidden outline-none', className)}
          style={{ zIndex: Z_FULLSCREEN }}
          // Prevent Radix from auto-focusing the first focusable element
          // Our fullscreen overlays are more like views than traditional dialogs
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Visually hidden title for accessibility - required by Radix Dialog */}
          <Dialog.Title className="sr-only">{accessibleTitle}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
