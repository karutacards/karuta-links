import { describe, expect, it } from 'vitest'
import { countRecentReports, insertReport, isReportBanned } from './report-store'
import type { ReportPayload } from './report-validate'

type Query = {
  sql: string
  binds: unknown[]
}

function mockDb(options: {
  banned?: boolean
  count?: number
  lastRowId?: number
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
          return null
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
  notes: 'Repeated snipes.',
  acknowledged: true
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
})
