// Headers that every HTML and JSON response carries. Image responses send only nosniff.
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
}

// Headers in `extra` win over the defaults, as a spread placed last would.
function respond(body: string, status: number, contentType: string, extra: HeadersInit): Response {
  const headers = new Headers(extra)
  for (const [name, value] of Object.entries({ 'content-type': contentType, ...SECURITY_HEADERS })) {
    if (!headers.has(name)) {
      headers.set(name, value)
    }
  }
  return new Response(body, { status, headers })
}

export function html(body: string, status = 200, extra: HeadersInit = {}): Response {
  return respond(body, status, 'text/html; charset=utf-8', extra)
}

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return respond(JSON.stringify(body), status, 'application/json; charset=utf-8', extra)
}
