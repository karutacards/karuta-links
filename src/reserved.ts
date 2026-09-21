export const RESERVED_SEGMENTS = [
  'albums',
  'api',
  'assets',
  'content',
  'contests',
  'drafts',
  'favicon.ico',
  'health',
  'images',
  'report',
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
