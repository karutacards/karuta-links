import { draftKey, parseDraftCatalog } from './draft-catalog'
import { assertDraftFontText } from './draft-glyphs'
import { discordAvatarUrl, parseDiscordAvatar } from './discord-avatar'
import { sortDraftEntities } from './draft-sort'
import { actorName, draftAuditSentence, draftAuditSpans } from './draft-audit'
import {
  catalogsMatch,
  isSaveAuditAction,
  replayDraftAudit,
  restoreIdentityFromCatalog,
  type DraftRestoreCharacter,
  type DraftRestoreSeries
} from './draft-restore'
import { applyDraftMutation, type DraftMutation } from './draft-mutation'
import { parseDraftAccessOverride, type DraftAccessOverride } from './drafts-config'
import { allocateId } from './db'
import {
  DRAFT_SECTION,
  DRAFT_SAVES_SECTION,
  DraftError,
  type DraftAuditEvent,
  type DraftAuditRow,
  type DraftCharacter,
  type DraftEntity,
  type DraftAuditSubject,
  type DraftEntityType,
  type DraftEventsSnapshot,
  type DraftPresence,
  type DraftRecord,
  type DraftReview,
  type DraftReviewDecision,
  type DraftSeries
} from './draft-types'

export const PRESENCE_STALE_MS = 10_000

export const MAX_DRAFT_DESCRIPTION = 1_000

// A client may keep adding to its own save for this long after that save's last event.
// After that, or for anyone else's save, the write starts a new save.
export const SAVE_REUSE_WINDOW_MS = 5 * 60_000

// Rows are written in chunks of JSON passed as one bound value, so a large import or
// restore is a few dozen statements instead of one statement per row. A chunk stays well
// under D1's 2 MB value limit even when every character is a three-byte glyph.
const CHUNK_MAX_CHARS = 400_000
const CHUNK_MAX_ROWS = 500

// SQL condition, with one bound draft id, that holds while the draft is unlocked.
const DRAFT_UNLOCKED = `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND locked_at IS NULL)`

type SqlGuard = { sql: string; binds: unknown[] }

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

function changesOf(outcome: unknown): number | undefined {
  const meta = (outcome as { meta?: { changes?: unknown } } | undefined)?.meta
  return typeof meta?.changes === 'number' ? meta.changes : undefined
}

type DraftRow = {
  id: number
  created_at: number
  updated_at: number
  locked_at: number | null
  locked_by: string | null
  hidden_at: number | null
  access_config: string | null
  description: string | null
}

type EntityRow = {
  entity_type: string
  entity_key: string
  name: string
  series_key: string | null
  aliases: string
  import_action: string | null
  base_aliases: string | null
  revision: number
  last_editor_id: string | null
  last_editor_name: string | null
}

type AuditDbRow = {
  id: number
  entity_type: string
  entity_key: string
  action: string
  before_json: string | null
  after_json: string | null
  discord_id: string
  username: string
  created_at: number
  save_id: number | null
}

type PresenceDbRow = {
  discord_id: string
  username: string
  avatar?: string
}

type ReviewDbRow = {
  discord_id: string
  username: string
  decision: string
}

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

type EntityTimeRow = {
  entity_type: string
  entity_key: string
  added_at: number
  last_edited_at: number
}

async function loadEntityTimes(
  db: D1Database,
  draftId: number
): Promise<Map<string, { addedAt: number; lastEditedAt: number }>> {
  const result = await db.prepare(
    `SELECT entity_type, entity_key,
            MIN(created_at) AS added_at,
            MAX(created_at) AS last_edited_at
     FROM draft_audit
     WHERE draft_id = ?
       AND entity_type IN ('series', 'character')
       AND action IN ('add', 'update', 'delete', 'import')
     GROUP BY entity_type, entity_key`
  ).bind(draftId).all<EntityTimeRow>()
  const times = new Map<string, { addedAt: number; lastEditedAt: number }>()
  for (const row of result.results ?? []) {
    times.set(`${row.entity_type}\0${row.entity_key}`, {
      addedAt: row.added_at,
      lastEditedAt: row.last_edited_at
    })
  }
  return times
}

function stampEntity(
  entity: DraftEntity,
  times: Map<string, { addedAt: number; lastEditedAt: number }>
): DraftEntity {
  const stamp = times.get(`${entity.type}\0${entity.key}`)
  return {
    ...entity,
    addedAt: stamp?.addedAt ?? entity.addedAt ?? 0,
    lastEditedAt: stamp?.lastEditedAt ?? entity.lastEditedAt ?? 0
  }
}

function rowToEntity(row: EntityRow): DraftEntity {
  const aliases = parseAliases(row.aliases)
  const shared = {
    key: row.entity_key,
    name: row.name,
    aliases,
    importAction: row.import_action === 'update' ? 'update' as const : 'add' as const,
    baseAliases: parseAliases(row.base_aliases ?? '[]'),
    revision: row.revision,
    lastEditorId: row.last_editor_id,
    lastEditorName: row.last_editor_name
  }
  return row.entity_type === 'character'
    ? { type: 'character', seriesKey: row.series_key ?? '', ...shared }
    : { type: 'series', ...shared }
}

