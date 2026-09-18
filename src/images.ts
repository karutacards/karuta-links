export const UNCACHED_CDN = 'https://d29rfjkp84y49u.cloudfront.net'

const ORIGIN_KEY = /^(cards|thumbs)\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CHARACTER_PUBLIC = /^characters\/(?:versioned\/)?[^./][^/]*\.jpg$/
const CONTEST_KEY = /^contests\/card_hunt\/[1-9][0-9]*\/[^/]+$/

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

export function contestImagePath(eventCounter: number, cardId: string): string {
  return `contests/card_hunt/${eventCounter}/${encodeURIComponent(cardId)}`
}

export function contestImageUrl(eventCounter: number, cardId: string): string {
  return `/images/${contestImagePath(eventCounter, cardId)}`
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
      cacheControl: 'public, max-age=31536000, immutable'
    }
  })
  return true
}

export async function serveKeyedImage(bucket: R2Bucket, objectKey: string): Promise<Response> {
  if (isContestObjectPath(objectKey)) {
    const object = await bucket.get(objectKey)
    if (!object) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(object.body, {
      headers: {
        'content-type': object.httpMetadata?.contentType || 'image/jpeg',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff'
      }
    })
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
