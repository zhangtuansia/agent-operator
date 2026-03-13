import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import type { BackendHostRuntimeContext } from '../types.ts';
import {
  setExecutable,
  setInterceptorPath,
  setPathToClaudeCodeExecutable,
} from '../../options.ts';

export interface ResolvedBackendRuntimePaths {
  claudeCliPath?: string;
  claudeInterceptorPath?: string;
  copilotCliPath?: string;
  copilotInterceptorPath?: string;
  piServerPath?: string;
  piInterceptorPath?: string;
  nodeRuntimePath?: string;
  bundledRuntimePath?: string;
}

export interface ResolvedBackendHostTooling {
  ripgrepPath?: string;
}

function firstExistingPath(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveUpwards(base: string, relativePath: string, maxLevels = 6): string | undefined {
  let dir = resolve(base);
  for (let i = 0; i <= maxLevels; i += 1) {
    const candidate = join(dir, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function resolveBundledRuntimePath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const bunBinary = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const bunBasePath = process.platform === 'win32'
    ? (hostRuntime.resourcesPath || hostRuntime.appRootPath)
    : hostRuntime.appRootPath;
  const bunPath = join(bunBasePath, 'vendor', 'bun', bunBinary);
  if (existsSync(bunPath)) {
    return bunPath;
  }

  if (!hostRuntime.isPackaged) {
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const systemBun = execFileSync(whichCmd, ['bun'], { encoding: 'utf-8' }).trim();
      if (systemBun && existsSync(systemBun)) {
        return systemBun;
      }
    } catch {
      // Fall back to plain "bun" below if PATH resolution is unavailable.
    }
  }

  return undefined;
}

function resolveClaudeCliPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const sdkRelative = join('node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  return firstExistingPath([
    join(hostRuntime.appRootPath, sdkRelative),
    join(hostRuntime.appRootPath, '..', '..', sdkRelative),
    resolveUpwards(hostRuntime.appRootPath, sdkRelative, 10) || '',
  ].filter(Boolean));
}

function resolveClaudeInterceptorPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const packagedCandidates = [
    join(hostRuntime.appRootPath, 'node_modules', '@agent-operator', 'shared', 'src', 'network', 'interceptor.ts'),
    join(hostRuntime.appRootPath, 'node_modules', '@agent-operator', 'shared', 'src', 'network-interceptor.ts'),
    join(hostRuntime.appRootPath, 'packages', 'shared', 'src', 'network', 'interceptor.ts'),
    join(hostRuntime.appRootPath, 'packages', 'shared', 'src', 'network-interceptor.ts'),
  ];

  const devCandidates = [
    resolveUpwards(hostRuntime.appRootPath, join('packages', 'shared', 'src', 'network', 'interceptor.ts'), 10),
    resolveUpwards(hostRuntime.appRootPath, join('packages', 'shared', 'src', 'network-interceptor.ts'), 10),
    resolveUpwards(hostRuntime.appRootPath, join('node_modules', '@agent-operator', 'shared', 'src', 'network', 'interceptor.ts'), 10),
    resolveUpwards(hostRuntime.appRootPath, join('node_modules', '@agent-operator', 'shared', 'src', 'network-interceptor.ts'), 10),
  ].filter(Boolean) as string[];

  return firstExistingPath(hostRuntime.isPackaged ? packagedCandidates : [...packagedCandidates, ...devCandidates]);
}

function resolveCopilotCliPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  return firstExistingPath([
    join(hostRuntime.appRootPath, 'node_modules', '@github', 'copilot', 'index.js'),
    join(hostRuntime.appRootPath, '..', '..', 'node_modules', '@github', 'copilot', 'index.js'),
    resolveUpwards(hostRuntime.appRootPath, join('node_modules', '@github', 'copilot', 'index.js'), 10) || '',
  ].filter(Boolean));
}

function resolveCopilotInterceptorPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  return firstExistingPath([
    join(hostRuntime.appRootPath, 'dist', 'copilot-interceptor.cjs'),
    join(hostRuntime.appRootPath, 'apps', 'electron', 'dist', 'copilot-interceptor.cjs'),
    resolveUpwards(hostRuntime.appRootPath, join('dist', 'copilot-interceptor.cjs'), 10) || '',
    resolveUpwards(hostRuntime.appRootPath, join('apps', 'electron', 'dist', 'copilot-interceptor.cjs'), 10) || '',
  ].filter(Boolean));
}

function resolvePiInterceptorPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  if (hostRuntime.interceptorBundlePath && existsSync(hostRuntime.interceptorBundlePath)) {
    return hostRuntime.interceptorBundlePath;
  }

  return firstExistingPath([
    join(hostRuntime.appRootPath, 'dist', 'interceptor.cjs'),
    join(hostRuntime.appRootPath, 'apps', 'electron', 'dist', 'interceptor.cjs'),
    resolveUpwards(hostRuntime.appRootPath, join('dist', 'interceptor.cjs'), 10) || '',
    resolveUpwards(hostRuntime.appRootPath, join('apps', 'electron', 'dist', 'interceptor.cjs'), 10) || '',
  ].filter(Boolean));
}

function resolvePiServerPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const packagedCandidates = [
    join(hostRuntime.appRootPath, 'resources', 'pi-agent-server', 'index.js'),
    hostRuntime.resourcesPath ? join(hostRuntime.resourcesPath, 'pi-agent-server', 'index.js') : '',
  ].filter(Boolean) as string[];

  const devCandidates = [
    resolveUpwards(hostRuntime.appRootPath, join('packages', 'pi-agent-server', 'dist', 'index.js'), 10) || '',
    resolveUpwards(hostRuntime.appRootPath, join('apps', 'electron', 'resources', 'pi-agent-server', 'index.js'), 10) || '',
  ].filter(Boolean);

  return firstExistingPath(hostRuntime.isPackaged ? packagedCandidates : [...packagedCandidates, ...devCandidates]);
}

function resolveRipgrepPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const platform = process.platform === 'win32'
    ? 'x64-win32'
    : process.platform === 'darwin'
      ? (process.arch === 'arm64' ? 'arm64-darwin' : 'x64-darwin')
      : (process.arch === 'arm64' ? 'arm64-linux' : 'x64-linux');
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const ripgrepRelative = join(
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk',
    'vendor',
    'ripgrep',
    platform,
    binaryName,
  );

  return firstExistingPath([
    join(hostRuntime.appRootPath, ripgrepRelative),
    join(hostRuntime.appRootPath, '..', '..', ripgrepRelative),
    resolveUpwards(hostRuntime.appRootPath, ripgrepRelative, 10) || '',
    join(process.cwd(), ripgrepRelative),
  ].filter(Boolean));
}

export function resolveBackendRuntimePaths(hostRuntime: BackendHostRuntimeContext): ResolvedBackendRuntimePaths {
  const bundledRuntimePath = hostRuntime.nodeRuntimePath || resolveBundledRuntimePath(hostRuntime);

  return {
    claudeCliPath: resolveClaudeCliPath(hostRuntime),
    claudeInterceptorPath: resolveClaudeInterceptorPath(hostRuntime),
    copilotCliPath: resolveCopilotCliPath(hostRuntime),
    copilotInterceptorPath: resolveCopilotInterceptorPath(hostRuntime),
    piServerPath: resolvePiServerPath(hostRuntime),
    piInterceptorPath: resolvePiInterceptorPath(hostRuntime),
    nodeRuntimePath: hostRuntime.nodeRuntimePath || bundledRuntimePath || 'bun',
    bundledRuntimePath,
  };
}

export function resolveBackendHostTooling(hostRuntime: BackendHostRuntimeContext): ResolvedBackendHostTooling {
  return {
    ripgrepPath: resolveRipgrepPath(hostRuntime),
  };
}

export function initializeBackendHostRuntime(args: {
  hostRuntime: BackendHostRuntimeContext;
  strict?: boolean;
}): ResolvedBackendRuntimePaths {
  const { hostRuntime, strict = true } = args;
  const paths = resolveBackendRuntimePaths(hostRuntime);

  if (paths.claudeCliPath) {
    setPathToClaudeCodeExecutable(paths.claudeCliPath);
  } else if (strict) {
    throw new Error('Claude Code SDK not found. The app package may be corrupted.');
  }

  if (paths.claudeInterceptorPath) {
    if (process.platform !== 'win32' || hostRuntime.isPackaged) {
      setInterceptorPath(paths.claudeInterceptorPath);
    }
  } else if (strict) {
    throw new Error('Network interceptor not found. The app package may be corrupted.');
  }

  if (hostRuntime.isPackaged) {
    if (paths.bundledRuntimePath) {
      setExecutable(paths.bundledRuntimePath);
    } else if (strict) {
      throw new Error('Bundled runtime not found. The app package may be corrupted.');
    }
  } else if (process.platform === 'win32' && paths.nodeRuntimePath) {
    setExecutable(paths.nodeRuntimePath);
  }

  return paths;
}

export function resolveBundledRuntimeBinary(hostRuntime: BackendHostRuntimeContext): string | undefined {
  return resolveBundledRuntimePath(hostRuntime);
}
