import { describe, expect, it } from 'vitest'
import { encodeSlug, generateSlug, isSlug, SLUG_LENGTH } from './slug'

describe('slugs', () => {
  it('accepts six lowercase alphanumeric characters', () => {
    expect(isSlug('a1b2c3')).toBe(true)
    expect(isSlug('abcdef')).toBe(true)
    expect(isSlug('abcde')).toBe(false)
    expect(isSlug('abcdefg')).toBe(false)
    expect(isSlug('ABC123')).toBe(false)
  })

  it('encodes six bytes into a slug', () => {
    expect(encodeSlug(Uint8Array.from([0, 1, 35, 10, 20, 30]))).toHaveLength(SLUG_LENGTH)
    expect(encodeSlug(Uint8Array.from([0, 0, 0, 0, 0, 0]))).toBe('aaaaaa')
  })

  it('retries when a reserved six-letter word is generated', () => {
    const reserved = Uint8Array.from([18, 19, 0, 19, 8, 2])
    const safe = Uint8Array.from([1, 2, 3, 4, 5, 6])
    let calls = 0
    const slug = generateSlug(() => {
      calls += 1
      return calls === 1 ? reserved : safe
    })
    expect(slug).not.toBe('static')
    expect(isSlug(slug)).toBe(true)
    expect(calls).toBeGreaterThan(1)
  })
})
