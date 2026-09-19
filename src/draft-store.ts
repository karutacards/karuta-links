import { parseDraftCatalog } from './draft-catalog'
import { discordAvatarUrl, parseDiscordAvatar } from './discord-avatar'
import { sortDraftEntities } from './draft-sort'
import { actorName, draftAuditSentence, draftAuditSpans } from './draft-audit'
import {
  catalogsMatch,
  isSaveAuditAction,
  lastEventIdForSave,
  replayDraftAudit,
  restoreIdentityFromCatalog
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

async function resolveSaveId(
  db: D1Database,
  draftId: number,
  requested: number | null
): Promise<number> {
  if (requested == null) return allocateId(db, DRAFT_SAVES_SECTION)
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new DraftError('INVALID_INPUT', 'Save id must be a positive integer.', 400)
  }
  const row = await db.prepare(
    `SELECT 1 AS ok FROM draft_audit WHERE draft_id = ? AND save_id = ? LIMIT 1`
  ).bind(draftId, requested).first()
  if (!row) {
    throw new DraftError('INVALID_INPUT', 'That save does not exist on this draft.', 400)
  }
  return requested
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
  const statements = [
    db.prepare(
      `INSERT INTO drafts (id, created_at, updated_at, locked_at, locked_by)
       VALUES (?, ?, ?, NULL, NULL)`
    ).bind(id, now, now)
  ]
  for (const series of parsed.series) {
    const importAction = series.action ?? 'add'
    const aliases = series.aliases ?? []
    const entity: DraftSeries = {
      type: 'series',
      key: series.key,
      name: series.name,
      aliases,
      importAction,
      baseAliases: importAction === 'update' ? aliases : [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, 'series', ?, ?, NULL, ?, ?, ?, 1, ?, ?)`
      ).bind(
        id,
        entity.key,
        entity.name,
        JSON.stringify(entity.aliases),
        entity.importAction,
        JSON.stringify(entity.baseAliases),
        editorId,
        editorName
      ),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at)
         VALUES (?, 'series', ?, 'import', NULL, ?, ?, ?, ?)`
      ).bind(id, entity.key, entityPayload(entity, parsed.series), editorId, editorName, now)
    )
  }
  for (const character of parsed.characters) {
    const importAction = character.action ?? 'add'
    const aliases = character.aliases ?? []
    const entity: DraftCharacter = {
      type: 'character',
      key: character.key,
      name: character.name,
      seriesKey: character.seriesKey,
      aliases,
      importAction,
      baseAliases: importAction === 'update' ? aliases : [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, 'character', ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        id,
        entity.key,
        entity.name,
        entity.seriesKey,
        JSON.stringify(entity.aliases),
        entity.importAction,
        JSON.stringify(entity.baseAliases),
        editorId,
        editorName
      ),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at)
         VALUES (?, 'character', ?, 'import', NULL, ?, ?, ?, ?)`
      ).bind(id, entity.key, entityPayload(entity, parsed.series), editorId, editorName, now)
    )
  }
  await db.batch(statements)
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
  if (!draft.locked_at) {
    throw new DraftError('LOCKED', 'Lock this draft before reviewing it.', 409)
  }
  if (decision === null) {
    await db.prepare(
      `DELETE FROM draft_reviews WHERE draft_id = ? AND discord_id = ?`
    ).bind(draftId, editorId).run()
  } else {
    await db.prepare(
      `INSERT INTO draft_reviews (draft_id, discord_id, username, decision, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(draft_id, discord_id)
       DO UPDATE SET username = excluded.username, decision = excluded.decision,
                     updated_at = excluded.updated_at`
    ).bind(draftId, editorId, editorName, decision, now).run()
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
  const key = mutation.action === 'add'
    ? (mutation.key?.trim() || '')
    : (mutation.key?.trim() ?? '')
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
  const batchSaveId = await resolveSaveId(db, draftId, saveId)
  const statements = [
    db.prepare(`UPDATE drafts SET updated_at = ? WHERE id = ?`).bind(now, draftId)
  ]
  if (result.action === 'delete' && current) {
    statements.push(
      db.prepare(
        `DELETE FROM draft_entities
         WHERE draft_id = ? AND entity_type = ? AND entity_key = ? AND revision = ?`
      ).bind(draftId, current.type, current.key, current.revision)
    )
    if (current.type === 'series') {
      const childRows = await db.prepare(
        `SELECT entity_type, entity_key, name, series_key, aliases, import_action,
                base_aliases, revision, last_editor_id, last_editor_name
         FROM draft_entities
         WHERE draft_id = ? AND entity_type = 'character' AND series_key = ?`
      ).bind(draftId, current.key).all<EntityRow>()
      const seriesRefs = [{ key: current.key, name: current.name }]
      for (const row of childRows.results ?? []) {
        const child = rowToEntity(row)
        statements.push(
          db.prepare(
            `DELETE FROM draft_entities
             WHERE draft_id = ? AND entity_type = ? AND entity_key = ?`
          ).bind(draftId, child.type, child.key)
        )
        statements.push(
          db.prepare(
            `INSERT INTO draft_audit
             (draft_id, entity_type, entity_key, action, before_json, after_json,
              discord_id, username, created_at, save_id)
             VALUES (?, ?, ?, 'delete', ?, NULL, ?, ?, ?, ?)`
          ).bind(
            draftId,
            child.type,
            child.key,
            entityPayload(child, seriesRefs),
            editorId,
            editorName,
            now,
            batchSaveId
          )
        )
      }
    }
  }
  if (result.adoptedSeries) {
    const series = result.adoptedSeries
    const seriesRefs = [...draftSeries, { key: series.key, name: series.name }]
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, 'series', ?, ?, NULL, ?, ?, ?, 1, ?, ?)`
      ).bind(
        draftId,
        series.key,
        series.name,
        JSON.stringify(series.aliases),
        series.importAction,
        JSON.stringify(series.baseAliases),
        editorId,
        editorName
      ),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at, save_id)
         VALUES (?, 'series', ?, 'add', NULL, ?, ?, ?, ?, ?)`
      ).bind(
        draftId,
        series.key,
        entityPayload(series, seriesRefs),
        editorId,
        editorName,
        now,
        batchSaveId
      )
    )
  }
  if (result.entity && result.action === 'add') {
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        editorName
      )
    )
  } else if (result.entity && current) {
    statements.push(
      db.prepare(
        `UPDATE draft_entities
         SET name = ?, series_key = ?, aliases = ?, revision = ?,
             last_editor_id = ?, last_editor_name = ?
         WHERE draft_id = ? AND entity_type = ? AND entity_key = ? AND revision = ?`
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
        current.revision
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      batchSaveId
    )
  )
  const outcomes = await db.batch(statements)
  const write = result.adoptedSeries ? outcomes[3] : outcomes[1]
  if (result.action !== 'add' && write && 'meta' in write && write.meta.changes === 0) {
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
  await db.batch([
    db.prepare(
      `UPDATE drafts SET locked_at = ?, locked_by = ?, hidden_at = ?, updated_at = ? WHERE id = ?`
    ).bind(lockedAt, lockedBy, hiddenAt, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', ?, NULL, NULL, ?, ?, ?)`
    ).bind(draftId, action, editorId, editorName, now),
    db.prepare(
      `DELETE FROM draft_reviews WHERE draft_id = ?`
    ).bind(draftId)
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
  await db.batch([
    db.prepare(
      `UPDATE drafts SET hidden_at = ?, updated_at = ? WHERE id = ?`
    ).bind(hiddenAt, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', ?, NULL, NULL, ?, ?, ?)`
    ).bind(draftId, action, editorId, editorName, now)
  ])
  return readDraftOrThrow(db, draftId)
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
  return value.replace(/^\s+|\s+$/g, '')
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
  if (ofSave.length) {
    return {
      throughId: lastEventIdForSave(ofSave, requested) ?? ofSave[ofSave.length - 1].id,
      saveId: requested,
      createdAt: ofSave[0].createdAt
    }
  }
  const target = audits.find((row) => row.id === requested)
  if (!target) {
    throw new DraftError('NOT_FOUND', 'That save is not on this draft.', 404)
  }
  if (target.action === 'import') {
    throw new DraftError('INVALID_INPUT', 'Imports cannot be restored.', 400)
  }
  if (!isSaveAuditAction(target.action)) {
    throw new DraftError('INVALID_INPUT', 'Pick a save in Activity.', 400)
  }
  if (target.saveId != null && target.saveId !== target.id) {
    throw new DraftError('INVALID_INPUT', 'Pick the start of a save in Activity.', 400)
  }
  return {
    throughId: target.id,
    saveId: target.saveId ?? target.id,
    createdAt: target.createdAt
  }
}

