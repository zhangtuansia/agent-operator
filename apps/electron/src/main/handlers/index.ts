import { registerCoreRpcHandlers as registerServerCoreRpcHandlers } from '@agent-operator/server-core/handlers/rpc'
import type { RpcServer } from '../../transport/server'
import type { HandlerDeps } from './handler-deps'
import { registerBrowserHandlers } from './browser'
import { registerFileOpsHandlers } from './file-ops'
import { registerImHandlers } from './im'
import { registerPermissionsHandlers } from './permissions'
import { registerOpenTargetHandlers } from './open-targets'
import { registerSourceHandlers } from './sources'
import { registerSystemGuiHandlers } from './system'
import { registerUiPreferenceGuiHandlers } from './ui-preferences'
import { registerWorkspaceGuiHandlers } from './workspace-window'
import { registerSettingsGuiHandlers } from './settings'
import type { WindowManager } from '../window-manager'
import type { IMServiceManager } from '../im-services'

export { registerServerCoreRpcHandlers as registerCoreRpcHandlers }

interface ElectronLocalHandlerOptions {
  windowManager: WindowManager
  imServices?: IMServiceManager
  validateFilePath: (path: string) => Promise<string>
  applyFileOpsRateLimit: (channel: string) => void
  ensureGwsInstalled: () => Promise<import('../../shared/types').EnsureGwsInstalledResult>
}

// First transport-aligned GUI slice. Additional GUI-only handler domains can
// move here as the app exits the legacy ipc.ts registration path.
export function registerGuiRpcHandlers(server: RpcServer, deps: HandlerDeps): void {
  if (deps.browserPaneManager && deps.windowManager) {
    registerBrowserHandlers(server, {
      browserPaneManager: deps.browserPaneManager,
      windowManager: deps.windowManager,
    })
  }

  registerOpenTargetHandlers(server)
  registerSystemGuiHandlers(server)
  registerUiPreferenceGuiHandlers(server)
  registerSettingsGuiHandlers(server)

  if (deps.windowManager) {
    registerWorkspaceGuiHandlers(server, deps.windowManager)
  }
}

export function registerAllRpcHandlers(server: RpcServer, deps: HandlerDeps): void {
  registerServerCoreRpcHandlers(server, deps)
  registerGuiRpcHandlers(server, deps)
}

export function registerElectronLocalRpcHandlers(
  server: RpcServer,
  deps: HandlerDeps,
  options: ElectronLocalHandlerOptions,
): void {
  registerFileOpsHandlers(server, options.windowManager, {
    validateFilePath: options.validateFilePath,
    applyFileOpsRateLimit: options.applyFileOpsRateLimit,
  })
  if (options.imServices) {
    registerImHandlers(server, options.imServices)
  }
  registerSourceHandlers(server, {
    ensureGwsInstalled: options.ensureGwsInstalled,
  })
  registerPermissionsHandlers(server)
}
