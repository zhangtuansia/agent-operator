/**
 * Documentation Links
 *
 * Provides URLs to documentation pages for various features.
 */

const DOC_BASE_URL = 'https://docs.cowork.ai'

/** Documentation link keys */
export type DocKey = 'labels' | 'views' | 'statuses' | 'skills' | 'sources' | 'permissions'

/** Get the documentation URL for a feature */
export function getDocUrl(key: DocKey): string {
  return `${DOC_BASE_URL}/${key}`
}
