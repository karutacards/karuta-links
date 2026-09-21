import { getFirestoreDocument, listFirestoreDocuments } from './firestore'
import {
  ALBUM_REFRESH_MS,
  DEFAULT_ALBUM_BACKGROUND,
  type AlbumSnapshot,
  type CompactCard,
  type SnapshotAlbum
} from './album-types'

export class AlbumRefreshLimited extends Error {
  readonly retryAfter: number

  constructor(retryAfter: number) {
    super('You can refresh again in a few minutes.')
    this.name = 'AlbumRefreshLimited'
    this.retryAfter = retryAfter
  }
}

export class AlbumSnapshotError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AlbumSnapshotError'
    this.status = status
  }
}

type SnapshotRow = {
  fetched_at: number
  payload: string
}

const DYE_HEX = /^#([0-9a-fA-F]{6})$/

function firestoreReady(env: Env): env is Env & {
  FIRESTORE_PROJECT_ID: string
  FIRESTORE_SERVICE_ACCOUNT: string
} {
  return Boolean(env.FIRESTORE_PROJECT_ID && env.FIRESTORE_SERVICE_ACCOUNT)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function dyeHex(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = DYE_HEX.exec(value)
    return match ? `#${match[1].toLowerCase()}` : undefined
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }
  return dyeHex(asRecord(value).color)
}

function itemCount(doc: Record<string, unknown> | null): number {
  return Math.max(0, Math.floor(asNumber(doc?.count)))
}

function parseInstanceKey(id: string): { character: string; edition: number; number: number } {
  const parts = id.split(':')
  return {
    character: parts[0] ?? '',
    edition: Number(parts[1]) || 0,
    number: Number(parts[2]) || 0
  }
}

export function compactCard(
  id: string,
  data: Record<string, unknown>
): CompactCard | null {
  const parsed = parseInstanceKey(id)
  const character = asString(data.metaCharacterId) || parsed.character
  const code = asString(data.code).toLowerCase()
  const edition = asNumber(data.edition, parsed.edition)
  const number = asNumber(data.number, parsed.number)
  if (!character || !code || edition < 1 || number < 1) {
    return null
  }
  const dye = dyeHex(data.dye)
  const card: CompactCard = {
    instanceKey: id || `${character}:${edition}:${number}`,
    code,
    character,
    edition,
    number,
    quality: Math.max(0, Math.min(4, Math.floor(asNumber(data.quality)))),
    version: Math.max(0, Math.floor(asNumber(data.version)))
  }
  if (dye) {
    card.dye = dye
  }
  return card
}

function compactAlbum(id: string, data: Record<string, unknown>): SnapshotAlbum {
  const raw = Array.isArray(data.cards) ? data.cards : []
  const cards = raw.map((item) => typeof item === 'string' && item ? item : null)
  const pages = Math.max(1, Math.ceil(cards.length / 8) || 1)
  while (cards.length < pages * 8) {
    cards.push(null)
  }
  const background = asString(data.background) || DEFAULT_ALBUM_BACKGROUND
  return {
    id: asString(data.id) || id,
    cards,
    background
  }
}

export function parseAlbumSnapshot(raw: string): AlbumSnapshot | null {
  try {
    const data = JSON.parse(raw) as Partial<AlbumSnapshot>
    if (!Array.isArray(data.albums) || !Array.isArray(data.cards) || !Array.isArray(data.backgrounds)) {
      return null
    }
    return {
      albums: data.albums,
      cards: data.cards,
      backgrounds: data.backgrounds,
      emptyAlbum: asNumber(data.emptyAlbum),
      emptyPage: asNumber(data.emptyPage)
    }
  } catch {
    return null
  }
}

export async function getAlbumSnapshotRow(
  db: D1Database,
  discordId: string
): Promise<SnapshotRow | null> {
  return db
    .prepare('SELECT fetched_at, payload FROM album_snapshots WHERE discord_id = ?')
    .bind(discordId)
    .first<SnapshotRow>()
}

export async function putAlbumSnapshot(
  db: D1Database,
  discordId: string,
  fetchedAt: number,
  snapshot: AlbumSnapshot
): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO album_snapshots (discord_id, fetched_at, payload) VALUES (?, ?, ?)'
    )
    .bind(discordId, fetchedAt, JSON.stringify(snapshot))
    .run()
}

export async function pullAlbumSnapshot(env: Env, discordId: string): Promise<AlbumSnapshot> {
  if (!firestoreReady(env)) {
    throw new AlbumSnapshotError('Album snapshots are unavailable.', 503)
  }
  const projectId = env.FIRESTORE_PROJECT_ID
  const serviceAccount = env.FIRESTORE_SERVICE_ACCOUNT
  const [albumRows, cardRows, unlocked, emptyAlbum, emptyPage] = await Promise.all([
    listFirestoreDocuments(projectId, serviceAccount, `users/${discordId}/albums`),
    listFirestoreDocuments(projectId, serviceAccount, `users/${discordId}/cards`),
    getFirestoreDocument(projectId, serviceAccount, `users/${discordId}/backgrounds/unlocked`),
    getFirestoreDocument(projectId, serviceAccount, `users/${discordId}/items/empty-album`),
    getFirestoreDocument(projectId, serviceAccount, `users/${discordId}/items/empty-page`)
  ])
  const unlockedKeys = Array.isArray(asRecord(unlocked).backgrounds)
    ? (asRecord(unlocked).backgrounds as unknown[]).filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  const backgrounds = [DEFAULT_ALBUM_BACKGROUND]
  for (const key of unlockedKeys) {
    if (!backgrounds.includes(key)) {
      backgrounds.push(key)
    }
  }
  const cards: CompactCard[] = []
  for (const row of cardRows) {
    const card = compactCard(row.id, row.data)
    if (card) {
      cards.push(card)
    }
  }
  return {
    albums: albumRows.map((row) => compactAlbum(row.id, row.data)),
    cards,
    backgrounds,
    emptyAlbum: itemCount(emptyAlbum),
    emptyPage: itemCount(emptyPage)
  }
}

export async function loadAlbumSnapshot(
  env: Env,
  discordId: string,
  now = Date.now()
): Promise<{ snapshot: AlbumSnapshot; fetchedAt: number }> {
  const row = await getAlbumSnapshotRow(env.DB, discordId)
  if (row) {
    const snapshot = parseAlbumSnapshot(row.payload)
    if (snapshot) {
      return { snapshot, fetchedAt: row.fetched_at }
    }
  }
  const snapshot = await pullAlbumSnapshot(env, discordId)
  await putAlbumSnapshot(env.DB, discordId, now, snapshot)
  return { snapshot, fetchedAt: now }
}

export function refreshWaitSeconds(fetchedAt: number, now = Date.now()): number {
  const wait = ALBUM_REFRESH_MS - (now - fetchedAt)
  return wait > 0 ? Math.ceil(wait / 1000) : 0
}

export async function refreshAlbumSnapshot(
  env: Env,
  discordId: string,
  now = Date.now()
): Promise<{ snapshot: AlbumSnapshot; fetchedAt: number }> {
  const row = await getAlbumSnapshotRow(env.DB, discordId)
  if (row) {
    const wait = refreshWaitSeconds(row.fetched_at, now)
    if (wait > 0) {
      throw new AlbumRefreshLimited(wait)
    }
  }
  const snapshot = await pullAlbumSnapshot(env, discordId)
  await putAlbumSnapshot(env.DB, discordId, now, snapshot)
  return { snapshot, fetchedAt: now }
}
