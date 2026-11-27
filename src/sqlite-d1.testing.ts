/// <reference types="node" />
// Test-only D1 stand-in backed by Node's built-in SQLite, with every migration applied.
// It covers the parts of the D1 API this Worker uses: prepare, bind, first, all, run
// and batch. A batch runs in one transaction and rolls back on any error, as D1 does.
// Binds follow D1: booleans become 1 or 0, undefined is refused, and each bind returns a
// new statement. Every query waits one microtask first, so concurrent requests
// interleave at each query as they do against D1.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

type Statement = {
  bind(...values: unknown[]): Statement
  first<T>(column?: string): Promise<T | null>
  all<T>(): Promise<{ results: T[]; success: true; meta: { changes: number } }>
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>
  execute(): { changes: number; lastRowId: number; rows: unknown[] }
}

function toParam(value: unknown): SQLInputValue {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a supported bind value')
  return value as SQLInputValue
}

export function sqliteD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }

  function prepare(sql: string, values: SQLInputValue[] = []): Statement {
    const statement: Statement = {
      bind(...args: unknown[]) {
        return prepare(sql, args.map(toParam))
      },
      execute() {
        const prepared = sqlite.prepare(sql)
        if (prepared.columns().length > 0) {
          return { changes: 0, lastRowId: 0, rows: prepared.all(...values) }
        }
        const result = prepared.run(...values)
        return { changes: Number(result.changes), lastRowId: Number(result.lastInsertRowid), rows: [] }
      },
      async first<T>(column?: string) {
        await Promise.resolve()
        const row = statement.execute().rows[0] as Record<string, unknown> | undefined
        if (!row) return null
        return (column ? row[column] : { ...row }) as T
      },
      async all<T>() {
        await Promise.resolve()
        const { rows, changes } = statement.execute()
        return { results: rows.map((row) => ({ ...(row as object) })) as T[], success: true, meta: { changes } }
      },
      async run() {
        await Promise.resolve()
        const { changes, lastRowId } = statement.execute()
        return { success: true, meta: { changes, last_row_id: lastRowId } }
      }
    }
    return statement
  }

  const db = {
    prepare: (sql: string) => prepare(sql),
    async batch(statements: Statement[]) {
      await Promise.resolve()
      sqlite.exec('BEGIN')
      try {
        const results = statements.map((statement) => {
          const { rows, changes, lastRowId } = statement.execute()
          return { results: rows, success: true, meta: { changes, last_row_id: lastRowId } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    }
  }
  return { db: db as unknown as D1Database, sqlite }
}
