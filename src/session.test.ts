import { describe, expect, it } from 'vitest'
import {
  createSessionCookie,
  getSession,
  newSession,
  parseCookies,
  presentSecret,
  safeDraftNext,
  signSession,
  verifySession
} from './session'

const SECRET = 'test-session-secret'

describe('session', () => {
  it('accepts only draft return paths', () => {
    expect(safeDraftNext('/drafts/import')).toBe('/drafts/import')
    expect(safeDraftNext('/drafts/12')).toBe('/drafts/12')
    expect(safeDraftNext('/report')).toBe('/report')
    expect(safeDraftNext('/albums')).toBe('/albums')
    expect(safeDraftNext('/drafts/01')).toBeNull()
    expect(safeDraftNext('/report/1')).toBeNull()
    expect(safeDraftNext('/')).toBeNull()
    expect(safeDraftNext('https://evil.example/')).toBeNull()
  })

  it('treats empty secrets as missing', () => {
    expect(presentSecret(undefined)).toBe(false)
    expect(presentSecret('')).toBe(false)
    expect(presentSecret('secret')).toBe(true)
  })

  it('signs and verifies a session that contains a dot in the username', async () => {
    const session = newSession('135694375647838208', 'bry.n')
    const signed = await signSession(session, SECRET)
    await expect(verifySession(signed, SECRET)).resolves.toEqual(session)
    expect(session.avatar).toBe('')
  })

  it('rejects a cookie from an earlier session generation', async () => {
    const payload = JSON.stringify({
      discordId: '1',
      username: 'tester',
      avatar: '',
      issuedAt: 1,
      sessionId: 'legacy'
    })
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const hex = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    await expect(verifySession(`${payload}.${hex}`, SECRET)).resolves.toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const signed = await signSession(newSession('1', 'tester'), SECRET)
    const lastDot = signed.lastIndexOf('.')
    const forged = `{"discordId":"2","username":"x","issuedAt":1,"sessionId":"x"}.${signed.slice(lastDot + 1)}`
    await expect(verifySession(forged, SECRET)).resolves.toBeNull()
  })

  it('reads a session from a signed cookie', async () => {
    const session = newSession('1', 'tester')
    const header = await createSessionCookie(session, SECRET, false)
    const request = new Request('http://127.0.0.1:8787/api/auth/me', {
      headers: { Cookie: header.split(';')[0] ?? '' }
    })
    await expect(getSession(request, SECRET)).resolves.toEqual(session)
  })

  it('returns no session without a secret', async () => {
    const request = new Request('http://127.0.0.1:8787/api/auth/me')
    await expect(getSession(request, undefined)).resolves.toBeNull()
  })

  it('decodes a URL-encoded cookie value', () => {
    expect(parseCookies('oauth_state=abc%2Fdef')['oauth_state']).toBe('abc/def')
  })
})
