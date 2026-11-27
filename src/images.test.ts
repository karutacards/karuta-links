import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  characterImageUrl,
  contestImagePath,
  contestImageUrl,
  ensureSnapshotImages,
  legacyContestImagePath,
  isContestObjectPath,
  keyedImagePath,
  originImageUrl,
  originKeyFromImagePath,
  publicCharacterPath
} from './images'

describe('keyed image paths', () => {
  it('encodes the character key the same way today does', () => {
    expect(keyedImagePath('a b', '2', 0)).toBe('cards/a%20b-2.jpg')
    expect(originImageUrl('a b', '2', 0)).toBe(
      'https://d29rfjkp84y49u.cloudfront.net/cards/a%20b-2.jpg'
    )
  })

  it('publishes character-art URLs under /images/characters', () => {
    expect(keyedImagePath('gojo-satoru', '8', 1)).toBe('cards/versioned/gojo-satoru-8-1.jpg')
    expect(publicCharacterPath('gojo-satoru', '8', 1)).toBe(
      'characters/versioned/gojo-satoru-8-1.jpg'
    )
    expect(characterImageUrl('gojo-satoru', '8', 1)).toBe(
      '/images/characters/versioned/gojo-satoru-8-1.jpg'
    )
    expect(originKeyFromImagePath('characters/gojo-satoru-1.jpg')).toBe(
      'cards/gojo-satoru-1.jpg'
    )
  })

  it('rejects traversal in the image route', () => {
    expect(originKeyFromImagePath('characters/gojo-satoru-1.jpg')).not.toBeNull()
    expect(originKeyFromImagePath('cards/gojo-satoru-1.jpg')).not.toBeNull()
    expect(originKeyFromImagePath('../cards/x.jpg')).toBeNull()
    expect(originKeyFromImagePath('cards/../secret')).toBeNull()
    expect(originKeyFromImagePath('characters/../secret')).toBeNull()
    expect(originKeyFromImagePath('thumbs/gojo-satoru-1.jpg')).toBeNull()
  })

  it('keeps framed contest cards off the character-art prefix', () => {
    expect(contestImagePath(12, 3)).toBe('contests/card/12/3')
    expect(contestImageUrl(12, 3)).toBe('/images/contests/card/12/3')
    expect(contestImagePath(12, 'ref')).toBe('contests/card/12/ref')
    expect(isContestObjectPath('contests/card/12/3')).toBe(true)
    expect(isContestObjectPath('contests/card/12/ref')).toBe(true)
    expect(isContestObjectPath('contests/card/12/0')).toBe(false)
    expect(isContestObjectPath('contests/card_hunt/12/ab-cd')).toBe(false)
    expect(isContestObjectPath('contests/card/12/../secret')).toBe(false)
    expect(originKeyFromImagePath('contests/card/12/3')).toBeNull()
    expect(legacyContestImagePath(1, 'ichika-nakano:4:12741')).toEqual([
      'contests/card_hunt/1/ichika-nakano%3A4%3A12741',
      'contests/card_hunt/1/ichika-nakano:4:12741'
    ])
  })
})

// An R2 stand-in that keeps each object's bytes as text.
function fakeBucket(objects: Record<string, string>) {
  const stored = new Map(Object.entries(objects))
  const bucket = {
    async head(key: string) {
      return stored.has(key) ? {} : null
    },
    async put(key: string, value: ArrayBuffer) {
      stored.set(key, new TextDecoder().decode(value))
      return {}
    }
  } as unknown as R2Bucket
  return { bucket, stored }
}

function stubOrigin(answer: () => Response | Promise<Response>) {
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, signal: init?.signal })
    return answer()
  })
  return calls
}

const editionRows = [{ key: 'gojo-satoru', editions: [{ edition: '8', version: 1 }] }]

const snapshot = (list: 'newEditions' | 'updatedEditions') => (
  list === 'newEditions'
    ? { newEditions: editionRows, updatedEditions: [] }
    : { newEditions: [], updatedEditions: editionRows }
)

describe('ensureSnapshotImages', () => {
  const objectKey = 'cards/versioned/gojo-satoru-8-1.jpg'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refetches a stored edition that the dump lists as updated', async () => {
    const { bucket, stored } = fakeBucket({ [objectKey]: 'old art' })
    const calls = stubOrigin(() => new Response('new art', { status: 200 }))
    await ensureSnapshotImages(bucket, snapshot('updatedEditions'))
    expect(calls.map((call) => call.url)).toEqual([originImageUrl('gojo-satoru', '8', 1)])
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(stored.get(objectKey)).toBe('new art')
  })

  it('keeps the stored copy when the origin refuses or fails', async () => {
    const { bucket, stored } = fakeBucket({ [objectKey]: 'old art' })
    stubOrigin(() => new Response('denied', { status: 403 }))
    await ensureSnapshotImages(bucket, snapshot('updatedEditions'))
    expect(stored.get(objectKey)).toBe('old art')
    stubOrigin(() => new Response('', { status: 200 }))
    await ensureSnapshotImages(bucket, snapshot('updatedEditions'))
    expect(stored.get(objectKey)).toBe('old art')
    stubOrigin(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    await ensureSnapshotImages(bucket, snapshot('updatedEditions'))
    expect(stored.get(objectKey)).toBe('old art')
  })

  it('leaves a stored new edition alone and copies a missing one', async () => {
    const { bucket, stored } = fakeBucket({ [objectKey]: 'old art' })
    const calls = stubOrigin(() => new Response('new art', { status: 200 }))
    await ensureSnapshotImages(bucket, snapshot('newEditions'))
    expect(calls).toEqual([])
    expect(stored.get(objectKey)).toBe('old art')
    const empty = fakeBucket({})
    await ensureSnapshotImages(empty.bucket, snapshot('newEditions'))
    expect(empty.stored.get(objectKey)).toBe('new art')
  })
})
