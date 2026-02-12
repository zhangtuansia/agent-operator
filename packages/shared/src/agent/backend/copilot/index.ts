/**
 * Copilot Agent Module
 *
 * Exports the CopilotAgent implementation that uses the @github/copilot-sdk.
 * Communicates with GitHub Copilot CLI via JSON-RPC over stdio.
 *
 * Note: The main CopilotAgent class is at ../copilot-agent.ts
 * for consistency with ClaudeAgent/CodexAgent. This index re-exports.
 */

export { CopilotAgent } from '../../copilot-agent.ts';
export { CopilotEventAdapter } from './event-adapter.ts';
