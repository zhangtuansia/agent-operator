/**
 * Cross-platform resources copy script
 */

import { existsSync, cpSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");
const ELECTRON_DIR = join(ROOT_DIR, "apps/electron");

const srcDir = join(ELECTRON_DIR, "resources");
const destDir = join(ELECTRON_DIR, "dist/resources");

if (existsSync(srcDir)) {
  cpSync(srcDir, destDir, { recursive: true, force: true });
  console.log("📦 Copied resources to dist");
} else {
  console.log("⚠️ No resources directory found");
}

type McpServerName = "bridge-mcp-server" | "session-mcp-server";

function syncMcpServer(server: McpServerName): void {
  const preferredBuiltPath = join(ROOT_DIR, "packages", server, "dist", "index.js");
  const fallbackResourcePath = join(ELECTRON_DIR, "resources", server, "index.js");
  const sourcePath = existsSync(preferredBuiltPath)
    ? preferredBuiltPath
    : existsSync(fallbackResourcePath)
      ? fallbackResourcePath
      : null;

  if (!sourcePath) {
    throw new Error(
      `[resources] Missing ${server}/index.js. Checked:\n- ${preferredBuiltPath}\n- ${fallbackResourcePath}`
    );
  }

  const targetDir = join(destDir, server);
  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, "index.js");
  copyFileSync(sourcePath, targetPath);
  console.log(`[resources] Synced ${server}/index.js from ${sourcePath}`);
}

syncMcpServer("bridge-mcp-server");
syncMcpServer("session-mcp-server");
