import { afterEach, describe, expect, it } from 'vitest'
import { app } from './app'
import { resetBlacklistCache } from './draft-access'
import { draftsConfig } from './drafts-config'
import { REPORT_BANNED_MESSAGE } from './report-access'
import { createSessionCookie, newSession, parseCookies, NEXT_COOKIE } from './session'

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
    ...overrides
  })
}

afterEach(() => {
  resetBlacklistCache()
})

describe('report routes', () => {
  it('starts OAuth and returns to /report', async () => {
    const response = await app.request('http://127.0.0.1:8787/report', {}, testEnv())
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location') ?? '', 'http://127.0.0.1:8787')
    expect(location.pathname).toBe('/api/auth/discord')
    expect(location.searchParams.get('next')).toBe('/report')

    const start = await app.request(location.toString(), {}, testEnv())
    const nextCookie = start.headers.getSetCookie().find((cookie) => cookie.startsWith(`${NEXT_COOKIE}=`))
    expect(parseCookies(nextCookie ?? null)[NEXT_COOKIE]).toBe('/report')
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

  it('renders the form for an allowed admin', async () => {
    const adminId = draftsConfig.adminIds[0] ?? '1'
    const cookie = await createSessionCookie(newSession(adminId, 'admin'), 'test-session-secret', false)
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
  })

  it('rejects a submit with no target IDs', async () => {
    const adminId = draftsConfig.adminIds[0] ?? '1'
    const cookie = await createSessionCookie(newSession(adminId, 'admin'), 'test-session-secret', false)
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
    const adminId = draftsConfig.adminIds[0] ?? '1'
    const cookie = await createSessionCookie(newSession(adminId, 'admin'), 'test-session-secret', false)
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
    expect(await response.text()).toContain('Your report was submitted.')
  })

  it('rate-limits a fourth report in 24 hours', async () => {
    const adminId = draftsConfig.adminIds[0] ?? '1'
    const cookie = await createSessionCookie(newSession(adminId, 'admin'), 'test-session-secret', false)
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
      await allowedEnv({ DB: reportDb({ recent: 3 }) })
    )
    expect(response.status).toBe(429)
    expect(await response.text()).toContain('You have submitted too many reports.')
  })
})
