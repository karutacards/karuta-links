import { describe, expect, it } from 'vitest'
import { app } from './app'
import { ALBUMS_UNAVAILABLE } from './albums'

function testEnv(): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DRAFT_WRITE: { limit: async () => ({ success: true }) },
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    DISCORD_CLIENT_ID: 'test-client',
    DISCORD_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret',
    FIRESTORE_PROJECT_ID: 'test-project',
    FIRESTORE_SERVICE_ACCOUNT: 'test-service-account'
  }
}

describe('album routes', () => {
  it('keeps GET /albums dark', async () => {
    const response = await app.request('http://127.0.0.1:8787/albums', {}, testEnv())
    expect(response.status).toBe(503)
    const page = await response.text()
    expect(page).toContain(ALBUMS_UNAVAILABLE)
    expect(page).not.toContain('window.__ALBUMS__')
    expect(page).not.toContain('/api/auth/discord?next=/albums')
  })

  it('keeps the snapshot and refresh routes dark', async () => {
    const snapshot = await app.request(
      'http://127.0.0.1:8787/api/v1/albums/snapshot',
      {},
      testEnv()
    )
    expect(snapshot.status).toBe(503)
    expect(await snapshot.json()).toEqual({
      error: 'UNAVAILABLE',
      message: ALBUMS_UNAVAILABLE
    })

    const refresh = await app.request(
      'http://127.0.0.1:8787/albums/refresh',
      { method: 'POST' },
      testEnv()
    )
    expect(refresh.status).toBe(503)
    expect(await refresh.json()).toEqual({
      error: 'UNAVAILABLE',
      message: ALBUMS_UNAVAILABLE
    })
  })
})
