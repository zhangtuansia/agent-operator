/**
 * POST /s/api — Create a new shared session
 *
 * Receives a StoredSession JSON body, generates a unique ID,
 * stores it in R2, and returns { id, url }.
 */

interface Env {
  SESSIONS: R2Bucket
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.text()

    // Basic size check (~50MB limit)
    if (body.length > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Session file is too large to share' }), {
        status: 413,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Validate JSON
    try {
      JSON.parse(body)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const id = generateId()
    await context.env.SESSIONS.put(`sessions/${id}.json`, body, {
      httpMetadata: { contentType: 'application/json' },
    })

    const url = new URL(context.request.url)
    const shareUrl = `${url.origin}/s/${id}`

    return new Response(JSON.stringify({ id, url: shareUrl }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
}
