/**
 * IMSettingsPage
 *
 * Settings for IM (Instant Messaging) platform integrations.
 * Supports Feishu/Lark and Telegram bot configuration.
 */

import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { routes } from '@/lib/navigate'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import { useLanguage } from '@/context/LanguageContext'
import type { IMConfigMap, IMGatewayStatus, IMPlatform } from '@agent-operator/shared/im'

import {
  SettingsSection,
  SettingsCard,
  SettingsCardFooter,
  SettingsToggle,
  SettingsInputRow,
  SettingsMenuSelectRow,
} from '@/components/settings'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'im',
}

// ============================================
// Types
// ============================================

interface FeishuFormState {
  appId: string
  appSecret: string
  domain: 'feishu' | 'lark'
  renderMode: 'text' | 'card'
  requireMention: boolean
  debug: boolean
}

interface TelegramFormState {
  botToken: string
  requireMention: boolean
  debug: boolean
}

type TestState = 'idle' | 'testing' | 'success' | 'error'
type ChannelAction = 'idle' | 'starting' | 'stopping'

// ============================================
// Main Component
// ============================================

export default function IMSettingsPage() {
  const { t } = useLanguage()

  // Feishu form state
  const [feishu, setFeishu] = useState<FeishuFormState>({
    appId: '',
    appSecret: '',
    domain: 'feishu',
    renderMode: 'card',
    requireMention: true,
    debug: false,
  })

  // Telegram form state
  const [telegram, setTelegram] = useState<TelegramFormState>({
    botToken: '',
    requireMention: true,
    debug: false,
  })

  // Channel statuses
  const [statuses, setStatuses] = useState<IMGatewayStatus[]>([])
  const [feishuTest, setFeishuTest] = useState<TestState>('idle')
  const [telegramTest, setTelegramTest] = useState<TestState>('idle')
  const [feishuAction, setFeishuAction] = useState<ChannelAction>('idle')
  const [telegramAction, setTelegramAction] = useState<ChannelAction>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  // ---- Load config on mount ----
  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      try {
        const [config, status] = await Promise.all([
          window.electronAPI.imGetConfig(),
          window.electronAPI.imGetStatus(),
        ])

        if (config.feishu) {
          const fc = config.feishu as Record<string, unknown>
          setFeishu({
            appId: (fc.appId as string) ?? '',
            appSecret: (fc.appSecret as string) ?? '',
            domain: (fc.domain as 'feishu' | 'lark') ?? 'feishu',
            renderMode: (fc.renderMode as 'text' | 'card') ?? 'card',
            requireMention: (fc.requireMention as boolean) ?? true,
            debug: (fc.debug as boolean) ?? false,
          })
        }

        if (config.telegram) {
          const tc = config.telegram as Record<string, unknown>
          setTelegram({
            botToken: (tc.botToken as string) ?? '',
            requireMention: (tc.requireMention as boolean) ?? true,
            debug: (tc.debug as boolean) ?? false,
          })
        }

        setStatuses(status)
      } catch (error) {
        console.error('Failed to load IM config:', error)
      }
    }
    load()
  }, [])

  // ---- Listen for status changes ----
  useEffect(() => {
    if (!window.electronAPI) return
    const cleanup = window.electronAPI.onImStatusChanged((newStatuses) => {
      setStatuses(newStatuses as IMGatewayStatus[])
      setFeishuAction('idle')
      setTelegramAction('idle')
    })
    return cleanup
  }, [])

  // ---- Helpers ----

  const getStatus = useCallback((platform: IMPlatform): IMGatewayStatus | undefined => {
    return statuses.find(s => s.platform === platform)
  }, [statuses])

  const buildConfig = useCallback((overrides?: { feishuEnabled?: boolean; telegramEnabled?: boolean }): IMConfigMap => {
    return {
      feishu: {
        ...(overrides?.feishuEnabled !== undefined ? { enabled: overrides.feishuEnabled } : {}),
        appId: feishu.appId,
        appSecret: feishu.appSecret,
        domain: feishu.domain,
        renderMode: feishu.renderMode,
        requireMention: feishu.requireMention,
        debug: feishu.debug,
      },
      telegram: {
        ...(overrides?.telegramEnabled !== undefined ? { enabled: overrides.telegramEnabled } : {}),
        botToken: telegram.botToken,
        requireMention: telegram.requireMention,
        debug: telegram.debug,
      },
    }
  }, [feishu, telegram])

  const saveConfig = useCallback(async (overrides?: { feishuEnabled?: boolean; telegramEnabled?: boolean }) => {
    if (!window.electronAPI) return
    await window.electronAPI.imSetConfig(buildConfig(overrides))
  }, [buildConfig])

  // ---- Feishu handlers ----

  const updateFeishu = useCallback(<K extends keyof FeishuFormState>(key: K, value: FeishuFormState[K]) => {
    setFeishu(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleFeishuTest = useCallback(async () => {
    if (!window.electronAPI) return
    setFeishuTest('testing')
    setTestError(null)
    try {
      // Save current config first so test uses latest values
      await saveConfig()
      const result = await window.electronAPI.imTestChannel('feishu')
      if (result && typeof result === 'object' && 'verdict' in result) {
        const testResult = result as { checks: Array<{ level: string; message: string }>; verdict: string }
        if (testResult.verdict === 'pass') {
          setFeishuTest('success')
        } else {
          setFeishuTest('error')
          const failedCheck = testResult.checks.find(c => c.level === 'fail')
          setTestError(failedCheck?.message || t('imSettings.testFailed'))
        }
      }
    } catch (error) {
      setFeishuTest('error')
      setTestError(error instanceof Error ? error.message : t('imSettings.testFailed'))
    }
    setTimeout(() => setFeishuTest('idle'), 4000)
  }, [t, saveConfig])

  const handleFeishuToggle = useCallback(async () => {
    if (!window.electronAPI) return
    const status = getStatus('feishu')
    if (status?.connected) {
      setFeishuAction('stopping')
      await saveConfig({ feishuEnabled: false })
      await window.electronAPI.imStopChannel('feishu')
    } else {
      await saveConfig({ feishuEnabled: true })
      setFeishuAction('starting')
      await window.electronAPI.imStartChannel('feishu')
    }
  }, [getStatus, saveConfig])

  // ---- Telegram handlers ----

  const updateTelegram = useCallback(<K extends keyof TelegramFormState>(key: K, value: TelegramFormState[K]) => {
    setTelegram(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleTelegramTest = useCallback(async () => {
    if (!window.electronAPI) return
    setTelegramTest('testing')
    setTestError(null)
    try {
      // Save current config first so test uses latest values
      await saveConfig()
      const result = await window.electronAPI.imTestChannel('telegram')
      if (result && typeof result === 'object' && 'verdict' in result) {
        const testResult = result as { checks: Array<{ level: string; message: string }>; verdict: string }
        if (testResult.verdict === 'pass') {
          setTelegramTest('success')
        } else {
          setTelegramTest('error')
          const failedCheck = testResult.checks.find(c => c.level === 'fail')
          setTestError(failedCheck?.message || t('imSettings.testFailed'))
        }
      }
    } catch (error) {
      setTelegramTest('error')
      setTestError(error instanceof Error ? error.message : t('imSettings.testFailed'))
    }
    setTimeout(() => setTelegramTest('idle'), 4000)
  }, [t, saveConfig])

  const handleTelegramToggle = useCallback(async () => {
    if (!window.electronAPI) return
    const status = getStatus('telegram')
    if (status?.connected) {
      setTelegramAction('stopping')
      await saveConfig({ telegramEnabled: false })
      await window.electronAPI.imStopChannel('telegram')
    } else {
      await saveConfig({ telegramEnabled: true })
      setTelegramAction('starting')
      await window.electronAPI.imStartChannel('telegram')
    }
  }, [getStatus, saveConfig])

  // ---- Auto-save on change (debounced) ----
  useEffect(() => {
    const timer = setTimeout(() => {
      saveConfig().catch(console.error)
    }, 800)
    return () => clearTimeout(timer)
  }, [feishu.domain, feishu.renderMode, feishu.requireMention, feishu.debug,
      telegram.requireMention, telegram.debug])

  // ---- Render helpers ----

  const feishuStatus = getStatus('feishu')
  const telegramStatus = getStatus('telegram')

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('imSettings.title')} actions={<HeaderMenu route={routes.view.settings('im')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">

              {/* ---- Feishu Section ---- */}
              <SettingsSection
                title={t('imSettings.feishu')}
                description={t('imSettings.feishuDescription')}
                action={<StatusBadge status={feishuStatus} t={t} />}
              >
                <SettingsCard>
                  <SettingsInputRow
                    label={t('imSettings.appId')}
                    value={feishu.appId}
                    onChange={(v) => updateFeishu('appId', v)}
                    placeholder="cli_xxxxxxxxxx"
                  />
                  <SettingsInputRow
                    label={t('imSettings.appSecret')}
                    value={feishu.appSecret}
                    onChange={(v) => updateFeishu('appSecret', v)}
                    placeholder="Enter App Secret..."
                  />
                  <SettingsMenuSelectRow
                    label={t('imSettings.domain')}
                    value={feishu.domain}
                    onValueChange={(v) => updateFeishu('domain', v as 'feishu' | 'lark')}
                    options={[
                      { value: 'feishu', label: t('imSettings.domainFeishu') },
                      { value: 'lark', label: t('imSettings.domainLark') },
                    ]}
                  />
                  <SettingsMenuSelectRow
                    label={t('imSettings.renderMode')}
                    value={feishu.renderMode}
                    onValueChange={(v) => updateFeishu('renderMode', v as 'text' | 'card')}
                    options={[
                      { value: 'text', label: t('imSettings.renderModeText') },
                      { value: 'card', label: t('imSettings.renderModeCard') },
                    ]}
                  />
                  <SettingsToggle
                    label={t('imSettings.requireMention')}
                    description={t('imSettings.requireMentionDesc')}
                    checked={feishu.requireMention}
                    onCheckedChange={(v) => updateFeishu('requireMention', v)}
                  />
                </SettingsCard>
                <SettingsCard>
                  <SettingsCardFooter>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFeishuTest}
                        disabled={!feishu.appId || feishuTest === 'testing'}
                      >
                        {feishuTest === 'testing' ? t('imSettings.testing') :
                         feishuTest === 'success' ? t('imSettings.testSuccess') :
                         feishuTest === 'error' ? t('imSettings.testFailed') :
                         t('imSettings.testConnection')}
                      </Button>
                      <Button
                        variant={feishuStatus?.connected ? 'destructive' : 'default'}
                        size="sm"
                        onClick={handleFeishuToggle}
                        disabled={!feishu.appId || feishuAction !== 'idle'}
                      >
                        {feishuAction === 'starting' ? t('imSettings.starting') :
                         feishuAction === 'stopping' ? t('imSettings.stopping') :
                         feishuStatus?.connected ? t('imSettings.stop') :
                         t('imSettings.start')}
                      </Button>
                    </div>
                  </SettingsCardFooter>
                </SettingsCard>
              </SettingsSection>

              {/* ---- Telegram Section ---- */}
              <SettingsSection
                title={t('imSettings.telegram')}
                description={t('imSettings.telegramDescription')}
                action={<StatusBadge status={telegramStatus} t={t} />}
              >
                <SettingsCard>
                  <SettingsInputRow
                    label={t('imSettings.botToken')}
                    value={telegram.botToken}
                    onChange={(v) => updateTelegram('botToken', v)}
                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  />
                  <SettingsToggle
                    label={t('imSettings.requireMention')}
                    description={t('imSettings.requireMentionDesc')}
                    checked={telegram.requireMention}
                    onCheckedChange={(v) => updateTelegram('requireMention', v)}
                  />
                </SettingsCard>
                <SettingsCard>
                  <SettingsCardFooter>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTelegramTest}
                        disabled={telegramTest === 'testing'}
                      >
                        {telegramTest === 'testing' ? t('imSettings.testing') :
                         telegramTest === 'success' ? t('imSettings.testSuccess') :
                         telegramTest === 'error' ? t('imSettings.testFailed') :
                         t('imSettings.testConnection')}
                      </Button>
                      <Button
                        variant={telegramStatus?.connected ? 'destructive' : 'default'}
                        size="sm"
                        onClick={handleTelegramToggle}
                        disabled={telegramAction !== 'idle'}
                      >
                        {telegramAction === 'starting' ? t('imSettings.starting') :
                         telegramAction === 'stopping' ? t('imSettings.stopping') :
                         telegramStatus?.connected ? t('imSettings.stop') :
                         t('imSettings.start')}
                      </Button>
                    </div>
                  </SettingsCardFooter>
                </SettingsCard>
              </SettingsSection>

              {/* ---- General Section ---- */}
              <SettingsSection title={t('imSettings.general')} description={t('imSettings.generalDescription')}>
                <SettingsCard>
                  <SettingsToggle
                    label={t('imSettings.debug')}
                    description={t('imSettings.debugDesc')}
                    checked={feishu.debug || telegram.debug}
                    onCheckedChange={(v) => {
                      updateFeishu('debug', v)
                      updateTelegram('debug', v)
                    }}
                  />
                </SettingsCard>
              </SettingsSection>

              {/* Error display */}
              {testError && (
                <p className="text-sm text-destructive">{testError}</p>
              )}

            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

// ============================================
// Status Badge
// ============================================

function StatusBadge({ status, t }: { status?: IMGatewayStatus; t: (key: string) => string }) {
  if (!status) return null

  if (status.connected) {
    return (
      <Badge variant="outline" className="text-green-500 border-green-500/30">
        {status.botName ? `${t('imSettings.botName')}: ${status.botName}` : t('imSettings.connected')}
      </Badge>
    )
  }

  if (status.error) {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30">
        {t('imSettings.error')}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      {t('imSettings.disconnected')}
    </Badge>
  )
}
