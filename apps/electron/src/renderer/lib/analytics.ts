import type { ElectronAPI, SessionEvent } from '../../shared/types'

const DEFAULT_POSTHOG_KEY = 'phc_USjUyB7bYj9mIBKkuEyRuONU3pU40NJG2ZY0yPxMkdd'
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || DEFAULT_POSTHOG_KEY
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '')
const ANALYTICS_DISABLED = import.meta.env.VITE_DISABLE_ANALYTICS === '1'
const ENABLED = Boolean(POSTHOG_KEY) && !ANALYTICS_DISABLED

const DISTINCT_ID_KEY = 'agent_operator_distinct_id'
const SESSION_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`

type Primitive = string | number | boolean | null | undefined

const superProperties: Record<string, Primitive> = {
  session_id: SESSION_ID,
  app: 'cowork-electron',
}

const METHOD_ALIAS_EVENTS: Record<string, { ok?: string; error?: string }> = {
  createWorkspace: { ok: 'workspace_created', error: 'workspace_create_failed' },
  switchWorkspace: { ok: 'workspace_switched', error: 'workspace_switch_failed' },
  createSession: { ok: 'session_created', error: 'session_create_failed' },
  deleteSession: { ok: 'session_deleted', error: 'session_delete_failed' },
  sendMessage: { ok: 'message_sent', error: 'message_send_failed' },
  cancelProcessing: { ok: 'message_interrupted' },
  respondToPermission: { ok: 'permission_request_responded' },
  respondToCredential: { ok: 'credential_request_submitted', error: 'credential_request_failed' },
  startSourceOAuth: { ok: 'source_oauth_started', error: 'source_oauth_failed' },
  saveSourceCredentials: { ok: 'source_credentials_saved', error: 'source_credentials_save_failed' },
  setModel: { ok: 'settings_global_model_updated' },
  setSessionModel: { ok: 'session_model_changed' },
  setAgentType: { ok: 'settings_agent_type_updated' },
  updateProviderConfig: { ok: 'settings_provider_updated' },
  setLanguage: { ok: 'settings_language_updated' },
  setNotificationsEnabled: { ok: 'settings_notifications_updated' },
}

const SESSION_EVENT_ALIAS: Record<SessionEvent['type'], string> = {
  text_delta: 'message_text_stream_delta',
  text_complete: 'message_text_stream_completed',
  tool_start: 'tool_started',
  tool_result: 'tool_result_received',
  parent_update: 'tool_parent_updated',
  error: 'message_error',
  typed_error: 'message_typed_error',
  complete: 'message_completed',
  interrupted: 'message_interrupted',
  status: 'message_status',
  info: 'message_info',
  title_generated: 'session_title_generated',
  title_regenerating: 'session_title_regenerating',
  async_operation: 'session_async_operation',
  working_directory_changed: 'session_working_directory_changed',
  permission_request: 'permission_request_shown',
  credential_request: 'credential_request_shown',
  permission_mode_changed: 'session_permission_mode_changed',
  plan_submitted: 'plan_submitted',
  sources_changed: 'session_sources_changed',
  task_backgrounded: 'task_backgrounded',
  shell_backgrounded: 'shell_backgrounded',
  task_progress: 'task_progress_updated',
  shell_killed: 'shell_killed',
  user_message: 'message_user_event',
  session_flagged: 'session_flagged',
  session_unflagged: 'session_unflagged',
  session_model_changed: 'session_model_changed',
  connection_changed: 'connection_changed',
  todo_state_changed: 'session_todo_state_changed',
  session_deleted: 'session_deleted',
  session_shared: 'session_shared',
  session_unshared: 'session_unshared',
  auth_request: 'auth_request_shown',
  auth_completed: 'auth_request_completed',
  source_activated: 'source_auto_activated',
  usage_update: 'message_usage_updated',
}

function getDistinctId(): string {
  try {
    const existing = localStorage.getItem(DISTINCT_ID_KEY)
    if (existing) return existing
    const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DISTINCT_ID_KEY, created)
    return created
  } catch {
    return `ephemeral_${SESSION_ID}`
  }
}

const distinctId = getDistinctId()

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeError(error: unknown): { error_name?: string; error_message?: string } {
  if (!error || typeof error !== 'object') return {}
  const err = error as { name?: string; message?: string }
  return {
    error_name: err.name || 'Error',
    error_message: err.message ? err.message.slice(0, 200) : undefined,
  }
}

function posthogCapture(event: string, properties: Record<string, Primitive> = {}): void {
  if (!ENABLED) return

  const payload = {
    api_key: POSTHOG_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...superProperties,
      ...properties,
      timestamp: nowIso(),
      $lib: 'cowork-electron',
    },
  }

  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics should never impact UX
  })
}

function addSuperProperties(props: Record<string, Primitive>): void {
  Object.assign(superProperties, props)
}

function summarizeArg(arg: unknown): Primitive {
  if (arg == null) return null
  if (typeof arg === 'string') return `str:${arg.length}`
  if (typeof arg === 'number') return arg
  if (typeof arg === 'boolean') return arg
  if (Array.isArray(arg)) return `arr:${arg.length}`
  if (typeof arg === 'object') return `obj:${Object.keys(arg as Record<string, unknown>).length}`
  return typeof arg
}

function toSnake(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function captureMethodBusinessEvent(
  name: string,
  status: 'ok' | 'error',
  baseProps: Record<string, Primitive>,
  error?: unknown
): void {
  const snake = toSnake(name)
  posthogCapture(`action_${snake}_${status}`, baseProps)

  const alias = METHOD_ALIAS_EVENTS[name]
  const aliasEvent = status === 'ok' ? alias?.ok : alias?.error
  if (aliasEvent) {
    posthogCapture(aliasEvent, {
      ...baseProps,
      ...(status === 'error' ? sanitizeError(error) : {}),
    })
  }
}

function sessionEventToProps(event: SessionEvent): Record<string, Primitive> {
  const base: Record<string, Primitive> = {
    session_id: event.sessionId,
    event_type: event.type,
  }

  switch (event.type) {
    case 'text_delta':
      return { ...base, text_len: event.delta.length }
    case 'text_complete':
      return { ...base, text_len: event.text.length, is_intermediate: Boolean(event.isIntermediate) }
    case 'tool_start':
      return { ...base, tool_name: event.toolName, has_intent: Boolean(event.toolIntent) }
    case 'tool_result':
      return {
        ...base,
        tool_name: event.toolName,
        result_len: event.result.length,
        is_error: Boolean(event.isError),
      }
    case 'error':
      return { ...base, error_len: event.error.length }
    case 'typed_error':
      return { ...base, error_code: event.error.code || '' }
    case 'status':
      return { ...base, status_type: event.statusType || '' }
    case 'permission_mode_changed':
      return { ...base, permission_mode: event.permissionMode }
    case 'todo_state_changed':
      return { ...base, todo_state: event.todoState }
    case 'session_model_changed':
      return { ...base, model: event.model || '' }
    case 'connection_changed':
      return { ...base, connection_slug: event.connectionSlug || '' }
    case 'usage_update':
      return { ...base, input_tokens: event.tokenUsage.inputTokens }
    default:
      return base
  }
}

export async function initAnalytics(api: ElectronAPI): Promise<void> {
  if (!ENABLED) return

  // Browser/environment properties (available immediately)
  addSuperProperties({
    // Platform info
    platform: navigator.platform,
    user_agent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages?.join(',') || navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Screen info
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    screen_available_width: window.screen.availWidth,
    screen_available_height: window.screen.availHeight,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    device_pixel_ratio: window.devicePixelRatio,
    color_depth: window.screen.colorDepth,
    // Connection info (if available)
    online: navigator.onLine,
  })

  try {
    const [versions, appVersion, windowMode, isDebug, agentType, model, storedConfig] = await Promise.all([
      Promise.resolve(api.getVersions()),
      api.getAppVersion(),
      api.getWindowMode(),
      api.isDebugMode(),
      api.getAgentType?.(),
      api.getModel(),
      api.getStoredConfig?.(),
    ])

    addSuperProperties({
      // App version info
      app_version: appVersion.app,
      electron_version: versions.electron,
      node_version: versions.node,
      chrome_version: versions.chrome,
      // OS info
      os: appVersion.os,
      os_version: appVersion.osVersion,
      arch: appVersion.arch,
      // App state
      window_mode: windowMode || '',
      is_debug: Boolean(isDebug),
      agent_type: agentType || '',
      model: model || '',
      // Provider info (without sensitive data)
      provider: storedConfig?.provider || '',
    })
  } catch {
    // Ignore context enrichment failures
  }

  posthogCapture('app_opened')

  window.addEventListener('beforeunload', () => {
    posthogCapture('app_closed')
  })

  window.addEventListener('error', (event) => {
    posthogCapture('renderer_error', {
      message_len: event.message?.length || 0,
      file: event.filename || '',
      line: event.lineno || 0,
      col: event.colno || 0,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const err = sanitizeError(event.reason)
    posthogCapture('renderer_unhandled_rejection', err)
  })
}

export function instrumentElectronApi(api: ElectronAPI): ElectronAPI {
  if (!ENABLED) return api

  const wrapped: Record<string, unknown> = {}

  for (const [name, original] of Object.entries(api as unknown as Record<string, unknown>)) {
    if (typeof original !== 'function') {
      wrapped[name] = original
      continue
    }

    if (name.startsWith('on')) {
      wrapped[name] = (...args: unknown[]) => {
        const callback = args[0]

        if (typeof callback === 'function') {
          args[0] = (...callbackArgs: unknown[]) => {
            const firstArg = callbackArgs[0]
            if (name === 'onSessionEvent' && firstArg && typeof firstArg === 'object') {
              const eventProps = sessionEventToProps(firstArg as SessionEvent)
              posthogCapture(`session_event_${eventProps.event_type || 'unknown'}`, eventProps)
              const aliasEvent = SESSION_EVENT_ALIAS[(firstArg as SessionEvent).type]
              if (aliasEvent) {
                posthogCapture(aliasEvent, eventProps)
              }
            } else {
              posthogCapture('ipc_listener_event', {
                listener: name,
                arg0_type: typeof firstArg,
              })
            }
            return (callback as (...inner: unknown[]) => unknown)(...callbackArgs)
          }
        }

        posthogCapture('ipc_listener_subscribed', { listener: name })
        const unsubscribe = (original as (...inner: unknown[]) => unknown)(...args)

        if (typeof unsubscribe === 'function') {
          return () => {
            posthogCapture('ipc_listener_unsubscribed', { listener: name })
            return unsubscribe()
          }
        }

        return unsubscribe
      }
      continue
    }

    wrapped[name] = (...args: unknown[]) => {
      const startedAt = performance.now()
      const baseProps: Record<string, Primitive> = {
        method: name,
        arg_count: args.length,
      }

      if (args.length > 0) {
        baseProps.arg0 = summarizeArg(args[0])
      }

      try {
        const result = (original as (...inner: unknown[]) => unknown)(...args)
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>)
            .then((resolved) => {
              const props = {
                ...baseProps,
                status: 'ok',
                duration_ms: Math.round(performance.now() - startedAt),
              }
              posthogCapture('ipc_invoke', props)
              captureMethodBusinessEvent(name, 'ok', props)
              return resolved
            })
            .catch((error: unknown) => {
              const props = {
                ...baseProps,
                status: 'error',
                duration_ms: Math.round(performance.now() - startedAt),
                ...sanitizeError(error),
              }
              posthogCapture('ipc_invoke', props)
              captureMethodBusinessEvent(name, 'error', props, error)
              throw error
            })
        }

        const props = {
          ...baseProps,
          status: 'ok',
          duration_ms: Math.round(performance.now() - startedAt),
        }
        posthogCapture('ipc_invoke', props)
        captureMethodBusinessEvent(name, 'ok', props)
        return result
      } catch (error) {
        const props = {
          ...baseProps,
          status: 'error',
          duration_ms: Math.round(performance.now() - startedAt),
          ...sanitizeError(error),
        }
        posthogCapture('ipc_invoke', props)
        captureMethodBusinessEvent(name, 'error', props, error)
        throw error
      }
    }
  }

  return wrapped as ElectronAPI
}
