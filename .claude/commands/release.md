# Release - 通过 GitHub Actions 自动打包发布

推送 git tag 触发 GitHub Actions 自动打包所有平台并创建 GitHub Release。

## 流程

### 1. 询问版本号

首先询问用户要发布的版本号，格式如 `0.2.3`（标准 semver）。

### 2. 更新版本号

更新以下文件中的版本号：
- `apps/electron/package.json` - 主要版本文件
- `package.json` - 根目录版本（可选同步）

### 3. 提交并推送

```bash
git add apps/electron/package.json package.json
git commit -m "chore: bump version to x.y.z"
git push origin main
```

### 4. 创建并推送 tag

```bash
git tag v{version}
git push origin v{version}
```

推送 `v*` tag 后，GitHub Actions (`release.yml`) 会自动：

1. **并行构建 4 个平台**：
   - macOS ARM64 (`macos-14` runner)
   - macOS x64 (`macos-15` runner)
   - Windows x64 (`windows-latest` runner)
   - Linux x64 (`ubuntu-latest` runner)

2. 每个平台自动：
   - 下载对应的 Bun 运行时
   - 安装依赖、复制 SDK 和 interceptor
   - 构建 Electron 应用
   - 使用 electron-builder 打包（含 `--publish always` 生成更新清单）

3. **合并 macOS YAML 清单**（arm64 + x64）

4. **创建 Draft GitHub Release**，包含所有产物：
   - `Cowork-arm64.dmg` + `Cowork-arm64.zip` (macOS ARM)
   - `Cowork-x64.dmg` + `Cowork-x64.zip` (macOS Intel)
   - `Cowork-x64.exe` (Windows)
   - `Cowork-x86_64.AppImage` (Linux)
   - `latest-mac.yml`, `latest.yml`, `latest-linux.yml` (自动更新清单)

### 5. 发布 Release

GitHub Actions 创建的是 **Draft Release**，需要用户去 GitHub 页面手动点击 Publish。
也可以用 CLI：

```bash
gh release edit v{version} --draft=false
```

### 6. 检查构建状态

```bash
gh run list --workflow=release.yml --limit=3
gh run view {run-id}
```

## 手动触发（可选）

不推 tag 也可以通过 workflow_dispatch 手动触发：

```bash
gh workflow run release.yml --field tag=v{version}
```

## 本地打包（仅调试用）

本地只能打当前平台的包，跨平台打包必须用 CI：

```bash
cd apps/electron && ./scripts/build-dmg.sh arm64    # macOS ARM
cd apps/electron && ./scripts/build-dmg.sh x64       # macOS Intel
```

## 注意事项

1. **版本号格式**：标准 semver `x.y.z`
2. **Tag 格式**：必须是 `v` 前缀（如 `v0.2.3`），才能触发 release workflow
3. **Secrets**：GitHub repo 需要配置 `GOOGLE_OAUTH_CLIENT_ID/SECRET`、`SLACK_OAUTH_CLIENT_ID/SECRET`、`MICROSOFT_OAUTH_CLIENT_ID/SECRET`
4. **Draft Release**：CI 创建的是草稿，需手动发布
5. **自动更新**：发布后 electron-updater 会通过 GitHub Releases 的 YAML 清单推送更新
