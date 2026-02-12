/**
 * Codex Agent Module
 *
 * Exports the CodexAgent implementation that uses the Codex app-server protocol.
 * Communicates via JSON-RPC over stdio with `codex app-server`.
 *
 * Note: The main CodexAgent class has been moved to ../codex-agent.ts
 * for consistency with ClaudeAgent. This index re-exports for backward compatibility.
 */

// Re-export CodexAgent from its new location
export { CodexAgent } from '../../codex-agent.ts';
export { EventAdapter } from './event-adapter.ts';
