import { isReservedSlug } from './reserved'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
export const SLUG_LENGTH = 6
export const SLUG_PATTERN = /^[a-z0-9]{6}$/

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

// 252 is the largest multiple of 36 below 256. Bytes at or above it are skipped, so
// every character is equally likely.
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length)

// Builds a slug from random bytes, or returns null when too few usable bytes remain.
export function encodeSlug(bytes: Uint8Array): string | null {
  let slug = ''
  for (const byte of bytes) {
    if (byte >= UNBIASED_LIMIT) continue
    slug += ALPHABET[byte % ALPHABET.length]
    if (slug.length === SLUG_LENGTH) return slug
  }
  return null
}

export function generateSlug(
  randomBytes: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(SLUG_LENGTH * 2))
): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const slug = encodeSlug(randomBytes())
    if (slug && !isReservedSlug(slug)) {
      return slug
    }
  }
  throw new Error('Failed to generate an unreserved slug')
}
