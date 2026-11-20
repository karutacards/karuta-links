import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContestSource } from './contest'
import { getContestDocument, lastDumpedEvent } from './db'
import { IMAGE_REPAIR_INTERVAL_MS, IMAGE_REPAIR_WINDOW_MS, pollCardHunt } from './poll'
import { sqliteD1 } from './sqlite-d1.testing'

function memoryBucket(): { bucket: R2Bucket; keys: Set<string> } {
  const keys = new Set<string>()
  const bucket = {
    async head(key: string) {
      return keys.has(key) ? { key } : null
    },
    async get() {
      return null
    },
    async put(key: string) {
      keys.add(key)
      return { key }
    }
  }
  return { bucket: bucket as unknown as R2Bucket, keys }
}

function source(overrides: Partial<ContestSource> = {}): ContestSource {
  return {
    getParent: async () => ({ eventCounter: 7 }),
    getEvent: async () => ({ rewarded: true, description: 'Hunt', winners: [] }),
    listEntries: async () => [{
      id: 'card1',
      data: {
        code: 'abc',
        edition: 1,
        number: 2,
        contestScore: 900,
        contestSubmittedAt: 100,
        contestImageUrl: 'https://example.test/card1.png'
      }
    }],
    ...overrides
  }
}

function env(db: D1Database, bucket: R2Bucket): Env {
  return { DB: db, IMAGES: bucket } as unknown as Env
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Card Hunt poll', () => {
  it('writes the event, its claim and its images', async () => {
    vi.stubGlobal('fetch', async () => new Response('jpeg', { headers: { 'content-type': 'image/png' } }))
    const { db } = sqliteD1()
    const { bucket, keys } = memoryBucket()
    expect(await pollCardHunt(env(db, bucket), source())).toBe('created')
    expect(await lastDumpedEvent(db)).toBe(7)
    expect((await getContestDocument(db, 7))?.snapshot.entries).toHaveLength(1)
    expect([...keys]).toContain('contests/card/7/1')
    expect(await pollCardHunt(env(db, bucket), source())).toBe('skipped')
  })

  it('leaves no claim behind when Firestore fails, so the next poll retries', async () => {
    vi.stubGlobal('fetch', async () => new Response('jpeg'))
    const { db } = sqliteD1()
    const { bucket } = memoryBucket()
    const failing = source({ listEntries: async () => { throw new Error('Firestore 503') } })
    await expect(pollCardHunt(env(db, bucket), failing)).rejects.toThrow('Firestore 503')
    expect(await lastDumpedEvent(db)).toBe(0)
    expect(await pollCardHunt(env(db, bucket), source())).toBe('created')
  })

  it('retries a failed image copy on the newest contest every ten minutes for a day', async () => {
    const { db } = sqliteD1()
    const { bucket, keys } = memoryBucket()
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }))

    expect(await pollCardHunt(env(db, bucket), source())).toBe('created')
    expect(keys.size).toBe(0)

    vi.stubGlobal('fetch', async () => new Response('jpeg'))
    const slot = (time: number) => time - (time % IMAGE_REPAIR_INTERVAL_MS)
    const later = slot(Date.now() + IMAGE_REPAIR_WINDOW_MS + IMAGE_REPAIR_INTERVAL_MS)
    await pollCardHunt(env(db, bucket), source(), later)
    expect(keys.size).toBe(0)
    const nextSlot = slot(Date.now()) + IMAGE_REPAIR_INTERVAL_MS
    await pollCardHunt(env(db, bucket), source(), nextSlot + 60_000)
    expect(keys.size).toBe(0)
    await pollCardHunt(env(db, bucket), source(), nextSlot)
    expect([...keys]).toContain('contests/card/7/1')
  })
})
