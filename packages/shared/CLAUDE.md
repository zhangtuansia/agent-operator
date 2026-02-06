# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this package.

**Important:** Keep this file and the root `CLAUDE.md` up-to-date whenever functionality changes.

## Overview

`@agent-operator/shared` is the core business logic package for Cowork. It contains:
- Agent implementation (OperatorAgent, session-scoped tools, permission modes)
- Authentication (OAuth, credentials, auth state)
- Configuration (storage, preferences, themes, watcher)
- MCP client and validation
- Headless execution mode
- Dynamic status system
- Session persistence

## Package Exports

This package uses subpath exports for clean imports:

```typescript
import { OperatorAgent, getPermissionMode, setPermissionMode } from '@agent-operator/shared/agent';
import { loadStoredConfig, type Workspace } from '@agent-operator/shared/config';
import { getCredentialManager } from '@agent-operator/shared/credentials';
import { OperatorMcpClient } from '@agent-operator/shared/mcp';
import { loadWorkspaceSources, type LoadedSource } from '@agent-operator/shared/sources';
import { loadStatusConfig, createStatus } from '@agent-operator/shared/statuses';
import { resolveTheme } from '@agent-operator/shared/config/theme';
import { debug } from '@agent-operator/shared/utils';

// IPC types and schemas (new)
import { IPC_CHANNELS, type Session, type SessionEvent } from '@agent-operator/shared/ipc';
import { SessionIdSchema } from '@agent-operator/shared/ipc/schemas';

// Routing utilities (new)
import { parseRouteToNavigationState, buildRouteFromNavigationState } from '@agent-operator/shared/routing';

// Promise utilities (new)
import { withTimeout, withRetry, sleep } from '@agent-operator/shared/utils/promises';
```

## Directory Structure

```
src/
├── agent/              # OperatorAgent, session-scoped-tools, mode-manager, mode-types, permissions-config
├── auth/               # OAuth, token management, state
├── config/             # Storage, preferences, models, theme, watcher
├── credentials/        # Secure credential storage (AES-256-GCM)
├── headless/           # Non-interactive execution mode
├── ipc/                # IPC types, schemas (Zod), channel constants
├── mcp/                # MCP client and connection validation
├── prompts/            # System prompt generation
├── routing/            # Route parsing and building for navigation
├── sessions/           # Session index, storage, persistence-queue
├── sources/            # Source types, storage, service
├── statuses/           # Dynamic status types, CRUD, storage
├── subscription/       # Subscription checking
├── utils/              # Debug logging, file handling, promises, summarization
├── validation/         # URL validation
├── version/            # Version management, install scripts
├── workspaces/         # Workspace storage
├── branding.ts         # Branding constants
└── network-interceptor.ts    # Fetch interceptor for API errors and MCP schema injection
```

## Key Concepts

### OperatorAgent (`src/agent/agent-operator.ts`)
The main agent class that wraps the Claude Agent SDK. Handles:
- MCP server connections
- Tool permissions via PreToolUse hook
- Large result summarization via PostToolUse hook
- Permission mode integration (safe/ask/allow-all)
- Session continuity

### Permission Modes (`src/agent/mode-manager.ts`, `mode-types.ts`)
Three-level permission system per session:

| Mode | Display Name | Behavior |
|------|--------------|----------|
| `'safe'` | Explore | Read-only, blocks write operations |
| `'ask'` | Ask to Edit | Prompts for bash commands (default) |
| `'allow-all'` | Auto | Auto-approves all commands |

- **Per-session state:** No global contamination between sessions
- **Keyboard shortcut:** SHIFT+TAB cycles through modes
- **UI config:** `PERMISSION_MODE_CONFIG` provides display names, colors, SVG icons

### Permissions Configuration (`src/agent/permissions-config.ts`)
Customizable safety rules at two levels (additive merging):
- Workspace: `~/.cowork/workspaces/{id}/permissions.json`
- Source: `~/.cowork/workspaces/{id}/sources/{slug}/permissions.json`

**Rule types:**
- `blockedTools` - Tools to block (extends defaults)
- `allowedBashPatterns` - Regex for read-only bash commands
- `allowedMcpPatterns` - Regex for allowed MCP tools
- `allowedApiEndpoints` - Fine-grained API rules `{ method, pathPattern }`
- `allowedWritePaths` - Glob patterns for writable directories

### Session-Scoped Tools (`src/agent/session-scoped-tools.ts`)
Tools available within agent sessions with callback registry:

