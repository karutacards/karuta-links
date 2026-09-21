import { describe, expect, it } from 'vitest'
import { app } from './app'

const storedRow = {
  id: 12,
  created_at: 50,
  reporter_id: '1',
  reporter_username: 'tester',
  reason: 'botting',
  user_ids: '["135694375647838208"]',
  server_ids: '[]',
  channel_ids: '[]',
  card_codes: '["Ab12C"]',
  dye_codes: '[]',
  idol_codes: '[]',
  offense_dates: '["2024-03-15"]',
  notes: 'Repeated snipes.'
}

function reviewDb(options: { row?: Record<string, unknown> | null; rows?: Record<string, unknown>[] } = {}): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          statement.binds = args
          return statement
        },
        async first() {
          if (sql.includes('FROM reports') && sql.includes('WHERE id =')) {
            return options.row === undefined ? storedRow : options.row
          }
          return null
        },
        async all() {
          return { results: options.rows ?? [storedRow] }
        }
      }
      return statement
    }
  } as unknown as D1Database
}

function reviewEnv(overrides: Partial<Env> = {}): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DRAFT_WRITE: { limit: async () => ({ success: true }) },
    REPORT_REVIEW: { limit: async () => ({ success: true }) },
    REPORT_REVIEW_TOKEN: 'test-review',
    DB: reviewDb(),
    IMAGES: {} as R2Bucket,
    ...overrides
  }
}

function auth(token = 'test-review'): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

describe('report review routes', () => {
  it('refuses a missing or ingest bearer', async () => {
    const missing = await app.request('http://127.0.0.1:8787/api/v1/reports', {}, reviewEnv())
    expect(missing.status).toBe(401)
    const ingest = await app.request(
      'http://127.0.0.1:8787/api/v1/reports',
      { headers: auth('test-ingest') },
      reviewEnv()
    )
    expect(ingest.status).toBe(401)
  })

  it('fails closed when the review secret is unset', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/reports',
      { headers: auth() },
      reviewEnv({ REPORT_REVIEW_TOKEN: undefined })
    )
    expect(response.status).toBe(503)
  })

  it('lists newest reports and returns the next cursor', async () => {
    const older = { ...storedRow, id: 11 }
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/reports?limit=2',
      { headers: auth() },
      reviewEnv({ DB: reviewDb({ rows: [storedRow, older] }) })
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { reports: { id: number }[]; after?: number }
    expect(body.reports.map((row) => row.id)).toEqual([12, 11])
    expect(body.after).toBe(11)
    expect(body.reports[0]).toMatchObject({
      reporterUsername: 'tester',
      notes: 'Repeated snipes.',
      userIds: ['135694375647838208']
    })
  })

  it('reads one report by id', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/reports/12',
      { headers: auth() },
      reviewEnv()
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 12, reason: 'botting' })
  })

  it('returns 404 for a missing report', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/reports/99',
      { headers: auth() },
      reviewEnv({ DB: reviewDb({ row: null }) })
    )
    expect(response.status).toBe(404)
  })

  it('rate-limits review reads', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/reports',
      { headers: auth() },
      reviewEnv({ REPORT_REVIEW: { limit: async () => ({ success: false }) } })
    )
    expect(response.status).toBe(429)
  })
})
