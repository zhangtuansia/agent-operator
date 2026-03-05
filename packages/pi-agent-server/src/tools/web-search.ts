import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import * as DDG from 'duck-duck-scrape';
import { parse as parseHtml } from 'node-html-parser';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

const schema = Type.Object({
  query: Type.String({ description: 'The search query' }),
  count: Type.Optional(
    Type.Number({
      description: 'Max results (1-10, default 5)',
      minimum: 1,
      maximum: 10,
    }),
  ),
});

function formatResults(
  query: string,
  provider: string,
  results: SearchResult[],
) {
  const formatted = results
    .map(
      (r, i) =>
        `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`,
    )
    .join('\n\n');

  return {
    content: [
      {
        type: 'text' as const,
        text: `Search results for "${query}" (via ${provider}):\n\n${formatted}`,
      },
    ],
    details: {},
  };
}

async function searchDDG(
  query: string,
  count: number,
): Promise<SearchResult[]> {
  const response = await DDG.search(query, {
    safeSearch: DDG.SafeSearchType.MODERATE,
  });

  if (response.noResults || !response.results?.length) {
    throw new Error('No DuckDuckGo results');
  }

  return response.results.slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.rawDescription || '',
  }));
}

async function searchDDGLite(
  query: string,
  count: number,
): Promise<SearchResult[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`DDG Lite returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const root = parseHtml(html);
  const results: SearchResult[] = [];

  // DDG Lite uses <a class="result-link"> for titles/URLs
  // and <td class="result-snippet"> for descriptions
  const links = root.querySelectorAll('a.result-link');
  const snippets = root.querySelectorAll('td.result-snippet');

  for (let i = 0; i < links.length && results.length < count; i++) {
    const anchor = links[i];
    const href = anchor.getAttribute('href') || '';

    // DDG Lite hrefs go through a redirect — extract the actual URL
    let url: string;
    const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    } else if (href.startsWith('http')) {
      url = href;
    } else {
      continue;
    }

    results.push({
      title: anchor.textContent.trim(),
      url,
      description: snippets[i]?.textContent?.trim() || '',
    });
  }

  if (results.length === 0) {
    throw new Error('No results parsed from DDG Lite HTML');
  }

  return results;
}

export const webSearchTool: AgentTool<typeof schema> = {
  name: 'web_search',
  label: 'Web Search',
  description:
    'Search the web for current information. Returns titles, URLs, and snippets. Use for current information, documentation lookups, or fact-checking.',
  parameters: schema,
  async execute(toolCallId, params) {
    const { query, count = 5 } = params;

    // Try DuckDuckGo first
    try {
      const results = await searchDDG(query, count);
      return formatResults(query, 'DuckDuckGo', results);
    } catch {
      // DDG failed (rate limit, network error, no results) — fall through
    }

    // Fallback to DDG Lite (HTML endpoint, different rate limits)
    try {
      const results = await searchDDGLite(query, count);
      return formatResults(query, 'DuckDuckGo', results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Search failed for "${query}": ${msg}`,
          },
        ],
        details: { isError: true },
      };
    }
  },
};
