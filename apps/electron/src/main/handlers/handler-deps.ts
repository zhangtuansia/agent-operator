import type { PlatformServices } from '@agent-operator/server-core/runtime'
import type {
  ISessionManager,
  IOAuthFlowStore,
  HandlerDeps as CoreHandlerDeps,
} from '@agent-operator/server-core/handlers'
import type { BrowserPaneManager } from '../browser-pane-manager'
import type { WindowManager } from '../window-manager'

export type HandlerDeps = CoreHandlerDeps<
  ISessionManager,
  IOAuthFlowStore,
  WindowManager,
  BrowserPaneManager
> & {
  platform: PlatformServices
}