export async function restoreDraft(
  db: D1Database,
  draftId: number,
  eventId: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftRecord> {
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
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
  const target = resolveRestoreTarget(audits, eventId)
  const replayed = replayDraftAudit(audits, target.throughId, restoreIdentityFromCatalog(current))
  if (catalogsMatch(current, replayed)) {
    return current
  }
  const statements = [
    db.prepare(`DELETE FROM draft_entities WHERE draft_id = ?`).bind(draftId)
  ]
  for (const series of replayed.series) {
    const revision = (current.series.find((item) => item.key === series.key)?.revision ?? 0) + 1
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, 'series', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
      ).bind(
        draftId,
        series.key,
        series.name,
        JSON.stringify(series.aliases),
        series.importAction,
        JSON.stringify(series.baseAliases),
        revision,
        editorId,
        editorName
      )
    )
  }
  for (const character of replayed.characters) {
    const revision = (current.characters.find((item) => item.key === character.key)?.revision ?? 0) + 1
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, import_action,
          base_aliases, revision, last_editor_id, last_editor_name)
         VALUES (?, 'character', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        draftId,
        character.key,
        character.name,
        character.seriesKey,
        JSON.stringify(character.aliases),
        character.importAction,
        JSON.stringify(character.baseAliases),
        revision,
        editorId,
        editorName
      )
    )
  }
  statements.push(
    db.prepare(
      `UPDATE drafts SET description = ?, updated_at = ? WHERE id = ?`
    ).bind(replayed.description, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', 'restore', ?, ?, ?, ?, ?)`
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
      now
    )
  )
  await db.batch(statements)
  return readDraftOrThrow(db, draftId)
}
