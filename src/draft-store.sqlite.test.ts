import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allocateId } from './db'
import {
  SAVE_REUSE_WINDOW_MS,
  createDraft,
  getDraft,
  lockDraft,
  mutateDraftEntity,
  restoreDraft,
  setDraftReview
} from './draft-store'
import { DRAFT_SAVES_SECTION } from './draft-types'
import { sqliteD1 } from './sqlite-d1.testing'

// These tests run the store against real SQLite with every migration applied, so the
// guards inside the SQL are exercised, not just the statements' text.

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

type Sqlite = ReturnType<typeof sqliteD1>['sqlite']

// Runs `before` once, right before the first batch reaches the database. That is the
// window in which another editor's write can land after this request read the draft.
function raceBeforeBatch(db: D1Database, before: () => unknown): D1Database {
  let fired = false
  return {
    ...db,
    async batch(statements: D1PreparedStatement[]) {
      if (!fired) {
        fired = true
        await before()
      }
      return db.batch(statements)
    }
  } as D1Database
}

function count(sqlite: Sqlite, sql: string, ...binds: (string | number)[]): number {
  return Number((sqlite.prepare(sql).get(...binds) as { n: number }).n)
}

async function seed(now = 10) {
  const { db, sqlite } = sqliteD1()
  const draft = await createDraft(db, {
    series: [{ name: 'Naruto' }],
    characters: [
      { name: 'Sakura Haruno', seriesKey: 'naruto' },
      { name: 'Hinata Hyuga', seriesKey: 'naruto' }
    ]
  }, 'u1', 'craig', now)
  return { db, sqlite, id: draft.id }
}

