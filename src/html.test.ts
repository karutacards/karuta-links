import { describe, expect, it } from 'vitest'
import { formatApDate } from './html'

describe('formatApDate', () => {
  it('formats a UTC timestamp in AP style', () => {
    expect(formatApDate(Date.UTC(2026, 8, 17, 5, 40))).toBe(
      'Sept. 17, 2026, 5:40 a.m. UTC'
    )
  })
})
