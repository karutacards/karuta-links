import { afterEach, describe, expect, it } from 'vitest'
import { app } from './app'
import { resetBlacklistCache } from './draft-access'
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
    expect(await response.json()).toMatchObject({
      code: 'RATE_LIMITED',
      error: 'Too many draft actions. Wait a few seconds.'
    })
  })
})
