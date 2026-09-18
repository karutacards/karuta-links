import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { callbackRedirectUri } from './oauth'
import { parseCookies, NEXT_COOKIE, SESSION_COOKIE, STATE_COOKIE } from './session'

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    DISCORD_CLIENT_ID: 'test-client',
    DISCORD_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret',
    ...overrides
  }
}

function firstCookie(response: Response, name: string): string | undefined {
  const match = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`))
  return match?.split(';')[0]
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('oauth', () => {
  it('returns 503 when Discord secrets are missing', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/auth/discord',
      {},
      testEnv({
        DISCORD_CLIENT_ID: '',
        DISCORD_CLIENT_SECRET: '',
        SESSION_SECRET: ''
      })
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Discord OAuth is not configured.'
    })
  })

  it('maps wrangler local http://krta.cc to the 127.0.0.1 callback', () => {
    expect(callbackRedirectUri(new URL('http://127.0.0.1:8787/api/auth/discord'))).toBe(
      'http://127.0.0.1:8787/api/auth/callback'
    )
    expect(callbackRedirectUri(new URL('http://krta.cc/api/auth/discord'))).toBe(
      'http://127.0.0.1:8787/api/auth/callback'
    )
    expect(callbackRedirectUri(new URL('https://krta.cc/api/auth/discord'))).toBe(
      'https://krta.cc/api/auth/callback'
    )
    expect(callbackRedirectUri(new URL('https://karuta-links.example.workers.dev/api/auth/discord'))).toBeNull()
  })

  it('uses the local callback when wrangler presents http://krta.cc', async () => {
    const response = await app.request('http://krta.cc/api/auth/discord', {}, testEnv())
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location') ?? '')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:8787/api/auth/callback'
    )
  })

  it('rejects a host that is not in the redirect allowlist', async () => {
    const response = await app.request(
      'https://karuta-links.example.workers.dev/api/auth/discord',
      {},
      testEnv()
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'This host cannot start Discord OAuth.'
    })
  })

  it('redirects to Discord with identify and a state cookie', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/auth/discord',
      {},
      testEnv()
    )
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location') ?? '')
    expect(location.origin + location.pathname).toBe('https://discord.com/oauth2/authorize')
    expect(location.searchParams.get('client_id')).toBe('test-client')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:8787/api/auth/callback'
    )
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('scope')).toBe('identify')
    expect(location.searchParams.get('state')).toBeTruthy()
    const stateCookie = firstCookie(response, STATE_COOKIE)
    expect(stateCookie).toBeTruthy()
    expect(parseCookies(stateCookie ?? null)[STATE_COOKIE]).toBe(
      location.searchParams.get('state')
    )
  })

  it('rejects a callback whose state does not match', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/auth/callback?code=abc&state=other',
      { headers: { Cookie: 'oauth_state=expected' } },
      testEnv()
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'The OAuth state does not match.'
    })
  })

  it('sets a session cookie after Discord identify and reports it on /me', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '135694375647838208', username: 'tester' }), {
          status: 200
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const start = await app.request(
      'http://127.0.0.1:8787/api/auth/discord',
      {},
      testEnv()
    )
    const state = parseCookies(firstCookie(start, STATE_COOKIE) ?? null)[STATE_COOKIE]
    const callback = await app.request(
      `http://127.0.0.1:8787/api/auth/callback?code=oauth-code&state=${state}`,
      { headers: { Cookie: firstCookie(start, STATE_COOKIE) ?? '' } },
      testEnv()
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get('Location')).toBe('/')
    const sessionPair = firstCookie(callback, SESSION_COOKIE)
    expect(sessionPair).toBeTruthy()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const tokenCall = fetchMock.mock.calls[0]
    expect(tokenCall?.[0]).toBe('https://discord.com/api/v10/oauth2/token')
    expect(String(tokenCall?.[1]?.body)).toContain('code=oauth-code')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://discord.com/api/v10/users/@me')

    const me = await app.request(
      'http://127.0.0.1:8787/api/auth/me',
      { headers: { Cookie: sessionPair ?? '' } },
      testEnv()
    )
    await expect(me.json()).resolves.toEqual({
      authenticated: true,
      discordId: '135694375647838208',
      username: 'tester'
    })
  })

  it('returns to a draft path after identify when oauth_next is set', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: '135694375647838208', username: 'tester' }), {
          status: 200
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const start = await app.request(
      'http://127.0.0.1:8787/api/auth/discord?next=/drafts/import',
      {},
      testEnv()
    )
    const state = parseCookies(firstCookie(start, STATE_COOKIE) ?? null)[STATE_COOKIE]
    const next = firstCookie(start, NEXT_COOKIE)
    const callback = await app.request(
      `http://127.0.0.1:8787/api/auth/callback?code=oauth-code&state=${state}`,
      { headers: { Cookie: `${firstCookie(start, STATE_COOKIE) ?? ''}; ${next ?? ''}` } },
      testEnv()
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get('Location')).toBe('/drafts/import')
  })

  it('reports an unauthenticated session', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/auth/me',
      {},
      testEnv()
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ authenticated: false })
  })

  it('clears the session cookie on logout', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/auth/logout',
      { method: 'POST' },
      testEnv()
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ authenticated: false })
    const cleared = response.headers.getSetCookie().find((cookie) => cookie.startsWith('session='))
    expect(cleared).toMatch(/Max-Age=0/)
  })
})
