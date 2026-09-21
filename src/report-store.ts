import { REPORT_REASONS, type ReportPayload, type ReportReason } from './report-validate'

export const REPORT_RATE_LIMIT = 10
export const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000

export type ReportRecord = {
  id: number
  createdAt: number
  reporterId: string
  reporterUsername: string
  reason: ReportPayload['reason']
  userIds: string[]
  serverIds: string[]
  channelIds: string[]
  cardCodes: string[]
  dyeCodes: string[]
  idolCodes: string[]
  offenseDates: string[]
  notes: string
}

export async function isReportBanned(db: D1Database, discordId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT discord_id FROM report_bans WHERE discord_id = ?')
    .bind(discordId)
    .first<{ discord_id: string }>()
  return Boolean(row)
}

export async function countRecentReports(
  db: D1Database,
  reporterId: string,
  since: number
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM reports WHERE reporter_id = ? AND created_at >= ?')
    .bind(reporterId, since)
    .first<{ count: number }>()
  return row?.count ?? 0
}

export async function insertReport(
  db: D1Database,
  input: {
    reporterId: string
    reporterUsername: string
    payload: ReportPayload
    createdAt?: number
  }
): Promise<ReportRecord> {
  const createdAt = input.createdAt ?? Date.now()
  const { payload } = input
  const result = await db
    .prepare(
      `INSERT INTO reports (
         created_at, reporter_id, reporter_username, reason,
         user_ids, server_ids, channel_ids,
         card_codes, dye_codes, idol_codes, offense_dates, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      createdAt,
      input.reporterId,
      input.reporterUsername,
      payload.reason,
      JSON.stringify(payload.userIds),
      JSON.stringify(payload.serverIds),
      JSON.stringify(payload.channelIds),
      JSON.stringify(payload.cardCodes),
      JSON.stringify(payload.dyeCodes),
      JSON.stringify(payload.idolCodes),
      JSON.stringify(payload.offenseDates),
      payload.notes
    )
    .run()
  const id = Number(result.meta.last_row_id)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error('Failed to insert a report.')
  }
  return {
    id,
    createdAt,
    reporterId: input.reporterId,
    reporterUsername: input.reporterUsername,
    reason: payload.reason,
    userIds: payload.userIds,
    serverIds: payload.serverIds,
    channelIds: payload.channelIds,
    cardCodes: payload.cardCodes,
    dyeCodes: payload.dyeCodes,
    idolCodes: payload.idolCodes,
    offenseDates: payload.offenseDates,
    notes: payload.notes
  }
}

export const REPORT_LIST_DEFAULT = 20
export const REPORT_LIST_MAX = 50

type ReportRow = {
  id: number
  created_at: number
  reporter_id: string
  reporter_username: string
  reason: string
  user_ids: string
  server_ids: string
  channel_ids: string
  card_codes: string
  dye_codes: string
  idol_codes: string
  offense_dates: string
  notes: string
}

const REPORT_SELECT = `SELECT id, created_at, reporter_id, reporter_username, reason,
         user_ids, server_ids, channel_ids,
         card_codes, dye_codes, idol_codes, offense_dates, notes
       FROM reports`

function parseStringArray(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value)
}

export function recordFromRow(row: ReportRow): ReportRecord | null {
  const id = Number(row.id)
  const createdAt = Number(row.created_at)
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(createdAt)) {
    return null
  }
  if (!isReportReason(row.reason)) {
    return null
  }
  const userIds = parseStringArray(row.user_ids)
  const serverIds = parseStringArray(row.server_ids)
  const channelIds = parseStringArray(row.channel_ids)
  const cardCodes = parseStringArray(row.card_codes)
  const dyeCodes = parseStringArray(row.dye_codes)
  const idolCodes = parseStringArray(row.idol_codes)
  const offenseDates = parseStringArray(row.offense_dates)
  if (
    !userIds ||
    !serverIds ||
    !channelIds ||
    !cardCodes ||
    !dyeCodes ||
    !idolCodes ||
    !offenseDates
  ) {
    return null
  }
  return {
    id,
    createdAt,
    reporterId: String(row.reporter_id),
    reporterUsername: String(row.reporter_username),
    reason: row.reason,
    userIds,
    serverIds,
    channelIds,
    cardCodes,
    dyeCodes,
    idolCodes,
    offenseDates,
    notes: String(row.notes ?? '')
  }
}

export async function getReport(db: D1Database, id: number): Promise<ReportRecord | null> {
  const row = await db
    .prepare(`${REPORT_SELECT} WHERE id = ?`)
    .bind(id)
    .first<ReportRow>()
  if (!row) {
    return null
  }
  return recordFromRow(row)
}

export async function listReports(
  db: D1Database,
  options: { after?: number; limit: number }
): Promise<ReportRecord[]> {
  const statement = options.after
    ? db.prepare(`${REPORT_SELECT} WHERE id < ? ORDER BY id DESC LIMIT ?`).bind(options.after, options.limit)
    : db.prepare(`${REPORT_SELECT} ORDER BY id DESC LIMIT ?`).bind(options.limit)
  const result = await statement.all<ReportRow>()
  const records: ReportRecord[] = []
  for (const row of result.results ?? []) {
    const record = recordFromRow(row)
    if (!record) {
      throw new Error('A stored report could not be read.')
    }
    records.push(record)
  }
  return records
}