function seriesNameMap(series: readonly { key: string; name: string }[]): Map<string, string> {
  return new Map(series.map((item) => [item.key, item.name]))
}

function entityPayload(
  entity: DraftEntity,
  series: readonly { key: string; name: string }[] = []
): string {
  if (entity.type === 'series') {
    return JSON.stringify({
      type: entity.type,
      key: entity.key,
      name: entity.name,
      aliases: entity.aliases,
      importAction: entity.importAction,
      baseAliases: entity.baseAliases
    })
  }
  const names = seriesNameMap(series)
  return JSON.stringify({
    type: entity.type,
    key: entity.key,
    name: entity.name,
    seriesKey: entity.seriesKey,
    seriesName: names.get(entity.seriesKey) ?? '',
    aliases: entity.aliases,
    importAction: entity.importAction,
    baseAliases: entity.baseAliases
  })
}

function jsonChunks<T>(rows: readonly T[], encode: (row: T) => unknown): string[] {
  const chunks: string[] = []
  let current: string[] = []
  let size = 0
  for (const row of rows) {
    const item = JSON.stringify(encode(row))
    if (current.length && (current.length >= CHUNK_MAX_ROWS || size + item.length > CHUNK_MAX_CHARS)) {
      chunks.push(`[${current.join(',')}]`)
      current = []
      size = 0
    }
    current.push(item)
    size += item.length + 1
  }
  if (current.length) chunks.push(`[${current.join(',')}]`)
  return chunks
}

// Inserts whole entity rows from JSON chunks. With a guard, each chunk writes only while
// the guard holds, so a batch whose guard fails writes nothing.
function insertEntityStatements(
  db: D1Database,
  draftId: number,
  rows: readonly { entity: DraftEntity | DraftRestoreSeries | DraftRestoreCharacter; revision: number }[],
  editorId: string,
  editorName: string,
  guard: SqlGuard | null = null
): D1PreparedStatement[] {
  const chunks = jsonChunks(rows, ({ entity, revision }) => ({
    type: entity.type,
    key: entity.key,
    name: entity.name,
    seriesKey: entity.type === 'character' ? entity.seriesKey : null,
    aliases: JSON.stringify(entity.aliases),
    importAction: entity.importAction,
    baseAliases: JSON.stringify(entity.baseAliases),
    revision
  }))
  return chunks.map((chunk) => db.prepare(
    `INSERT INTO draft_entities
     (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
      base_aliases, revision, last_editor_id, last_editor_name)
     SELECT ?, json_extract(value, '$.type'), json_extract(value, '$.key'),
            json_extract(value, '$.name'), json_extract(value, '$.seriesKey'),
            json_extract(value, '$.aliases'), json_extract(value, '$.importAction'),
            json_extract(value, '$.baseAliases'), json_extract(value, '$.revision'), ?, ?
     FROM json_each(?)
     ${guard ? `WHERE ${guard.sql}` : ''}
     ORDER BY key`
  ).bind(draftId, editorId, editorName, chunk, ...(guard?.binds ?? [])))
}

function importAuditStatements(
  db: D1Database,
  draftId: number,
  entities: readonly DraftEntity[],
  series: readonly { key: string; name: string }[],
  editorId: string,
  editorName: string,
  now: number
): D1PreparedStatement[] {
  const chunks = jsonChunks(entities, (entity) => ({
    type: entity.type,
    key: entity.key,
    payload: entityPayload(entity, series)
  }))
  return chunks.map((chunk) => db.prepare(
    `INSERT INTO draft_audit
     (draft_id, entity_type, entity_key, action, before_json, after_json,
      discord_id, username, created_at)
     SELECT ?, json_extract(value, '$.type'), json_extract(value, '$.key'), 'import',
            NULL, json_extract(value, '$.payload'), ?, ?, ?
     FROM json_each(?)
     ORDER BY key`
  ).bind(draftId, editorId, editorName, now, chunk))
}


function parseStoredAccessOverride(raw: string | null | undefined): DraftAccessOverride | null {
  if (!raw) return null
  try {
    return parseDraftAccessOverride(JSON.parse(raw) as unknown)
  } catch {
    throw new DraftError('UNAVAILABLE', 'Draft access could not be verified.', 503)
  }
}

async function getDraftRow(db: D1Database, id: number): Promise<DraftRow | null> {
  return db.prepare(
    `SELECT id, created_at, updated_at, locked_at, locked_by, hidden_at, access_config, description
     FROM drafts WHERE id = ?`
  ).bind(id).first<DraftRow>()
}

async function getEntityRow(
  db: D1Database,
  draftId: number,
  type: DraftEntityType,
  key: string
): Promise<EntityRow | null> {
  return db.prepare(
    `SELECT entity_type, entity_key, name, series_key, aliases, import_action,
            base_aliases, revision, last_editor_id, last_editor_name
     FROM draft_entities
     WHERE draft_id = ? AND entity_type = ? AND entity_key = ?`
  ).bind(draftId, type, key).first<EntityRow>()
}

