export const UNCACHED_CDN = 'https://d29rfjkp84y49u.cloudfront.net'
export const CONTEST_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

const ORIGIN_KEY = /^cards\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CHARACTER_PUBLIC = /^characters\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CONTEST_KEY = /^contests\/card\/[1-9][0-9]*\/(?:[1-9][0-9]*|ref)$/

// karuta.today gives up on Karuta's origin host after the same 20 seconds.
const ORIGIN_TIMEOUT_MS = 20_000

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

export function isContestObjectPath(path: string): boolean {
  return CONTEST_KEY.test(path) && !path.includes('..')
}

function fetchKeyedOrigin(key: string, edition: string, version: number): Promise<Response> {
  return fetch(originImageUrl(key, edition, version), {
    headers: { accept: 'image/jpeg' },
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS)
  })
}

async function putKeyedFull(bucket: R2Bucket, objectKey: string, bytes: ArrayBuffer): Promise<void> {
  await bucket.put(objectKey, bytes, {
    httpMetadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  })
}

async function copyKeyedFull(
  bucket: R2Bucket,
  objectKey: string,
  key: string,
  edition: string,
  version: number
): Promise<boolean> {
  const response = await fetchKeyedOrigin(key, edition, version)
  if (!response.ok) return false
  await putKeyedFull(bucket, objectKey, await response.arrayBuffer())
  return true
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
  return copyKeyedFull(bucket, objectKey, key, edition, version)
}

// Karuta sometimes replaces the art of an already published version in place, so the keyed
// path stays the same and the stored copy goes stale. karuta.today refetches an object that
// is older than the character's update. A dump always arrives after the stored object was
// uploaded, so here that rule means refetching every stored edition the dump lists as
// updated. The stored copy is overwritten only by a 200 answer with bytes, and kept when the
// origin refuses, fails or times out.
export async function refreshKeyedFull(
  bucket: R2Bucket,
  key: string,
  edition: string,
  version = 0
): Promise<boolean> {
  const objectKey = keyedImagePath(key, edition, version)
  const existing = await bucket.head(objectKey)
  if (!existing) {
    return copyKeyedFull(bucket, objectKey, key, edition, version)
  }
  try {
    const response = await fetchKeyedOrigin(key, edition, version)
    if (response.status !== 200) return true
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 0) {
      await putKeyedFull(bucket, objectKey, bytes)
    }
  } catch {
    // Keep the stored copy.
  }
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
  if (!response.ok) return false
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  // Buffer the body: R2 refuses a stream of unknown length, such as a chunked response.
  await bucket.put(objectKey, await response.arrayBuffer(), {
    httpMetadata: {
      contentType,
      cacheControl: CONTEST_IMAGE_CACHE_CONTROL
    }
  })
  return true
}

function contestCacheUrl(requestUrl: string): string {
  const url = new URL(requestUrl)
  return `${url.origin}${url.pathname}`
}

async function serveContestImage(
  bucket: R2Bucket,
  objectKey: string,
  requestUrl?: string
): Promise<Response> {
  const cache = caches.default
  // Key the cache on the path alone, so query strings can't create extra entries.
  const cacheKey = requestUrl ? new Request(contestCacheUrl(requestUrl), { method: 'GET' }) : null
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
    const response = await fetch(origin, {
      headers: { accept: 'image/jpeg' },
      signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS)
    })
    if (!response.ok) {
      return new Response('Not found', { status: 404 })
    }
    await bucket.put(originKey, await response.arrayBuffer(), {
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
  // Browsers keep art they already cached at an unchanged URL for a year, because the
  // image route marks it immutable and the dump's stored image URLs carry no version. That
  // limit is accepted: in-place replacements are rare, and new viewers see the new art.
  const passes = [
    { rows: snapshot.newEditions, copy: ensureKeyedFull },
    { rows: snapshot.updatedEditions, copy: refreshKeyedFull }
  ]
  for (const { rows, copy } of passes) {
    for (const row of rows) {
      for (const edition of row.editions) {
        try {
          await copy(bucket, row.key, edition.edition, edition.version)
        } catch {
          // Dump HTML still renders; GET /images will retry the origin.
        }
      }
    }
  }
}
