import React from 'react'
import { useAtomValue } from 'jotai'
import { Button } from '@/components/ui/button'
import { FreeFormInput } from '@/components/app-shell/input/FreeFormInput'
import type { RichTextInputHandle } from '@/components/ui/rich-text-input'
import { AiGenerate3d } from '@/components/icons/AiGenerate3d'
import { useTranslation } from '@/i18n'
import { windowWorkspaceIdAtom } from '@/atoms/sessions'
import { DEFAULT_MODEL } from '@config/models'
import { getDefaultModelsForConnection, resolveEffectiveConnectionSlug } from '@config/llm-connections'
import type { LlmConnectionWithStatus } from '../shared/types'

const TRAY_PANEL_BASE_HEIGHT = 136
const TRAY_PANEL_MAX_HEIGHT = 320
const TRAY_PANEL_VERTICAL_CHROME = 16

function buildMiniWindowParams({
  message,
  shouldSend = false,
  model,
  llmConnection,
}: {
  message?: string
  shouldSend?: boolean
  model?: string
  llmConnection?: string
} = {}): string {
  const params = new URLSearchParams({
    window: 'focused',
    systemPrompt: 'mini',
    sources: 'none',
  })

  if (message) {
    params.set('input', message)
    if (shouldSend) {
      params.set('send', 'true')
    }
  }

  if (model) {
    params.set('model', model)
  }

  if (llmConnection) {
    params.set('llmConnection', llmConnection)
  }

  return params.toString()
}

