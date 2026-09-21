import type { Hono } from 'hono'
import { renderAlbumUnavailable } from './album-html'

export const ALBUMS_UNAVAILABLE = 'Album snapshots are unavailable.'

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY'
    }
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY'
    }
  })
}

export function registerAlbums(app: Hono<{ Bindings: Env }>): void {
  const closedPage = () => html(renderAlbumUnavailable(ALBUMS_UNAVAILABLE), 503)
  const closedJson = () => json({ error: 'UNAVAILABLE', message: ALBUMS_UNAVAILABLE }, 503)

  app.get('/albums', async () => closedPage())
  app.get('/api/v1/albums/snapshot', async () => closedJson())
  app.post('/albums/refresh', async () => closedJson())
}
