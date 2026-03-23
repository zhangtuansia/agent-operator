import * as React from 'react'
import { ExternalLink, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

export function OfficeWorkspace() {
  const { t } = useTranslation()

  const handleOpenOffice = React.useCallback(() => {
    window.electronAPI.openOfficeWindow()
  }, [])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 min-h-[40px] border-b border-border/50">
        <span className="text-sm font-medium">{t('sidebar.office') ?? '办公室'}</span>
      </div>

      {/* Content — prompt to open in new window */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="rounded-full bg-muted p-4">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-medium">
              {t('sidebar.office') ?? '办公室'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[280px]">
              办公室将在独立窗口中打开，您可以自由调整大小和位置。
            </p>
          </div>
          <Button
            onClick={handleOpenOffice}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            打开办公室
          </Button>
        </div>
      </div>
    </div>
  )
}