function assertUnlocked(row: DraftRow): void {
  if (row.locked_at) {
    throw new DraftError('LOCKED', 'This draft is locked.', 423)
  }
}

function auditSubject(value: string): DraftAuditSubject {
  if (value === 'character' || value === 'draft') return value
  return 'series'
}

function toAuditRow(row: AuditDbRow): DraftAuditRow {
  return {
    id: row.id,
    entityType: auditSubject(row.entity_type),
    entityKey: row.entity_key,
    action: row.action,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    discordId: row.discord_id,
    username: row.username,
    createdAt: row.created_at,
    saveId: row.save_id ?? null
  }
}

// A client may name the save it is adding to. The write joins that save only when every
// event in it is this editor's and its last event is recent. Otherwise it starts a new
// save, so nobody can stretch someone else's save, or an old one, over their own edits.
async function resolveSaveId(
  db: D1Database,
  draftId: number,
  requested: number | null,
  editorId: string,
  now: number
): Promise<number> {
  if (requested == null) return allocateId(db, DRAFT_SAVES_SECTION)
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new DraftError('INVALID_INPUT', 'Save id must be a positive integer.', 400)
  }
  const row = await db.prepare(
    `SELECT COUNT(*) AS events,
            SUM(CASE WHEN discord_id = ? THEN 0 ELSE 1 END) AS others,
            MAX(created_at) AS last_at
     FROM draft_audit
     WHERE draft_id = ? AND save_id = ?`
  ).bind(editorId, draftId, requested).first<{
    events: number | null
    others: number | null
    last_at: number | null
  }>()
  const reusable = Boolean(row?.events)
    && !row?.others
    && row?.last_at != null
    && now - row.last_at <= SAVE_REUSE_WINDOW_MS
  return reusable ? requested : allocateId(db, DRAFT_SAVES_SECTION)
}

function toAuditEvent(
  row: AuditDbRow,
  series: readonly { key: string; name: string }[] = []
): DraftAuditEvent {
  const entry = toAuditRow(row)
  return {
    ...entry,
    summary: draftAuditSentence(entry, series),
    actor: actorName(entry.username),
    spans: draftAuditSpans(entry, series)
  }
}

