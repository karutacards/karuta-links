import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { resetBlacklistCache } from './draft-access'
import { REPORT_BANNED_MESSAGE } from './report-access'
import { createSessionCookie, newSession, parseCookies, NEXT_COOKIE } from './session'

vi.mock('./firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./firestore')>()
  return {
    ...actual,
    getFirestoreDocument: async () => ({ cardDropped: 1000 })
  }
})

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

async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))
  return await new Response(stream).arrayBuffer()
}

function reportDb(options: { banned?: boolean; recent?: number } = {}): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          statement.binds = args
          return statement
        },
        async first() {
          if (sql.includes('report_bans')) {
            return options.banned ? { discord_id: '1' } : null
          }
          if (sql.includes('COUNT(*)')) {
            return { count: options.recent ?? 0 }
          }
          return null
        },
        async run() {
          return { success: true, meta: { last_row_id: 3 } }
        }
      }
      return statement
    }
  } as unknown as D1Database
}

async function allowedEnv(overrides: Partial<Env> = {}): Promise<Env> {
  const bytes = await gzipJson([])
  return testEnv({
    KARUTA_DATA: {
      get: async () => ({ arrayBuffer: async () => bytes })
    } as unknown as R2Bucket,
    DB: reportDb(),
    FIRESTORE_PROJECT_ID: 'test-project',
    FIRESTORE_SERVICE_ACCOUNT: 'test-service-account',
    ...overrides
  })
}

afterEach(() => {
  resetBlacklistCache()
})

describe('report routes', () => {
  it('starts OAuth and returns to /report', async () => {
    const response = await app.request('http://127.0.0.1:8787/report', {}, testEnv())
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('property="og:title" content="Karuta report form"')
    expect(page).toContain(
      'property="og:description" content="Report cheating in Karuta. Share what happened and who or where we should look into. A false report is a permanent ban from this form."'
    )
    expect(page).toContain('href="/api/auth/discord?next=/report"')
    expect(page).toContain('0;url=/api/auth/discord?next=/report')

    const start = await app.request(
      'http://127.0.0.1:8787/api/auth/discord?next=/report',
      {},
      testEnv()
    )
    const nextCookie = start.headers.getSetCookie().find((cookie) => cookie.startsWith(`${NEXT_COOKIE}=`))
    expect(parseCookies(nextCookie ?? null)[NEXT_COOKIE]).toBe('/report')
  })

  it('serves the public embed thumbnail', async () => {
    const response = await app.request('http://127.0.0.1:8787/report-og.webp', {}, testEnv())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WEBP')
  })

  it('fails closed when access cannot be verified', async () => {
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      testEnv()
    )
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('Report access could not be verified.')
  })

  it('refuses a form-banned session', async () => {
    const bytes = await gzipJson([])
    const cookie = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      testEnv({
        KARUTA_DATA: {
          get: async () => ({ arrayBuffer: async () => bytes })
        } as unknown as R2Bucket,
        DB: reportDb({ banned: true })
      })
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toContain(REPORT_BANNED_MESSAGE)
  })

  it('renders the form for a player who meets a credential bar', async () => {
    const cookie = await createSessionCookie(newSession('1', 'player'), 'test-session-secret', false)
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      { headers: { Cookie: cookie.split(';')[0] ?? '' } },
      await allowedEnv()
    )
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Report a player')
    expect(body).toContain('Alting')
    expect(body).toContain('falsely reporting a player')
    expect(body).toContain('class="avatar"')
    expect(body).toContain('https://cdn.discordapp.com/embed/avatars/0.png')
  })

  it('rejects a submit with no target IDs', async () => {
    const cookie = await createSessionCookie(newSession('1', 'player'), 'test-session-secret', false)
    const body = new URLSearchParams({
      reason: 'alting',
      acknowledged: 'on'
    })
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      {
        method: 'POST',
        headers: {
          Cookie: cookie.split(';')[0] ?? '',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body
      },
      await allowedEnv()
    )
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Enter at least one user ID, server ID, or channel ID.')
  })

  it('stores a valid report and thanks the reporter', async () => {
    const cookie = await createSessionCookie(newSession('1', 'player'), 'test-session-secret', false)
    const body = new URLSearchParams({
      reason: 'scamming',
      user_ids: '135694375647838208',
      acknowledged: 'on',
      notes: 'Sold accounts.'
    })
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      {
        method: 'POST',
        headers: {
          Cookie: cookie.split(';')[0] ?? '',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body
      },
      await allowedEnv()
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Your report has been received.')
  })

  it('rate-limits an 11th report in one hour', async () => {
    const cookie = await createSessionCookie(newSession('1', 'player'), 'test-session-secret', false)
    const body = new URLSearchParams({
      reason: 'botting',
      server_ids: '135694375647838208',
      acknowledged: 'on'
    })
    const response = await app.request(
      'http://127.0.0.1:8787/report',
      {
        method: 'POST',
        headers: {
          Cookie: cookie.split(';')[0] ?? '',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body
      },
      await allowedEnv({ DB: reportDb({ recent: 10 }) })
    )
    expect(response.status).toBe(429)
    const page = await response.text()
    expect(page).toContain('You have submitted too many reports in a short timeframe.')
    expect(page).not.toContain('10 reports')
    expect(page).not.toContain('per hour')
    expect(page).not.toContain('Too many reports today.')
  })
})
