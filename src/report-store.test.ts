import { describe, expect, it } from 'vitest'
import {
  countRecentReports,
  getReport,
  insertReport,
  isReportBanned,
  listReports,
  recordFromRow
} from './report-store'
import type { ReportPayload } from './report-validate'

type Query = {
  sql: string
  binds: unknown[]
}

function mockDb(options: {
  banned?: boolean
  count?: number
  lastRowId?: number
  row?: Record<string, unknown> | null
  rows?: Record<string, unknown>[]
}): { db: D1Database; queries: Query[] } {
  const queries: Query[] = []
  const db = {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          statement.binds = args
          return statement
        },
        async first() {
          queries.push({ sql, binds: statement.binds })
          if (sql.includes('report_bans')) {
            return options.banned ? { discord_id: statement.binds[0] } : null
          }
          if (sql.includes('COUNT(*)')) {
            return { count: options.count ?? 0 }
          }
          if (sql.includes('FROM reports') && sql.includes('WHERE id =')) {
            return options.row ?? null
          }
          return null
        },
        async all() {
          queries.push({ sql, binds: statement.binds })
          return { results: options.rows ?? [] }
        },
        async run() {
          queries.push({ sql, binds: statement.binds })
          return { success: true, meta: { last_row_id: options.lastRowId ?? 4 } }
        }
      }
      return statement
    }
  }
  return { db: db as unknown as D1Database, queries }
}

const payload: ReportPayload = {
  reason: 'botting',
  userIds: ['135694375647838208'],
  serverIds: [],
  channelIds: [],
  cardCodes: ['Ab12C'],
  dyeCodes: [],
  idolCodes: [],
  offenseDates: ['2024-03-15'],
  notes: 'Repeated snipes.'
}

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

describe('report store', () => {
  it('detects a banned reporter', async () => {
    const banned = mockDb({ banned: true })
    await expect(isReportBanned(banned.db, '9')).resolves.toBe(true)
    const open = mockDb({ banned: false })
    await expect(isReportBanned(open.db, '9')).resolves.toBe(false)
  })

  it('counts recent reports for the rate limit', async () => {
    const { db, queries } = mockDb({ count: 3 })
    await expect(countRecentReports(db, '1', 10)).resolves.toBe(3)
    expect(queries[0]?.binds).toEqual(['1', 10])
  })

  it('inserts a report row as JSON arrays', async () => {
    const { db, queries } = mockDb({ lastRowId: 12 })
    const record = await insertReport(db, {
      reporterId: '1',
      reporterUsername: 'tester',
      payload,
      createdAt: 50
    })
    expect(record.id).toBe(12)
    expect(record.reason).toBe('botting')
    const insert = queries.find((query) => query.sql.includes('INSERT INTO reports'))
    expect(insert?.binds[4]).toBe('["135694375647838208"]')
    expect(insert?.binds[7]).toBe('["Ab12C"]')
  })

  it('maps a stored row and lists newest first', async () => {
    const record = recordFromRow(storedRow)
    expect(record).toEqual({
      id: 12,
      createdAt: 50,
      reporterId: '1',
      reporterUsername: 'tester',
      reason: 'botting',
      userIds: ['135694375647838208'],
      serverIds: [],
      channelIds: [],
      cardCodes: ['Ab12C'],
      dyeCodes: [],
      idolCodes: [],
      offenseDates: ['2024-03-15'],
      notes: 'Repeated snipes.'
    })
    const listed = mockDb({ rows: [storedRow] })
    const rows = await listReports(listed.db, { limit: 20 })
    expect(rows).toHaveLength(1)
    expect(listed.queries[0]?.binds).toEqual([20])
    const paged = mockDb({ rows: [storedRow] })
    await listReports(paged.db, { after: 40, limit: 10 })
    expect(paged.queries[0]?.binds).toEqual([40, 10])
  })

  it('reads one report by id', async () => {
    const { db, queries } = mockDb({ row: storedRow })
    await expect(getReport(db, 12)).resolves.toMatchObject({ id: 12, notes: 'Repeated snipes.' })
    expect(queries[0]?.binds).toEqual([12])
    const missing = mockDb({ row: null })
    await expect(getReport(missing.db, 99)).resolves.toBeNull()
  })

  it('rejects a corrupt stored row', () => {
    expect(recordFromRow({ ...storedRow, reason: 'nope' })).toBeNull()
    expect(recordFromRow({ ...storedRow, user_ids: 'not-json' })).toBeNull()
  })
})
