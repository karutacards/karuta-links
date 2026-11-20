import { readContestSnapshot } from './contest'
import { generateSlug } from './slug'
import {
  CARD_HUNT_NAME,
  CONTEST_KIND,
  CONTEST_SECTION,
  CONTENT_KIND,
  CONTENT_SECTION,
  type ContentSnapshot,
  type ContestSnapshot,
  type ListedContest,
  type ListedDump
} from './types'

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

const SLUG_ATTEMPTS = 8

// Writes a document, its short link and any extra statements in one D1 transaction.
// A slug collision retries with a new slug. Any other unique-constraint failure is
// returned as 'duplicate' so the caller can decide what it means.
async function insertDocument(
  db: D1Database,
  section: string,
  id: number,
  kind: string,
  payload: string,
  createdAt: number,
  before: D1PreparedStatement[] = []
): Promise<{ id: number; slug: string } | 'duplicate'> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateSlug()
    try {
      await db.batch([
        ...before,
        db.prepare(
          `INSERT INTO documents (section, id, created_at, kind, payload)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(section, id, createdAt, kind, payload),
        db.prepare(
          `INSERT INTO slugs (slug, section, id) VALUES (?, ?, ?)`
        ).bind(slug, section, id)
      ])
      return { id, slug }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/UNIQUE/i.test(message)) {
        throw error
      }
      if (!/slugs\.slug/i.test(message)) {
        return 'duplicate'
      }
    }
  }

  throw new Error('Failed to allocate a unique slug')
}

export async function insertContentDump(
  db: D1Database,
  snapshot: ContentSnapshot,
  createdAt = Date.now()
): Promise<{ id: number; slug: string }> {
  const id = await allocateId(db, CONTENT_SECTION)
  const result = await insertDocument(
    db, CONTENT_SECTION, id, CONTENT_KIND, JSON.stringify(snapshot), createdAt
  )
  if (result === 'duplicate') {
    throw new Error(`Content document ${id} already exists`)
  }
  return result
}

// Claims the Card Hunt event and writes its page in one transaction, so a failed
// write never leaves a claim behind that would hide the event from later polls.
// Returns null when the event was already claimed or written.
export async function insertContestDump(
  db: D1Database,
  snapshot: ContestSnapshot,
  createdAt = Date.now(),
  contestName = CARD_HUNT_NAME
): Promise<{ id: number; slug: string } | null> {
  const id = snapshot.eventCounter
  if (!Number.isSafeInteger(id) || id < 1) {
    return null
  }
  const claim = db.prepare(
    `INSERT INTO contest_dumps (contest_name, event_counter, document_id)
     VALUES (?, ?, ?)`
  ).bind(contestName, id, id)
  const result = await insertDocument(
    db, CONTEST_SECTION, id, CONTEST_KIND, JSON.stringify(snapshot), createdAt, [claim]
  )
  return result === 'duplicate' ? null : result
}

export async function lastDumpedEvent(
  db: D1Database,
  contestName = CARD_HUNT_NAME
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(event_counter) AS event_counter
       FROM contest_dumps
       WHERE contest_name = ?`
    )
    .bind(contestName)
    .first<{ event_counter: number | null }>()
  return row?.event_counter ?? 0
}

export async function getContestDocument(
  db: D1Database,
  id: number
): Promise<{ createdAt: number; snapshot: ContestSnapshot; slug: string | null } | null> {
  const document = await db
    .prepare(
      `SELECT documents.created_at AS created_at, documents.payload AS payload, slugs.slug AS slug
       FROM documents
       LEFT JOIN slugs ON slugs.section = documents.section AND slugs.id = documents.id
       WHERE documents.section = ? AND documents.id = ?`
    )
    .bind(CONTEST_SECTION, id)
    .first<{ created_at: number; payload: string; slug: string | null }>()

  if (!document) {
    return null
  }

  return {
    createdAt: document.created_at,
    snapshot: readContestSnapshot(document.payload),
    slug: document.slug
  }
}

export async function listRecentContests(db: D1Database, limit = 50): Promise<ListedContest[]> {
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
    .bind(CONTEST_SECTION, limit)
    .all<{ id: number; created_at: number; payload: string; slug: string | null }>()

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    slug: row.slug,
    snapshot: readContestSnapshot(row.payload)
  }))
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
