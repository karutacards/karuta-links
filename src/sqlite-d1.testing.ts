/// <reference types="node" />
// Test-only D1 stand-in backed by Node's built-in SQLite, with every migration applied.
// It covers the parts of the D1 API this Worker uses: prepare, bind, first, all, run
// and batch. A batch runs in one transaction and rolls back on any error, as D1 does.
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

export function sqliteD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }

  function prepare(sql: string): Statement {
    let values: SQLInputValue[] = []
    const statement: Statement = {
      bind(...args: unknown[]) {
        values = args.map((value) => (value === undefined ? null : value) as SQLInputValue)
        return statement
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
        const row = statement.execute().rows[0] as Record<string, unknown> | undefined
        if (!row) return null
        return (column ? row[column] : { ...row }) as T
      },
      async all<T>() {
        const { rows, changes } = statement.execute()
        return { results: rows.map((row) => ({ ...(row as object) })) as T[], success: true, meta: { changes } }
      },
      async run() {
        const { changes, lastRowId } = statement.execute()
        return { success: true, meta: { changes, last_row_id: lastRowId } }
      }
    }
    return statement
  }

  const db = {
    prepare,
    async batch(statements: Statement[]) {
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
