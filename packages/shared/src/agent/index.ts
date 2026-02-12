export * from './operator-agent.ts';
export { ClaudeAgent, type ClaudeAgentConfig } from './claude-agent.ts';
export { CodexAgent } from './codex-agent.ts';
export { CopilotAgent, CopilotBackend, resolveCopilotModelId } from './copilot-agent.ts';
export * from './errors.ts';
export * from './options.ts';

// Export session-scoped-tools - tools scoped to a specific session
export {
  // Tool factories (creates session-scoped tools)
  createSubmitPlanTool,
  // Session-scoped tools provider
  getSessionScopedTools,
  cleanupSessionScopedTools,
  // Plan file management
  getSessionPlansDir,
  getLastPlanFilePath,
  clearPlanFileState,
  isPathInPlansDir,
  // Callback registry for session-scoped tool notifications
  registerSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
  // Types
  type SessionScopedToolCallbacks,
  // Auth request types (unified auth flow)
  type AuthRequest,
  type AuthRequestType,
  type AuthResult,
  type CredentialAuthRequest,
  type McpOAuthAuthRequest,
  type GoogleOAuthAuthRequest,
  type SlackOAuthAuthRequest,
  type MicrosoftOAuthAuthRequest,
  type CredentialInputMode,
} from './session-scoped-tools.ts';

// Export mode-manager - Centralized mode management
export {
  // Permission Mode API (primary)
  getPermissionMode,
  setPermissionMode,
  cyclePermissionMode,
  subscribeModeChanges,
  PERMISSION_MODE_ORDER,
  PERMISSION_MODE_CONFIG,
  type PermissionMode,
  getModeState,
  initializeModeState,
  cleanupModeState,
  // Tool blocking (centralized)
  shouldAllowToolInMode,
  blockWithReason,
  // Session state (lightweight per-message injection)
  getSessionState,
  formatSessionState,
  // Mode manager singleton (for advanced use cases)
  modeManager,
  // Default Explore mode patterns (for UI display)
  SAFE_MODE_CONFIG,
  // Types
  type ModeState,
  type ModeCallbacks,
  type ModeConfig,
} from './mode-manager.ts';

// Export plan types and permission mode messages
export type { Plan, PlanStep, PlanState, PlanReviewRequest, PlanReviewResult } from './plan-types.ts';
export { PERMISSION_MODE_MESSAGES, PERMISSION_MODE_PROMPTS } from './plan-types.ts';

// Export thinking-levels - extended reasoning configuration
export {
  type ThinkingLevel,
  type ThinkingLevelDefinition,
  THINKING_LEVELS,
  DEFAULT_THINKING_LEVEL,
  getThinkingTokens,
  getThinkingLevelName,
  isValidThinkingLevel,
} from './thinking-levels.ts';

// Export permissions-config - customizable permissions per workspace/source (permissions.json)
export {
  // Parser and validation
  parsePermissionsJson,
  validatePermissionsConfig,
  PermissionsConfigSchema,
  // API endpoint checking
  isApiEndpointAllowed,
  // Storage functions
  loadWorkspacePermissionsConfig,
  loadSourcePermissionsConfig,
  getWorkspacePermissionsPath,
  getSourcePermissionsPath,
  // App-level default permissions (at ~/.cowork/permissions/)
  getAppPermissionsDir,
  ensureDefaultPermissions,
  loadDefaultPermissions,
  // Cache singleton
  permissionsConfigCache,
  // Types
  type ApiEndpointRule,
  type CompiledApiEndpointRule,
  type PermissionsCustomConfig,
  type PermissionsConfigFile,
  type MergedPermissionsConfig,
  type PermissionsContext,
} from './permissions-config.ts';

// Export BaseAgent - shared abstract class for all agent backends
export {
  BaseAgent,
  // Mini agent configuration (centralized for all backends)
  type MiniAgentConfig,
  MINI_AGENT_TOOLS,
  MINI_AGENT_MCP_KEYS,
} from './base-agent.ts';

// Export backend abstraction - unified interface for AI agents
// This module enables switching between Claude (Anthropic) and Codex (OpenAI) agents
export {
  // Factory (createAgent is the preferred name, createBackend is kept for backward compat)
  createBackend,
  createAgent,
  detectProvider,
  getAvailableProviders,
  // Types
  type AgentBackend,
  type AgentProvider,
  type BackendConfig,
  type PermissionCallback,
  type PlanCallback,
  type AuthCallback,
  type SourceChangeCallback,
  type SourceActivationCallback,
  type ChatOptions,
  type RecoveryMessage,
  type SdkMcpServerConfig as BackendMcpServerConfig,
  // Enums
  AbortReason as BackendAbortReason,
} from './backend/index.ts';

// Export core utilities for shared agent logic
// Note: selective re-export to avoid AbortReason/PERMISSION_MODE_ORDER/PERMISSION_MODE_CONFIG conflicts with operator-agent.ts
export type {
  RecoveryMessage as CoreRecoveryMessage,
  PermissionManagerConfig,
  ToolPermissionResult,
  SourceManagerConfig,
  PromptBuilderConfig,
  ContextBlockOptions,
  PathProcessorConfig,
  ConfigValidatorConfig,
  ConfigValidationResult,
  ConfigFileType,
  MismatchAnalysis,
  PermissionPaths,
  ToolCheckResult,
  ConfigWatcherManagerCallbacks,
  ConfigWatcherManagerConfig,
  SessionState,
  SessionLifecycleConfig,
  PlanningAnalysis,
  PlanningAdvisorConfig,
  MessageUsage,
  SessionUsage,
  UsageUpdate,
  UsageTrackerConfig,
  PreToolUseContext,
  PathExpansionResult,
  SkillQualificationResult,
  MetadataStrippingResult,
  PreToolUseConfigValidationResult,
} from './core/index.ts';
export {
  PermissionManager,
  SourceManager,
  PromptBuilder,
  PathProcessor,
  expandPath,
  normalizePath,
  pathStartsWith,
  toPortablePath,
  ConfigValidator,
  ConfigWatcherManager,
  createConfigWatcherManager,
  SessionLifecycleManager,
  createSessionLifecycleManager,
  PlanningAdvisor,
  createPlanningAdvisor,
  shouldSuggestPlanning,
  UsageTracker,
  createUsageTracker,
  BUILT_IN_TOOLS,
  FILE_PATH_TOOLS,
  CONFIG_WRITE_TOOLS,
  expandToolPaths,
  qualifySkillName,
  stripToolMetadata,
  stripMcpMetadata,
  validateConfigWrite,
  SAFE_MODE_CONFIG as CORE_SAFE_MODE_CONFIG,
} from './core/index.ts';

// Export PowerShell validator root setter (for Electron startup on Windows)
export { setPowerShellValidatorRoot } from './powershell-validator.ts';
