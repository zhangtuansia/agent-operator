# Release - 打包并上传到 R2

打包 Electron 应用并上传到 Cloudflare R2 (cowork bucket)。

## 流程

### 1. 询问版本号

首先询问用户要发布的版本号，格式如 `0.1.6`（标准 semver）。

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
- **macOS arm64**: `Cowork-arm64.dmg` + `Cowork-arm64.zip`
- **macOS x64**: `Cowork-x64.dmg` + `Cowork-x64.zip`
- **Windows x64**: `Cowork-x64.exe`
- **Linux x64**: `Cowork-x86_64.AppImage`

同时生成 electron-updater YAML 清单：
- `latest-mac.yml` — macOS 自动更新清单
- `latest.yml` — Windows 自动更新清单
- `latest-linux.yml` — Linux 自动更新清单

> **关键**: electron-builder 需要 `--publish always` 参数才会生成 YAML 清单和 ZIP 文件。
> 脚本已内置此参数，无需手动添加。

打包脚本会自动：
1. 下载对应平台的 Bun 运行时到 `vendor/bun/`
2. 安装依赖并复制 SDK
3. 构建 Electron 应用
4. 使用 electron-builder 打包（含 `--publish always`）

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
│       ├── Cowork-arm64.dmg
│       ├── Cowork-x64.dmg
│       ├── Cowork-x64.exe
│       └── Cowork-x86_64.AppImage
└── electron/
    ├── {version}/
    │   └── manifest.json
    └── latest/
        ├── latest-mac.yml        ← electron-updater macOS 清单
        ├── latest.yml            ← electron-updater Windows 清单
        ├── latest-linux.yml      ← electron-updater Linux 清单
        ├── Cowork-arm64.zip      ← macOS arm64 自动更新包
        ├── Cowork-x64.zip        ← macOS x64 自动更新包
        ├── Cowork-x64.exe        ← Windows 自动更新包
        └── Cowork-x86_64.AppImage ← Linux 自动更新包
```

`electron/latest` (无斜杠) 是版本指针 JSON：`{"version": "x.x.x"}`

### 5. 环境变量

上传需要配置以下环境变量（在 `.env` 文件中）：

```
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=cowork
```

## 自动更新原理

应用使用 `electron-updater` 库实现自动更新：

1. 启动时，`auto-update.ts` 调用 `autoUpdater.checkForUpdates()`
2. electron-updater 从 `https://download.aicowork.chat/electron/latest/latest-mac.yml` 获取清单
3. 清单包含最新版本号、文件名、SHA512 校验和
4. 如果版本号高于当前版本，自动下载对应的 ZIP/EXE/AppImage
5. 下载完成后通知用户可以安装更新

**配置位置**: `electron-builder.yml` 中的 `publish` 字段：
```yaml
publish:
  provider: generic
  url: https://download.aicowork.chat/electron/latest
```

## 快速命令

单独打包某个平台（推荐用 build-dmg.sh，支持签名和公证）：
```bash
cd apps/electron && ./scripts/build-dmg.sh arm64           # macOS ARM
cd apps/electron && ./scripts/build-dmg.sh x64             # macOS Intel
cd apps/electron && ./scripts/build-dmg.sh arm64 --upload --latest  # 打包+上传
```

使用 build-all.sh：
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

### 自动更新 YAML 清单

`--publish always` 是关键！没有它，electron-builder 不会生成：
- YAML 清单（`latest-mac.yml` 等）
- macOS ZIP 文件（`Cowork-arm64.zip` 等）

如果 `upload.ts` 输出 "WARNING: Missing YAML manifests"，说明打包时缺少了 `--publish always`。

### 其他注意事项

1. **版本号格式**：标准 semver `x.y.z`
2. **R2 权限**：确保 API Token 有 `Object Read & Write` 权限
3. **Windows 特殊处理**：Windows 的 Bun 放在 `extraResources` 而非 `files`，避免 EBUSY 锁定问题
