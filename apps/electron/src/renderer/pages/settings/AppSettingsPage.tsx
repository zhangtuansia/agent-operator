/**
 * AppSettingsPage
 *
 * Global app-level settings that apply across all workspaces.
 *
 * Settings:
 * - Appearance (Theme, Font)
 * - Notifications
 * - Billing (API Key, Claude Max)
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { useTheme } from '@/context/ThemeContext'
import { routes } from '@/lib/navigate'
import { Monitor, Sun, Moon } from 'lucide-react'
import { Spinner } from '@agent-operator/ui'
import type { AuthType } from '../../../shared/types'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
  SettingsSegmentedControl,
  SettingsMenuSelectRow,
  SettingsMenuSelect,
} from '@/components/settings'
import { ApiKeyDialogContent } from '@/components/settings/ApiKeyDialog'
import { ClaudeOAuthDialogContent } from '@/components/settings/ClaudeOAuthDialog'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useAppShellContext } from '@/context/AppShellContext'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES, type Language } from '@/i18n'
import type { PresetTheme } from '@config/theme'
import { FONTS, getFontLabel, SYSTEM_FONT } from '@/config/fonts'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'app',
}

export default function AppSettingsPage() {
  const { mode, setMode, colorTheme, setColorTheme, setPreviewColorTheme, font, setFont } = useTheme()
  const { language, setLanguage, t } = useLanguage()

  // Get workspace ID from context for loading preset themes
  const { activeWorkspaceId } = useAppShellContext()

  // Preset themes state
  const [presetThemes, setPresetThemes] = useState<PresetTheme[]>([])

  // Billing state
  const [authType, setAuthType] = useState<AuthType>('api_key')
  const [expandedMethod, setExpandedMethod] = useState<AuthType | null>(null)
  const [hasCredential, setHasCredential] = useState(false)
  const [isLoadingBilling, setIsLoadingBilling] = useState(true)

  // API Key state
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | undefined>()

  // Claude OAuth state
  const [existingClaudeToken, setExistingClaudeToken] = useState<string | null>(null)
  const [claudeOAuthStatus, setClaudeOAuthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [claudeOAuthError, setClaudeOAuthError] = useState<string | undefined>()
  const [isWaitingForCode, setIsWaitingForCode] = useState(false)
  const [authCode, setAuthCode] = useState('')

  // Notifications state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // Auto-update state
  const updateChecker = useUpdateChecker()
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false)

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingForUpdates(true)
    try {
      await updateChecker.checkForUpdates()
    } finally {
      setIsCheckingForUpdates(false)
    }
  }, [updateChecker])

  // Load current billing method, notifications setting, and preset themes on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return
      try {
        const [billing, notificationsOn] = await Promise.all([
          window.electronAPI.getBillingMethod(),
          window.electronAPI.getNotificationsEnabled(),
        ])
        setAuthType(billing.authType)
        setHasCredential(billing.hasCredential)
        setNotificationsEnabled(notificationsOn)
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setIsLoadingBilling(false)
      }
    }
    loadSettings()
  }, [])

  // Load preset themes when workspace changes (themes are workspace-scoped)
  // Load preset themes (app-level, no workspace dependency)
  useEffect(() => {
    const loadThemes = async () => {
      if (!window.electronAPI) {
        setPresetThemes([])
        return
      }
      try {
        const themes = await window.electronAPI.loadPresetThemes()
        setPresetThemes(themes)
      } catch (error) {
        console.error('Failed to load preset themes:', error)
        setPresetThemes([])
      }
    }
    loadThemes()
  }, [])

  // Check for existing Claude token when expanding oauth_token option
  useEffect(() => {
    if (expandedMethod !== 'oauth_token') return

    const checkExistingToken = async () => {
      if (!window.electronAPI) return
      try {
        const token = await window.electronAPI.getExistingClaudeToken()
        setExistingClaudeToken(token)
      } catch (error) {
        console.error('Failed to check existing Claude token:', error)
      }
    }
    checkExistingToken()
  }, [expandedMethod])

  // Handle clicking on a billing method option
  const handleMethodClick = useCallback(async (method: AuthType) => {
    if (method === authType && hasCredential) {
      setExpandedMethod(null)
      return
    }

    setExpandedMethod(method)
    setApiKeyError(undefined)
    setClaudeOAuthStatus('idle')
    setClaudeOAuthError(undefined)
  }, [authType, hasCredential])

  // Cancel billing method expansion
  const handleCancel = useCallback(() => {
    setExpandedMethod(null)
    setApiKeyValue('')
    setApiKeyError(undefined)
    setClaudeOAuthStatus('idle')
    setClaudeOAuthError(undefined)
  }, [])

  // Save API key
  const handleSaveApiKey = useCallback(async () => {
    if (!window.electronAPI || !apiKeyValue.trim()) return

    setIsSavingApiKey(true)
    setApiKeyError(undefined)
    try {
      await window.electronAPI.updateBillingMethod('api_key', apiKeyValue.trim())
      setAuthType('api_key')
      setHasCredential(true)
      setApiKeyValue('')
      setExpandedMethod(null)
    } catch (error) {
      console.error('Failed to save API key:', error)
      setApiKeyError(error instanceof Error ? error.message : 'Invalid API key. Please check and try again.')
    } finally {
      setIsSavingApiKey(false)
    }
  }, [apiKeyValue])

  // Use existing Claude token
  const handleUseExistingClaudeToken = useCallback(async () => {
    if (!window.electronAPI || !existingClaudeToken) return

    setClaudeOAuthStatus('loading')
    setClaudeOAuthError(undefined)
    try {
      await window.electronAPI.updateBillingMethod('oauth_token', existingClaudeToken)
      setAuthType('oauth_token')
      setHasCredential(true)
      setClaudeOAuthStatus('success')
      setExpandedMethod(null)
    } catch (error) {
      setClaudeOAuthStatus('error')
      setClaudeOAuthError(error instanceof Error ? error.message : 'Failed to save token')
    }
  }, [existingClaudeToken])

  // Start Claude OAuth flow (native browser-based)
  const handleStartClaudeOAuth = useCallback(async () => {
    if (!window.electronAPI) return

    setClaudeOAuthStatus('loading')
    setClaudeOAuthError(undefined)

    try {
      // Start OAuth flow - this opens the browser
      const result = await window.electronAPI.startClaudeOAuth()

      if (result.success) {
        // Browser opened successfully, now waiting for user to copy the code
        setIsWaitingForCode(true)
        setClaudeOAuthStatus('idle')
      } else {
        setClaudeOAuthStatus('error')
        setClaudeOAuthError(result.error || 'Failed to start OAuth')
      }
    } catch (error) {
      setClaudeOAuthStatus('error')
      setClaudeOAuthError(error instanceof Error ? error.message : 'OAuth failed')
    }
  }, [])

  // Submit authorization code from browser
  const handleSubmitAuthCode = useCallback(async (code: string) => {
    if (!window.electronAPI || !code.trim()) {
      setClaudeOAuthError('Please enter the authorization code')
      return
    }

    setClaudeOAuthStatus('loading')
    setClaudeOAuthError(undefined)

    try {
      const result = await window.electronAPI.exchangeClaudeCode(code.trim())

      if (result.success && result.token) {
        await window.electronAPI.updateBillingMethod('oauth_token', result.token)
        setAuthType('oauth_token')
        setHasCredential(true)
        setClaudeOAuthStatus('success')
        setIsWaitingForCode(false)
        setAuthCode('')
        setExpandedMethod(null)
      } else {
        setClaudeOAuthStatus('error')
        setClaudeOAuthError(result.error || 'Failed to exchange code')
      }
    } catch (error) {
      setClaudeOAuthStatus('error')
      setClaudeOAuthError(error instanceof Error ? error.message : 'Failed to exchange code')
    }
  }, [])

  // Cancel OAuth flow and clear state
  const handleCancelOAuth = useCallback(async () => {
    setIsWaitingForCode(false)
    setAuthCode('')
    setClaudeOAuthStatus('idle')
    setClaudeOAuthError(undefined)
    setExpandedMethod(null)

    // Clear OAuth state on backend
    if (window.electronAPI) {
      try {
        await window.electronAPI.clearClaudeOAuthState()
      } catch (error) {
        // Non-critical: state cleanup failed, but UI is already reset
        console.error('Failed to clear OAuth state:', error)
      }
    }
  }, [])

  const handleNotificationsEnabledChange = useCallback(async (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    await window.electronAPI.setNotificationsEnabled(enabled)
  }, [])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={t('appSettings.title')} actions={<HeaderMenu route={routes.view.settings('app')} />} />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
          <div className="space-y-6">
            {/* Appearance */}
            <SettingsSection title={t('appSettings.appearance')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.mode')}>
                  <SettingsSegmentedControl
                    value={mode}
                    onValueChange={setMode}
                    options={[
                      { value: 'system', label: t('appSettings.modeSystem'), icon: <Monitor className="w-4 h-4" /> },
                      { value: 'light', label: t('appSettings.modeLight'), icon: <Sun className="w-4 h-4" /> },
                      { value: 'dark', label: t('appSettings.modeDark'), icon: <Moon className="w-4 h-4" /> },
                    ]}
                  />
                </SettingsRow>
                <SettingsRow label={t('appSettings.colorTheme')}>
                  <SettingsMenuSelect
                    value={colorTheme}
                    onValueChange={setColorTheme}
                    options={[
                      { value: 'default', label: t('appSettings.colorThemeDefault') },
                      ...presetThemes
                        .filter(theme => theme.id !== 'default')
                        .map(theme => ({
                          value: theme.id,
                          label: theme.theme.name || theme.id,
                        })),
                    ]}
                  />
                </SettingsRow>
                <SettingsRow label={t('appSettings.font')}>
                  <SettingsMenuSelect
                    value={font}
                    onValueChange={setFont}
                    options={[
                      { value: SYSTEM_FONT.id, label: t('appSettings.modeSystem') },
                      ...FONTS.map(f => ({
                        value: f.id,
                        label: getFontLabel(f),
                      })),
                    ]}
                  />
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>

            {/* Language */}
            <SettingsSection title={t('appSettings.language')} description={t('appSettings.languageDescription')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.language')}>
                  <SettingsSegmentedControl
                    value={language}
                    onValueChange={(v) => setLanguage(v as Language)}
                    options={LANGUAGES.map(lang => ({
                      value: lang.value,
                      label: lang.nativeLabel,
                    }))}
                  />
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>

            {/* Notifications */}
            <SettingsSection title={t('appSettings.notifications')}>
              <SettingsCard>
                <SettingsToggle
                  label={t('appSettings.desktopNotifications')}
                  description={t('appSettings.desktopNotificationsDesc')}
                  checked={notificationsEnabled}
                  onCheckedChange={handleNotificationsEnabledChange}
                />
              </SettingsCard>
            </SettingsSection>

            {/* Billing */}
            <SettingsSection title={t('appSettings.billing')} description={t('appSettings.billingDescription')}>
              <SettingsCard>
                <SettingsMenuSelectRow
                  label={t('appSettings.paymentMethod')}
                  description={
                    authType === 'api_key' && hasCredential
                      ? t('appSettings.apiKeyConfigured')
                      : authType === 'oauth_token' && hasCredential
                        ? t('appSettings.claudeConnected')
                        : t('appSettings.selectMethod')
                  }
                  value={authType}
                  onValueChange={(v) => handleMethodClick(v as AuthType)}
                  options={[
                    { value: 'oauth_token', label: t('appSettings.claudeProMax'), description: t('appSettings.claudeProMaxDesc') },
                    { value: 'api_key', label: t('appSettings.apiKey'), description: t('appSettings.apiKeyDesc') },
                  ]}
                />
              </SettingsCard>

              {/* API Key Dialog */}
              <Dialog open={expandedMethod === 'api_key'} onOpenChange={(open) => !open && handleCancel()}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('appSettings.apiKey')}</DialogTitle>
                    <DialogDescription>
                      {t('appSettings.configureApiKey')}
                    </DialogDescription>
                  </DialogHeader>
                  <ApiKeyDialogContent
                    value={apiKeyValue}
                    onChange={setApiKeyValue}
                    onSave={handleSaveApiKey}
                    onCancel={handleCancel}
                    isSaving={isSavingApiKey}
                    hasExistingKey={authType === 'api_key' && hasCredential}
                    error={apiKeyError}
                  />
                </DialogContent>
              </Dialog>

              {/* Claude OAuth Dialog */}
              <Dialog open={expandedMethod === 'oauth_token'} onOpenChange={(open) => !open && handleCancelOAuth()}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('appSettings.claudeProMax')}</DialogTitle>
                    <DialogDescription>
                      {t('appSettings.configureClaudeMax')}
                    </DialogDescription>
                  </DialogHeader>
                  {isWaitingForCode ? (
                    <ClaudeOAuthDialogContent
                      existingToken={existingClaudeToken}
                      isLoading={claudeOAuthStatus === 'loading'}
                      onUseExisting={handleUseExistingClaudeToken}
                      onStartOAuth={handleStartClaudeOAuth}
                      onCancel={handleCancelOAuth}
                      status={claudeOAuthStatus}
                      errorMessage={claudeOAuthError}
                      isWaitingForCode={true}
                      authCode={authCode}
                      onAuthCodeChange={setAuthCode}
                      onSubmitAuthCode={handleSubmitAuthCode}
                    />
                  ) : (
                    <ClaudeOAuthDialogContent
                      existingToken={existingClaudeToken}
                      isLoading={claudeOAuthStatus === 'loading'}
                      onUseExisting={handleUseExistingClaudeToken}
                      onStartOAuth={handleStartClaudeOAuth}
                      onCancel={handleCancelOAuth}
                      status={claudeOAuthStatus}
                      errorMessage={claudeOAuthError}
                      isWaitingForCode={false}
                    />
                  )}
                </DialogContent>
              </Dialog>
            </SettingsSection>

            {/* About */}
            <SettingsSection title={t('appSettings.about')}>
              <SettingsCard>
                <SettingsRow label={t('appSettings.version')}>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {updateChecker.updateInfo?.currentVersion ?? t('common.loading')}
                    </span>
                    {/* Show download progress next to version when downloading */}
                    {updateChecker.isDownloading && (
                      <span className="text-xs text-primary">
                        {t('appSettings.downloadProgress').replace('{progress}', String(updateChecker.downloadProgress))}
                      </span>
                    )}
                    {/* Show new version badge when ready */}
                    {updateChecker.isReadyToInstall && updateChecker.updateInfo?.latestVersion && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        → {updateChecker.updateInfo.latestVersion}
                      </span>
                    )}
                  </div>
                </SettingsRow>
                <SettingsRow label={t('appSettings.checkForUpdates')}>
                  {/* Ready to install */}
                  {updateChecker.isReadyToInstall ? (
                    <Button
                      size="sm"
                      onClick={updateChecker.installUpdate}
                    >
                      {t('appSettings.restartToUpdate')}
                    </Button>
                  ) : /* Downloading */ updateChecker.isDownloading ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                    >
                      <Spinner className="mr-1.5" />
                      {t('appSettings.downloadProgress').replace('{progress}', String(updateChecker.downloadProgress))}
                    </Button>
                  ) : /* Download error */ updateChecker.updateInfo?.downloadState === 'error' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckForUpdates}
                    >
                      {t('appSettings.retryDownload')}
                    </Button>
                  ) : /* Checking */ isCheckingForUpdates ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                    >
                      <Spinner className="mr-1.5" />
                      {t('appSettings.checking')}
                    </Button>
                  ) : /* Default: Check Now */ (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckForUpdates}
                    >
                      {t('appSettings.checkNow')}
                    </Button>
                  )}
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>
          </div>
        </div>
        </ScrollArea>
      </div>
    </div>
  )
}
