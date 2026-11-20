import { describe, expect, it } from 'vitest'
import { app } from './app'
import { insertContentDump } from './db'
import { isShortLinkSegment, parsePositiveInt } from './routing'
import { sqliteD1 } from './sqlite-d1.testing'
import type { ContentSnapshot } from './types'

const snapshot = {
  environment: 'production',
  newSeries: [{ key: 'jjk', name: 'Jujutsu Kaisen' }],
  updatedSeries: [],
  newCharacters: [],
  newEditions: [],
  updatedEditions: [],
  newSeriesAliases: [],
  newCharacterAliases: []
} as unknown as ContentSnapshot

async function request(path: string) {
  const { db } = sqliteD1()
  const created = await insertContentDump(db, snapshot)
  const env = { DB: db } as unknown as Env
  return { response: await app.request(`http://krta.cc${path.replace('{slug}', created.slug)}`, {}, env), created }
}

describe('route helpers', () => {
  it('accepts only positive ids without leading zeros', () => {
    expect(parsePositiveInt('1')).toBe(1)
    expect(parsePositiveInt('42')).toBe(42)
    expect(parsePositiveInt('0')).toBeNull()
    expect(parsePositiveInt('01')).toBeNull()
    expect(parsePositiveInt('abc')).toBeNull()
    expect(parsePositiveInt('99999999999999999999')).toBeNull()
  })

  it('treats only six-character unreserved segments as short links', () => {
    expect(isShortLinkSegment('a1b2c3')).toBe(true)
    expect(isShortLinkSegment('static')).toBe(false)
    expect(isShortLinkSegment('assets')).toBe(false)
    expect(isShortLinkSegment('abcde')).toBe(false)
    expect(isShortLinkSegment('abcdefg')).toBe(false)
    expect(isShortLinkSegment('A1B2C3')).toBe(false)
  })
})

describe('public routes', () => {
  it('serves a canonical content dump and redirects its short link there', async () => {
    const page = await request('/content/1')
    expect(page.response.status).toBe(200)
    const short = await request('/{slug}')
    expect(short.response.status).toBe(302)
    expect(short.response.headers.get('location')).toBe('/content/1')
  })

  it('returns 404 for bad ids, unknown sections and reserved names', async () => {
    for (const path of ['/content/0', '/content/01', '/content/abc', '/content/2', '/logs/1', '/static', '/abcde', '/zzzzzz']) {
      expect((await request(path)).response.status, path).toBe(404)
    }
  })

  it('answers health and robots', async () => {
    expect(await (await request('/health')).response.text()).toBe('ok')
    expect((await request('/robots.txt')).response.status).toBe(200)
  })
})

describe('content ingest', () => {
  it('refuses an oversized body that arrives without a Content-Length', async () => {
    const { db } = sqliteD1()
    const chunk = new TextEncoder().encode(' '.repeat(600_000))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.close()
      }
    })
    const response = await app.request('http://krta.cc/api/v1/content', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-ingest', 'Content-Type': 'application/json' },
      body,
      duplex: 'half'
    } as RequestInit, { DB: db, INGEST_TOKEN: 'test-ingest' } as unknown as Env)
    expect(response.status).toBe(413)
  })
})
