/**
 * Network proxy manager — configures both Node.js (undici) and Electron session proxies.
 */

import { app, session } from 'electron';
import { Agent, Dispatcher, ProxyAgent, setGlobalDispatcher } from 'undici';
import { parseNoProxyRules, shouldBypassProxy, splitCommaSeparated } from './network-proxy-utils';
import { getNetworkProxySettings, setNetworkProxySettings, type NetworkProxySettings } from '@agent-operator/shared/config';
import { BROWSER_PANE_SESSION_PARTITION } from './browser-pane-manager';
import log from './logger';

let currentProxyDispatcher: Dispatcher | null = null;

class ProtocolProxyDispatcher extends Dispatcher {
  private httpProxy: ProxyAgent | null;
  private httpsProxy: ProxyAgent | null;
  private direct: Agent;
  private rules: ReturnType<typeof parseNoProxyRules>;

  constructor(opts: { httpProxy?: string; httpsProxy?: string; noProxy?: string }) {
    super();
    this.httpProxy = opts.httpProxy ? new ProxyAgent(opts.httpProxy) : null;
    this.httpsProxy = opts.httpsProxy ? new ProxyAgent(opts.httpsProxy) : null;
    this.direct = new Agent();
    this.rules = parseNoProxyRules(opts.noProxy);
  }

  dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    const url = typeof opts.origin === 'string' ? opts.origin : opts.origin?.toString();

    if (url && shouldBypassProxy(url, this.rules)) {
      return this.direct.dispatch(opts, handler);
    }

    const isHttps = url?.startsWith('https:');
    const proxy = isHttps ? (this.httpsProxy ?? this.httpProxy) : this.httpProxy;
    if (proxy) {
      return proxy.dispatch(opts, handler);
    }

    return this.direct.dispatch(opts, handler);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.httpProxy?.close(),
      this.httpsProxy?.close(),
      this.direct.close(),
    ]);
  }

  async destroy(): Promise<void> {
    await Promise.all([
      this.httpProxy?.destroy(),
      this.httpsProxy?.destroy(),
      this.direct.destroy(),
    ]);
  }
}

function configureNodeProxy(settings: NetworkProxySettings | undefined): void {
  if (currentProxyDispatcher) {
    currentProxyDispatcher.close().catch(() => {});
    currentProxyDispatcher = null;
  }

  if (!settings?.enabled || (!settings.httpProxy && !settings.httpsProxy)) {
    const direct = new Agent();
    setGlobalDispatcher(direct);
    currentProxyDispatcher = direct;
    return;
  }

  const dispatcher = new ProtocolProxyDispatcher({
    httpProxy: settings.httpProxy,
    httpsProxy: settings.httpsProxy,
    noProxy: settings.noProxy,
  });

  setGlobalDispatcher(dispatcher);
  currentProxyDispatcher = dispatcher;
}

async function configureElectronProxy(settings: NetworkProxySettings | undefined): Promise<void> {
  if (!app.isReady()) return;

  const proxyConfig = settings?.enabled
    ? buildElectronProxyConfig(settings)
    : { mode: 'direct' as const };

  const sessions = [
    session.defaultSession,
    session.fromPartition(BROWSER_PANE_SESSION_PARTITION),
  ];

  await Promise.all(sessions.map(ses => ses.setProxy(proxyConfig)));
}

function buildElectronProxyConfig(settings: NetworkProxySettings): Electron.ProxyConfig {
  const rules: string[] = [];

  if (settings.httpsProxy) rules.push(`https=${settings.httpsProxy}`);
  if (settings.httpProxy) rules.push(`http=${settings.httpProxy}`);

  if (rules.length === 0) {
    return { mode: 'direct' };
  }

  return {
    mode: 'fixed_servers',
    proxyRules: rules.join(';'),
    proxyBypassRules: settings.noProxy ? splitCommaSeparated(settings.noProxy).join(',') : undefined,
  };
}

export async function applyConfiguredProxySettings(): Promise<void> {
  const settings = getNetworkProxySettings();

  log.info('[proxy] Applying proxy settings:', {
    enabled: settings?.enabled ?? false,
    hasHttpProxy: !!settings?.httpProxy,
    hasHttpsProxy: !!settings?.httpsProxy,
    hasNoProxy: !!settings?.noProxy,
  });

  configureNodeProxy(settings);
  await configureElectronProxy(settings);
}

export async function updateConfiguredProxySettings(settings: NetworkProxySettings): Promise<void> {
  setNetworkProxySettings(settings);
  await applyConfiguredProxySettings();
}
