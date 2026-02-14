#!/bin/bash
# Cross-platform build script
# Can build for any platform from macOS
#
# Usage:
#   ./scripts/build-all.sh [platform] [arch]
#   ./scripts/build-all.sh mac arm64    # Build macOS arm64
#   ./scripts/build-all.sh mac x64      # Build macOS x64
#   ./scripts/build-all.sh win x64      # Build Windows x64
#   ./scripts/build-all.sh linux x64    # Build Linux x64
#   ./scripts/build-all.sh all          # Build all platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"

# Configuration
BUN_VERSION="bun-v1.3.5"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Download Bun for a specific platform
download_bun() {
    local platform=$1  # darwin, win32, linux
    local arch=$2      # arm64, x64

    log_info "Downloading Bun ${BUN_VERSION} for ${platform}-${arch}..."

    # Map platform/arch to Bun download names
    local bun_download=""
    local bun_binary="bun"

    case "${platform}-${arch}" in
        darwin-arm64)  bun_download="bun-darwin-aarch64" ;;
        darwin-x64)    bun_download="bun-darwin-x64" ;;
        win32-x64)     bun_download="bun-windows-x64-baseline"; bun_binary="bun.exe" ;;
        linux-x64)     bun_download="bun-linux-x64" ;;
        linux-arm64)   bun_download="bun-linux-aarch64" ;;
        *)
            log_error "Unsupported platform: ${platform}-${arch}"
            exit 1
            ;;
    esac

    # Clean and create vendor directory
    rm -rf "$ELECTRON_DIR/vendor/bun"
    mkdir -p "$ELECTRON_DIR/vendor/bun"

    # Create temp directory
    local temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" RETURN

    # Download
    curl -fSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${bun_download}.zip" \
        -o "$temp_dir/${bun_download}.zip"

    # Extract
    unzip -q -o "$temp_dir/${bun_download}.zip" -d "$temp_dir"

    # Copy binary with correct name
    # For Windows, the binary inside the archive is bun.exe
    if [ "$platform" = "win32" ]; then
        cp "$temp_dir/${bun_download}/bun.exe" "$ELECTRON_DIR/vendor/bun/${bun_binary}"
    else
        cp "$temp_dir/${bun_download}/bun" "$ELECTRON_DIR/vendor/bun/${bun_binary}"
    fi
    chmod +x "$ELECTRON_DIR/vendor/bun/${bun_binary}"

    log_info "Bun downloaded: vendor/bun/${bun_binary}"
}

# Copy SDK and interceptor
setup_dependencies() {
    log_info "Setting up dependencies..."

    # Clean previous
    rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai"
    rm -rf "$ELECTRON_DIR/packages"

    # Install dependencies
    cd "$ROOT_DIR"
    bun install

    # Copy SDK
    local sdk_source="$ROOT_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
    if [ ! -d "$sdk_source" ]; then
        log_error "SDK not found at $sdk_source"
        exit 1
    fi
    mkdir -p "$ELECTRON_DIR/node_modules/@anthropic-ai"
    cp -r "$sdk_source" "$ELECTRON_DIR/node_modules/@anthropic-ai/"

    # Copy interceptor
    local interceptor_source="$ROOT_DIR/packages/shared/src/network-interceptor.ts"
    if [ ! -f "$interceptor_source" ]; then
        log_error "Interceptor not found at $interceptor_source"
        exit 1
    fi
    mkdir -p "$ELECTRON_DIR/packages/shared/src"
    cp "$interceptor_source" "$ELECTRON_DIR/packages/shared/src/"

    log_info "Dependencies ready"
}

# Build the app
build_app() {
    log_info "Building Electron app..."
    cd "$ROOT_DIR"
    bun run electron:build
}

# Package for a specific platform
package_app() {
    local platform=$1  # mac, win, linux
    local arch=$2      # arm64, x64

    log_info "Packaging for ${platform} ${arch}..."

    cd "$ELECTRON_DIR"

    case "$platform" in
        mac)
            npx electron-builder --mac --${arch} --publish always
            ;;
        win)
            npx electron-builder --win --${arch} --publish always
            ;;
        linux)
            npx electron-builder --linux --${arch} --publish always
            ;;
    esac
}

