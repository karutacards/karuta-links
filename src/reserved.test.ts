import { describe, expect, it } from 'vitest'
import { isReservedSegment, isReservedSlug } from './reserved'

describe('reserved segments', () => {
  it('treats known first segments as reserved', () => {
    expect(isReservedSegment('content')).toBe(true)
    expect(isReservedSegment('contests')).toBe(true)
    expect(isReservedSegment('images')).toBe(true)
    expect(isReservedSegment('API')).toBe(true)
    expect(isReservedSegment('health')).toBe(true)
    expect(isReservedSegment('assets')).toBe(true)
    expect(isReservedSegment('static')).toBe(true)
  })

  it('does not reserve ordinary slugs', () => {
    expect(isReservedSegment('a1b2c3')).toBe(false)
    expect(isReservedSlug('zzzzzz')).toBe(false)
  })
})