export default function TrayApp() {
  const workspaceId = useAtomValue(windowWorkspaceIdAtom)
  const { t } = useTranslation()
  const [quickAsk, setQuickAsk] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [currentModel, setCurrentModel] = React.useState(DEFAULT_MODEL)
  const [currentConnection, setCurrentConnection] = React.useState<string | undefined>()
  const [workspaceDefaultConnection, setWorkspaceDefaultConnection] = React.useState<string | undefined>()
  const [llmConnections, setLlmConnections] = React.useState<LlmConnectionWithStatus[]>([])
  const inputRef = React.useRef<RichTextInputHandle>(null)
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const lastPanelHeightRef = React.useRef(TRAY_PANEL_BASE_HEIGHT)

  const focusInput = React.useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  React.useEffect(() => {
    let isMounted = true

    const loadLauncherState = async () => {
      const [storedModel, connections, settings] = await Promise.all([
        window.electronAPI.getModel(),
        window.electronAPI.listLlmConnectionsWithStatus(),
        workspaceId ? window.electronAPI.getWorkspaceSettings(workspaceId) : Promise.resolve(null),
      ])

      if (!isMounted) return

      const workspaceDefault = settings?.defaultLlmConnection
      const effectiveConnectionSlug = resolveEffectiveConnectionSlug(undefined, workspaceDefault, connections)
      const effectiveConnection = effectiveConnectionSlug
        ? connections.find(connection => connection.slug === effectiveConnectionSlug) ?? null
        : null
      const allowedModelIds = effectiveConnection
        ? (effectiveConnection.models && effectiveConnection.models.length > 0
            ? effectiveConnection.models
            : getDefaultModelsForConnection(effectiveConnection.providerType)
          ).map((model) => typeof model === 'string' ? model : model.id)
        : []
      const fallbackModel = effectiveConnection?.defaultModel ?? DEFAULT_MODEL
      const resolvedModel = storedModel && (allowedModelIds.length === 0 || allowedModelIds.includes(storedModel))
        ? storedModel
        : fallbackModel

      setLlmConnections(connections)
      setWorkspaceDefaultConnection(workspaceDefault)
      setCurrentConnection(effectiveConnectionSlug ?? undefined)
      setCurrentModel(resolvedModel)
    }

    void loadLauncherState()

    return () => {
      isMounted = false
    }
  }, [workspaceId])

  React.useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const updateTrayHeight = (contentHeight: number) => {
      const desiredHeight = Math.min(
        TRAY_PANEL_MAX_HEIGHT,
        Math.max(
          TRAY_PANEL_BASE_HEIGHT,
          Math.round(contentHeight + TRAY_PANEL_VERTICAL_CHROME)
        )
      )

      if (desiredHeight === lastPanelHeightRef.current) {
        return
      }

      lastPanelHeightRef.current = desiredHeight
      void window.electronAPI.setTrayPanelHeight(desiredHeight)
    }

    const observer = new ResizeObserver(() => {
      updateTrayHeight(Math.ceil(surface.getBoundingClientRect().height))
    })

    observer.observe(surface)
    requestAnimationFrame(() => {
      updateTrayHeight(Math.ceil(surface.getBoundingClientRect().height))
    })

    return () => {
      observer.disconnect()
      lastPanelHeightRef.current = TRAY_PANEL_BASE_HEIGHT
    }
  }, [workspaceId])

  React.useEffect(() => {
    focusInput()

    const handleFocus = () => {
      focusInput()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        void window.electronAPI.closeWindow()
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusInput])

  const openUrlAndDismiss = React.useCallback(async (url: string) => {
    await window.electronAPI.openUrl(url)
    await window.electronAPI.closeWindow()
  }, [])

  const handleSubmit = React.useCallback(async (message: string) => {
    const trimmedMessage = message.trim()
    if (!workspaceId || !trimmedMessage || isSubmitting) return

    setIsSubmitting(true)
    try {
      await openUrlAndDismiss(
        `agentoperator://workspace/${workspaceId}/action/new-chat?${buildMiniWindowParams({
          message: trimmedMessage,
          shouldSend: true,
          model: currentModel,
          llmConnection: currentConnection,
        })}`
      )
      setQuickAsk('')
    } finally {
      setIsSubmitting(false)
    }
  }, [currentConnection, currentModel, isSubmitting, openUrlAndDismiss, workspaceId])

  const handleModelChange = React.useCallback((model: string, connection?: string) => {
    setCurrentModel(model)
    if (connection) {
      setCurrentConnection(connection)
    }
  }, [])

  const handleOpenMainWindow = React.useCallback(async () => {
    await openUrlAndDismiss('agentoperator://allChats?window=focused')
  }, [openUrlAndDismiss])

  return (
    <div className="h-screen overflow-hidden bg-transparent text-foreground">
      <div className="flex h-full items-end justify-center px-3 pb-3 pt-2">
        <div className="w-full max-w-[560px]">
          {workspaceId ? (
            <div ref={surfaceRef} className="relative pt-5">
              <div className="pointer-events-none absolute left-4 top-0 z-20">
                <AiGenerate3d
                  aria-hidden="true"
                  blinkOnly
                  className="h-6 w-6 drop-shadow-[0_4px_10px_rgba(0,0,0,0.1)]"
                />
              </div>

              <div className="rounded-[22px] bg-background/94 px-2.5 pb-2.5 pt-3 shadow-middle backdrop-blur-2xl">
                <FreeFormInput
                  inputRef={inputRef}
                  unstyled
                  launcherMode
                  launcherShowModelSelector
                  placeholder={t('trayPanel.quickAskPlaceholder')}
                  disabled={isSubmitting}
                  inputValue={quickAsk}
                  onInputChange={setQuickAsk}
                  currentModel={currentModel}
                  currentConnection={currentConnection}
                  availableLlmConnections={llmConnections}
                  workspaceDefaultLlmConnection={workspaceDefaultConnection}
                  onModelChange={handleModelChange}
                  isEmptySession
                  onSubmit={(message) => {
                    void handleSubmit(message)
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-[16px] bg-background/96 p-4 shadow-middle backdrop-blur-2xl">
              <div className="text-sm text-muted-foreground">
                {t('trayPanel.noWorkspace')}
              </div>
              <Button
                className="mt-3"
                variant="secondary"
                onClick={handleOpenMainWindow}
              >
                {t('trayPanel.openApp')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
