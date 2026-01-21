# Craft Agents 项目架构文档

## 目录

1. [项目概述](#一项目概述)
2. [项目架构](#二项目架构)
3. [核心功能](#三核心功能)
4. [技术栈](#四技术栈)
5. [与 Claude 的交互机制](#五与-claude-的交互机制)
6. [消息发送与解析机制](#六消息发送与解析机制)
7. [权限管理系统](#七权限管理系统)
8. [数据存储](#八数据存储)
9. [性能优化](#九性能优化)
10. [产品定位与规划](#十产品定位与规划)

---

## 一、项目概述

**Craft Agents** 是一个开源的 Electron 桌面应用，旨在成为 Claude Code 的替代品，提供更美观的 UI 和更好的 Agent 工作流程体验。

| 属性 | 值 |
|------|------|
| 版本 | 0.2.21 |
| 许可证 | Apache 2.0 |
| 代码规模 | 427 个 TypeScript 文件，约 10 万行代码 |
| 运行时 | Bun |
| 桌面框架 | Electron 39 |

### 核心理念

Craft Agents **不是**调用 Claude Code CLI，而是直接使用 **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`）来实现类似 Claude Code 的功能，同时提供更好的用户界面和更灵活的权限控制。

```
┌─────────────────────────────────────────────────────────┐
│                    Craft Agents                         │
│  ┌─────────────┐    ┌───────────────────────────────┐  │
│  │  Electron   │    │  @anthropic-ai/claude-agent-sdk │  │
│  │  UI (React) │ ←→ │   (与 Claude Code 相同的 SDK)   │  │
│  └─────────────┘    └───────────────────────────────┘  │
│                              ↓                          │
│                    Claude API (Anthropic)               │
└─────────────────────────────────────────────────────────┘
```

---

## 二、项目架构

### 2.1 目录结构

```
craft-agents-oss/
├── apps/                          # 应用层
│   ├── electron/                  # 主桌面应用
│   │   ├── src/
│   │   │   ├── main/              # Electron 主进程（8个文件，~8000行）
│   │   │   ├── preload/           # 上下文隔离桥接
│   │   │   └── renderer/          # React UI 层
│   │   ├── resources/             # 应用资源（主题、权限配置）
│   │   └── vite.config.ts         # Vite 配置
│   └── viewer/                    # Web 查看器应用
│
├── packages/                      # 共享库（Monorepo）
│   ├── core/                      # 核心类型定义
│   │   ├── types/
│   │   │   ├── workspace.ts       # 工作区和配置类型
│   │   │   ├── session.ts         # 会话类型
│   │   │   └── message.ts         # 消息和事件类型
│   │   └── utils/                 # 工具函数
│   │
│   ├── shared/                    # 业务逻辑库（核心）
│   │   ├── src/
│   │   │   ├── agent/             # CraftAgent 实现、权限模式
│   │   │   ├── auth/              # OAuth、身份认证
│   │   │   ├── config/            # 存储、主题、偏好设置
│   │   │   ├── credentials/       # 加密凭证存储
│   │   │   ├── mcp/               # MCP 客户端集成
│   │   │   ├── sources/           # MCP、API、本地文件源
│   │   │   ├── sessions/          # 会话持久化
│   │   │   ├── statuses/          # 动态状态系统
│   │   │   ├── prompts/           # 系统提示词
│   │   │   └── utils/             # 工具函数和总结
│   │   └── resources/             # 配置模板
│   │
│   └── ui/                        # UI 组件库
│
└── scripts/                       # 构建和安装脚本
    ├── install-app.sh             # macOS/Linux 安装脚本
    ├── install-app.ps1            # Windows 安装脚本
    └── sync-version.ts            # 版本同步脚本
```

### 2.2 三层架构设计

```
┌─────────────────────────────────────────────────────────┐
│  Electron 层                                            │
│  - 桌面应用框架                                          │
│  - 窗口管理、IPC 通信、深链接                            │
│  - 文件: apps/electron/src/main/                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  React 层                                               │
│  - 响应式 UI                                            │
│  - Jotai 状态管理                                       │
│  - 文件: apps/electron/src/renderer/                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Business Logic 层                                      │
│  - @craft-agent/shared 包含所有核心业务逻辑              │
│  - CraftAgent、权限、会话、数据源                        │
│  - 文件: packages/shared/src/                           │
└─────────────────────────────────────────────────────────┘
```

### 2.3 主进程核心模块

| 文件 | 行数 | 功能 |
|------|------|------|
| `sessions.ts` | ~3000+ | 会话生命周期管理、Agent 运行 |
| `ipc.ts` | ~2400 | Electron IPC 事件处理 |
| `window-manager.ts` | ~500 | 窗口生命周期管理 |
| `auto-update.ts` | ~650 | 自动更新检查和安装 |
| `deep-link.ts` | ~350 | 深链接处理 |
| `notifications.ts` | ~300 | 系统通知 |

---

## 三、核心功能

### 3.1 多会话管理（Inbox 模式）

- 会话持久化到磁盘（JSONL 格式）
- 状态工作流：Todo → In Progress → Needs Review → Done
- 标记系统（Flag）用于快速访问
- 自动/手动命名会话

### 3.2 三级权限管理系统

| 模式 | 名称 | 说明 |
|------|------|------|
| `safe` | 浏览模式 (Explore) | 只读，阻止所有写操作 |
| `ask` | 问询模式 (Ask to Edit) | 危险操作需要用户确认（默认）|
| `allow-all` | 自动模式 (Auto) | 自动批准所有操作 |

**快捷键**：`SHIFT+TAB` 切换模式

### 3.3 数据源集成

- **MCP 服务器**：支持 Craft、Linear、GitHub、Notion 等
- **REST APIs**：Google、Slack、Microsoft OAuth 集成
- **本地文件**：文件系统和 Git 仓库
- **Gmail**：专门的邮件处理

### 3.4 高级特性

| 特性 | 说明 |
|------|------|
| 主题系统 | App 和 Workspace 级联主题，支持 6 色自定义 |
| 自定义技能 | Skills 扩展 Agent 能力 |
| 后台任务 | 长时间任务后台运行和进度跟踪 |
| 深链接 | `craftagents://` 协议支持外部调用 |
| 加密存储 | AES-256-GCM 加密所有凭证 |
| 自动总结 | 超过 60KB 的工具响应自动用 Haiku 总结 |
| 扩展思考 | 支持 Extended Thinking（off/think/max）|

---

## 四、技术栈

### 4.1 核心依赖

```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.2.12",  // 核心 Agent SDK
  "@anthropic-ai/sdk": ">=0.70.0",              // Claude API 客户端
  "@modelcontextprotocol/sdk": ">=1.0.0"        // MCP 协议支持
}
```

### 4.2 完整技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Bun | - |
| AI | Claude Agent SDK | 0.2.12 |
| 桌面框架 | Electron | 39.2.7 |
| 前端框架 | React | 18.3.1 |
| 类型系统 | TypeScript | 5.0.0 |
| 样式 | Tailwind CSS | 4.1.18 |
| 状态管理 | Jotai | 2.16.0 |
| 组件库 | shadcn/ui + Radix UI | - |
| 构建（主进程）| esbuild | - |
| 构建（渲染器）| Vite | - |
| 打包 | electron-builder | 26.0.12 |

### 4.3 开发命令

```bash
# 开发模式（热重载）
bun run electron:dev

# 生产构建
bun run electron:dist:mac      # macOS
bun run electron:dist:win      # Windows
bun run electron:dist:linux    # Linux

# 类型检查
bun run typecheck:all

# 代码检查
bun run lint:electron
```

---

## 五、与 Claude 的交互机制

### 5.1 核心类：CraftAgent

位于 `packages/shared/src/agent/craft-agent.ts`，是整个交互的核心：

```typescript
export class CraftAgent {
  // 主入口：chat() 方法是一个异步生成器
  async *chat(
    userMessage: string,
    attachments?: FileAttachment[]
  ): AsyncGenerator<AgentEvent> {

    // 1. 构建 SDK 配置
    const options: Options = {
      model: 'claude-opus-4-5-20251101',

      // 使用 Claude Code 的预设系统提示
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',  // ← 关键！使用 Claude Code 预设
        append: customPrompt,
      },

      // 使用 Claude Code 的工具集
      tools: {
        type: 'preset',
        preset: 'claude_code'  // ← 包含 Read, Write, Edit, Bash 等工具
      },

      // 自定义权限钩子
      hooks: {
        PreToolUse: [...],   // 权限检查
        PostToolUse: [...],  // 结果总结
      },

      // MCP 服务器配置
      mcpServers: {...},
    };

    // 2. 创建查询并获取事件流
    const query = agent.query(userMessage, options);

    // 3. 迭代 SDK 返回的事件
    for await (const message of query) {
      yield convertToAgentEvent(message);
    }
  }
}
```

### 5.2 与 Claude Code 的关键差异

| 特性 | Claude Code CLI | Craft Agents |
|------|-----------------|--------------|
| 界面 | 终端 CLI | Electron GUI |
| 权限系统 | SDK 内置 | 自定义三级权限 |
| 会话管理 | 单会话 | 多会话（Inbox） |
| 数据源 | 无 | MCP + OAuth APIs |
| 主题 | 无 | 自定义主题系统 |

### 5.3 SDK Options 配置

```typescript
const options: Options = {
  model,  // Claude 模型 (claude-opus-4-5 等)

  // 扩展思考配置
  maxThinkingTokens: getThinkingTokens(effectiveThinkingLevel, model),

  // 系统提示：使用 Claude Code 预设 + 自定义附加
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',
    append: getSystemPrompt(pinnedPreferencesPrompt, debugMode, workspaceRootPath),
  },

  // 工作目录
  cwd: sessionPath,

  // 使用 Claude Code 工具集
  tools: { type: 'preset', preset: 'claude_code' },

  // 绕过 SDK 内置权限系统，使用自定义 PreToolUse 钩子
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,

  // Beta 功能
  betas: ['advanced-tool-use-2025-11-20'],

  // 钩子配置
  hooks: {
    PreToolUse: [{...}],    // 权限检查
    PostToolUse: [{...}],   // 结果总结
    SubagentStart: [{...}], // 子代理跟踪
    SubagentStop: [{...}],  // 子代理跟踪
  },

  // MCP 服务器
  mcpServers,
};
```

### 5.4 工具系统

**Claude Code 预设工具**（通过 `preset: 'claude_code'` 获得）：
- **Read** - 读取文件
- **Write** - 写入文件
- **Edit** - 编辑文件
- **Bash** - 执行命令
- **Glob** - 文件搜索
- **Grep** - 内容搜索
- **Task** - 子任务
- 等等...

**自定义会话工具**（`packages/shared/src/agent/session-scoped-tools.ts`）：
- `SubmitPlan` - 计划提交
- `OAuthTrigger` - OAuth 触发
- `CredentialPrompt` - 凭证请求
- `ConfigValidate` - 配置验证
- `SkillValidate` - 技能验证
- `SourceTest` - 源测试

---

## 六、消息发送与解析机制

### 6.1 完整数据流

```
用户在 UI 输入消息
       ↓
┌──────────────────────────────────────┐
│  Electron 渲染器 (React)              │
│  handleSendMessage()                 │
│  window.electronAPI.sendMessage()    │
└──────────────────────────────────────┘
       ↓ IPC: SEND_MESSAGE
┌──────────────────────────────────────┐
│  Electron 主进程 (ipc.ts)             │
│  ipcMain.handle(SEND_MESSAGE)        │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  SessionManager.sendMessage()        │
│  1. 创建用户消息                      │
│  2. 发送 user_message 事件           │
│  3. 获取或创建 Agent                 │
│  4. 调用 agent.chat()                │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  CraftAgent.chat()                   │
│  1. 构建 SDK Options                 │
│  2. 调用 SDK query()                 │
│  3. 迭代事件流                        │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  Claude Agent SDK                    │
│  - 发送请求到 Claude API             │
│  - 流式返回响应                       │
│  - 处理工具调用                       │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  PreToolUse 钩子                     │
│  - 权限检查                          │
│  - 需要确认则暂停等待用户             │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  工具执行 (Read/Write/Bash/etc)      │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  PostToolUse 钩子                    │
│  - 大结果自动总结 (>60KB)            │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  processEvent() (sessions.ts)        │
│  - 转换 AgentEvent → SessionEvent   │
│  - sendEvent() 发送到 UI             │
└──────────────────────────────────────┘
       ↓ IPC: SESSION_EVENT
┌──────────────────────────────────────┐
│  渲染进程: onSessionEvent()          │
│  - processAgentEvent() 纯函数处理   │
│  - 更新 Jotai atom                   │
│  - React 组件重新渲染                │
└──────────────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  UI 实时更新                          │
│  - ChatDisplay 显示消息              │
│  - StreamingText 显示流式文本        │
│  - ToolDisplay 显示工具执行          │
└──────────────────────────────────────┘
```

### 6.2 AgentEvent 类型

```typescript
export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'info'; message: string }
  | { type: 'text_delta'; text: string; turnId?: string }
  | { type: 'text_complete'; text: string; isIntermediate?: boolean; turnId?: string }
  | { type: 'tool_start'; toolName: string; toolUseId: string; input: Record<string, unknown>;
      intent?: string; displayName?: string; turnId?: string; parentToolUseId?: string }
  | { type: 'tool_result'; toolUseId: string; result: string; isError: boolean;
      input?: Record<string, unknown>; turnId?: string; parentToolUseId?: string }
  | { type: 'permission_request'; requestId: string; toolName: string; command: string; description: string }
  | { type: 'error'; message: string }
  | { type: 'typed_error'; error: TypedError }
  | { type: 'complete'; usage?: AgentEventUsage }
  | { type: 'task_backgrounded'; toolUseId: string; taskId: string; intent?: string; turnId?: string }
  | { type: 'shell_backgrounded'; toolUseId: string; shellId: string; intent?: string; command?: string }
  | { type: 'source_activated'; sourceSlug: string; originalMessage: string }
  // ... 更多事件类型
```

### 6.3 SessionEvent 类型（IPC 事件）

```typescript
export type SessionEvent =
  // 流式文本事件
  | { type: 'text_delta'; sessionId: string; delta: string; turnId?: string }
  | { type: 'text_complete'; sessionId: string; text: string; isIntermediate?: boolean;
      turnId?: string; parentToolUseId?: string }

  // 工具执行事件
  | { type: 'tool_start'; sessionId: string; toolName: string; toolUseId: string;
      toolInput: Record<string, unknown>; toolIntent?: string; toolDisplayName?: string }
  | { type: 'tool_result'; sessionId: string; toolUseId: string; toolName: string;
      result: string; isError?: boolean }

  // 控制流事件
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'complete'; sessionId: string; tokenUsage?: TokenUsage }
  | { type: 'interrupted'; sessionId: string; message?: Message }

  // 权限和凭证事件
  | { type: 'permission_request'; sessionId: string; request: PermissionRequest }
  | { type: 'credential_request'; sessionId: string; request: CredentialRequest }
  | { type: 'auth_request'; sessionId: string; message: Message; request: AuthRequest }

  // 用户消息事件（乐观UI）
  | { type: 'user_message'; sessionId: string; message: Message;
      status: 'accepted' | 'queued' | 'processing' }

  // 后台任务事件
  | { type: 'task_backgrounded'; sessionId: string; toolUseId: string; taskId: string }
  | { type: 'shell_backgrounded'; sessionId: string; toolUseId: string; shellId: string }
  | { type: 'task_progress'; sessionId: string; toolUseId: string; elapsedSeconds: number }
```

### 6.4 事件处理示例

**sessions.ts 中的 processEvent 方法**：

```typescript
private processEvent(managed: ManagedSession, event: AgentEvent): void {
  switch (event.type) {
    case 'text_delta':
      // 累积流式文本，批量发送（每50ms）
      managed.streamingText += event.text
      this.queueDelta(sessionId, workspaceId, event.text, event.turnId)
      break

    case 'text_complete':
      // 刷新待发送的文本增量
      this.flushDelta(sessionId, workspaceId)

      // 创建完整的助手消息
      const assistantMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: event.text,
        timestamp: Date.now(),
        isIntermediate: event.isIntermediate,
        turnId: event.turnId
      }
      managed.messages.push(assistantMessage)

      this.sendEvent({ type: 'text_complete', sessionId, text: event.text }, workspaceId)
      break

    case 'tool_start':
      // 跟踪工具执行，处理父子关系
      managed.pendingTools.set(event.toolUseId, event.toolName)

      const toolStartMsg: Message = {
        id: generateMessageId(),
        role: 'tool',
        toolName: event.toolName,
        toolUseId: event.toolUseId,
        toolInput: event.input,
        toolIntent: event.intent
      }
      managed.messages.push(toolStartMsg)

      this.sendEvent({ type: 'tool_start', sessionId, ...event }, workspaceId)
      break

    case 'tool_result':
      const toolResultMsg: Message = {
        id: generateMessageId(),
        role: 'tool',
        toolUseId: event.toolUseId,
        toolResult: event.result,
        isToolError: event.isError
      }
      managed.messages.push(toolResultMsg)

      this.sendEvent({ type: 'tool_result', sessionId, ...event }, workspaceId)
      break

    case 'complete':
      managed.tokenUsage = {
        inputTokens: event.usage?.inputTokens ?? 0,
        outputTokens: event.usage?.outputTokens ?? 0,
        totalTokens: (event.usage?.inputTokens ?? 0) + (event.usage?.outputTokens ?? 0)
      }

      this.sendEvent({ type: 'complete', sessionId, tokenUsage: managed.tokenUsage }, workspaceId)
      break
  }
}
```

### 6.5 渲染器事件处理

**App.tsx 中的 onSessionEvent**：

```typescript
const cleanup = window.electronAPI.onSessionEvent((event: SessionEvent) => {
  const sessionId = event.sessionId

  // 获取当前会话状态
  const currentSession = store.get(sessionAtomFamily(sessionId))

  // 处理事件（纯函数）
  const { session: updatedSession, effects } = processAgentEvent(
    event,
    currentSession,
    workspaceId
  )

  // 直接更新 Jotai atom（UI 立即看到更新）
  updateSessionDirect(sessionId, () => updatedSession)

  // 处理副作用
  handleEffects(effects, sessionId, event.type)
})
```

---

## 七、权限管理系统

### 7.1 PreToolUse 钩子

```typescript
PreToolUse: [{
  hooks: [async (input) => {
    const { tool_name, tool_input } = input
    const mode = getPermissionMode(sessionId)

    // Safe 模式：只允许读操作
    if (mode === 'safe') {
      if (tool_name === 'Write' || tool_name === 'Edit') {
        return {
          continue: false,
          decision: 'block',
          reason: 'Write operations blocked in safe mode',
        }
      }
    }

    // Ask 模式：危险操作需要用户确认
    if (mode === 'ask') {
      if (isDangerousOperation(tool_name, tool_input)) {
        const approved = await requestUserPermission({
          toolName: tool_name,
          input: tool_input,
        })

        if (!approved) {
          return { continue: false, decision: 'block' }
        }
      }
    }

    // Allow-all 模式：允许执行（除非明确阻止）
    return { continue: true }
  }],
}],
```

### 7.2 PostToolUse 钩子（大结果总结）

```typescript
PostToolUse: [{
  hooks: [async (input) => {
    const { tool_response } = input
    const tokens = estimateTokens(tool_response)

    if (tokens > 8000) {
      // 使用 Claude Haiku 总结大结果
      const summary = await summarizeLargeResult(tool_response, {
        toolName: input.tool_name,
        input: input.tool_input,
      })

      return {
        continue: true,
        hookSpecificOutput: {
          updatedMCPToolOutput: summary,
        },
      }
    }

    return { continue: true }
  }],
}],
```

### 7.3 权限配置文件

三个层级（从特定到通用）：

1. **源级权限**：`~/.craft-agent/workspaces/{id}/sources/{slug}/permissions.json`
2. **工作区级权限**：`~/.craft-agent/workspaces/{id}/permissions.json`
3. **应用级权限**：`~/.craft-agent/permissions/default.json`

**示例配置**：
```json
{
  "blockedTools": ["DeleteFile"],
  "allowedBashPatterns": ["^ls ", "^cat ", "^grep "],
  "allowedMcpPatterns": ["read_file", "list_directory"],
  "allowedApiEndpoints": [
    { "method": "GET", "pathPattern": "/api/.*" },
    { "method": "POST", "pathPattern": "/api/safe" }
  ],
  "allowedWritePaths": [
    "~/Documents/**",
    "/tmp/**"
  ]
}
```

---

## 八、数据存储

### 8.1 存储结构

```
~/.craft-agent/
├── config.json              # 主配置（工作区、认证类型）
├── credentials.enc          # AES-256-GCM 加密凭证
├── preferences.json         # 用户偏好设置
├── theme.json               # 应用级主题
└── workspaces/{id}/
    ├── config.json          # 工作区设置
    ├── theme.json           # 工作区主题覆盖
    ├── permissions.json     # 工作区权限规则
    ├── sessions/            # 会话数据（JSONL 格式）
    ├── sources/             # 已连接的源
    ├── skills/              # 自定义技能
    └── statuses/            # 状态配置
```

### 8.2 会话持久化

- **格式**：JSONL（每行一个 JSON）
- **写入策略**：500ms 防抖队列
- **恢复机制**：SDK 会话 ID 用于恢复

```typescript
// 会话消息结构
interface StoredMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'error' | 'plan' | 'auth-request'
  content: string
  timestamp: number

  // 工具特定字段
  toolName?: string
  toolUseId?: string
  toolInput?: Record<string, unknown>
  toolResult?: string | Record<string, unknown>
  toolStatus?: 'pending' | 'success' | 'error'
  toolDuration?: number
  toolIntent?: string
  parentToolUseId?: string

  // 错误字段
  isError?: boolean
  errorCode?: string
  errorTitle?: string
  errorDetails?: string
}
```

### 8.3 凭证安全

- **加密算法**：AES-256-GCM (authenticated encryption)
- **存储位置**：`~/.craft-agent/credentials.enc`
- **访问方式**：CredentialManager 提供统一 API
- **子进程隔离**：自动过滤敏感环境变量

---

## 九、性能优化

### 9.1 文本增量批处理

```typescript
// 问题：每秒 50+ text_delta 事件 → IPC 过载
// 解决：累积文本并每 50ms 发送一次批处理

const DELTA_BATCH_INTERVAL_MS = 50

private queueDelta(sessionId, workspaceId, delta, turnId) {
  existing.delta += delta  // 累积
  if (!timer) {
    timer = setTimeout(() => {
      sendEvent({
        type: 'text_delta',
        delta: accumulated,  // 批处理增量
        turnId
      })
    }, DELTA_BATCH_INTERVAL_MS)
  }
}

// 结果：IPC 事件从 50+/秒 减少到 ~20/秒
```

### 9.2 会话消息懒加载

```typescript
// 会话列表不包含消息（只元数据）
getSessions(): Session[] {
  return sessions.map(m => ({
    id: m.id,
    lastMessageAt: m.lastMessageAt,
    // messages: [] 省略
  }))
}

// 选定会话时才加载消息
async getSession(sessionId: string): Promise<Session> {
  await this.ensureMessagesLoaded(m)
  return { ...m, messages: m.messages }
}
```

### 9.3 乐观 UI 更新

```typescript
// 用户消息立即显示
this.sendEvent({
  type: 'user_message',
  message: userMessage,
  status: 'accepted'
}, workspaceId)

// 然后异步处理，通过完整事件流更新
```

---

## 十、产品定位与规划

### 10.1 产品愿景

打造一个比 Claude Code CLI 更易用、更美观、更强大的 Agent 工作平台。

### 10.2 核心差异化

| 特性 | 说明 |
|------|------|
| Agent-Native 设计 | 专为 Agent 工作流设计，不仅仅是代码编辑器 |
| 多权限模式 | 灵活控制 Agent 的操作权限 |
| 多数据源 | 统一接入各种工具和服务（MCP、OAuth） |
| 会话管理 | 类似邮箱的多会话管理体验 |
| 工作区隔离 | 不同项目可以有独立的配置和权限 |
| 主题系统 | 完全可自定义的外观 |

### 10.3 目标用户

- 开发者和技术人员
- 需要与 Claude 进行复杂交互的用户
- 希望管理多个 Agent 会话的用户
- 需要精细控制 AI 权限的企业用户

### 10.4 平台支持

- macOS（DMG）
- Windows（EXE）
- Linux（AppImage）

---

## 附录：关键文件路径

| 模块 | 路径 |
|------|------|
| 主进程入口 | `apps/electron/src/main/index.ts` |
| IPC 处理 | `apps/electron/src/main/ipc.ts` |
| 会话管理 | `apps/electron/src/main/sessions.ts` |
| CraftAgent | `packages/shared/src/agent/craft-agent.ts` |
| 权限模式 | `packages/shared/src/agent/mode-manager.ts` |
| 会话工具 | `packages/shared/src/agent/session-scoped-tools.ts` |
| 渲染器入口 | `apps/electron/src/renderer/main.tsx` |
| App 组件 | `apps/electron/src/renderer/App.tsx` |
| 事件处理器 | `apps/electron/src/renderer/event-processor/` |
| 类型定义 | `packages/core/src/types/` |
| 共享类型 | `apps/electron/src/shared/types.ts` |
