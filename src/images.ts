export const UNCACHED_CDN = 'https://d29rfjkp84y49u.cloudfront.net'
export const CONTEST_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

const ORIGIN_KEY = /^(cards|thumbs)\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CHARACTER_PUBLIC = /^characters\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CONTEST_KEY = /^contests\/card\/[1-9][0-9]*\/(?:[1-9][0-9]*|ref)$/

function encodedName(key: string, edition: string, version: number, folder: 'cards' | 'characters'): string {
  const name = encodeURIComponent(key)
  if (version > 0) {
    return `${folder}/versioned/${name}-${edition}-${version}.jpg`
  }
  return `${folder}/${name}-${edition}.jpg`
}

export function keyedImagePath(key: string, edition: string, version = 0): string {
  return encodedName(key, edition, version, 'cards')
}

export function publicCharacterPath(key: string, edition: string, version = 0): string {
  return encodedName(key, edition, version, 'characters')
}

export function characterImageUrl(key: string, edition: string, version = 0): string {
  return `/images/${publicCharacterPath(key, edition, version)}`
}

export function originImageUrl(key: string, edition: string, version = 0): string {
  return `${UNCACHED_CDN}/${keyedImagePath(key, edition, version)}`
}

export type ContestImageSlot = number | 'ref'

export function contestImagePath(eventCounter: number, slot: ContestImageSlot): string {
  return `contests/card/${eventCounter}/${slot}`
}

export function contestImageUrl(eventCounter: number, slot: ContestImageSlot): string {
  return `/images/${contestImagePath(eventCounter, slot)}`
}

export function originKeyFromImagePath(path: string): string | null {
  if (CHARACTER_PUBLIC.test(path)) {
    return `cards/${path.slice('characters/'.length)}`
  }
  if (ORIGIN_KEY.test(path)) {
    return path
  }
  return null
}

export function isKeyedObjectPath(path: string): boolean {
  return CHARACTER_PUBLIC.test(path) || ORIGIN_KEY.test(path)
}

export function isContestObjectPath(path: string): boolean {
  return CONTEST_KEY.test(path) && !path.includes('..')
}

export async function ensureKeyedFull(
  bucket: R2Bucket,
  key: string,
  edition: string,
  version = 0
): Promise<boolean> {
  const objectKey = keyedImagePath(key, edition, version)
  const existing = await bucket.head(objectKey)
  if (existing) return true
  const response = await fetch(originImageUrl(key, edition, version), {
    headers: { accept: 'image/jpeg' }
  })
  if (response.status === 403 || response.status === 404) return false
  if (!response.ok) return false
  await bucket.put(objectKey, response.body, {
    httpMetadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  })
  return true
}

export function legacyContestImagePath(eventCounter: number, cardId: string): string[] {
  return [
    `contests/card_hunt/${eventCounter}/${encodeURIComponent(cardId)}`,
    `contests/card_hunt/${eventCounter}/${cardId}`
  ]
}

export async function promoteLegacyContestImage(
  bucket: R2Bucket,
  eventCounter: number,
  cardId: string,
  objectKey: string
): Promise<boolean> {
  if (!isContestObjectPath(objectKey)) return false
  if (await bucket.head(objectKey)) return true
  for (const oldKey of legacyContestImagePath(eventCounter, cardId)) {
    const object = await bucket.get(oldKey)
    if (!object?.body) continue
    await bucket.put(objectKey, object.body, {
      httpMetadata: object.httpMetadata ?? {
        contentType: 'image/jpeg',
        cacheControl: CONTEST_IMAGE_CACHE_CONTROL
      }
    })
    return true
  }
  return false
}

export async function copyContestImage(
  bucket: R2Bucket,
  objectKey: string,
  sourceUrl: string
): Promise<boolean> {
  if (!isContestObjectPath(objectKey)) return false
  const existing = await bucket.head(objectKey)
  if (existing) return true
  const response = await fetch(sourceUrl, { headers: { accept: 'image/*' } })
  if (!response.ok || !response.body) return false
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  await bucket.put(objectKey, response.body, {
    httpMetadata: {
      contentType,
      cacheControl: CONTEST_IMAGE_CACHE_CONTROL
    }
  })
  return true
}

async function serveContestImage(
  bucket: R2Bucket,
  objectKey: string,
  requestUrl?: string
): Promise<Response> {
  const cache = caches.default
  const cacheKey = requestUrl ? new Request(requestUrl, { method: 'GET' }) : null
  if (cacheKey) {
    const hit = await cache.match(cacheKey)
    if (hit) {
      return hit
    }
  }
  const object = await bucket.get(objectKey)
  if (!object) {
    return new Response('Not found', { status: 404 })
  }
  const response = new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': CONTEST_IMAGE_CACHE_CONTROL,
      'cdn-cache-control': CONTEST_IMAGE_CACHE_CONTROL,
      'x-content-type-options': 'nosniff'
    }
  })
  if (cacheKey) {
    await cache.put(cacheKey, response.clone())
  }
  return response
}

export async function serveKeyedImage(
  bucket: R2Bucket,
  objectKey: string,
  requestUrl?: string
): Promise<Response> {
  if (isContestObjectPath(objectKey)) {
    return serveContestImage(bucket, objectKey, requestUrl)
  }
  if (objectKey.startsWith('cards/') && ORIGIN_KEY.test(objectKey)) {
    return new Response(null, {
      status: 301,
      headers: {
        location: `/images/characters/${objectKey.slice('cards/'.length)}`
      }
    })
  }
  const originKey = originKeyFromImagePath(objectKey)
  if (!originKey || !ORIGIN_KEY.test(originKey)) {
    return new Response('Not found', { status: 404 })
  }
  let object = await bucket.get(originKey)
  if (!object) {
    const origin = `${UNCACHED_CDN}/${originKey}`
    const response = await fetch(origin, { headers: { accept: 'image/jpeg' } })
    if (!response.ok || !response.body) {
      return new Response('Not found', { status: 404 })
    }
    await bucket.put(originKey, response.body, {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    })
    object = await bucket.get(originKey)
  }
  if (!object) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(object.body, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff'
    }
  })
}

export async function ensureSnapshotImages(
  bucket: R2Bucket,
  snapshot: {
    newEditions: { key: string; editions: { edition: string; version: number }[] }[]
    updatedEditions: { key: string; editions: { edition: string; version: number }[] }[]
  }
): Promise<void> {
  const rows = [...snapshot.newEditions, ...snapshot.updatedEditions]
  for (const row of rows) {
    for (const edition of row.editions) {
      try {
        await ensureKeyedFull(bucket, row.key, edition.edition, edition.version)
      } catch {
        // Dump HTML still renders; GET /images will retry the origin.
      }
    }
  }
}
