# 搭子（Dazi）

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Website](https://img.shields.io/badge/Website-aicowork.chat-brightgreen)](https://www.aicowork.chat)

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

Dazi is a powerful desktop application for working effectively with AI agents. It enables intuitive multitasking, seamless connection to any API or Service, session sharing, and a more document-centric workflow - in a beautiful and fluid UI.

Built on top of Claude Agent SDK, Dazi brings the power of Claude to a native desktop experience with advanced features like multi-session management, permission controls, and extensible source connections.

**Key Highlights:**
- 🖥️ Native desktop app with beautiful UI
- 🔄 Multi-session inbox with status workflow
- 🔌 Connect to MCP servers, REST APIs, and local files
- 🛡️ Three-level permission system (Explore / Ask / Auto)
- 🎨 Customizable themes and workspaces
- 📦 Skills system for specialized agent instructions

Dazi is open source under the Apache 2.0 license. Visit [aicowork.chat](https://www.aicowork.chat) for more information.

<img width="1372" height="870" alt="Dazi Screenshot" src="assets/screenshot.webp" />

### Installation

#### Download

Visit [aicowork.chat](https://www.aicowork.chat) to download the latest version for your platform.

#### Build from Source

```bash
git clone https://github.com/zhangtuansia/agent-operator.git
cd agent-operator
bun install
bun run electron:start
```

### Features

- **Multi-Session Inbox**: Desktop app with session management, status workflow, and flagging
- **Streaming Responses**: Real-time tool visualization and progress updates
- **Sources**: Connect to MCP servers, REST APIs (Google, Slack, Microsoft), and local filesystems
- **Permission Modes**: Three-level system (Explore, Ask to Edit, Auto) with customizable rules
- **Background Tasks**: Run long-running operations with progress tracking
- **Dynamic Status System**: Customizable session workflow states (Todo, In Progress, Done, etc.)
- **Theme System**: Cascading themes at app and workspace levels
- **Multi-File Diff**: VS Code-style window for viewing all file changes in a turn
- **Skills**: Specialized agent instructions stored per-workspace ([Skills Market](https://www.aicowork.chat/skills))
- **File Attachments**: Drag-drop images, PDFs, Office documents with auto-conversion
- **i18n Support**: English and Chinese language support

### Quick Start

1. **Launch the app** after installation
2. **Choose billing**: Use your own Anthropic API key or Claude Max subscription
3. **Create a workspace**: Set up a workspace to organize your sessions
4. **Connect sources** (optional): Add MCP servers, REST APIs, or local filesystems
5. **Start chatting**: Create sessions and interact with Claude

### Desktop App Features

#### Session Management

- **Inbox/Archive**: Sessions organized by workflow status
- **Flagging**: Mark important sessions for quick access
- **Status Workflow**: Todo → In Progress → Needs Review → Done
- **Session Naming**: AI-generated titles or manual naming
- **Session Persistence**: Full conversation history saved to disk

#### Sources

Connect external data sources to your workspace:

| Type | Examples |
|------|----------|
| **MCP Servers** | Linear, GitHub, Notion, and any custom MCP servers |
| **REST APIs** | Google (Gmail, Calendar, Drive), Slack, Microsoft |
| **Local Files** | Filesystem, Obsidian vaults, Git repos |

#### Permission Modes

| Mode | Display | Behavior |
|------|---------|----------|
| `safe` | Explore | Read-only, blocks all write operations |
| `ask` | Ask to Edit | Prompts for approval (default) |
| `allow-all` | Auto | Auto-approves all commands |

Use **SHIFT+TAB** to cycle through modes in the chat interface.

#### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New chat |
| `Cmd+1/2/3` | Focus sidebar/list/chat |
| `Cmd+,` | Open settings |
| `Cmd+B` | Toggle sidebar |
| `SHIFT+TAB` | Cycle permission modes |
| `Cmd+Enter` | Send message |
| `Enter` | New line |
| `Esc` | Interrupt agent |

---

<a id="中文"></a>

## 中文

搭子是一款功能强大的桌面应用，帮助你高效地与 AI 智能体协作。它支持直觉化的多任务处理、无缝连接各类 API 和服务、会话共享，以及更以文档为中心的工作流 — 一切都在精美流畅的界面中完成。

基于 Claude Agent SDK 构建，搭子将 Claude 的强大能力带到原生桌面体验中，提供多会话管理、权限控制和可扩展的数据源连接等高级功能。

**核心亮点：**
- 🖥️ 精美 UI 的原生桌面应用
- 🔄 多会话收件箱 + 状态工作流
- 🔌 连接 MCP 服务器、REST API 和本地文件
- 🛡️ 三级权限系统（浏览 / 询问 / 自动）
- 🎨 可自定义主题和工作区
- 📦 技能系统，提供专业化的智能体指令

搭子基于 Apache 2.0 协议开源。访问 [aicowork.chat](https://www.aicowork.chat) 了解更多。

### 安装

#### 下载

访问 [aicowork.chat](https://www.aicowork.chat) 下载适用于你平台的最新版本。

#### 从源码构建

```bash
git clone https://github.com/zhangtuansia/agent-operator.git
cd agent-operator
bun install
bun run electron:start
```

### 功能特性

- **多会话收件箱**：桌面应用，支持会话管理、状态工作流和标记
- **流式响应**：实时工具可视化和进度更新
- **数据源**：连接 MCP 服务器、REST API（Google、Slack、Microsoft）和本地文件系统
- **权限模式**：三级权限系统（浏览、询问编辑、自动），支持自定义规则
- **后台任务**：运行长时间操作并跟踪进度
- **动态状态系统**：可自定义的会话工作流状态（待办、进行中、待审核、已完成等）
- **主题系统**：支持应用级和工作区级的级联主题
- **多文件差异**：VS Code 风格的窗口，查看一轮对话中所有文件的变更
- **技能**：按工作区存储的专业化智能体指令（[技能市场](https://www.aicowork.chat/skills)）
- **文件附件**：拖放图片、PDF、Office 文档，自动转换
- **多语言支持**：支持中文和英文界面

### 快速开始

1. **启动应用**
2. **选择计费方式**：使用你自己的 Anthropic API 密钥或 Claude Max 订阅
3. **创建工作区**：设置工作区来组织你的会话
4. **连接数据源**（可选）：添加 MCP 服务器、REST API 或本地文件系统
5. **开始对话**：创建会话，与 Claude 交互

### 桌面应用功能

#### 会话管理

- **收件箱/归档**：按工作流状态组织会话
- **标记**：标记重要会话以便快速访问
- **状态工作流**：待办 → 进行中 → 待审核 → 已完成
- **会话命名**：AI 自动生成标题或手动命名
- **会话持久化**：完整对话历史保存到磁盘

#### 数据源

将外部数据源连接到你的工作区：

| 类型 | 示例 |
|------|------|
| **MCP 服务器** | Linear、GitHub、Notion 及任何自定义 MCP 服务器 |
| **REST API** | Google（Gmail、日历、云端硬盘）、Slack、Microsoft |
| **本地文件** | 文件系统、Obsidian 库、Git 仓库 |

#### 权限模式

| 模式 | 显示名称 | 行为 |
|------|---------|------|
| `safe` | 浏览 | 只读，阻止所有写操作 |
| `ask` | 询问编辑 | 执行前需要确认（默认） |
| `allow-all` | 自动 | 自动批准所有命令 |

在聊天界面中使用 **SHIFT+TAB** 切换权限模式。

#### 快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd+N` | 新建对话 |
| `Cmd+1/2/3` | 聚焦侧边栏/列表/对话 |
| `Cmd+,` | 打开设置 |
| `Cmd+B` | 切换侧边栏 |
| `SHIFT+TAB` | 切换权限模式 |
| `Cmd+Enter` | 发送消息 |
| `Enter` | 换行 |
| `Esc` | 中断智能体 |

---

## Architecture

```
agent-operator/
├── apps/
│   └── electron/              # Desktop GUI (primary)
│       └── src/
│           ├── main/          # Electron main process
│           ├── preload/       # Context bridge
│           └── renderer/      # React UI (Vite + shadcn)
└── packages/
    ├── core/                  # Shared types
    └── shared/                # Business logic
        └── src/
            ├── agent/         # OperatorAgent, permissions
            ├── auth/          # OAuth, tokens
            ├── config/        # Storage, preferences, themes
            ├── credentials/   # AES-256-GCM encrypted storage
            ├── sessions/      # Session persistence
            ├── sources/       # MCP, API, local sources
            └── statuses/      # Dynamic status system
```

## Development

```bash
# Hot reload development
bun run electron:dev

# Build and run
bun run electron:start

# Type checking
bun run typecheck:all

# Debug logging (writes to ~/Library/Logs/Dazi/)
# Logs are automatically enabled in development
```

### Environment Variables

OAuth integrations (Google, Slack, Microsoft) require credentials. Create a `.env` file:

```bash
MICROSOFT_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
SLACK_OAUTH_CLIENT_ID=your-slack-client-id
SLACK_OAUTH_CLIENT_SECRET=your-slack-client-secret
```

See [Google Cloud Console](https://console.cloud.google.com/apis/credentials) to create OAuth credentials.

## Configuration

Configuration is stored at `~/.cowork/`:

```
~/.cowork/
├── config.json              # Main config (workspaces, auth type)
├── credentials.enc          # Encrypted credentials (AES-256-GCM)
├── preferences.json         # User preferences
├── theme.json               # App-level theme
└── workspaces/
    └── {id}/
        ├── config.json      # Workspace settings
        ├── theme.json       # Workspace theme override
        ├── sessions/        # Session data (JSONL)
        ├── sources/         # Connected sources
        ├── skills/          # Custom skills
        └── statuses/        # Status configuration
```

## Advanced Features

### Large Response Handling

Tool responses exceeding ~60KB are automatically summarized using Claude Haiku with intent-aware context. The `_intent` field is injected into MCP tool schemas to preserve summarization focus.

### Deep Linking

External apps can navigate using `agentoperator://` URLs:

```
agentoperator://allChats                    # All chats view
agentoperator://allChats/chat/session123    # Specific chat
agentoperator://settings                    # Settings
agentoperator://sources/source/github       # Source info
agentoperator://action/new-chat             # Create new chat
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh/) |
| AI | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Desktop | [Electron](https://www.electronjs.org/) + React |
| UI | [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS v4 |
| Build | esbuild (main) + Vite (renderer) |
| Credentials | AES-256-GCM encrypted file storage |

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses

This project uses the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), which is subject to [Anthropic's Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms).

### Trademark

"Dazi" and "搭子" are trademarks. See [TRADEMARK.md](TRADEMARK.md) for usage guidelines.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

### Local MCP Server Isolation

When spawning local MCP servers (stdio transport), sensitive environment variables are filtered out to prevent credential leakage to subprocesses. Blocked variables include:

- `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` (app auth)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `STRIPE_SECRET_KEY`, `NPM_TOKEN`

To explicitly pass an env var to a specific MCP server, use the `env` field in the source config.

To report security vulnerabilities, please see [SECURITY.md](SECURITY.md).
