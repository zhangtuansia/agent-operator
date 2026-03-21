#!/bin/bash
# Build the Pixel Agents office backend (UI + Server)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Building Pixel Agents UI ==="
cd "$SCRIPT_DIR/pixel-agents-ui"
npm install
npx tsc -b
npx vite build
echo "UI built to pixel-agents-ui/dist/"

echo ""
echo "=== Building Pixel Agents Server ==="
cd "$SCRIPT_DIR/pixel-agents-server"
npm install
node build.mjs
echo "Server built to pixel-agents-server/dist/"

echo ""
echo "=== Build Complete ==="
echo "To test: cd pixel-agents-server && node dist/server.mjs"
echo "Then open: http://127.0.0.1:19000"
