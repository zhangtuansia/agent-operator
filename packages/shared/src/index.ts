/**
 * @agent-operator/shared
 *
 * Shared business logic for Craft Agent.
 * Used by the Electron app.
 *
 * Import specific modules via subpath exports:
 *   import { CraftAgent } from '@agent-operator/shared/agent';
 *   import { loadStoredConfig } from '@agent-operator/shared/config';
 *   import { getCredentialManager } from '@agent-operator/shared/credentials';
 *   import { CraftMcpClient } from '@agent-operator/shared/mcp';
 *   import { debug } from '@agent-operator/shared/utils';
 *   import { loadSource, createSource, getSourceCredentialManager } from '@agent-operator/shared/sources';
 *   import { createWorkspace, loadWorkspace } from '@agent-operator/shared/workspaces';
 *
 * Available modules:
 *   - agent: CraftAgent SDK wrapper, plan tools
 *   - auth: OAuth, token management, auth state
 *   - clients: Craft API client
 *   - config: Storage, models, preferences
 *   - credentials: Encrypted credential storage
 *   - headless: Non-interactive execution mode
 *   - mcp: MCP client, connection validation
 *   - prompts: System prompt generation
 *   - sources: Workspace-scoped source management (MCP, API, local)
 *   - utils: Debug logging, file handling, summarization
 *   - validation: URL validation
 *   - version: Version and installation management
 *   - workspaces: Workspace management (top-level organizational unit)
 */

// Export branding (standalone, no dependencies)
export * from './branding.ts';
