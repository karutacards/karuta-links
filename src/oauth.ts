import type { Hono } from 'hono'
import { draftIdentityForEnv } from './draft-access'
import { renderDraftForbidden, renderDraftUnavailable } from './draft-html'
import {
  clearNextCookie,
  clearSessionCookie,
  clearStateCookie,
  createNextCookie,
  createSessionCookie,
  createStateCookie,
  getSession,
  isHttps,
  newSession,
  parseCookies,
  presentSecret,
  safeDraftNext,
  NEXT_COOKIE,
  STATE_COOKIE
} from './session'
import { parseDiscordAvatar } from './discord-avatar'

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const DISCORD_TOKEN_URL = 'https://discord.com/api/v10/oauth2/token'
const DISCORD_IDENTIFY_URL = 'https://discord.com/api/v10/users/@me'
const LOCAL_CALLBACK = 'http://127.0.0.1:8787/api/auth/callback'
const PRODUCTION_CALLBACK = 'https://krta.cc/api/auth/callback'

interface OAuthSecrets {
  DISCORD_CLIENT_ID: string
  DISCORD_CLIENT_SECRET: string
  SESSION_SECRET: string
}

export function oauthConfigured(env: Env): env is Env & OAuthSecrets {
  return (
    presentSecret(env.DISCORD_CLIENT_ID) &&
    presentSecret(env.DISCORD_CLIENT_SECRET) &&
    presentSecret(env.SESSION_SECRET)
  )
}

export function callbackRedirectUri(url: URL): string | null {
  if (url.hostname === 'krta.cc' && url.protocol === 'https:') {
    return PRODUCTION_CALLBACK
  }
  const localWrangler =
    url.protocol === 'http:' &&
    ((url.hostname === '127.0.0.1' && url.port === '8787') ||
      (url.hostname === 'localhost' && url.port === '8787') ||
      url.hostname === 'krta.cc')
  if (localWrangler) {
    return LOCAL_CALLBACK
  }
  return null
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      ...headers
    }
  })
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location })
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie)
  }
  return new Response(null, { status: 302, headers })
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state
  })
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCode(
  secrets: OAuthSecrets,
  code: string,
  redirectUri: string
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: secrets.DISCORD_CLIENT_ID,
    client_secret: secrets.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  })
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as { access_token?: unknown }
  return typeof payload.access_token === 'string' ? payload.access_token : null
}

async function identifyUser(
  accessToken: string
): Promise<{ id: string; username: string; avatar: string } | null> {
  const response = await fetch(DISCORD_IDENTIFY_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as { id?: unknown; username?: unknown; avatar?: unknown }
  if (typeof payload.id !== 'string' || typeof payload.username !== 'string') {
    return null
  }
  return { id: payload.id, username: payload.username, avatar: parseDiscordAvatar(payload.avatar) }
}

export function registerOAuth(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/auth/discord', (c) => {
    if (!oauthConfigured(c.env)) {
      return json({ error: 'Discord OAuth is not configured.' }, 503)
    }
    const url = new URL(c.req.url)
    const redirectUri = callbackRedirectUri(url)
    if (!redirectUri) {
      console.error(`OAUTH HOST :: ${url.origin}`)
      return json({ error: 'This host cannot start Discord OAuth.' }, 400)
    }
    const state = crypto.randomUUID()
    const https = isHttps(url)
    const next = safeDraftNext(url.searchParams.get('next'))
    const cookies = [createStateCookie(state, https)]
    if (next) {
      cookies.push(createNextCookie(next, https))
    }
    return redirect(authorizeUrl(c.env.DISCORD_CLIENT_ID, redirectUri, state), cookies)
  })

  app.get('/api/auth/callback', async (c) => {
    if (!oauthConfigured(c.env)) {
      return json({ error: 'Discord OAuth is not configured.' }, 503)
    }
    const url = new URL(c.req.url)
    const redirectUri = callbackRedirectUri(url)
    if (!redirectUri) {
      return json({ error: 'This host cannot start Discord OAuth.' }, 400)
    }
    if (url.searchParams.get('error')) {
      return json({ error: 'Discord did not complete authorization.' }, 401)
    }
    const code = url.searchParams.get('code')
    if (!code) {
      return json({ error: 'The authorization code is missing.' }, 400)
    }
    const https = isHttps(url)
    const cookies = parseCookies(c.req.header('Cookie') ?? null)
    const expectedState = cookies[STATE_COOKIE]
    const returnedState = url.searchParams.get('state')
    if (!expectedState || !returnedState || expectedState !== returnedState) {
      return json({ error: 'The OAuth state does not match.' }, 400)
    }
    const accessToken = await exchangeCode(c.env, code, redirectUri)
    if (!accessToken) {
      return json({ error: 'Discord did not complete authorization.' }, 401)
    }
    const user = await identifyUser(accessToken)
    if (!user) {
      return json({ error: 'Discord did not return a user.' }, 401)
    }
    const decision = await draftIdentityForEnv(c.env, user.id)
    if (!decision.ok) {
      const headers = new Headers({
        'content-type': 'text/html; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY'
      })
      headers.append('Set-Cookie', clearStateCookie(https))
      headers.append('Set-Cookie', clearNextCookie(https))
      return new Response(
        decision.status === 503 ? renderDraftUnavailable() : renderDraftForbidden(),
        { status: decision.status, headers }
      )
    }
    const sessionCookie = await createSessionCookie(
      newSession(user.id, user.username, user.avatar),
      c.env.SESSION_SECRET,
      https
    )
    const next = safeDraftNext(cookies[NEXT_COOKIE]) ?? '/'
    return redirect(next, [sessionCookie, clearStateCookie(https), clearNextCookie(https)])
  })

  app.get('/api/auth/me', async (c) => {
    const session = await getSession(c.req.raw, c.env.SESSION_SECRET)
    if (!session) {
      return json({ authenticated: false })
    }
    return json({
      authenticated: true,
      discordId: session.discordId,
      username: session.username
    })
  })

  app.post('/api/auth/logout', (c) => {
    const https = isHttps(new URL(c.req.url))
    return json({ authenticated: false }, 200, {
      'Set-Cookie': clearSessionCookie(https)
    })
  })
}
