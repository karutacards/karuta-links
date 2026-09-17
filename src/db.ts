import { generateSlug } from './slug'
import { CONTENT_KIND, CONTENT_SECTION, type ContentSnapshot, type ListedDump } from './types'

export async function allocateId(db: D1Database, section: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO sequences (section, next_id) VALUES (?, 1)
       ON CONFLICT(section) DO UPDATE SET next_id = next_id + 1
       RETURNING next_id`
    )
    .bind(section)
    .first<{ next_id: number }>()

  if (!row) {
    throw new Error('Failed to allocate a document id')
  }
  return row.next_id
}

export async function insertContentDump(
  db: D1Database,
  snapshot: ContentSnapshot,
  createdAt = Date.now()
): Promise<{ id: number; slug: string }> {
  const id = await allocateId(db, CONTENT_SECTION)
  const payload = JSON.stringify(snapshot)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = generateSlug()
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO documents (section, id, created_at, kind, payload)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(CONTENT_SECTION, id, createdAt, CONTENT_KIND, payload),
        db.prepare(
          `INSERT INTO slugs (slug, section, id) VALUES (?, ?, ?)`
        ).bind(slug, CONTENT_SECTION, id)
      ])
      return { id, slug }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/UNIQUE/i.test(message) || attempt === 7) {
        throw error
      }
    }
  }

  throw new Error('Failed to allocate a unique slug')
}

export async function getDocument(
  db: D1Database,
  section: string,
  id: number
): Promise<{ createdAt: number; snapshot: ContentSnapshot; slug: string | null } | null> {
  const document = await db
    .prepare(
      `SELECT documents.created_at AS created_at, documents.payload AS payload, slugs.slug AS slug
       FROM documents
       LEFT JOIN slugs ON slugs.section = documents.section AND slugs.id = documents.id
       WHERE documents.section = ? AND documents.id = ?`
    )
    .bind(section, id)
    .first<{ created_at: number; payload: string; slug: string | null }>()

  if (!document) {
    return null
  }

  return {
    createdAt: document.created_at,
    snapshot: JSON.parse(document.payload) as ContentSnapshot,
    slug: document.slug
  }
}

export async function resolveSlug(
  db: D1Database,
  slug: string
): Promise<{ section: string; id: number } | null> {
  const row = await db
    .prepare(`SELECT section, id FROM slugs WHERE slug = ?`)
    .bind(slug)
    .first<{ section: string; id: number }>()
  return row ?? null
}

export async function listRecentContent(db: D1Database, limit = 50): Promise<ListedDump[]> {
  const rows = await db
    .prepare(
      `SELECT documents.id AS id, documents.created_at AS created_at, documents.payload AS payload,
              slugs.slug AS slug
       FROM documents
       LEFT JOIN slugs ON slugs.section = documents.section AND slugs.id = documents.id
       WHERE documents.section = ?
       ORDER BY documents.id DESC
       LIMIT ?`
    )
    .bind(CONTENT_SECTION, limit)
    .all<{ id: number; created_at: number; payload: string; slug: string | null }>()

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    slug: row.slug,
    snapshot: JSON.parse(row.payload) as ContentSnapshot
  }))
}
