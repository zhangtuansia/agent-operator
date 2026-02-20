# Release - 打包并上传到 R2

打包 Electron 应用并上传到 Cloudflare R2 (cowork bucket)。

## 流程

### 1. 询问版本号

首先询问用户要发布的版本号，格式如 `0.1.2b`。

### 2. 更新版本号

更新以下文件中的版本号：
- `apps/electron/package.json` - 主要版本文件
- `package.json` - 根目录版本（可选同步）

### 3. 打包所有平台

运行打包脚本，为每个平台下载对应的 Bun 运行时并打包：

```bash
cd apps/electron && ./scripts/build-all.sh all
```

这会打包：
- **macOS arm64**: `Agent-Operator-arm64.dmg`
- **macOS x64**: `Agent-Operator-x64.dmg`
- **Windows x64**: `Agent-Operator-x64.exe`
- **Linux x64**: `Agent-Operator-x86_64.AppImage`

打包脚本会自动：
1. 下载对应平台的 Bun 运行时到 `vendor/bun/`
2. 安装依赖并复制 SDK
3. 构建 Electron 应用
4. 使用 electron-builder 打包

### 4. 上传到 R2

上传到 Cloudflare R2 的 `cowork` bucket：

```bash
bun run scripts/upload.ts --electron --latest
```

上传结构：
```
cowork/
├── downloads/
│   └── {version}/
│       ├── Agent-Operator-arm64.dmg
│       ├── Agent-Operator-x64.dmg
│       ├── Agent-Operator-x64.exe
│       └── Agent-Operator-x86_64.AppImage
└── electron/
    ├── {version}/
    │   └── manifest.json
    └── latest                # {"version": "x.x.x"}
```

### 5. 环境变量

上传需要配置以下环境变量（在 `.env` 文件中）：

```
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=cowork
```

## 快速命令

单独打包某个平台：
```bash
cd apps/electron && ./scripts/build-all.sh mac arm64   # macOS ARM
cd apps/electron && ./scripts/build-all.sh mac x64     # macOS Intel
cd apps/electron && ./scripts/build-all.sh win x64     # Windows
cd apps/electron && ./scripts/build-all.sh linux x64   # Linux
```

只上传不打包：
```bash
bun run scripts/upload.ts --electron --latest
```

## 注意事项

### Bun 运行时打包（关键）

每个平台需要打包**对应平台的 Bun 二进制文件**，不能混用！

| 平台 | Bun 下载包 | 二进制文件名 |
|------|-----------|-------------|
| macOS ARM | `bun-darwin-aarch64` | `bun` |
| macOS Intel | `bun-darwin-x64` | `bun` |
| Windows x64 | `bun-windows-x64-baseline` | `bun.exe` |
| Linux x64 | `bun-linux-x64` | `bun` |
| Linux ARM | `bun-linux-aarch64` | `bun` |

打包脚本 `build-all.sh` 会自动：
1. 根据目标平台下载对应的 Bun（从 GitHub releases）
2. 解压并复制到 `apps/electron/vendor/bun/`
3. 打包时将 `vendor/bun/` 包含在应用中

**重要**：如果单独打包某个平台，必须确保 `vendor/bun/` 中是对应平台的 Bun！

### 其他注意事项

1. **版本号格式**：支持 `x.y.z` 或 `x.y.za`/`x.y.zb` 等后缀
2. **R2 权限**：确保 API Token 有 `Object Read & Write` 权限
3. **Windows 特殊处理**：Windows 的 Bun 放在 `extraResources` 而非 `files`，避免 EBUSY 锁定问题
