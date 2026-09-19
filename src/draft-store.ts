import { parseDraftCatalog } from './draft-catalog'
import { actorName, draftAuditSentence, draftAuditSpans } from './draft-audit'
import { applyDraftMutation, type DraftMutation } from './draft-mutation'
import { allocateId } from './db'
import {
  DRAFT_SECTION,
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
}

type PresenceDbRow = {
  discord_id: string
  username: string
}

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
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
      aliases: entity.aliases
    })
  }
  const names = seriesNameMap(series)
  return JSON.stringify({
    type: entity.type,
    key: entity.key,
    name: entity.name,
    seriesKey: entity.seriesKey,
    seriesName: names.get(entity.seriesKey) ?? '',
    aliases: entity.aliases
  })
}

async function getDraftRow(db: D1Database, id: number): Promise<DraftRow | null> {
  return db.prepare(
    `SELECT id, created_at, updated_at, locked_at, locked_by, description
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
    createdAt: row.created_at
  }
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
     ORDER BY entity_type, name COLLATE NOCASE, entity_key`
  ).bind(id).all<EntityRow>()
  const series: DraftSeries[] = []
  const characters: DraftCharacter[] = []
  for (const entityRow of result.results ?? []) {
    const entity = rowToEntity(entityRow)
    if (entity.type === 'series') {
      series.push(entity)
    } else {
      characters.push(entity)
    }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
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
            discord_id, username, created_at
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
            discord_id, username, created_at
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
  now = Date.now()
): Promise<DraftPresence[]> {
  const staleBefore = now - PRESENCE_STALE_MS
  await db.batch([
    db.prepare(
      `INSERT INTO draft_presence (draft_id, discord_id, username, last_seen)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(draft_id, discord_id)
       DO UPDATE SET username = excluded.username, last_seen = excluded.last_seen`
    ).bind(draftId, discordId, username, now),
    db.prepare(
      `DELETE FROM draft_presence WHERE draft_id = ? AND last_seen < ?`
    ).bind(draftId, staleBefore)
  ])
  const result = await db.prepare(
    `SELECT discord_id, username
     FROM draft_presence
     WHERE draft_id = ? AND last_seen >= ?
     ORDER BY username COLLATE NOCASE, discord_id`
  ).bind(draftId, staleBefore).all<PresenceDbRow>()
  return (result.results ?? []).map((row) => ({
    discordId: row.discord_id,
    username: row.username
  }))
}

export async function pollDraftEvents(
  db: D1Database,
  draftId: number,
  after: number,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftEventsSnapshot> {
  const draft = await getDraft(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  const events = await listDraftEvents(db, draftId, after, draft.series)
  const presence = await touchDraftPresence(db, draftId, editorId, editorName, now)
  const lastId = events.at(-1)?.id
  return {
    after: lastId ?? (Number.isSafeInteger(after) && after > 0 ? after : 0),
    events,
    series: draft.series,
    characters: draft.characters,
    presence,
    lockedAt: draft.lockedAt,
    lockedBy: draft.lockedBy,
    description: draft.description
  }
}

export async function mutateDraftEntity(
  db: D1Database,
  draftId: number,
  mutation: DraftMutation,
  editorId: string,
  editorName: string,
  now = Date.now()
): Promise<DraftEntity | null> {
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
  const existing = await db.prepare(
    `SELECT entity_key FROM draft_entities
     WHERE draft_id = ? AND entity_type = ?`
  ).bind(draftId, mutation.type).all<{ entity_key: string }>()
  const usedKeys = new Set((existing.results ?? []).map((row) => row.entity_key))
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
  const result = applyDraftMutation(
    current,
    mutation,
    usedKeys,
    editorId,
    editorName,
    draftSeries
  )
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
              discord_id, username, created_at)
             VALUES (?, ?, ?, 'delete', ?, NULL, ?, ?, ?)`
          ).bind(
            draftId,
            child.type,
            child.key,
            entityPayload(child, seriesRefs),
            editorId,
            editorName,
            now
          )
        )
      }
    }
  } else if (result.entity && result.action === 'add') {
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
  statements.push(
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      draftId,
      mutation.type,
      result.entity?.key ?? current?.key ?? key,
      result.action,
      result.before ? entityPayload(result.before, draftSeries) : null,
      result.after ? entityPayload(result.after, draftSeries) : null,
      editorId,
      editorName,
      now
    )
  )
  const outcomes = await db.batch(statements)
  const write = outcomes[1]
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
  return result.entity
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
  lockedBy: string | null
): Promise<DraftRecord> {
  await db.batch([
    db.prepare(
      `UPDATE drafts SET locked_at = ?, locked_by = ?, updated_at = ? WHERE id = ?`
    ).bind(lockedAt, lockedBy, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', ?, NULL, NULL, ?, ?, ?)`
    ).bind(draftId, action, editorId, editorName, now)
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
  return writeLockAudit(db, draftId, 'lock', editorId, editorName, now, now, editorId)
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
  return writeLockAudit(db, draftId, 'unlock', editorId, editorName, now, null, null)
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
): Promise<DraftRecord> {
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
    return readDraftOrThrow(db, draftId)
  }
  await db.batch([
    db.prepare(
      `UPDATE drafts SET description = ?, updated_at = ? WHERE id = ?`
    ).bind(next, now, draftId),
    db.prepare(
      `INSERT INTO draft_audit
       (draft_id, entity_type, entity_key, action, before_json, after_json,
        discord_id, username, created_at)
       VALUES (?, 'draft', '', 'describe', ?, ?, ?, ?, ?)`
    ).bind(
      draftId,
      JSON.stringify({ description: current }),
      JSON.stringify({ description: next }),
      editorId,
      editorName,
      now
    )
  ])
  return readDraftOrThrow(db, draftId)
}