describe('draft store writes against SQLite', () => {
  it('writes nothing when a series delete loses a revision race', async () => {
    const { db, sqlite, id } = await seed()
    const audits = count(sqlite, 'SELECT COUNT(*) AS n FROM draft_audit')
    const raced = raceBeforeBatch(db, () => sqlite.exec(
      `UPDATE draft_entities SET revision = 2 WHERE entity_type = 'series' AND entity_key = 'naruto'`
    ))
    await expect(mutateDraftEntity(raced, id, {
      type: 'series',
      action: 'delete',
      key: 'naruto',
      expectedRevision: 1
    }, 'u1', 'craig', 20)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(count(sqlite, `SELECT COUNT(*) AS n FROM draft_entities WHERE entity_type = 'character'`)).toBe(2)
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM draft_audit')).toBe(audits)
    expect(count(sqlite, 'SELECT updated_at AS n FROM drafts WHERE id = ?', id)).toBe(10)
  })

  it('deletes a series with its characters and logs each in one save', async () => {
    const { db, sqlite, id } = await seed()
    const result = await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'delete',
      key: 'naruto',
      expectedRevision: 1
    }, 'u1', 'craig', 20)
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM draft_entities')).toBe(0)
    const rows = sqlite.prepare(
      `SELECT entity_type, entity_key, action, before_json, save_id
       FROM draft_audit WHERE action = 'delete' ORDER BY id`
    ).all() as { entity_type: string; entity_key: string; before_json: string; save_id: number }[]
    expect(rows.map((row) => `${row.entity_type}:${row.entity_key}`)).toEqual([
      'character:hinata-hyuga',
      'character:sakura-haruno',
      'series:naruto'
    ])
    expect(new Set(rows.map((row) => row.save_id))).toEqual(new Set([result.saveId]))
    expect(rows[0].before_json).toBe(JSON.stringify({
      type: 'character',
      key: 'hinata-hyuga',
      name: 'Hinata Hyuga',
      seriesKey: 'naruto',
      seriesName: 'Naruto',
      aliases: [],
      importAction: 'add',
      baseAliases: []
    }))
  })

  it('refuses a save that lands after a lock and writes nothing', async () => {
    const { db, sqlite, id } = await seed()
    const audits = count(sqlite, 'SELECT COUNT(*) AS n FROM draft_audit')
    const lock = () => sqlite.exec(`UPDATE drafts SET locked_at = 15, locked_by = 'u9' WHERE id = ${id}`)
    await expect(mutateDraftEntity(raceBeforeBatch(db, lock), id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 1,
      name: 'Naruto Shippuden'
    }, 'u1', 'craig', 20)).rejects.toMatchObject({ code: 'LOCKED', status: 423 })
    sqlite.exec(`UPDATE drafts SET locked_at = NULL, locked_by = NULL WHERE id = ${id}`)
    await expect(mutateDraftEntity(raceBeforeBatch(db, lock), id, {
      type: 'series',
      action: 'add',
      name: 'Bleach'
    }, 'u1', 'craig', 20)).rejects.toMatchObject({ code: 'LOCKED', status: 423 })
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM draft_audit')).toBe(audits)
    expect(count(sqlite, `SELECT COUNT(*) AS n FROM draft_entities WHERE name IN ('Naruto Shippuden', 'Bleach')`)).toBe(0)
  })

  it('answers two adds of the same key with a conflict, not a server error', async () => {
    const { db, sqlite, id } = await seed()
    const raced = raceBeforeBatch(db, () => sqlite.exec(
      `INSERT INTO draft_entities (draft_id, entity_type, entity_key, name, revision, last_editor_id, last_editor_name)
       VALUES (${id}, 'series', 'one-piece', 'One Piece', 1, 'u2', 'other')`
    ))
    const error = await mutateDraftEntity(raced, id, {
      type: 'series',
      action: 'add',
      name: 'One Piece'
    }, 'u1', 'craig', 20).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'CONFLICT', status: 409 })
    expect((error as { entity: { name: string } }).entity.name).toBe('One Piece')
    expect(count(sqlite, `SELECT COUNT(*) AS n FROM draft_audit WHERE entity_key = 'one-piece'`)).toBe(0)
  })

  it('slugs an added key the way imports do', async () => {
    const { db, id } = await seed()
    const added = await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'add',
      key: ' One Piece! ',
      name: 'One Piece'
    }, 'u1', 'craig', 20)
    expect(added.entity?.key).toBe('one-piece')
    await expect(mutateDraftEntity(db, id, {
      type: 'series',
      action: 'add',
      key: 'One Piece',
      name: 'One Piece'
    }, 'u1', 'craig', 30)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('reuses a save id only for its own editor within the window', async () => {
    const { db, id } = await seed()
    const add = (name: string, editor: string, now: number, saveId: number | null) => mutateDraftEntity(
      db, id, { type: 'series', action: 'add', name }, editor, editor, now, saveId
    )
    const first = await add('Bleach', 'u1', 100, null)
    expect((await add('Gintama', 'u1', 1_000, first.saveId)).saveId).toBe(first.saveId)
    expect((await add('Haikyu', 'u2', 2_000, first.saveId)).saveId).not.toBe(first.saveId)
    expect((await add('Mushishi', 'u1', 1_000 + SAVE_REUSE_WINDOW_MS + 1, first.saveId)).saveId)
      .not.toBe(first.saveId)
    expect((await add('Monster', 'u1', 1_000, 99_999)).saveId).not.toBe(99_999)
  })

  it('restores a save with revisions above the ones it replaced', async () => {
    const { db, sqlite, id } = await seed()
    const update = (name: string, revision: number, now: number) => mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: revision,
      name
    }, 'u1', 'craig', now)
    const first = await update('Naruto Shippuden', 1, 20)
    await update('Boruto', 2, 30)
    const restored = await restoreDraft(db, id, first.saveId, 'u1', 'craig', 40)
    expect(restored.series.map((item) => [item.name, item.revision])).toEqual([['Naruto Shippuden', 4]])
    expect(restored.characters).toHaveLength(2)
    expect(sqlite.prepare(`SELECT action FROM draft_audit ORDER BY id DESC LIMIT 1`).get())
      .toEqual({ action: 'restore' })
  })

  it('refuses a restore when a save lands while it runs, and keeps that save', async () => {
    const { db, sqlite, id } = await seed()
    const first = await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 1,
      name: 'Naruto Shippuden'
    }, 'u1', 'craig', 20)
    await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 2,
      name: 'Boruto'
    }, 'u1', 'craig', 30)
    const raced = raceBeforeBatch(db, () => mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 3,
      name: 'Konoha'
    }, 'u2', 'other', 35))
    await expect(restoreDraft(raced, id, first.saveId, 'u1', 'craig', 40))
      .rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    const draft = await getDraft(db, id)
    expect(draft?.series.map((item) => [item.name, item.revision])).toEqual([['Konoha', 4]])
    expect(draft?.characters).toHaveLength(2)
    expect(count(sqlite, `SELECT COUNT(*) AS n FROM draft_audit WHERE action = 'restore'`)).toBe(0)
  })

  it('refuses a restore that lands after a lock', async () => {
    const { db, sqlite, id } = await seed()
    const first = await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 1,
      name: 'Naruto Shippuden'
    }, 'u1', 'craig', 20)
    await mutateDraftEntity(db, id, {
      type: 'series',
      action: 'update',
      key: 'naruto',
      expectedRevision: 2,
      name: 'Boruto'
    }, 'u1', 'craig', 30)
    const raced = raceBeforeBatch(db, () => sqlite.exec(`UPDATE drafts SET locked_at = 35 WHERE id = ${id}`))
    await expect(restoreDraft(raced, id, first.saveId, 'u1', 'craig', 40))
      .rejects.toMatchObject({ code: 'LOCKED', status: 423 })
    expect((await getDraft(db, id))?.series[0].name).toBe('Boruto')
  })

  it('refuses a review when the draft is unlocked before the write', async () => {
    const { db, sqlite, id } = await seed()
    await lockDraft(db, id, 'u1', 'craig', 20)
    const raced = {
      ...db,
      prepare(sql: string) {
        if (sql.includes('INSERT INTO draft_reviews')) {
          sqlite.exec(`UPDATE drafts SET locked_at = NULL, locked_by = NULL WHERE id = ${id}`)
        }
        return db.prepare(sql)
      }
    } as D1Database
    await expect(setDraftReview(raced, id, 'u2', 'other', 'approve', 30))
      .rejects.toMatchObject({ code: 'LOCKED', status: 409 })
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM draft_reviews')).toBe(0)
  })

  it('imports the largest catalog in a few dozen statements', async () => {
    const { db, sqlite } = sqliteD1()
    const series = Array.from({ length: 100 }, (_, index) => ({ name: `Series ${index}` }))
    const characters = Array.from({ length: 9_900 }, (_, index) => ({
      name: `Character ${index}`,
      seriesKey: `series-${index % 100}`,
      aliases: [`Alias ${index}`]
    }))
    let statements = 0
    const counted = {
      ...db,
      async batch(list: D1PreparedStatement[]) {
        statements += list.length
        return db.batch(list)
      }
    } as D1Database
    const draft = await createDraft(counted, { series, characters }, 'u1', 'craig', 10)
    expect(statements).toBeLessThan(60)
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM draft_entities WHERE draft_id = ?', draft.id)).toBe(10_000)
    expect(count(sqlite, `SELECT COUNT(*) AS n FROM draft_audit WHERE action = 'import'`)).toBe(10_000)
    const firstCharacter = sqlite.prepare(
      `SELECT entity_key, after_json FROM draft_audit WHERE entity_type = 'character' ORDER BY id LIMIT 1`
    ).get() as { entity_key: string; after_json: string }
    expect(firstCharacter.entity_key).toBe('character-0')
    expect(JSON.parse(firstCharacter.after_json)).toMatchObject({
      seriesKey: 'series-0',
      seriesName: 'Series 0',
      aliases: ['Alias 0']
    })
    expect(draft.characters.find((item) => item.key === 'character-0')?.aliases).toEqual(['Alias 0'])
  })
})

