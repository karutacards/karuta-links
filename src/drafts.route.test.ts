import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { app } from './app'
import { resetBlacklistCache } from './draft-access'
import { createDraft, mutateDraftEntity } from './draft-store'
import { registerDrafts } from './drafts'
import { draftsConfig } from './drafts-config'
import { sqliteD1 } from './sqlite-d1.testing'
import { createSessionCookie, newSession, parseCookies, NEXT_COOKIE } from './session'

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DRAFT_WRITE: { limit: async () => ({ success: true }) },
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    DISCORD_CLIENT_ID: 'test-client',
    DISCORD_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret',
    ...overrides
  }
}

afterEach(() => {
  resetBlacklistCache()
})

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(response.headers.get('x-frame-options')).toBe('DENY')
}

describe('draft routes', () => {
  it('starts OAuth and keeps a draft return path', async () => {
    const response = await app.request('http://127.0.0.1:8787/drafts/3', {}, testEnv())
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location') ?? '', 'http://127.0.0.1:8787')
    expect(location.pathname).toBe('/api/auth/discord')
    expect(location.searchParams.get('next')).toBe('/drafts/3')
  })

  it('stores only a safe draft next cookie when OAuth starts', async () => {
    const allowed = await app.request(
      'http://127.0.0.1:8787/api/auth/discord?next=/drafts/import',
      {},
      testEnv()
    )
    const nextCookie = allowed.headers.getSetCookie().find((cookie) => cookie.startsWith(`${NEXT_COOKIE}=`))
    expect(parseCookies(nextCookie ?? null)[NEXT_COOKIE]).toBe('/drafts/import')

    const rejected = await app.request(
      'http://127.0.0.1:8787/api/auth/discord?next=https://evil.example/',
      {},
      testEnv()
    )
    expect(rejected.headers.getSetCookie().some((cookie) => cookie.startsWith(`${NEXT_COOKIE}=`))).toBe(false)
  })

  it('requires a session for draft event polls', async () => {
    const response = await app.request('http://127.0.0.1:8787/api/v1/drafts/3/events?after=0', {}, testEnv())
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBeNull()
  })

  it('fails closed when a signed-in user cannot verify access', async () => {
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/drafts/3',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      testEnv()
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expectSecurityHeaders(response)
    expect(await response.text()).toContain('Draft access could not be verified.')
  })

  it('refuses a blacklisted session on the draft page', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify([
      { type: 'User', id: '1' }
    ]))
    const bytes = await new Response(
      new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer()
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/drafts/3',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      testEnv({
        KARUTA_DATA: {
          get: async () => ({ arrayBuffer: async () => bytes })
        } as unknown as R2Bucket
      })
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toContain('You do not have access to this draft.')
  })

  it('fails closed on draft events when access cannot be verified', async () => {
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/drafts/3/events?after=0',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      testEnv()
    )
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expectSecurityHeaders(response)
    expect(await response.json()).toMatchObject({ code: 'UNAVAILABLE' })
  })

  it('rate-limits draft writes', async () => {
    const encoded = new TextEncoder().encode(JSON.stringify([]))
    const bytes = await new Response(
      new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer()
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/drafts/3/entities',
      {
        method: 'PATCH',
        headers: {
          Cookie: cookie.split(';')[0] ?? '',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'series', action: 'add', name: 'Safe' })
      },
      testEnv({
        DRAFT_WRITE: { limit: async () => ({ success: false }) },
        KARUTA_DATA: {
          get: async () => ({ arrayBuffer: async () => bytes })
        } as unknown as R2Bucket
      })
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('10')
    expectSecurityHeaders(response)
    expect(await response.json()).toMatchObject({
      code: 'RATE_LIMITED',
      error: 'Too many draft actions. Wait a few seconds.'
    })
  })
})

async function emptyBlacklist(): Promise<R2Bucket> {
  const bytes = await new Response(
    new Blob([new TextEncoder().encode('[]')]).stream().pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer()
  return { get: async () => ({ arrayBuffer: async () => bytes }) } as unknown as R2Bucket
}

// A drafts app whose access gate lets everyone in, over a SQLite-backed D1.
async function openDraftsApp() {
  const drafts = new Hono<{ Bindings: Env }>()
  registerDrafts(drafts, { gate: async () => ({ ok: true }) })
  const { db } = sqliteD1()
  const adminId = draftsConfig.adminIds[0] ?? ''
  const cookie = await createSessionCookie(newSession(adminId, 'admin'), 'test-session-secret', false)
  const env = testEnv({ DB: db, KARUTA_DATA: await emptyBlacklist() })
  return { drafts, db, adminId, env, cookie: cookie.split(';')[0] ?? '' }
}

describe('draft routes over SQLite', () => {
  it('refuses an oversized import even without a Content-Length header', async () => {
    const { drafts, env, cookie } = await openDraftsApp()
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 20) {
          controller.close()
          return
        }
        sent += 1
        controller.enqueue(chunk)
      }
    })
    const response = await drafts.request('http://127.0.0.1:8787/api/v1/drafts', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body,
      duplex: 'half'
    } as RequestInit, env)
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'TOO_LARGE' })
  })

  it('restores by save id and no longer accepts an event id', async () => {
    const { drafts, db, adminId, env, cookie } = await openDraftsApp()
    const draft = await createDraft(db, { series: [{ name: 'Naruto' }] }, adminId, 'admin', 10)
    const saved = await mutateDraftEntity(db, draft.id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 1,
      name: 'Naruto Shippuden'
    }, adminId, 'admin', 20)
    await mutateDraftEntity(db, draft.id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 2,
      name: 'Boruto'
    }, adminId, 'admin', 30)
    const restore = (payload: unknown) => drafts.request(`http://127.0.0.1:8787/api/v1/drafts/${draft.id}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }, env)
    const byEvent = await restore({ eventId: saved.saveId })
    expect(byEvent.status).toBe(400)
    const bySave = await restore({ saveId: saved.saveId })
    expect(bySave.status).toBe(200)
    expect(await bySave.json()).toMatchObject({
      restored: true,
      series: [{ name: 'Naruto Shippuden', revision: 4 }]
    })
  })

  it('polls events without reading the draft entities', async () => {
    const { drafts, db, adminId, env, cookie } = await openDraftsApp()
    const draft = await createDraft(db, { series: [{ name: 'Naruto' }] }, adminId, 'admin', 10)
    const statements: string[] = []
    const recorded = testEnv({
      ...env,
      DB: {
        ...db,
        prepare(sql: string) {
          statements.push(sql)
          return db.prepare(sql)
        }
      } as unknown as D1Database
    })
    const get = (path: string) => drafts.request(`http://127.0.0.1:8787${path}`, {
      headers: { Cookie: cookie }
    }, recorded)
    const first = await get(`/api/v1/drafts/${draft.id}/events?after=0`)
    expect(first.status).toBe(200)
    const { after } = await first.json() as { after: number }
    statements.length = 0
    const poll = await get(`/api/v1/drafts/${draft.id}/events?after=${after}`)
    expect(poll.status).toBe(200)
    expect(await poll.json()).toMatchObject({ events: [], series: [], characters: [] })
    expect(statements.length).toBeGreaterThan(0)
    expect(statements.filter((sql) => /draft_entities|GROUP BY/.test(sql))).toEqual([])

    const full = await get(`/api/v1/drafts/${draft.id}`)
    expect(full.status).toBe(200)
    expect(await full.json()).toMatchObject({
      id: draft.id,
      canAdmin: true,
      series: [{ name: 'Naruto' }],
      characters: []
    })
  })
})