export async function createDraft(
  db: D1Database,
  catalog: unknown,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const parsed = parseDraftCatalog(catalog)
  const id = await allocateId(db, DRAFT_SECTION)
  const series: DraftSeries[] = parsed.series.map((item) => {
    const importAction = item.action ?? 'add'
    const aliases = item.aliases ?? []
    return {
      type: 'series',
      key: item.key,
      name: item.name,
      aliases,
      importAction,
      baseAliases: importAction === 'update' ? aliases : [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
  })
  const characters: DraftCharacter[] = parsed.characters.map((item) => {
    const importAction = item.action ?? 'add'
    const aliases = item.aliases ?? []
    return {
      type: 'character',
      key: item.key,
      name: item.name,
      seriesKey: item.seriesKey,
      aliases,
      importAction,
      baseAliases: importAction === 'update' ? aliases : [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
  })
  const rows = (entities: readonly DraftEntity[]) => entities.map((entity) => ({ entity, revision: 1 }))
  await db.batch([
    db.prepare(
      `INSERT INTO drafts (id, created_at, updated_at, locked_at, locked_by)
       VALUES (?, ?, ?, NULL, NULL)`
    ).bind(id, now, now),
    ...insertEntityStatements(db, id, rows(series), editorId, editorName),
    ...importAuditStatements(db, id, series, parsed.series, editorId, editorName, now),
    ...insertEntityStatements(db, id, rows(characters), editorId, editorName),
    ...importAuditStatements(db, id, characters, parsed.series, editorId, editorName, now)
  ])
  const created = await getDraft(db, id)
  if (!created) {
    throw new Error('Failed to read the created draft.')
  }
  return created
}

export async function getDraft(db: D1Database, id: number): Promise<DraftRecord | null> {
  const row = await getDraftRow(db, id)
  if (!row) {
    return null
  }
  const result = await db.prepare(
    `SELECT entity_type, entity_key, name, series_key, aliases, import_action,
            base_aliases, revision, last_editor_id, last_editor_name
     FROM draft_entities
     WHERE draft_id = ?
     ORDER BY entity_type, entity_key`
  ).bind(id).all<EntityRow>()
  const times = await loadEntityTimes(db, id)
  const series: DraftSeries[] = []
  const characters: DraftCharacter[] = []
  for (const entityRow of result.results ?? []) {
    const entity = stampEntity(rowToEntity(entityRow), times)
    if (entity.type === 'series') {
      series.push(entity)
    } else {
      characters.push(entity)
    }
  }
  series.splice(0, series.length, ...sortDraftEntities(series, 'added'))
  characters.splice(0, characters.length, ...sortDraftEntities(characters, 'added'))
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    hiddenAt: row.hidden_at ?? null,
    accessOverride: parseStoredAccessOverride(row.access_config),
    description: row.description ?? '',
    series,
    characters
  }
}

export async function listEntityAudit(
  db: D1Database,
  draftId: number,
  type: DraftEntityType,
  key: string
): Promise<DraftAuditRow[]> {
  const result = await db.prepare(
    `SELECT id, entity_type, entity_key, action, before_json, after_json,
            discord_id, username, created_at, save_id
     FROM draft_audit
     WHERE draft_id = ? AND entity_type = ? AND entity_key = ?
     ORDER BY created_at DESC, id DESC`
  ).bind(draftId, type, key).all<AuditDbRow>()
  return (result.results ?? []).map(toAuditRow)
}

export async function listDraftEvents(
  db: D1Database,
  draftId: number,
  after: number,
  series: readonly { key: string; name: string }[] = []
): Promise<DraftAuditEvent[]> {
  const cursor = Number.isSafeInteger(after) && after > 0 ? after : 0
  const result = await db.prepare(
    `SELECT id, entity_type, entity_key, action, before_json, after_json,
            discord_id, username, created_at, save_id
     FROM draft_audit
     WHERE draft_id = ? AND id > ?
     ORDER BY id ASC`
  ).bind(draftId, cursor).all<AuditDbRow>()
  return (result.results ?? []).map((row) => toAuditEvent(row, series))
}

export async function touchDraftPresence(
  db: D1Database,
  draftId: number,
  discordId: string,
  username: string,
  now = Date.now(),
  avatar = ''
): Promise<DraftPresence[]> {
  const staleBefore = now - PRESENCE_STALE_MS
  const hash = parseDiscordAvatar(avatar)
  await db.batch([
    db.prepare(
      `INSERT INTO draft_presence (draft_id, discord_id, username, avatar, last_seen)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(draft_id, discord_id)
       DO UPDATE SET username = excluded.username, last_seen = excluded.last_seen,
         avatar = CASE WHEN excluded.avatar = '' THEN draft_presence.avatar ELSE excluded.avatar END`
    ).bind(draftId, discordId, username, hash, now),
    db.prepare(
      `DELETE FROM draft_presence WHERE draft_id = ? AND last_seen < ?`
    ).bind(draftId, staleBefore)
  ])
  const result = await db.prepare(
    `SELECT discord_id, username, avatar
     FROM draft_presence
     WHERE draft_id = ? AND last_seen >= ?
     ORDER BY username COLLATE NOCASE, discord_id`
  ).bind(draftId, staleBefore).all<PresenceDbRow>()
  return (result.results ?? []).map((row) => ({
    discordId: row.discord_id,
    username: row.username,
    avatarUrl: discordAvatarUrl(row.discord_id, row.avatar ?? '')
  }))
}

function toDraftReview(row: ReviewDbRow): DraftReview | null {
  if (row.decision !== 'approve' && row.decision !== 'reject') return null
  return {
    discordId: row.discord_id,
    username: row.username,
    decision: row.decision
  }
}

export async function listDraftReviews(
  db: D1Database,
  draftId: number
): Promise<DraftReview[]> {
  const result = await db.prepare(
    `SELECT discord_id, username, decision
     FROM draft_reviews
     WHERE draft_id = ?
     ORDER BY username COLLATE NOCASE, discord_id`
  ).bind(draftId).all<ReviewDbRow>()
  return (result.results ?? []).flatMap((row) => {
    const review = toDraftReview(row)
    return review ? [review] : []
  })
}

export async function setDraftReview(
  db: D1Database,
  draftId: number,
  editorId: string,
  editorName: string,
  decision: DraftReviewDecision | null,
  now = Date.now()
): Promise<DraftReview[]> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  const notLocked = () => new DraftError('LOCKED', 'Lock this draft before reviewing it.', 409)
  if (!draft.locked_at) {
    throw notLocked()
  }
  // The lock condition sits in the write itself, so an unlock that lands after the read
  // above cannot leave a review on an unlocked draft.
  const locked = `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND locked_at IS NOT NULL)`
  const outcome = decision === null
    ? await db.prepare(
      `DELETE FROM draft_reviews WHERE draft_id = ? AND discord_id = ? AND ${locked}`
    ).bind(draftId, editorId, draftId).run()
    : await db.prepare(
      `INSERT INTO draft_reviews (draft_id, discord_id, username, decision, updated_at)
       SELECT ?, ?, ?, ?, ? WHERE ${locked}
       ON CONFLICT(draft_id, discord_id)
       DO UPDATE SET username = excluded.username, decision = excluded.decision,
                     updated_at = excluded.updated_at`
    ).bind(draftId, editorId, editorName, decision, now, draftId).run()
  if (changesOf(outcome) === 0) {
    const latest = await getDraftRow(db, draftId)
    if (!latest) {
      throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
    }
    if (!latest.locked_at) {
      throw notLocked()
    }
  }
  return listDraftReviews(db, draftId)
}

export async function pollDraftEvents(
  db: D1Database,
  draftId: number,
  after: number,
  editorId: string,
  editorName: string,
  now = Date.now(),
  editorAvatar = ''
): Promise<DraftEventsSnapshot> {
  const row = await getDraftRow(db, draftId)
  if (!row) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  let events = await listDraftEvents(db, draftId, after)
  const needsCatalog = events.some((entry) => (
    entry.entityType === 'series' || entry.entityType === 'character'
  ))
  let series: DraftSeries[] = []
  let characters: DraftCharacter[] = []
  if (needsCatalog) {
    const draft = await getDraft(db, draftId)
    if (!draft) {
      throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
    }
    series = draft.series
    characters = draft.characters
    events = await listDraftEvents(db, draftId, after, draft.series)
  }
  const presence = await touchDraftPresence(db, draftId, editorId, editorName, now, editorAvatar)
  const reviews = row.locked_at ? await listDraftReviews(db, draftId) : []
  const lastId = events.at(-1)?.id
  return {
    after: lastId ?? (Number.isSafeInteger(after) && after > 0 ? after : 0),
    events,
    series,
    characters,
    presence,
    reviews,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    hiddenAt: row.hidden_at ?? null,
    description: row.description ?? ''
  }
}

async function listUsedEntityKeys(
  db: D1Database,
  draftId: number,
  type: DraftEntityType
): Promise<Set<string>> {
  const live = await db.prepare(
    `SELECT entity_key FROM draft_entities
     WHERE draft_id = ? AND entity_type = ?`
  ).bind(draftId, type).all<{ entity_key: string }>()
  const past = await db.prepare(
    `SELECT DISTINCT entity_key FROM draft_audit
     WHERE draft_id = ? AND entity_type = ? AND entity_key != ''`
  ).bind(draftId, type).all<{ entity_key: string }>()
  const keys = new Set<string>()
  for (const row of live.results ?? []) keys.add(row.entity_key)
  for (const row of past.results ?? []) keys.add(row.entity_key)
  return keys
}

export async function mutateDraftEntity(
  db: D1Database,
  draftId: number,
  mutation: DraftMutation,
  editorId: string,
  editorName: string,
  now = Date.now(),
  saveId: number | null = null
): Promise<{ entity: DraftEntity | null; saveId: number; adoptedSeries?: DraftSeries }> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  assertUnlocked(draft)
  // An added key follows the import rule, so `Naruto Shippuden` and `naruto-shippuden`
  // name the same row. Update and delete name a stored key exactly.
  const rawKey = mutation.key?.trim() ?? ''
  const key = mutation.action === 'add' && rawKey ? draftKey(rawKey) : rawKey
  if (mutation.action !== 'add' && !key) {
    throw new DraftError('INVALID_INPUT', 'Key is required.', 400)
  }
  const currentRow = key
    ? await getEntityRow(db, draftId, mutation.type, key)
    : null
  const current = currentRow ? rowToEntity(currentRow) : null
  const usedKeys = await listUsedEntityKeys(db, draftId, mutation.type)
  const reservedSeriesKeys = mutation.type === 'character'
    ? await listUsedEntityKeys(db, draftId, 'series')
    : new Set<string>()
  const seriesRows = mutation.type === 'character'
    ? await db.prepare(
      `SELECT entity_key, name FROM draft_entities
       WHERE draft_id = ? AND entity_type = 'series'`
    ).bind(draftId).all<{ entity_key: string; name: string }>()
    : { results: [] as { entity_key: string; name: string }[] }
  const draftSeries = (seriesRows.results ?? []).map((row) => ({
    key: row.entity_key,
    name: row.name
  }))
  const characterRows = mutation.type === 'character'
    ? await db.prepare(
      `SELECT entity_key, name, series_key FROM draft_entities
       WHERE draft_id = ? AND entity_type = 'character'`
    ).bind(draftId).all<{ entity_key: string; name: string; series_key: string | null }>()
    : { results: [] as { entity_key: string; name: string; series_key: string | null }[] }
  const draftCharacters = (characterRows.results ?? []).map((row) => ({
    key: row.entity_key,
    name: row.name,
    seriesKey: row.series_key ?? ''
  }))
  const result = applyDraftMutation(
    current,
    mutation,
    usedKeys,
    editorId,
    editorName,
    draftSeries,
    draftCharacters,
    reservedSeriesKeys
  )
  const batchSaveId = await resolveSaveId(db, draftId, saveId, editorId, now)
  // Every statement carries the same guard: the draft is still unlocked and, for an update
  // or delete, the entity still has the revision this write was built from. D1 runs a
  // batch as one transaction, so either the guard holds for every statement or none of
  // them writes. The one statement that changes what the guard checks runs last.
  const guard: SqlGuard = current
    ? {
        sql: `${DRAFT_UNLOCKED} AND EXISTS (
          SELECT 1 FROM draft_entities
          WHERE draft_id = ? AND entity_type = ? AND entity_key = ? AND revision = ?)`,
        binds: [draftId, draftId, current.type, current.key, current.revision]
      }
    : { sql: DRAFT_UNLOCKED, binds: [draftId] }
  const statements = [
    db.prepare(
      `UPDATE drafts SET updated_at = ? WHERE id = ? AND ${guard.sql}`
    ).bind(now, draftId, ...guard.binds)
  ]
  if (result.action === 'delete' && current?.type === 'series') {
    // The series' characters go with it. They are read inside the batch, so a character
    // added after this request started is deleted and logged like the rest.
    statements.push(
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at, save_id)
         SELECT ?, 'character', entity_key, 'delete',
                json_object(
                  'type', 'character',
                  'key', entity_key,
                  'name', name,
                  'seriesKey', COALESCE(series_key, ''),
                  'seriesName', ?,
                  'aliases', json(aliases),
                  'importAction', CASE WHEN import_action = 'update' THEN 'update' ELSE 'add' END,
                  'baseAliases', json(COALESCE(base_aliases, '[]'))
                ),
                NULL, ?, ?, ?, ?
         FROM draft_entities
         WHERE draft_id = ? AND entity_type = 'character' AND series_key = ? AND ${guard.sql}
         ORDER BY entity_key`
      ).bind(
        draftId,
        current.name,
        editorId,
        editorName,
        now,
        batchSaveId,
        draftId,
        current.key,
        ...guard.binds
      ),
      db.prepare(
        `DELETE FROM draft_entities
         WHERE draft_id = ? AND entity_type = 'character' AND series_key = ? AND ${guard.sql}`
      ).bind(draftId, current.key, ...guard.binds)
    )
  }
  if (result.adoptedSeries) {
    const series = result.adoptedSeries
    const seriesRefs = [...draftSeries, { key: series.key, name: series.name }]
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         SELECT ?, 'series', ?, ?, NULL, ?, ?, ?, 1, ?, ?
         WHERE ${guard.sql}`
      ).bind(
        draftId,
        series.key,
        series.name,
        JSON.stringify(series.aliases),
        series.importAction,
        JSON.stringify(series.baseAliases),
        editorId,
        editorName,
        ...guard.binds
      ),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at, save_id)
         SELECT ?, 'series', ?, 'add', NULL, ?, ?, ?, ?, ?
         WHERE ${guard.sql}`
      ).bind(
        draftId,
        series.key,
        entityPayload(series, seriesRefs),
        editorId,
        editorName,
        now,
        batchSaveId,
        ...guard.binds
      )
    )
  }
  const payloadSeries = result.adoptedSeries
    ? [...draftSeries, { key: result.adoptedSeries.key, name: result.adoptedSeries.name }]
    : draftSeries
  statements.push(
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at, save_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${guard.sql}`
    ).bind(
      draftId,
      mutation.type,
      result.entity?.key ?? current?.key ?? key,
      result.action,
      result.before ? entityPayload(result.before, payloadSeries) : null,
      result.after ? entityPayload(result.after, payloadSeries) : null,
      editorId,
      editorName,
      now,
      batchSaveId,
      ...guard.binds
    )
  )
  if (result.entity && result.action === 'add') {
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${guard.sql}`
      ).bind(
        draftId,
        result.entity.type,
        result.entity.key,
        result.entity.name,
        result.entity.type === 'character' ? result.entity.seriesKey : null,
        JSON.stringify(result.entity.aliases),
        result.entity.importAction,
        JSON.stringify(result.entity.baseAliases),
        result.entity.revision,
        editorId,
        editorName,
        ...guard.binds
      )
    )
  } else if (result.entity && current) {
    statements.push(
      db.prepare(
        `UPDATE draft_entities
         SET name = ?, series_key = ?, aliases = ?, revision = ?,
             last_editor_id = ?, last_editor_name = ?
         WHERE draft_id = ? AND entity_type = ? AND entity_key = ? AND revision = ?
           AND ${DRAFT_UNLOCKED}`
      ).bind(
        result.entity.name,
        result.entity.type === 'character' ? result.entity.seriesKey : null,
        JSON.stringify(result.entity.aliases),
        result.entity.revision,
        editorId,
        editorName,
        draftId,
        current.type,
        current.key,
        current.revision,
        draftId
      )
    )
  } else if (result.action === 'delete' && current) {
    statements.push(
      db.prepare(
        `DELETE FROM draft_entities
         WHERE draft_id = ? AND entity_type = ? AND entity_key = ? AND revision = ?
           AND ${DRAFT_UNLOCKED}`
      ).bind(draftId, current.type, current.key, current.revision, draftId)
    )
  }
  let outcomes: unknown[]
  try {
    outcomes = await db.batch(statements)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    // Two people added the same key, or adopted the same new series, at the same time.
    const latest = result.entity
      ? await getEntityRow(db, draftId, result.entity.type, result.entity.key)
      : null
    throw new DraftError(
      'CONFLICT',
      latest
        ? 'Someone else already added this entity.'
        : 'Someone else added this at the same time. Reload and try again.',
      409,
      latest ? rowToEntity(latest) : null
    )
  }
  if (changesOf(outcomes[0]) === 0) {
    const latestDraft = await getDraftRow(db, draftId)
    if (!latestDraft) {
      throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
    }
    assertUnlocked(latestDraft)
    const latest = key ? await getEntityRow(db, draftId, mutation.type, key) : null
    throw new DraftError(
      latest ? 'CONFLICT' : 'ENTITY_GONE',
      latest
        ? 'Someone else changed this entity. Reload it and try again.'
        : 'That entity was deleted.',
      409,
      latest ? rowToEntity(latest) : null
    )
  }
  const times = await loadEntityTimes(db, draftId)
  return {
    entity: result.entity ? stampEntity(result.entity, times) : result.entity,
    saveId: batchSaveId,
    adoptedSeries: result.adoptedSeries
      ? stampEntity(result.adoptedSeries, times) as DraftSeries
      : result.adoptedSeries
  }
}

async function readDraftOrThrow(db: D1Database, draftId: number): Promise<DraftRecord> {
  const draft = await getDraft(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  return draft
}

async function writeLockAudit(
  db: D1Database,
  draftId: number,
  action: 'lock' | 'unlock',
  editorId: string,
  editorName: string,
  now: number,
  lockedAt: number | null,
  lockedBy: string | null,
  hiddenAt: number | null
): Promise<DraftRecord> {
  // Two admins pressing Lock at once write one lock. The state change runs last, so the
  // audit row and the review reset see the same state the guard checks.
  const guard = `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND locked_at IS ${action === 'lock' ? '' : 'NOT '}NULL)`
  await db.batch([
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       SELECT ?, 'draft', '', ?, NULL, NULL, ?, ?, ?
       WHERE ${guard}`
    ).bind(draftId, action, editorId, editorName, now, draftId),
    db.prepare(
      `DELETE FROM draft_reviews WHERE draft_id = ? AND ${guard}`
    ).bind(draftId, draftId),
    db.prepare(
      `UPDATE drafts SET locked_at = ?, locked_by = ?, hidden_at = ?, updated_at = ?
       WHERE id = ? AND ${guard}`
    ).bind(lockedAt, lockedBy, hiddenAt, now, draftId, draftId)
  ])
  return readDraftOrThrow(db, draftId)
}

