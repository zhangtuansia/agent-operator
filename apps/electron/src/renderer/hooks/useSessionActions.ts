import { useCallback } from "react"
import { toast } from "sonner"
import { useTranslation } from "@/i18n"

interface UseSessionActionsOptions {
  onFlag?: (sessionId: string) => void
  onUnflag?: (sessionId: string) => void
  onArchive?: (sessionId: string) => void
  onUnarchive?: (sessionId: string) => void
  onDelete: (sessionId: string, skipConfirmation?: boolean) => Promise<boolean>
}

export function useSessionActions({
  onFlag,
  onUnflag,
  onArchive,
  onUnarchive,
  onDelete,
}: UseSessionActionsOptions) {
  const { t } = useTranslation()

  const handleFlagWithToast = useCallback((sessionId: string) => {
    if (!onFlag) return
    onFlag(sessionId)
    toast(t('toasts.conversationFlagged'), {
      description: t('toasts.addedToFlagged'),
      action: onUnflag ? {
        label: t('toasts.undo'),
        onClick: () => onUnflag(sessionId),
      } : undefined,
    })
  }, [onFlag, onUnflag, t])

  const handleUnflagWithToast = useCallback((sessionId: string) => {
    if (!onUnflag) return
    onUnflag(sessionId)
    toast(t('toasts.flagRemoved'), {
      description: t('toasts.removedFromFlagged'),
      action: onFlag ? {
        label: t('toasts.undo'),
        onClick: () => onFlag(sessionId),
      } : undefined,
    })
  }, [onFlag, onUnflag, t])

  const handleArchiveWithToast = useCallback((sessionId: string) => {
    if (!onArchive) return
    onArchive(sessionId)
    toast(t('toasts.conversationArchived'), {
      description: t('toasts.movedToArchive'),
      action: onUnarchive ? {
        label: t('toasts.undo'),
        onClick: () => onUnarchive(sessionId),
      } : undefined,
    })
  }, [onArchive, onUnarchive, t])

  const handleUnarchiveWithToast = useCallback((sessionId: string) => {
    if (!onUnarchive) return
    onUnarchive(sessionId)
    toast(t('toasts.conversationRestored'), {
      description: t('toasts.movedFromArchive'),
      action: onArchive ? {
        label: t('toasts.undo'),
        onClick: () => onArchive(sessionId),
      } : undefined,
    })
  }, [onArchive, onUnarchive, t])

  const handleDeleteWithToast = useCallback(async (sessionId: string): Promise<boolean> => {
    // Confirmation dialog is shown by handleDeleteSession in App.tsx
    // We await so toast only shows after successful deletion (if user confirmed)
    const deleted = await onDelete(sessionId)
    if (deleted) {
      toast(t('toasts.conversationDeleted'))
    }
    return deleted
  }, [onDelete, t])

  return {
    handleFlagWithToast,
    handleUnflagWithToast,
    handleArchiveWithToast,
    handleUnarchiveWithToast,
    handleDeleteWithToast,
  }
}
