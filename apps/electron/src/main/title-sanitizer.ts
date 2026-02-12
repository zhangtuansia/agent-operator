/**
 * Title sanitization utility.
 * Extracted to a separate file to allow unit testing without importing
 * Electron main process modules.
 */

/**
 * Sanitize message content for use as session title.
 * Strips XML blocks (e.g. <edit_request>), bracket mentions, and normalizes whitespace.
 */
export function sanitizeForTitle(content: string): string {
  return content
    .replace(/<edit_request>[\s\S]*?<\/edit_request>/g, '') // Strip entire edit_request blocks
    .replace(/<[^>]+>/g, '') // Strip remaining XML/HTML tags
    .replace(/\[skill:(?:[^:\]]+:)?[\w-]+\]/g, '') // Strip [skill:slug] and [skill:workspace:slug]
    .replace(/\[source:[\w-]+\]/g, '') // Strip [source:...]
    .replace(/\[file:[^\]]+\]/g, '') // Strip [file:...]
    .replace(/\[folder:[^\]]+\]/g, '') // Strip [folder:...]
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
}
