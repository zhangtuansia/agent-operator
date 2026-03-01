/**
 * /s/api/{id} — GET, PUT, DELETE a shared session
 *
 * GET    - Retrieve session JSON from R2
 * PUT    - Update session JSON in R2
 * DELETE - Remove session from R2
 */

interface Env {
  SESSIONS: R2Bucket
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string
  const object = await context.env.SESSIONS.get(`sessions/${id}.json`)

  if (!object) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  // Check if session exists
  const existing = await context.env.SESSIONS.head(`sessions/${id}.json`)
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const body = await context.request.text()

  if (body.length > 50 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Session file is too large' }), {
      status: 413,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  await context.env.SESSIONS.put(`sessions/${id}.json`, body, {
    httpMetadata: { contentType: 'application/json' },
  })

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  const existing = await context.env.SESSIONS.head(`sessions/${id}.json`)
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  await context.env.SESSIONS.delete(`sessions/${id}.json`)

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