export async function lockDraft(
  db: D1Database,
  draftId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (draft.locked_at) {
    return readDraftOrThrow(db, draftId)
  }
  return writeLockAudit(db, draftId, 'lock', editorId, editorName, now, now, editorId, draft.hidden_at)
}

export async function unlockDraft(
  db: D1Database,
  draftId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (!draft.locked_at) {
    return readDraftOrThrow(db, draftId)
  }
  return writeLockAudit(db, draftId, 'unlock', editorId, editorName, now, null, null, null)
}

export async function hideDraft(
  db: D1Database,
  draftId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (!draft.locked_at) {
    throw new DraftError('LOCKED', 'Lock this draft before hiding it.', 409)
  }
  if (draft.hidden_at) {
    return readDraftOrThrow(db, draftId)
  }
  return writeHideAudit(db, draftId, 'hide', editorId, editorName, now, now)
}

export async function unhideDraft(
  db: D1Database,
  draftId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (!draft.hidden_at) {
    return readDraftOrThrow(db, draftId)
  }
  return writeHideAudit(db, draftId, 'unhide', editorId, editorName, now, null)
}

async function writeHideAudit(
  db: D1Database,
  draftId: number,
  action: 'hide' | 'unhide',
  editorId: string,
  editorName: string,
  now: number,
  hiddenAt: number | null
): Promise<DraftRecord> {
  // Hiding needs a locked, visible draft and unhiding a hidden one. The condition sits in
  // the writes, so an unlock that lands after the caller's read cannot be undone by a hide.
  const guard = action === 'hide'
    ? `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND locked_at IS NOT NULL AND hidden_at IS NULL)`
    : `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND hidden_at IS NOT NULL)`
  const outcomes = await db.batch([
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       SELECT ?, 'draft', '', ?, NULL, NULL, ?, ?, ?
       WHERE ${guard}`
    ).bind(draftId, action, editorId, editorName, now, draftId),
    db.prepare(
      `UPDATE drafts SET hidden_at = ?, updated_at = ? WHERE id = ? AND ${guard}`
    ).bind(hiddenAt, now, draftId, draftId)
  ])
  const draft = await readDraftOrThrow(db, draftId)
  if (action === 'hide' && changesOf(outcomes[1]) === 0 && !draft.lockedAt) {
    throw new DraftError('LOCKED', 'Lock this draft before hiding it.', 409)
  }
  return draft
}


export async function setDraftAccessConfig(
  db: D1Database,
  draftId: number,
  override: DraftAccessOverride | null,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  const current = parseStoredAccessOverride(draft.access_config)
  const next = parseDraftAccessOverride(override)
  const currentJson = current ? JSON.stringify(current) : ''
  const nextJson = next ? JSON.stringify(next) : ''
  if (currentJson === nextJson) {
    return readDraftOrThrow(db, draftId)
  }
  await db.batch([
    db.prepare(
      `UPDATE drafts SET access_config = ?, updated_at = ? WHERE id = ?`
    ).bind(next ? JSON.stringify(next) : null, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', 'config', ?, ?, ?, ?, ?)`
    ).bind(
      draftId,
      JSON.stringify({ override: current }),
      JSON.stringify({ override: next }),
      editorId,
      editorName,
      now
    )
  ])
  return readDraftOrThrow(db, draftId)
}

