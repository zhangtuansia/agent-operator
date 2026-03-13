import type { PlatformServices } from '@agent-operator/server-core/runtime/platform'
import type {
  ISessionManager,
  IBrowserPaneManager,
  IOAuthFlowStore,
  IWindowManager,
  HandlerDeps as CoreHandlerDeps,
} from '@agent-operator/server-core/handlers'

export type HandlerDeps = CoreHandlerDeps<
  ISessionManager,
  IOAuthFlowStore,
  IWindowManager,
  IBrowserPaneManager
> & {
  platform: PlatformServices
}
