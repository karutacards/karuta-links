import type { ReportPayload } from './report-validate'

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
