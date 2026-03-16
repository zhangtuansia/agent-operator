/**
 * Network proxy utility functions (pure — no Electron deps).
 *
 * Parses NO_PROXY rules and determines whether a given URL should bypass the proxy.
 */

/** Split a comma-separated string into trimmed, non-empty entries. */
export function splitCommaSeparated(str: string | undefined): string[] {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

export interface NoProxyRule {
  /** Exact hostname or domain suffix (without leading dot). */
  host: string;
  /** Optional port restriction. */
  port?: number;
  /** If true, matches any hostname (wildcard `*`). */
  wildcard: boolean;
}

/**
 * Parse a comma-separated NO_PROXY string into structured rules.
 */
export function parseNoProxyRules(noProxy: string | undefined): NoProxyRule[] {
  if (!noProxy) return [];

  return splitCommaSeparated(noProxy)
    .map(entry => entry.toLowerCase())
    .map(entry => {
      if (entry === '*') {
        return { host: '*', wildcard: true };
      }

      let cleaned = entry.startsWith('.') ? entry.slice(1) : entry;

      if (cleaned.startsWith('[')) {
        const closeBracket = cleaned.indexOf(']');
        if (closeBracket > 0) {
          const ipv6Host = cleaned.slice(1, closeBracket);
          const afterBracket = cleaned.slice(closeBracket + 1);
          if (afterBracket.startsWith(':')) {
            const port = parseInt(afterBracket.slice(1), 10);
            if (!isNaN(port)) {
              return { host: ipv6Host, port, wildcard: false };
            }
          }
          return { host: ipv6Host, wildcard: false };
        }
      }

      const lastColon = cleaned.lastIndexOf(':');
      if (lastColon > 0) {
        const host = cleaned.slice(0, lastColon);
        const port = parseInt(cleaned.slice(lastColon + 1), 10);
        if (!isNaN(port)) {
          return { host, port, wildcard: false };
        }
      }

      return { host: cleaned, wildcard: false };
    });
}

const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };

/**
 * Determine whether a URL should bypass the proxy based on NO_PROXY rules.
 */
export function shouldBypassProxy(url: string | URL, rules: NoProxyRule[]): boolean {
  if (rules.length === 0) return false;

  const parsed = typeof url === 'string' ? new URL(url) : url;
  const hostname = parsed.hostname.toLowerCase();
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : DEFAULT_PORTS[parsed.protocol];

  for (const rule of rules) {
    if (rule.wildcard) return true;
    if (rule.port !== undefined && rule.port !== port) continue;
    if (host === rule.host) return true;
    if (host.endsWith(`.${rule.host}`)) return true;
  }

  return false;
}
