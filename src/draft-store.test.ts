import { describe, expect, it } from 'vitest'
import {
  PRESENCE_STALE_MS,
  listDraftEvents,
  lockDraft,
  pollDraftEvents,
  setDraftDescription,
  touchDraftPresence,
  restoreDraft,
  unlockDraft
} from './draft-store'

type Query = {
  sql: string
  binds: unknown[]
}

function mockDb(options: {
  draft?: Record<string, unknown> | null
  entities?: Record<string, unknown>[]
  audit?: Record<string, unknown>[]
  presence?: Record<string, unknown>[]
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
          if (sql.includes('FROM drafts')) return options.draft ?? null
          return null
        },
        async all() {
          queries.push({ sql, binds: statement.binds })
          if (sql.includes('FROM draft_audit')) return { results: options.audit ?? [] }
          if (sql.includes('FROM draft_entities')) return { results: options.entities ?? [] }
          if (sql.includes('FROM draft_presence')) return { results: options.presence ?? [] }
          return { results: [] }
        },
        async run() {
          queries.push({ sql, binds: statement.binds })
          return { success: true }
        }
      }
      return statement
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      for (const statement of statements) {
        await statement.run()
      }
      return statements.map(() => ({ success: true }))
    }
  }
  return { db: db as unknown as D1Database, queries }
}

