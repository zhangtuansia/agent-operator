/**
 * Documentation Links
 *
 * Provides URLs to documentation pages for various features.
 */

const DOC_BASE_URL = 'https://docs.cowork.ai'

/** Documentation link keys */
export type DocKey =
  | 'labels'
  | 'views'
  | 'statuses'
  | 'skills'
  | 'sources'
  | 'sources-api'
  | 'sources-mcp'
  | 'sources-local'
  | 'automations'
  | 'permissions'

/** Path mapping for documentation links */
const DOC_PATHS: Record<DocKey, string> = {
  labels: 'labels',
  views: 'views',
  statuses: 'statuses',
  skills: 'skills',
  sources: 'sources/overview',
  'sources-api': 'sources/apis',
  'sources-mcp': 'sources/mcp-servers',
  'sources-local': 'sources/local-filesystems',
  automations: 'automations/overview',
  permissions: 'permissions',
}

/** Get the documentation URL for a feature */
export function getDocUrl(key: DocKey): string {
  return `${DOC_BASE_URL}/${DOC_PATHS[key]}`
}
