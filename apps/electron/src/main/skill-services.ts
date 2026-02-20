/**
 * Skill Services Manager - Manages background services for skills
 *
 * Adapted from LobsterAI's skillServices.ts for the agent-operator project.
 * Currently manages the Web Search Bridge Server lifecycle.
 */

import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Resolve the user's login shell PATH on macOS/Linux.
 * Packaged Electron apps on macOS don't inherit the user's shell profile,
 * so node/npm won't be in PATH unless we resolve it explicitly.
 */
function resolveUserShellPath(): string | null {
  if (process.platform === 'win32') return null;

  try {
    const shell = process.env.SHELL || '/bin/bash';
    const result = execSync(`${shell} -ilc 'echo __PATH__=$PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env },
    });
    const match = result.match(/__PATH__=(.+)/);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.warn('[SkillServices] Failed to resolve user shell PATH:', error);
    return null;
  }
}

/**
 * Build an environment for spawning skill service scripts.
 * Merges the user's shell PATH with the current process environment.
 */
function buildSkillServiceEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  if (app.isPackaged) {
    if (!env.HOME) {
      env.HOME = app.getPath('home');
    }

    const userPath = resolveUserShellPath();
    if (userPath) {
      env.PATH = userPath;
      console.log('[SkillServices] Resolved user shell PATH for skill services');
    } else {
      // Fallback: append common node installation paths
      const commonPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        `${env.HOME}/.nvm/current/bin`,
        `${env.HOME}/.volta/bin`,
        `${env.HOME}/.fnm/current/bin`,
      ];
      env.PATH = [env.PATH, ...commonPaths].filter(Boolean).join(':');
      console.log('[SkillServices] Using fallback PATH for skill services');
    }
  }

  // Expose Electron executable so skill scripts can run JS with ELECTRON_RUN_AS_NODE
  env.COWORK_ELECTRON_PATH = process.execPath;

  return env;
}

/**
 * Get the SKILLs root directory path.
 * - Development: apps/electron/SKILLs/ (relative to project)
 * - Production: userData/SKILLs/ (user data directory)
 */
export function getSkillsRoot(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'SKILLs');
  }

  // In development, __dirname is dist/, so .. goes to apps/electron/
  const projectRoot = path.resolve(__dirname, '..');
  const candidate = path.join(projectRoot, 'SKILLs');
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  // Fallback: try app path
  return path.join(app.getAppPath(), 'SKILLs');
}

export class SkillServiceManager {
  private webSearchPid: number | null = null;
  private skillEnv: Record<string, string | undefined> | null = null;

  private hasWebSearchRuntimeScriptSupport(skillPath: string): boolean {
    const startServerScript = path.join(skillPath, 'scripts', 'start-server.sh');
    const searchScript = path.join(skillPath, 'scripts', 'search.sh');
    if (!fs.existsSync(startServerScript) || !fs.existsSync(searchScript)) {
      return false;
    }
    try {
      const startScript = fs.readFileSync(startServerScript, 'utf-8');
      const searchScriptContent = fs.readFileSync(searchScript, 'utf-8');
      return startScript.includes('WEB_SEARCH_FORCE_REPAIR')
        && startScript.includes('detect_healthy_bridge_server')
        && searchScriptContent.includes('ACTIVE_SERVER_URL')
        && searchScriptContent.includes('try_switch_to_local_server');
    } catch {
      return false;
    }
  }

  private isWebSearchRuntimeHealthy(skillPath: string): boolean {
    const requiredPaths = [
      path.join(skillPath, 'scripts', 'start-server.sh'),
      path.join(skillPath, 'scripts', 'search.sh'),
      path.join(skillPath, 'dist', 'server', 'index.js'),
      path.join(skillPath, 'node_modules', 'iconv-lite', 'encodings', 'index.js'),
    ];
    return requiredPaths.every(requiredPath => fs.existsSync(requiredPath))
      && this.hasWebSearchRuntimeScriptSupport(skillPath);
  }

  private hasCommand(command: string, env: NodeJS.ProcessEnv): boolean {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checker, [command], { stdio: 'ignore', env });
    return result.status === 0;
  }

  private repairWebSearchRuntimeFromBundled(skillPath: string): void {
    if (!app.isPackaged) return;

    const candidates = [
      path.join(process.resourcesPath, 'SKILLs', 'web-search'),
      path.join(app.getAppPath(), 'SKILLs', 'web-search'),
    ];

    const bundledPath = candidates.find(candidate => candidate !== skillPath && fs.existsSync(candidate));
    if (!bundledPath) return;

    try {
      fs.cpSync(bundledPath, skillPath, {
        recursive: true,
        dereference: true,
        force: true,
        errorOnExist: false,
      });
      console.log('[SkillServices] Repaired web-search runtime from bundled resources');
    } catch (error) {
      console.warn('[SkillServices] Failed to repair web-search runtime from bundled resources:', error);
    }
  }

  private resolveNodeRuntime(
    env: NodeJS.ProcessEnv
  ): { command: string; args: string[]; extraEnv?: NodeJS.ProcessEnv } {
    if (!app.isPackaged && this.hasCommand('node', env)) {
      return { command: 'node', args: [] };
    }

    return {
      command: process.execPath,
      args: [],
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  private ensureWebSearchRuntimeReady(skillPath: string): void {
    if (this.isWebSearchRuntimeHealthy(skillPath)) return;

    this.repairWebSearchRuntimeFromBundled(skillPath);
    if (this.isWebSearchRuntimeHealthy(skillPath)) return;

    const nodeModules = path.join(skillPath, 'node_modules');
    const distDir = path.join(skillPath, 'dist');
    const env = this.skillEnv as NodeJS.ProcessEnv ?? process.env;
    const npmAvailable = this.hasCommand('npm', env);

    const shouldInstallDeps = !fs.existsSync(nodeModules) || !this.isWebSearchRuntimeHealthy(skillPath);
    if (shouldInstallDeps) {
      if (!npmAvailable) {
        throw new Error('Web-search runtime is incomplete and npm is not available to repair it');
      }
      console.log('[SkillServices] Installing/repairing web-search dependencies...');
      execSync('npm install', { cwd: skillPath, stdio: 'ignore', env });
    }

    if (!fs.existsSync(distDir)) {
      if (!npmAvailable) {
        throw new Error('Web-search dist files are missing and npm is not available to rebuild them');
      }
      console.log('[SkillServices] Compiling web-search TypeScript...');
      execSync('npm run build', { cwd: skillPath, stdio: 'ignore', env });
    }

    if (!this.isWebSearchRuntimeHealthy(skillPath)) {
      throw new Error('Web-search runtime is still unhealthy after attempted repair');
    }
  }

  /**
   * Sync bundled skills to user data directory (production only).
   * Copies skills from the app bundle to userData/SKILLs/ on first run.
   */
  syncBundledSkills(): void {
    if (!app.isPackaged) return;

    const userRoot = path.join(app.getPath('userData'), 'SKILLs');
    const bundledCandidates = [
      path.join(process.resourcesPath, 'SKILLs'),
      path.join(app.getAppPath(), 'SKILLs'),
    ];

    const bundledRoot = bundledCandidates.find(c => c !== userRoot && fs.existsSync(c));
    if (!bundledRoot) return;

    try {
      if (!fs.existsSync(userRoot)) {
        fs.mkdirSync(userRoot, { recursive: true });
      }

      const entries = fs.readdirSync(bundledRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const targetDir = path.join(userRoot, entry.name);
        const targetExists = fs.existsSync(targetDir);

        // Only copy if target doesn't exist, or if web-search needs repair
        const shouldRepair = entry.name === 'web-search' && targetExists
          && !this.isWebSearchRuntimeHealthy(targetDir);
        if (targetExists && !shouldRepair) continue;

        try {
          fs.cpSync(path.join(bundledRoot, entry.name), targetDir, {
            recursive: true,
            dereference: true,
            force: shouldRepair,
            errorOnExist: false,
          });
          console.log(`[SkillServices] ${shouldRepair ? 'Repaired' : 'Installed'} bundled skill "${entry.name}"`);
        } catch (error) {
          console.warn(`[SkillServices] Failed to sync bundled skill "${entry.name}":`, error);
        }
      }
    } catch (error) {
      console.warn('[SkillServices] Failed to sync bundled skills:', error);
    }
  }

  /**
   * Start all skill services
   */
  async startAll(): Promise<void> {
    console.log('[SkillServices] Starting skill services...');

    // Resolve environment once for all service spawns
    this.skillEnv = buildSkillServiceEnv();

    // Sync bundled skills to user data (production only)
    this.syncBundledSkills();

    // Set SKILLS_ROOT env var for agent sessions
    const skillsRoot = getSkillsRoot();
    process.env.SKILLS_ROOT = skillsRoot;
    process.env.COWORK_SKILLS_ROOT = skillsRoot;
    process.env.COWORK_ELECTRON_PATH = process.execPath;

    try {
      await this.startWebSearchService();
    } catch (error) {
      console.error('[SkillServices] Error starting services:', error);
    }
  }

  /**
   * Stop all skill services
   */
  async stopAll(): Promise<void> {
    console.log('[SkillServices] Stopping skill services...');

    try {
      await this.stopWebSearchService();
    } catch (error) {
      console.error('[SkillServices] Error stopping services:', error);
    }
  }

  /**
   * Start Web Search Bridge Server
   */
  async startWebSearchService(): Promise<void> {
    try {
      const skillPath = this.getWebSearchPath();
      if (!skillPath) {
        console.log('[SkillServices] Web Search skill not found, skipping');
        return;
      }

      if (this.isWebSearchServiceRunning()) {
        console.log('[SkillServices] Web Search service already running');
        return;
      }

      console.log('[SkillServices] Starting Web Search Bridge Server...');

      await this.startWebSearchServiceProcess(skillPath);

      // Wait for the server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      const pidFile = path.join(skillPath, '.server.pid');
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
        this.webSearchPid = pid;
        console.log(`[SkillServices] Web Search Bridge Server started (PID: ${pid})`);
      } else {
        console.warn('[SkillServices] Web Search Bridge Server may not have started correctly');
      }
    } catch (error) {
      console.error('[SkillServices] Failed to start Web Search service:', error);
    }
  }

  private async startWebSearchServiceProcess(skillPath: string): Promise<void> {
    const pidFile = path.join(skillPath, '.server.pid');
    const logFile = path.join(skillPath, '.server.log');
    const serverEntry = path.join(skillPath, 'dist', 'server', 'index.js');
    this.ensureWebSearchRuntimeReady(skillPath);
    const baseEnv = this.skillEnv as NodeJS.ProcessEnv ?? process.env;
    const runtime = this.resolveNodeRuntime(baseEnv);
    const env = {
      ...baseEnv,
      ...(runtime.extraEnv ?? {}),
      COWORK_ELECTRON_PATH: process.execPath,
    };

    const logFd = fs.openSync(logFile, 'a');
    let child;
    try {
      child = spawn(runtime.command, [...runtime.args, serverEntry], {
        cwd: skillPath,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env,
      });
    } finally {
      fs.closeSync(logFd);
    }

    fs.writeFileSync(pidFile, child.pid!.toString());
    child.unref();

    const runtimeLabel = runtime.command === process.execPath ? 'electron-node' : 'node';
    console.log(`[SkillServices] Web Search Bridge Server starting (PID: ${child.pid}, runtime: ${runtimeLabel})`);
    console.log(`[SkillServices] Logs: ${logFile}`);
  }

  /**
   * Stop Web Search Bridge Server
   */
  async stopWebSearchService(): Promise<void> {
    try {
      const skillPath = this.getWebSearchPath();
      if (!skillPath) return;

      if (!this.isWebSearchServiceRunning()) {
        console.log('[SkillServices] Web Search service not running');
        return;
      }

      console.log('[SkillServices] Stopping Web Search Bridge Server...');

      if (this.webSearchPid) {
        try {
          process.kill(this.webSearchPid, 'SIGTERM');
        } catch (error) {
          console.warn('[SkillServices] Failed to kill process:', error);
        }
      }

      const pidFile = path.join(skillPath, '.server.pid');
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[SkillServices] Web Search Bridge Server stopped');
      this.webSearchPid = null;
    } catch (error) {
      console.error('[SkillServices] Failed to stop Web Search service:', error);
    }
  }

  /**
   * Check if Web Search service is running
   */
  isWebSearchServiceRunning(): boolean {
    if (this.webSearchPid === null) {
      const skillPath = this.getWebSearchPath();
      if (!skillPath) return false;

      const pidFile = path.join(skillPath, '.server.pid');
      if (fs.existsSync(pidFile)) {
        try {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
          this.webSearchPid = pid;
        } catch {
          return false;
        }
      } else {
        return false;
      }
    }

    try {
      process.kill(this.webSearchPid, 0); // Signal 0 checks if process exists
      return true;
    } catch {
      this.webSearchPid = null;
      return false;
    }
  }

  /**
   * Get Web Search skill path
   */
  private getWebSearchPath(): string | null {
    const candidates: string[] = [];

    if (app.isPackaged) {
      candidates.push(path.join(app.getPath('userData'), 'SKILLs', 'web-search'));
      candidates.push(path.join(process.resourcesPath, 'SKILLs', 'web-search'));
      candidates.push(path.join(app.getAppPath(), 'SKILLs', 'web-search'));
    } else {
      // In development, __dirname is dist/, so .. goes to apps/electron/
      const projectRoot = path.resolve(__dirname, '..');
      candidates.push(path.join(projectRoot, 'SKILLs', 'web-search'));
      candidates.push(path.join(app.getAppPath(), 'SKILLs', 'web-search'));
    }

    return candidates.find(skillPath => fs.existsSync(skillPath)) ?? null;
  }

  /**
   * Get service status
   */
  getStatus(): { webSearch: boolean } {
    return {
      webSearch: this.isWebSearchServiceRunning()
    };
  }

  /**
   * Health check for Web Search service
   */
  async checkWebSearchHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://127.0.0.1:8923/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let serviceManager: SkillServiceManager | null = null;

export function getSkillServiceManager(): SkillServiceManager {
  if (!serviceManager) {
    serviceManager = new SkillServiceManager();
  }
  return serviceManager;
}
