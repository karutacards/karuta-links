export const SESSION_COOKIE = 'session'
export const STATE_COOKIE = 'oauth_state'
export const NEXT_COOKIE = 'oauth_next'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30
export const STATE_MAX_AGE = 300
export const NEXT_MAX_AGE = 600

export interface Session {
  discordId: string
  username: string
  issuedAt: number
  sessionId: string
}

export function presentSecret(value: string | undefined): value is string {
  return Boolean(value && value.length > 0)
}

export function isHttps(url: URL): boolean {
  return url.protocol === 'https:'
}

export function cookieFlags(https: boolean, maxAge: number): string {
  const secure = https ? 'Secure; ' : ''
  return `HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAge}; Path=/`
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {}
  }
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const trimmed = part.trim()
    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1) {
      return cookies
    }
    const key = trimmed.slice(0, equalIndex).trim()
    const value = trimmed.slice(equalIndex + 1).trim()
    try {
      cookies[key] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
    return cookies
  }, {})
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g)
  if (!pairs || pairs.join('').length !== hex.length) {
    return new Uint8Array()
  }
  return Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)))
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload = JSON.stringify(session)
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(payload)
  )
  return `${payload}.${bytesToHex(signature)}`
}

export async function verifySession(
  cookieValue: string,
  secret: string
): Promise<Session | null> {
  const lastDot = cookieValue.lastIndexOf('.')
  if (lastDot === -1) {
    return null
  }
  const payload = cookieValue.slice(0, lastDot)
  const signatureHex = cookieValue.slice(lastDot + 1)
  if (!payload || !signatureHex) {
    return null
  }
  const signature = hexToBytes(signatureHex)
  if (signature.length === 0) {
    return null
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(payload)
  )
  if (!valid) {
    return null
  }
  try {
    const parsed = JSON.parse(payload) as Session
    if (
      typeof parsed.discordId !== 'string' ||
      typeof parsed.username !== 'string' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.sessionId !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function createSessionCookie(
  session: Session,
  secret: string,
  https: boolean
): Promise<string> {
  const signed = await signSession(session, secret)
  return `${SESSION_COOKIE}=${encodeURIComponent(signed)}; ${cookieFlags(https, SESSION_MAX_AGE)}`
}

export function clearSessionCookie(https: boolean): string {
  return `${SESSION_COOKIE}=; ${cookieFlags(https, 0)}`
}

export function createStateCookie(state: string, https: boolean): string {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieFlags(https, STATE_MAX_AGE)}`
}

export function clearStateCookie(https: boolean): string {
  return `${STATE_COOKIE}=; ${cookieFlags(https, 0)}`
}

export function safeDraftNext(raw: string | null): string | null {
  if (!raw) {
    return null
  }
  if (raw === '/drafts/import') {
    return raw
  }
  if (/^\/drafts\/[1-9][0-9]*$/.test(raw)) {
    return raw
  }
  return null
}

export function createNextCookie(path: string, https: boolean): string {
  return `${NEXT_COOKIE}=${encodeURIComponent(path)}; ${cookieFlags(https, NEXT_MAX_AGE)}`
}

export function clearNextCookie(https: boolean): string {
  return `${NEXT_COOKIE}=; ${cookieFlags(https, 0)}`
}

export async function getSession(
  request: Request,
  secret: string | undefined
): Promise<Session | null> {
  if (!presentSecret(secret)) {
    return null
  }
  const value = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE]
  if (!value) {
    return null
  }
  return verifySession(value, secret)
}

export function newSession(discordId: string, username: string): Session {
  return {
    discordId,
    username,
    issuedAt: Date.now(),
    sessionId: crypto.randomUUID()
  }
}
