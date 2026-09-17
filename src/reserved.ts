export const RESERVED_SEGMENTS = [
  'api',
  'assets',
  'content',
  'contests',
  'favicon.ico',
  'health',
  'images',
  'robots.txt',
  'static'
] as const

const reserved = new Set<string>(RESERVED_SEGMENTS)

export function isReservedSegment(segment: string): boolean {
  return reserved.has(segment.toLowerCase())
}

export function isReservedSlug(slug: string): boolean {
  return isReservedSegment(slug)
}
