import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { createSessionCookie, newSession, parseCookies, NEXT_COOKIE } from './session'
import type { AlbumSnapshot } from './album-types'

const snapshot: AlbumSnapshot = {
  albums: [{ id: 'summer', cards: [null, null, null, null, null, null, null, null], background: 'default' }],
  cards: [{
    instanceKey: 'natsu:1:2',
    code: 'abc',
    character: 'natsu',
    edition: 1,
    number: 2,
    quality: 0,
    version: 0
  }],
}

vi.mock('./firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./firestore')>()
  return {
    ...actual,
    listFirestoreDocuments: async (_project: string, _account: string, path: string) => {
      if (path.endsWith('/albums')) {
        return [{ id: 'summer', data: snapshot.albums[0] }]
      }
      if (path.endsWith('/cards')) {
        return [{ id: 'natsu:1:2', data: { code: 'abc', metaCharacterId: 'natsu', edition: 1, number: 2 } }]
      }
      return []
    }
  }
})

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DRAFT_WRITE: { limit: async () => ({ success: true }) },
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    DISCORD_CLIENT_ID: 'test-client',
    DISCORD_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret',
    FIRESTORE_PROJECT_ID: 'test-project',
    FIRESTORE_SERVICE_ACCOUNT: 'test-service-account',
    ...overrides
  }
}

function albumDb(row: { fetched_at: number; payload: string } | null = null): D1Database {
  let stored = row
  return {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          statement.binds = args
          return statement
        },
        async first() {
          if (sql.includes('SELECT') && stored) {
            return stored
          }
          return null
        },
        async run() {
          if (sql.includes('INSERT')) {
            stored = {
              fetched_at: statement.binds[1] as number,
              payload: statement.binds[2] as string
            }
          }
          return { success: true }
        }
      }
      return statement
    }
  } as unknown as D1Database
}

async function cookieHeader(): Promise<string> {
  const header = await createSessionCookie(newSession('1', 'tester'), 'test-session-secret', false)
  return header.split(';')[0] ?? ''
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('album routes', () => {
  it('starts OAuth and returns to /albums', async () => {
    const response = await app.request('http://127.0.0.1:8787/albums', {}, testEnv())
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('href="/api/auth/discord?next=/albums"')
    expect(page).toContain('0;url=/api/auth/discord?next=/albums')
    expect(page).toContain('Sign in with Discord to plan albums from the cards you already own.')

    const start = await app.request(
      'http://127.0.0.1:8787/api/auth/discord?next=/albums',
      {},
      testEnv()
    )
    const nextCookie = start.headers.getSetCookie().find((cookie) => cookie.startsWith(`${NEXT_COOKIE}=`))
    expect(parseCookies(nextCookie ?? null)[NEXT_COOKIE]).toBe('/albums')
  })

  it('renders a snapshot for a signed-in user', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/albums',
      { headers: { Cookie: await cookieHeader() } },
      testEnv({ DB: albumDb() })
    )
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('id="refresh"')
    expect(page).toContain('window.__ALBUMS__')
    expect(page).toContain('natsu')
    expect(page).toContain('/images/characters/')
    expect(page).toContain('alt="tester"')
    expect(page).not.toContain('<span>tester</span>')
    expect(page).toContain('Drag a card onto a slot to start an album.')
    expect(page).toContain('ensureAlbum')
    expect(page).toContain('backgroundKeys')
    expect(page).toContain('abstractdragons')
    expect(page).not.toContain('You can refresh again in a few minutes.')
  })

  it('reads D1 on later visits without requiring a new pull', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/api/v1/albums/snapshot',
      { headers: { Cookie: await cookieHeader() } },
      testEnv({
        DB: albumDb({ fetched_at: 50, payload: JSON.stringify(snapshot) })
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json() as { fetchedAt: number; snapshot: AlbumSnapshot }
    expect(body.fetchedAt).toBe(50)
    expect(body.snapshot.albums[0]?.id).toBe('summer')
  })

  it('caps refresh at once per 10 minutes', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/albums/refresh',
      { method: 'POST', headers: { Cookie: await cookieHeader() } },
      testEnv({
        DB: albumDb({ fetched_at: Date.now() - 60_000, payload: JSON.stringify(snapshot) })
      })
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBeTruthy()
    const body = await response.json() as { error: string; message: string }
    expect(body.error).toBe('RATE_LIMITED')
    expect(body.message.endsWith('.')).toBe(true)
  })

  it('allows a first-ever refresh', async () => {
    const response = await app.request(
      'http://127.0.0.1:8787/albums/refresh',
      { method: 'POST', headers: { Cookie: await cookieHeader() } },
      testEnv({ DB: albumDb() })
    )
    expect(response.status).toBe(200)
    const body = await response.json() as { snapshot: AlbumSnapshot }
    expect(body.snapshot.albums[0]?.id).toBe('summer')
    expect(body.snapshot.cards[0]?.code).toBe('abc')
    expect(body.snapshot).not.toHaveProperty('backgrounds')
    expect(body.snapshot).not.toHaveProperty('emptyAlbum')
  })
})