# Build for a single platform
build_single() {
    local platform=$1
    local arch=$2

    # Map platform names
    local bun_platform=""
    case "$platform" in
        mac)   bun_platform="darwin" ;;
        win)   bun_platform="win32" ;;
        linux) bun_platform="linux" ;;
    esac

    log_info "=== Building ${platform} ${arch} ==="

    download_bun "$bun_platform" "$arch"
    setup_dependencies
    build_app
    package_app "$platform" "$arch"

    log_info "=== ${platform} ${arch} build complete ==="
}

# Merge two latest-mac.yml files (arm64 + x64) into one with both architectures.
# electron-builder overwrites latest-mac.yml on each build, so we need to
# save the first arch's yml and merge the files entries after the second build.
merge_mac_yml() {
    local yml="$ELECTRON_DIR/release/latest-mac.yml"
    local yml_arm64="$ELECTRON_DIR/release/latest-mac-arm64.yml"

    if [ ! -f "$yml_arm64" ] || [ ! -f "$yml" ]; then
        log_warn "Cannot merge latest-mac.yml: missing arm64 or x64 yml"
        return
    fi

    log_info "Merging latest-mac.yml (arm64 + x64)..."

    # Use bun to merge the two YAML files
    cd "$ROOT_DIR"
    bun -e "
const fs = require('fs');
const arm64 = fs.readFileSync('$yml_arm64', 'utf8');
const x64 = fs.readFileSync('$yml', 'utf8');

// Simple YAML parser for electron-builder's latest-mac.yml format
function parseFiles(yml) {
  const files = [];
  let inFiles = false;
  let current = null;
  for (const line of yml.split('\n')) {
    if (line.startsWith('files:')) { inFiles = true; continue; }
    if (inFiles && line.startsWith('  - ')) {
      if (current) files.push(current);
      current = {};
    }
    if (inFiles && current) {
      const m = line.match(/^\s+-?\s*(\w+):\s*(.+)/);
      if (m) current[m[1]] = m[2];
    }
    if (inFiles && !line.startsWith('  ') && !line.startsWith('files:') && line.trim()) {
      inFiles = false;
    }
  }
  if (current) files.push(current);
  return files;
}

const arm64Files = parseFiles(arm64);
const x64Files = parseFiles(x64);
const allFiles = [...arm64Files, ...x64Files];

// Rebuild the yml with merged files, using x64 yml as base (has latest version/date)
let merged = x64.replace(/files:[\s\S]*?(?=\npath:)/,
  'files:\n' + allFiles.map(f =>
    '  - url: ' + f.url + '\n    sha512: ' + f.sha512 + '\n    size: ' + f.size +
    (f.blockMapSize ? '\n    blockMapSize: ' + f.blockMapSize : '')
  ).join('\n') + '\n');

fs.writeFileSync('$yml', merged);
console.log('Merged ' + allFiles.length + ' file entries into latest-mac.yml');
"

    # Clean up temp file
    rm -f "$yml_arm64"
}

# Build all platforms
build_all() {
    log_info "=== Building all platforms ==="

    # Build macOS first (current platform)
    build_single "mac" "arm64"

    # Save arm64's latest-mac.yml before x64 build overwrites it
    if [ -f "$ELECTRON_DIR/release/latest-mac.yml" ]; then
        cp "$ELECTRON_DIR/release/latest-mac.yml" "$ELECTRON_DIR/release/latest-mac-arm64.yml"
    fi

    build_single "mac" "x64"

    # Merge arm64 + x64 into a single latest-mac.yml
    merge_mac_yml

    # Build Windows
    build_single "win" "x64"

    # Build Linux
    build_single "linux" "x64"

    log_info "=== All builds complete ==="
    ls -la "$ELECTRON_DIR/release/"*.{dmg,exe,AppImage,zip,yml} 2>/dev/null || true
}

# Main
PLATFORM=${1:-"mac"}
ARCH=${2:-"arm64"}

case "$PLATFORM" in
    all)
        build_all
        ;;
    mac|win|linux)
        build_single "$PLATFORM" "$ARCH"
        ;;
    *)
        echo "Usage: $0 [mac|win|linux|all] [arm64|x64]"
        exit 1
        ;;
esac