export function normalizeDraftDescription(value: string): string {
  const next = value.replace(/^\s+|\s+$/g, '')
  if (!next) return ''
  return assertDraftFontText(next, 'description')
}

export async function setDraftDescription(
  db: D1Database,
  draftId: number,
  description: string,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<{ draft: DraftRecord }> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  const next = normalizeDraftDescription(description)
  if (next.length > MAX_DRAFT_DESCRIPTION) {
    throw new DraftError('INVALID_INPUT', 'The draft description is too long.', 400)
  }
  const current = draft.description ?? ''
  if (current === next) {
    return { draft: await readDraftOrThrow(db, draftId) }
  }
  await db.batch([
    db.prepare(
      `UPDATE drafts SET description = ?, updated_at = ? WHERE id = ?`
    ).bind(next, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at, save_id)
       VALUES (?, 'draft', '', 'describe', ?, ?, ?, ?, ?, NULL)`
    ).bind(
      draftId,
      JSON.stringify({ description: current }),
      JSON.stringify({ description: next }),
      editorId,
      editorName,
      now
    )
  ])
  return { draft: await readDraftOrThrow(db, draftId) }
}

async function listAllDraftAudit(db: D1Database, draftId: number): Promise<DraftAuditRow[]> {
  const result = await db.prepare(
    `SELECT id, entity_type, entity_key, action, before_json, after_json,
            discord_id, username, created_at, save_id
     FROM draft_audit
     WHERE draft_id = ?
     ORDER BY id ASC`
  ).bind(draftId).all<AuditDbRow>()
  return (result.results ?? []).map(toAuditRow)
}

function resolveRestoreTarget(
  audits: readonly DraftAuditRow[],
  requested: number
): { throughId: number; saveId: number; createdAt: number } {
  const ofSave = audits.filter((row) => row.saveId === requested && isSaveAuditAction(row.action))
  if (!ofSave.length) {
    throw new DraftError('NOT_FOUND', 'That save is not on this draft.', 404)
  }
  return {
    throughId: ofSave[ofSave.length - 1].id,
    saveId: requested,
    createdAt: ofSave[0].createdAt
  }
}

export async function restoreDraft(
  db: D1Database,
  draftId: number,
  saveId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  if (!Number.isSafeInteger(saveId) || saveId < 1) {
    throw new DraftError('INVALID_INPUT', 'Save id must be a positive integer.', 400)
  }
  const current = await getDraft(db, draftId)
  if (!current) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (current.lockedAt) {
    throw new DraftError('LOCKED', 'This draft is locked.', 423)
  }
  const audits = await listAllDraftAudit(db, draftId)
  const target = resolveRestoreTarget(audits, saveId)
  const replayed = replayDraftAudit(audits, target.throughId, restoreIdentityFromCatalog(current))
  if (catalogsMatch(current, replayed)) {
    return current
  }
  // Every change to a draft writes an audit row, so the newest audit id read above stands
  // for the whole state this restore was built from. Each statement writes only while the
  // draft is unlocked and that id is still the newest. A save or lock that lands in between
  // makes the whole restore write nothing, and the editor is asked to try again. The
  // restore's own audit row, which moves that id, is written last.
  const lastAuditId = audits.length ? audits[audits.length - 1].id : 0
  const guard: SqlGuard = {
    sql: `${DRAFT_UNLOCKED}
      AND (SELECT COALESCE(MAX(id), 0) FROM draft_audit WHERE draft_id = ?) = ?`,
    binds: [draftId, draftId, lastAuditId]
  }
  const revisionOf = (type: DraftEntityType, key: string) => (
    (type === 'series' ? current.series : current.characters)
      .find((item) => item.key === key)?.revision ?? 0
  ) + 1
  const rows = [...replayed.series, ...replayed.characters].map((entity) => ({
    entity,
    revision: revisionOf(entity.type, entity.key)
  }))
  const outcomes = await db.batch([
    db.prepare(
      `UPDATE drafts SET description = ?, updated_at = ? WHERE id = ? AND ${guard.sql}`
    ).bind(replayed.description, now, draftId, ...guard.binds),
    db.prepare(
      `DELETE FROM draft_entities WHERE draft_id = ? AND ${guard.sql}`
    ).bind(draftId, ...guard.binds),
    ...insertEntityStatements(db, draftId, rows, editorId, editorName, guard),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       SELECT ?, 'draft', '', 'restore', ?, ?, ?, ?, ?
       WHERE ${guard.sql}`
    ).bind(
      draftId,
      JSON.stringify({ eventId: target.saveId, createdAt: target.createdAt }),
      JSON.stringify({
        eventId: target.saveId,
        createdAt: target.createdAt,
        description: replayed.description,
        series: replayed.series,
        characters: replayed.characters
      }),
      editorId,
      editorName,
      now,
      ...guard.binds
    )
  ])
  if (changesOf(outcomes[0]) === 0) {
    const latest = await getDraftRow(db, draftId)
    if (!latest) {
      throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
    }
    assertUnlocked(latest)
    throw new DraftError(
      'CONFLICT',
      'Someone changed this draft while it was being restored. Try again.',
      409
    )
  }
  return readDraftOrThrow(db, draftId)
}
