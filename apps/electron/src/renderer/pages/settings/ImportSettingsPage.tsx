/**
 * ImportSettingsPage
 *
 * Import chat history from external platforms (OpenAI ChatGPT, Anthropic Claude).
 */

import * as React from 'react'
import { useState, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLanguage } from '@/context/LanguageContext'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from '@/components/settings'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'import',
}

interface ImportResult {
  imported: number
  failed: number
  errors: string[]
  source: 'openai' | 'anthropic'
}

export default function ImportSettingsPage() {
  const { t } = useLanguage()
  const { activeWorkspaceId, refreshSessions } = useAppShellContext()

  const [isImporting, setIsImporting] = useState(false)
  const [importSource, setImportSource] = useState<'openai' | 'anthropic' | null>(null)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)

  const handleImport = useCallback(async (source: 'openai' | 'anthropic') => {
    if (!activeWorkspaceId) return

    // Open file dialog with zip/json filter
    const filePaths = await window.electronAPI.openFileDialog({
      filters: [
        { name: 'Export Files', extensions: ['zip', 'json'] },
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'JSON Files', extensions: ['json'] },
      ],
    })
    if (!filePaths || filePaths.length === 0) return

    const filePath = filePaths[0]
    setIsImporting(true)
    setImportSource(source)
    setLastResult(null)

    try {
      const result = await window.electronAPI.importSessions(activeWorkspaceId, source, filePath)
      setLastResult({ ...result, source })
      // Refresh sessions to show imported chats
      refreshSessions?.()
    } catch (error) {
      setLastResult({
        imported: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        source,
      })
    } finally {
      setIsImporting(false)
      setImportSource(null)
    }
  }, [activeWorkspaceId, refreshSessions])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('importSettings.title')} actions={<HeaderMenu route={routes.view.settings('import')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-6">
              {/* Import Section */}
              <SettingsSection
                title={t('importSettings.importChats')}
                description={t('importSettings.description')}
              >
                <SettingsCard>
                  <SettingsRow label={t('importSettings.importFromOpenAI')}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImport('openai')}
                      disabled={isImporting}
                    >
                      {isImporting && importSource === 'openai' ? (
                        <>
                          <Spinner className="mr-1.5" />
                          {t('importSettings.importing')}
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-1.5" />
                          {t('importSettings.selectFile')}
                        </>
                      )}
                    </Button>
                  </SettingsRow>
                  <SettingsRow label={t('importSettings.importFromAnthropic')}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImport('anthropic')}
                      disabled={isImporting}
                    >
                      {isImporting && importSource === 'anthropic' ? (
                        <>
                          <Spinner className="mr-1.5" />
                          {t('importSettings.importing')}
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-1.5" />
                          {t('importSettings.selectFile')}
                        </>
                      )}
                    </Button>
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              {/* Import Result */}
              {lastResult && (
                <SettingsSection title={t('importSettings.result')}>
                  <SettingsCard>
                    <div className="p-4 space-y-3">
                      {/* Success message */}
                      {lastResult.imported > 0 && (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span>
                            {t('importSettings.successMessage')
                              .replace('{count}', String(lastResult.imported))
                              .replace('{source}', lastResult.source === 'openai' ? 'OpenAI' : 'Anthropic')}
                          </span>
                        </div>
                      )}

                      {/* Failed count */}
                      {lastResult.failed > 0 && (
                        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            {t('importSettings.failedMessage').replace('{count}', String(lastResult.failed))}
                          </span>
                        </div>
                      )}

                      {/* Errors */}
                      {lastResult.errors.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="w-4 h-4" />
                            <span>{t('importSettings.errors')}</span>
                          </div>
                          <ul className="pl-6 text-sm text-muted-foreground list-disc">
                            {lastResult.errors.slice(0, 5).map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                            {lastResult.errors.length > 5 && (
                              <li>
                                {t('importSettings.moreErrors').replace(
                                  '{count}',
                                  String(lastResult.errors.length - 5)
                                )}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {/* No results message */}
                      {lastResult.imported === 0 && lastResult.failed === 0 && lastResult.errors.length === 0 && (
                        <div className="text-muted-foreground">
                          {t('importSettings.noConversations')}
                        </div>
                      )}
                    </div>
                  </SettingsCard>
                </SettingsSection>
              )}

              {/* Instructions */}
              <SettingsSection title={t('importSettings.howToExport')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* OpenAI Card */}
                  <SettingsCard>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#10a37f] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                          </svg>
                        </div>
                        <h4 className="font-medium text-foreground">OpenAI (ChatGPT)</h4>
                      </div>
                      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
                        <li>{t('importSettings.openaiStep1')}</li>
                        <li>{t('importSettings.openaiStep2')}</li>
                        <li>{t('importSettings.openaiStep3')}</li>
                        <li>{t('importSettings.openaiStep4')}</li>
                      </ol>
                    </div>
                  </SettingsCard>

                  {/* Anthropic Card */}
                  <SettingsCard>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#d4a27f] flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.304 3.541h-3.672l6.696 16.918h3.672l-6.696-16.918zm-10.608 0l-6.696 16.918h3.78l1.344-3.492h6.468l1.344 3.492h3.78l-6.696-16.918h-3.324zm-.252 10.476l2.124-5.52 2.124 5.52h-4.248z"/>
                          </svg>
                        </div>
                        <h4 className="font-medium text-foreground">Anthropic (Claude)</h4>
                      </div>
                      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
                        <li>{t('importSettings.anthropicStep1')}</li>
                        <li>{t('importSettings.anthropicStep2')}</li>
                        <li>{t('importSettings.anthropicStep3')}</li>
                        <li>{t('importSettings.anthropicStep4')}</li>
                      </ol>
                    </div>
                  </SettingsCard>
                </div>
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