describe('draft migrations', () => {
  it('moves the save sequence past every save id in use', async () => {
    const { db, sqlite } = sqliteD1()
    const migration = readFileSync(join(MIGRATIONS, '0016_draft_save_sequence.sql'), 'utf8')
    sqlite.exec(
      `INSERT INTO draft_audit (draft_id, entity_type, entity_key, action, discord_id, username, created_at, save_id)
       VALUES (1, 'series', 'a', 'update', 'u1', 'craig', 1, 40)`
    )
    sqlite.exec(migration)
    expect(await allocateId(db, DRAFT_SAVES_SECTION)).toBe(41)
    sqlite.exec(`UPDATE sequences SET next_id = 90 WHERE section = 'draft-saves'`)
    sqlite.exec(migration)
    expect(await allocateId(db, DRAFT_SAVES_SECTION)).toBe(91)
  })

  it('brings stored access overrides in line without changing who can open a draft', () => {
    const { sqlite } = sqliteD1()
    const migration = readFileSync(join(MIGRATIONS, '0017_draft_access_override_rules.sql'), 'utf8')
    const insert = sqlite.prepare(
      `INSERT INTO drafts (id, created_at, updated_at, access_config) VALUES (?, 1, 1, ?)`
    )
    insert.run(1, JSON.stringify({
      access: 'whitelist',
      whitelist: ['111111111111111111', '1', 'craig', 5],
      credentials: { minDrops: 0, minGrabs: 20, minPurchases: -1 }
    }))
    insert.run(2, JSON.stringify({ credentials: { minDrops: 0 } }))
    insert.run(3, JSON.stringify({ access: 'open', credentials: { minGrabs: 2.5 } }))
    insert.run(4, JSON.stringify({ access: 'credentials', credentials: { minDrops: 1500.5 } }))
    sqlite.exec(migration)
    const stored = (sqlite.prepare(`SELECT id, access_config FROM drafts ORDER BY id`).all() as {
      id: number
      access_config: string | null
    }[]).map((row) => (row.access_config ? JSON.parse(row.access_config) : null))
    expect(stored).toEqual([
      { access: 'whitelist', whitelist: ['111111111111111111'], credentials: { minGrabs: 20 } },
      { access: 'open' },
      { access: 'open', credentials: { minGrabs: 3 } },
      { access: 'credentials', credentials: { minDrops: 1501 } }
    ])
  })
})
