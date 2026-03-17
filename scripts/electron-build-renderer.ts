/**
 * Cross-platform renderer build script
 */

import { spawn } from "bun";
import { existsSync, rmSync } from "fs";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");
const ELECTRON_DIR = join(ROOT_DIR, "apps/electron");
const DEFAULT_NODE_OPTIONS = "--max-old-space-size=8192";

// Clean renderer dist first
const rendererDir = join(ELECTRON_DIR, "dist/renderer");
if (existsSync(rendererDir)) {
  rmSync(rendererDir, { recursive: true, force: true });
}

const proc = spawn({
  cmd: ["bun", "run", "vite", "build", "--config", "apps/electron/vite.config.ts"],
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS
      ? `${process.env.NODE_OPTIONS} ${DEFAULT_NODE_OPTIONS}`
      : DEFAULT_NODE_OPTIONS,
  },
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
