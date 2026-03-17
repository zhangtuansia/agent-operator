/**
 * Cross-platform resources copy script
 */

import { existsSync, cpSync, copyFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT_DIR = join(import.meta.dir, "..");
const ELECTRON_DIR = join(ROOT_DIR, "apps/electron");
const GWS_PACKAGE = "@googleworkspace/cli@latest";

const srcDir = join(ELECTRON_DIR, "resources");
const destDir = join(ELECTRON_DIR, "dist/resources");

if (existsSync(srcDir)) {
  cpSync(srcDir, destDir, { recursive: true, force: true });
  console.log("📦 Copied resources to dist");
} else {
  console.log("⚠️ No resources directory found");
}

type McpServerName = "bridge-mcp-server" | "session-mcp-server" | "pi-agent-server";

function syncMcpServer(server: McpServerName): void {
  const preferredBuiltDir = join(ROOT_DIR, "packages", server, "dist");
  const preferredBuiltPath = join(preferredBuiltDir, "index.js");
  const fallbackResourceDir = join(ELECTRON_DIR, "resources", server);
  const fallbackResourcePath = join(fallbackResourceDir, "index.js");

  if (!existsSync(preferredBuiltPath) && !existsSync(fallbackResourcePath)) {
    if (server === "pi-agent-server") {
      console.warn(
        `[resources] Optional ${server}/index.js not found. PI provider will be unavailable until it is built.`
      );
      return;
    }
    throw new Error(
      `[resources] Missing ${server}/index.js. Checked:\n- ${preferredBuiltPath}\n- ${fallbackResourcePath}`
    );
  }

  const targetDir = join(destDir, server);

  if (existsSync(preferredBuiltDir)) {
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    cpSync(preferredBuiltDir, targetDir, { recursive: true, force: true });
    console.log(`[resources] Synced ${server} dist/ from ${preferredBuiltDir}`);
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, "index.js");
  copyFileSync(fallbackResourcePath, targetPath);
  console.log(`[resources] Synced ${server}/index.js from ${fallbackResourcePath}`);
}

function findNpmCommand(): string | null {
  const candidates = process.platform === "win32"
    ? ["npm.cmd", "npm"]
    : ["npm", "/opt/homebrew/bin/npm", "/usr/local/bin/npm", "/usr/bin/npm"];

  for (const candidate of candidates) {
    if (candidate.startsWith("/") && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    if (probe.status === 0) return candidate;
  }

  return null;
}

function bundleGoogleWorkspaceCli(): void {
  const vendorDir = join(destDir, "vendor", "gws-cli");
  const runScriptPath = join(vendorDir, "node_modules", "@googleworkspace", "cli", "run-gws.js");
  if (existsSync(runScriptPath)) {
    console.log("[resources] Google Workspace CLI already bundled");
    return;
  }

  const npmCommand = findNpmCommand();
  if (!npmCommand) {
    console.warn("[resources] npm not found; skipping Google Workspace CLI prebundle");
    return;
  }

  mkdirSync(vendorDir, { recursive: true });
  console.log(`[resources] Bundling ${GWS_PACKAGE} to ${vendorDir}`);

  const result = spawnSync(
    npmCommand,
    [
      "install",
      "--prefix",
      vendorDir,
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      GWS_PACKAGE,
    ],
    {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_update_notifier: "false",
        npm_config_fund: "false",
        npm_config_audit: "false",
      },
    },
  );

  if (result.status !== 0) {
    console.warn(`[resources] Failed to prebundle ${GWS_PACKAGE}; runtime auto-install fallback will be used`);
    return;
  }

  if (!existsSync(runScriptPath)) {
    console.warn(
      "[resources] Google Workspace CLI install finished, but run-gws.js is missing; runtime fallback will be used",
    );
    return;
  }

  console.log("[resources] Bundled Google Workspace CLI");
}

syncMcpServer("bridge-mcp-server");
syncMcpServer("session-mcp-server");
syncMcpServer("pi-agent-server");
bundleGoogleWorkspaceCli();
