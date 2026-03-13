import type { LoadedSource } from '../sources/types.ts'
import type { OAuthProvider } from './oauth-flow-types.ts'
import type { IOAuthFlowStore } from '@agent-operator/server-core/handlers'

const FLOW_TTL_MS = 5 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 1000

export interface PendingOAuthFlow {
  flowId: string
  state: string
  codeVerifier: string
  redirectUri: string
  source: LoadedSource
  clientId: string
  clientSecret?: string
  tokenEndpoint: string
  provider: OAuthProvider
  ownerClientId: string
  workspaceId: string
  sourceSlug: string
  sessionId?: string
  authRequestId?: string
  createdAt: number
  expiresAt: number
}

export class OAuthFlowStore implements IOAuthFlowStore {
  private flows = new Map<string, PendingOAuthFlow>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  store(flow: PendingOAuthFlow): void {
    this.flows.set(flow.state, flow)
  }

  getByState(state: string): PendingOAuthFlow | null {
    const flow = this.flows.get(state)
    if (!flow) return null
    if (Date.now() > flow.expiresAt) {
      this.flows.delete(state)
      return null
    }
    return flow
  }

  remove(state: string): void {
    this.flows.delete(state)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [state, flow] of this.flows) {
      if (now > flow.expiresAt) {
        this.flows.delete(state)
      }
    }
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.flows.clear()
  }

  get size(): number {
    return this.flows.size
  }
}

export function createPendingFlow(
  params: Omit<PendingOAuthFlow, 'createdAt' | 'expiresAt'>,
): PendingOAuthFlow {
  const now = Date.now()
  return {
    ...params,
    createdAt: now,
    expiresAt: now + FLOW_TTL_MS,
  }
}