describe('draft events store', () => {
  it('returns audit rows after the cursor with summaries', async () => {
    const { db, queries } = mockDb({
      audit: [{
        id: 4,
        entity_type: 'series',
        entity_key: 'new-series',
        action: 'add',
        before_json: null,
        after_json: JSON.stringify({
          type: 'series',
          key: 'new-series',
          name: 'New Series',
          aliases: []
        }),
        discord_id: '1',
        username: 'craig',
        created_at: 9
      }]
    })
    await expect(listDraftEvents(db, 2, 3)).resolves.toEqual([{
      id: 4,
      entityType: 'series',
      entityKey: 'new-series',
      action: 'add',
      beforeJson: null,
      afterJson: JSON.stringify({
        type: 'series',
        key: 'new-series',
        name: 'New Series',
        aliases: []
      }),
      discordId: '1',
      username: 'craig',
      createdAt: 9,
      summary: '@craig added series New Series.',
      actor: 'craig',
      spans: [
        { text: ' added series ' },
        { text: 'New Series', entity: true },
        { text: '.' }
      ]
    }])
    expect(queries[0]?.binds).toEqual([2, 3])
  })

  it('heartbeats presence and prunes stale rows', async () => {
    const now = 50_000
    const { db, queries } = mockDb({
      presence: [{ discord_id: '1', username: 'craig' }]
    })
    await expect(touchDraftPresence(db, 2, '1', 'craig', now)).resolves.toEqual([
      { discordId: '1', username: 'craig' }
    ])
    expect(queries.some((query) => query.sql.includes('INSERT INTO draft_presence'))).toBe(true)
    expect(queries.some((query) => (
      query.sql.includes('DELETE FROM draft_presence')
      && query.binds[1] === now - PRESENCE_STALE_MS
    ))).toBe(true)
  })

  it('builds a poll payload with lock fields and the latest cursor', async () => {
    const { db } = mockDb({
      draft: {
        id: 2,
        created_at: 1,
        updated_at: 2,
        locked_at: 9,
        locked_by: '1'
      },
      entities: [],
      audit: [{
        id: 8,
        entity_type: 'series',
        entity_key: 'new-series',
        action: 'add',
        before_json: null,
        after_json: JSON.stringify({
          type: 'series',
          key: 'new-series',
          name: 'New Series',
          aliases: []
        }),
        discord_id: '1',
        username: 'craig',
        created_at: 9
      }],
      presence: [{ discord_id: '1', username: 'craig' }]
    })
    const snapshot = await pollDraftEvents(db, 2, 0, '1', 'craig', 20_000)
    expect(snapshot.after).toBe(8)
    expect(snapshot.lockedAt).toBe(9)
    expect(snapshot.lockedBy).toBe('1')
    expect(snapshot.description).toBe('')
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.presence).toEqual([{ discordId: '1', username: 'craig' }])
  })

  it('writes a lock audit row only when the draft was unlocked', async () => {
    const unlocked = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null },
      entities: []
    })
    await lockDraft(unlocked.db, 2, '1', 'craig', 50)
    expect(unlocked.queries.some((query) => (
      query.sql.includes('INSERT INTO draft_audit')
      && query.binds[0] === 2
      && query.binds[1] === 'lock'
    ))).toBe(true)

    const alreadyLocked = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: 9, locked_by: '1' },
      entities: []
    })
    await lockDraft(alreadyLocked.db, 2, '1', 'craig', 50)
    expect(alreadyLocked.queries.some((query) => query.sql.includes('INSERT INTO draft_audit'))).toBe(false)
  })

  it('writes an unlock audit row only when the draft was locked', async () => {
    const locked = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: 9, locked_by: '1' },
      entities: []
    })
    await unlockDraft(locked.db, 2, '1', 'craig', 50)
    expect(locked.queries.some((query) => (
      query.sql.includes('INSERT INTO draft_audit')
      && query.binds[0] === 2
      && query.binds[1] === 'unlock'
    ))).toBe(true)

    const alreadyUnlocked = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null },
      entities: []
    })
    await unlockDraft(alreadyUnlocked.db, 2, '1', 'craig', 50)
    expect(alreadyUnlocked.queries.some((query) => query.sql.includes('INSERT INTO draft_audit'))).toBe(false)
  })

  it('writes a describe audit row only when the description changes', async () => {
    const changed = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null, description: '' },
      entities: []
    })
    await setDraftDescription(changed.db, 2, '  Season 3 notes.  ', '1', 'craig', 50)
    expect(changed.queries.some((query) => query.sql.includes("'describe'"))).toBe(true)

    const same = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null, description: 'Season 3 notes.' },
      entities: []
    })
    await setDraftDescription(same.db, 2, 'Season 3 notes.', '1', 'craig', 50)
    expect(same.queries.some((query) => query.sql.includes('INSERT INTO draft_audit'))).toBe(false)
  })

  it('rewrites the catalog from an Activity save and writes a restore audit', async () => {
    const { db, queries } = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null, description: 'Now.' },
      entities: [{
        entity_type: 'series',
        entity_key: 'naruto',
        name: 'Naruto Shippuden',
        series_key: null,
        aliases: JSON.stringify(['Ninja', 'Leaf']),
        import_action: 'add',
        base_aliases: JSON.stringify([]),
        revision: 2,
        last_editor_id: '1',
        last_editor_name: 'craig'
      }],
      audit: [{
        id: 4,
        entity_type: 'series',
        entity_key: 'naruto',
        action: 'import',
        before_json: null,
        after_json: JSON.stringify({
          type: 'series',
          key: 'naruto',
          name: 'Naruto',
          aliases: ['Ninja'],
          importAction: 'add',
          baseAliases: []
        }),
        discord_id: '1',
        username: 'craig',
        created_at: 9
      }]
    })
    await restoreDraft(db, 2, 4, '1', 'craig', 50)
    expect(queries.some((query) => query.sql.includes('DELETE FROM draft_entities'))).toBe(true)
    expect(queries.some((query) => (
      query.sql.includes('INSERT INTO draft_entities')
      && query.binds[2] === 'Naruto'
    ))).toBe(true)
    expect(queries.some((query) => (
      query.sql.includes("'restore'")
      && query.binds[0] === 2
    ))).toBe(true)
  })

  it('refuses to restore a lock event', async () => {
    const { db, queries } = mockDb({
      draft: { id: 2, created_at: 1, updated_at: 2, locked_at: null, locked_by: null, description: '' },
      entities: [],
      audit: [{
        id: 8,
        entity_type: 'draft',
        entity_key: '',
        action: 'lock',
        before_json: null,
        after_json: null,
        discord_id: '1',
        username: 'craig',
        created_at: 9
      }]
    })
    await expect(restoreDraft(db, 2, 8, '1', 'craig', 50)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    expect(queries.some((query) => query.sql.includes('DELETE FROM draft_entities'))).toBe(false)
  })
})
