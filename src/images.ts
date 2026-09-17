export const UNCACHED_CDN = 'https://d29rfjkp84y49u.cloudfront.net'

const IMAGE_KEY = /^(cards|thumbs)\/(?:versioned\/)?[^./][^/]*\.jpg$/

export function keyedImagePath(key: string, edition: string, version = 0): string {
  const name = encodeURIComponent(key)
  if (version > 0) {
    return `cards/versioned/${name}-${edition}-${version}.jpg`
  }
  return `cards/${name}-${edition}.jpg`
}

export function cardImageUrl(key: string, edition: string, version = 0): string {
  return `/images/${keyedImagePath(key, edition, version)}`
}

export function originImageUrl(key: string, edition: string, version = 0): string {
  return `${UNCACHED_CDN}/${keyedImagePath(key, edition, version)}`
}

export function isKeyedObjectPath(path: string): boolean {
  return IMAGE_KEY.test(path)
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

export async function serveKeyedImage(bucket: R2Bucket, objectKey: string): Promise<Response> {
  if (!isKeyedObjectPath(objectKey)) {
    return new Response('Not found', { status: 404 })
  }
  let object = await bucket.get(objectKey)
  if (!object) {
    const origin = `${UNCACHED_CDN}/${objectKey}`
    const response = await fetch(origin, { headers: { accept: 'image/jpeg' } })
    if (!response.ok || !response.body) {
      return new Response('Not found', { status: 404 })
    }
    await bucket.put(objectKey, response.body, {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    })
    object = await bucket.get(objectKey)
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
