import type { Hono } from 'hono'
import {
  renderAlbumEditor,
  renderAlbumStart,
  renderAlbumUnavailable,
  viewerOf
} from './album-html'
import {
  AlbumRefreshLimited,
  AlbumSnapshotError,
  loadAlbumSnapshot,
  refreshAlbumSnapshot
} from './album-snapshot'
import { oauthConfigured } from './oauth'
import { getSession } from './session'

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

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      ...extra
    }
  })
}

export function registerAlbums(app: Hono<{ Bindings: Env }>): void {
  app.get('/albums', async (c) => {
    if (!oauthConfigured(c.env)) {
      return html(renderAlbumUnavailable('Album snapshots are unavailable.'), 503)
    }
    const session = await getSession(c.req.raw, c.env.SESSION_SECRET)
    if (!session) {
      return html(renderAlbumStart())
    }
    try {
      const loaded = await loadAlbumSnapshot(c.env, session.discordId)
      return html(renderAlbumEditor(viewerOf(session), loaded.snapshot, loaded.fetchedAt))
    } catch (error) {
      if (error instanceof AlbumSnapshotError) {
        return html(renderAlbumUnavailable(error.message), error.status)
      }
      return html(renderAlbumUnavailable('Album snapshots are unavailable.'), 503)
    }
  })

  app.get('/api/v1/albums/snapshot', async (c) => {
    if (!oauthConfigured(c.env)) {
      return json({ error: 'UNAVAILABLE', message: 'Album snapshots are unavailable.' }, 503)
    }
    const session = await getSession(c.req.raw, c.env.SESSION_SECRET)
    if (!session) {
      return json({ error: 'UNAUTHORIZED', message: 'Sign in with Discord to load albums.' }, 401)
    }
    try {
      const loaded = await loadAlbumSnapshot(c.env, session.discordId)
      return json(loaded)
    } catch (error) {
      if (error instanceof AlbumSnapshotError) {
        return json({ error: 'UNAVAILABLE', message: error.message }, error.status)
      }
      return json({ error: 'UNAVAILABLE', message: 'Album snapshots are unavailable.' }, 503)
    }
  })

  app.post('/albums/refresh', async (c) => {
    if (!oauthConfigured(c.env)) {
      return json({ error: 'UNAVAILABLE', message: 'Album snapshots are unavailable.' }, 503)
    }
    const session = await getSession(c.req.raw, c.env.SESSION_SECRET)
    if (!session) {
      return json({ error: 'UNAUTHORIZED', message: 'Sign in with Discord to refresh albums.' }, 401)
    }
    try {
      const loaded = await refreshAlbumSnapshot(c.env, session.discordId)
      return json(loaded)
    } catch (error) {
      if (error instanceof AlbumRefreshLimited) {
        return json(
          { error: 'RATE_LIMITED', message: error.message, retryAfter: error.retryAfter },
          429,
          { 'retry-after': String(error.retryAfter) }
        )
      }
      if (error instanceof AlbumSnapshotError) {
        return json({ error: 'UNAVAILABLE', message: error.message }, error.status)
      }
      return json({ error: 'UNAVAILABLE', message: 'Album snapshots are unavailable.' }, 503)
    }
  })
}
