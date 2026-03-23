export function sanitizeWindowRestoreUrl(url: string | undefined): string | undefined {
  if (!url) return undefined

  try {
    const parsed = new URL(url)

    if (parsed.protocol === 'app:') {
      return url
    }

    const params = new URLSearchParams()
    const workspaceId = parsed.searchParams.get('workspaceId')
    if (workspaceId) {
      params.set('workspaceId', workspaceId)
    }

    const route = parsed.searchParams.get('route')
    if (route) {
      params.set('route', route)
    }

    const sidebar = parsed.searchParams.get('sidebar')
    if (sidebar) {
      params.set('sidebar', sidebar)
    }

    const focused = parsed.searchParams.get('focused')
    if (focused === 'true') {
      params.set('focused', 'true')
    }

    if (!workspaceId && !route && !sidebar && focused !== 'true') {
      return undefined
    }

    return `app://window?${params.toString()}`
  } catch {
    return undefined
  }
}
