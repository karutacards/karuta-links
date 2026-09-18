import { parseDraftCatalog } from './draft-catalog'
import { applyDraftMutation, type DraftMutation } from './draft-mutation'
import { allocateId } from './db'
import {
  DRAFT_SECTION,
  DraftError,
  type DraftAuditRow,
  type DraftCharacter,
  type DraftEntity,
  type DraftEntityType,
  type DraftRecord,
  type DraftSeries
} from './draft-types'

type DraftRow = {
  id: number
  created_at: number
  updated_at: number
  locked_at: number | null
  locked_by: string | null
}

type EntityRow = {
  entity_type: string
  entity_key: string
  name: string
  series_key: string | null
  aliases: string
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
    revision: row.revision,
    lastEditorId: row.last_editor_id,
    lastEditorName: row.last_editor_name
  }
  return row.entity_type === 'character'
    ? { type: 'character', seriesKey: row.series_key ?? '', ...shared }
    : { type: 'series', ...shared }
}

function entityPayload(entity: DraftEntity): string {
  if (entity.type === 'series') {
    return JSON.stringify({
      type: entity.type,
      key: entity.key,
      name: entity.name,
      aliases: entity.aliases
    })
  }
  return JSON.stringify({
    type: entity.type,
    key: entity.key,
    name: entity.name,
    seriesKey: entity.seriesKey,
    aliases: entity.aliases
  })
}

async function getDraftRow(db: D1Database, id: number): Promise<DraftRow | null> {
  return db.prepare(
    `SELECT id, created_at, updated_at, locked_at, locked_by
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
    `SELECT entity_type, entity_key, name, series_key, aliases, revision,
            last_editor_id, last_editor_name
     FROM draft_entities
     WHERE draft_id = ? AND entity_type = ? AND entity_key = ?`
  ).bind(draftId, type, key).first<EntityRow>()
}

function assertUnlocked(row: DraftRow): void {
  if (row.locked_at) {
    throw new DraftError('LOCKED', 'This draft is locked.', 423)
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
    const entity: DraftSeries = {
      type: 'series',
      key: series.key,
      name: series.name,
      aliases: series.aliases ?? [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, revision,
          last_editor_id, last_editor_name)
         VALUES (?, 'series', ?, ?, NULL, ?, 1, ?, ?)`
      ).bind(id, entity.key, entity.name, JSON.stringify(entity.aliases), editorId, editorName),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at)
         VALUES (?, 'series', ?, 'add', NULL, ?, ?, ?, ?)`
      ).bind(id, entity.key, entityPayload(entity), editorId, editorName, now)
    )
  }
  for (const character of parsed.characters) {
    const entity: DraftCharacter = {
      type: 'character',
      key: character.key,
      name: character.name,
      seriesKey: character.seriesKey,
      aliases: character.aliases ?? [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, revision,
          last_editor_id, last_editor_name)
         VALUES (?, 'character', ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        id,
        entity.key,
        entity.name,
        entity.seriesKey,
        JSON.stringify(entity.aliases),
        editorId,
        editorName
      ),
      db.prepare(
        `INSERT INTO draft_audit
         (draft_id, entity_type, entity_key, action, before_json, after_json,
          discord_id, username, created_at)
         VALUES (?, 'character', ?, 'add', NULL, ?, ?, ?, ?)`
      ).bind(id, entity.key, entityPayload(entity), editorId, editorName, now)
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
    `SELECT entity_type, entity_key, name, series_key, aliases, revision,
            last_editor_id, last_editor_name
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
  return (result.results ?? []).map((row) => ({
    id: row.id,
    entityType: row.entity_type as DraftEntityType,
    entityKey: row.entity_key,
    action: row.action,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    discordId: row.discord_id,
    username: row.username,
    createdAt: row.created_at
  }))
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
  const result = applyDraftMutation(current, mutation, usedKeys, editorId, editorName)
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
  } else if (result.entity && result.action === 'add') {
    statements.push(
      db.prepare(
        `INSERT INTO draft_entities
         (draft_id, entity_type, entity_key, name, series_key, aliases, revision,
          last_editor_id, last_editor_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        draftId,
        result.entity.type,
        result.entity.key,
        result.entity.name,
        result.entity.type === 'character' ? result.entity.seriesKey : null,
        JSON.stringify(result.entity.aliases),
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
      result.before ? entityPayload(result.before) : null,
      result.after ? entityPayload(result.after) : null,
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

export async function lockDraft(
  db: D1Database,
  draftId: number,
  editorId: string,
  now = Date.now()
): Promise<DraftRecord> {
  const draft = await getDraftRow(db, draftId)
  if (!draft) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  if (draft.locked_at) {
    const locked = await getDraft(db, draftId)
    if (!locked) {
      throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
    }
    return locked
  }
  await db.prepare(
    `UPDATE drafts SET locked_at = ?, locked_by = ?, updated_at = ? WHERE id = ?`
  ).bind(now, editorId, now, draftId).run()
  const locked = await getDraft(db, draftId)
  if (!locked) {
    throw new DraftError('NOT_FOUND', 'That draft does not exist.', 404)
  }
  return locked
}
