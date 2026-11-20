import { isReservedSegment } from './reserved'
import { isSlug } from './slug'

// Parses a canonical page id: a positive integer with no leading zeros.
export function parsePositiveInt(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

// A single path segment is a short link only when it has the slug shape and isn't reserved.
export function isShortLinkSegment(segment: string): boolean {
  return isSlug(segment) && !isReservedSegment(segment)
}