**Source management:** `source_test`, `source_oauth_trigger`, `source_google_oauth_trigger`, `source_credential_prompt`

**Utilities:** `SubmitPlan`, `config_validate`

**Callbacks:** `onPlanSubmitted`, `onOAuthBrowserOpen`, `onOAuthSuccess`, `onOAuthError`, `onCredentialRequest`, `onSourcesChanged`, `onSourceActivated`

### Dynamic Status System (`src/statuses/`)
Workspace-level customizable workflow states:

**Storage:** `~/.cowork/workspaces/{id}/statuses/config.json`

**Status properties:** `id`, `label`, `color`, `icon`, `shortcut`, `category` (open/closed), `isFixed`, `isDefault`, `order`

**Default statuses:** Todo, In Progress, Needs Review, Done, Cancelled

**CRUD:** `createStatus()`, `updateStatus()`, `deleteStatus()`, `reorderStatuses()`

### Theme System (`src/config/theme.ts`)
Cascading theme configuration: app → workspace (last wins)

**Storage:**
- App: `~/.cowork/theme.json`
- Workspace: `~/.cowork/workspaces/{id}/theme.json`

**6-color system:** `background`, `foreground`, `accent`, `info`, `success`, `destructive`

**Functions:** `resolveTheme()`, `themeToCSS()`, dark mode support via `dark: { ... }` overrides

### Session Persistence (`src/sessions/`)
- **persistence-queue.ts:** Debounced async session writes (500ms)
- **storage.ts:** Session CRUD, portable path format
- **index.ts:** Session listing and metadata

### Credentials (`src/credentials/`)
All sensitive credentials (API keys, OAuth tokens) are stored in an AES-256-GCM encrypted file at `~/.cowork/credentials.enc`. The `CredentialManager` provides the API for reading and writing credentials.

### Configuration (`src/config/storage.ts`)
Multi-workspace configuration stored in `~/.cowork/config.json`. Supports:
- Multiple workspaces with separate MCP servers and sessions
- Default permission mode for new sessions
- Extended cache TTL preference
- Token display mode

### Config Watcher (`src/config/watcher.ts`)
File watcher for live config updates:
- Watches `config.json`, `theme.json`, `permissions.json` at all levels
- Callbacks: `onConfigChange`, `onThemeChange`, `onWorkspacePermissionsChange`, `onSourcePermissionsChange`

### Sources (`src/sources/`)
Sources are external data connections (MCP servers, APIs, local filesystems). Stored at `~/.cowork/workspaces/{id}/sources/{slug}/` with config.json and guide.md. Types: `mcp`, `api`, `local`, `gmail`.

### IPC Module (`src/ipc/`)
Centralized IPC (Inter-Process Communication) types and validation for Electron apps:

**Files:**
- `schemas.ts` - Zod validation schemas for IPC messages
- `types.ts` - TypeScript types for sessions, events, navigation state
- `channels.ts` - IPC channel name constants
- `index.ts` - Re-exports

**Key types:**
- `Session`, `SessionEvent`, `SessionCommand` - Session management
- `NavigationState`, `ChatFilter`, `RightSidebarPanel` - UI navigation
- `FileAttachment`, `CredentialResponse` - IPC payloads

**Usage:**
```typescript
import { IPC_CHANNELS, type Session, type SessionEvent } from '@agent-operator/shared/ipc';
import { SessionIdSchema, SendMessageArgsSchema } from '@agent-operator/shared/ipc/schemas';
```

### Routing Module (`src/routing/`)
Route parsing and building for deep links and navigation:

**Functions:**
- `parseRoute()` - Parse action/view routes
- `parseCompoundRoute()` - Parse compound routes (allChats/chat/abc123)
- `parseRouteToNavigationState()` - Parse directly to NavigationState
- `buildRouteFromNavigationState()` - Build route string from state
- `buildUrlWithState()` - Build full URL with query params

**Usage:**
```typescript
import { parseRouteToNavigationState, buildRouteFromNavigationState } from '@agent-operator/shared/routing';
```

### Promise Utilities (`src/utils/promises.ts`)
Common async patterns:

- `withTimeout()` - Add timeout to promises
- `withRetry()` - Retry with exponential backoff
- `sleep()` - Simple delay
- `createDeferred()` - Externally resolvable promise
- `withConcurrency()` - Limit concurrent operations
- `raceWithFallback()` - Race with fallback value

## Dependencies

- `@agent-operator/core` - Shared types
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK

## Type Checking

```bash
# From monorepo root
cd packages/shared && bun run tsc --noEmit
```
