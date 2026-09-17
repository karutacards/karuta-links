import { isReservedSlug } from './reserved'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
export const SLUG_LENGTH = 6
export const SLUG_PATTERN = /^[a-z0-9]{6}$/

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

export function encodeSlug(bytes: Uint8Array): string {
  if (bytes.length < SLUG_LENGTH) {
    throw new Error('Need at least 6 random bytes to encode a slug')
  }
  let slug = ''
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const byte = bytes[i]
    if (byte === undefined) {
      throw new Error('Need at least 6 random bytes to encode a slug')
    }
    slug += ALPHABET[byte % ALPHABET.length]
  }
  return slug
}

export function generateSlug(
  randomBytes: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const slug = encodeSlug(randomBytes())
    if (!isReservedSlug(slug)) {
      return slug
    }
  }
  throw new Error('Failed to generate an unreserved slug')
}
