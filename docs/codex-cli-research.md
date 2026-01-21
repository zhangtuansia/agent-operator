# OpenAI Codex CLI 调研报告

> 调研日期: 2026-01-21

## 1. 概述

Codex CLI 是 OpenAI 推出的终端编程助手，类似于 Claude Code。它可以在本地终端运行，读取、修改和执行代码。

- **官方文档**: https://developers.openai.com/codex/cli/
- **GitHub 仓库**: https://github.com/openai/codex
- **SDK 文档**: https://developers.openai.com/codex/sdk/

## 2. 技术栈对比

| 方面 | Claude Code | OpenAI Codex CLI |
|-----|-------------|------------------|
| 核心语言 | TypeScript | Rust (97.5%) |
| SDK 包名 | `@anthropic-ai/claude-code` | `@openai/codex-sdk` |
| 默认模型 | Claude Sonnet/Opus | GPT-5-Codex |
| 配置文件 | `.claude/` | `~/.codex/config.toml` |
| 认证方式 | API Key / OAuth | ChatGPT 账号 / API Key |
| 构建系统 | npm/bun | Bazel |

## 3. 安装方式

```bash
# npm 安装
npm install -g @openai/codex

# macOS Homebrew
brew install --cask codex
```

支持平台: macOS, Windows, Linux

## 4. SDK 使用

### 4.1 安装 SDK

```bash
npm install @openai/codex-sdk
```

### 4.2 基本用法

```typescript
import { Codex } from "@openai/codex-sdk";

// 创建实例
const codex = new Codex();

// 启动新线程
const thread = codex.startThread();
const result = await thread.run("Make a plan to diagnose and fix the CI failures");

// 继续对话
const result2 = await thread.run("Implement the plan");
```

### 4.3 恢复会话

```typescript
const threadId = "<thread-id>";
const thread = codex.resumeThread(threadId);
const result = await thread.run("Pick up where you left off");
```

## 5. 核心功能

### 5.1 交互模式
- 全屏终端界面
- 支持提交 prompts、代码片段、截图
- 操作执行前需用户批准

### 5.2 会话管理
- 本地存储会话记录
- `codex resume` - 交互式选择恢复
- `codex resume --last` - 恢复最近会话
- `codex resume <SESSION_ID>` - 恢复指定会话

### 5.3 代码审查
- `/review` 命令启动代码审查
- 支持对比 base branch、未提交更改、特定 commit

### 5.4 审批模式
- **Auto** (默认) - 自动执行安全操作
- **Read-only** - 只读模式
- **Full Access** - 完全访问权限

### 5.5 MCP 支持
- 支持 Model Context Protocol
- 通过 STDIO 或 HTTP 服务器连接额外工具
- 配置文件: `~/.codex/config.toml`

### 5.6 非交互执行
```bash
codex exec "your prompt here"
```
适用于 CI/CD 管道和自动化脚本

## 6. 配置

配置文件位置: `~/.codex/config.toml`

```toml
# 示例配置
[mcp]
servers = [
  { name = "my-tool", command = "my-mcp-server" }
]
```

命令行覆盖:
```bash
codex -c key=value "your prompt"
```

## 7. 与 Claude Code 架构差异

### Claude Code 架构
```
App → operator-agent.ts → Claude Code SDK → Anthropic API
                       ↓
              事件流 (streaming)
              工具调用 (tool_use)
              会话管理 (session)
```

### Codex CLI 架构
```
App → Codex SDK → Thread API → OpenAI API (GPT-5-Codex)
              ↓
       startThread()
       run()
       resumeThread()
```

### 关键差异

1. **事件模型**
   - Claude Code: 细粒度事件流 (tool_use, text_delta, complete 等)
   - Codex: Thread/Run 模型，更高层抽象

2. **工具调用**
   - Claude Code: Anthropic tool_use 格式
   - Codex: OpenAI function calling + MCP

3. **会话恢复**
   - Claude Code: SDK 内置会话恢复
   - Codex: Thread ID 恢复机制

4. **执行模式**
   - Claude Code: 流式事件处理
   - Codex: run() 返回完整结果

## 8. 集成可行性分析

### 8.1 需要的改动

如果要在 agent-operator 中支持 Codex CLI，需要：

1. **抽象 Agent 层**
   ```typescript
   interface AgentAdapter {
     startSession(): Promise<Session>
     resumeSession(id: string): Promise<Session>
     sendMessage(message: string): Promise<void>
     onEvent(handler: EventHandler): void
     stop(): Promise<void>
   }
   ```

2. **实现 Codex Adapter**
   ```typescript
   class CodexAdapter implements AgentAdapter {
     private codex: Codex
     private thread: Thread | null

     async startSession() {
       this.thread = this.codex.startThread()
       return { id: this.thread.id }
     }

     async sendMessage(message: string) {
       const result = await this.thread.run(message)
       // 转换为统一事件格式
       this.emitEvents(result)
     }
   }
   ```

3. **事件格式转换**
   - 将 Codex 的结果转换为现有的事件格式
   - 处理工具调用的格式差异

4. **配置管理**
   - 支持 Codex 的 config.toml 格式
   - 或统一为项目配置

### 8.2 工作量估算

| 任务 | 预估时间 |
|-----|---------|
| 设计 AgentAdapter 接口 | 1 天 |
| 实现 ClaudeCodeAdapter | 2 天 |
| 实现 CodexAdapter | 3 天 |
| 事件格式转换 | 2 天 |
| 配置管理统一 | 1 天 |
| 测试和调试 | 2 天 |
| **总计** | **~2 周** |

### 8.3 潜在挑战

1. **事件粒度差异**: Codex 的 Thread/Run 模型比 Claude Code 的流式事件更粗粒度
2. **工具调用兼容**: 两者的工具定义和调用格式不同
3. **实时反馈**: Codex 可能不支持像 Claude Code 那样细粒度的流式更新

## 9. 结论

支持 Codex CLI 是可行的，但需要：

1. 重构现有代码，抽象出 Agent 层
2. 实现适配器模式，统一不同 CLI 的接口
3. 处理事件格式和工具调用的差异

建议的实施路径：

1. **Phase 1**: 设计并实现 AgentAdapter 抽象接口
2. **Phase 2**: 将现有 Claude Code 逻辑迁移到 ClaudeCodeAdapter
3. **Phase 3**: 实现 CodexAdapter
4. **Phase 4**: 用户界面支持切换 Agent

## 10. 参考链接

- [Codex CLI 官方文档](https://developers.openai.com/codex/cli/)
- [Codex CLI 功能介绍](https://developers.openai.com/codex/cli/features/)
- [Codex SDK 文档](https://developers.openai.com/codex/sdk/)
- [Codex GitHub 仓库](https://github.com/openai/codex)
- [Codex 命令行参考](https://developers.openai.com/codex/cli/reference/)
