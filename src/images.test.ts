import { describe, expect, it } from 'vitest'
import { CARD_CDN_BASE, cardImageUrl } from './images'

describe('cardImageUrl', () => {
  it('uses the unversioned path when version is 0', () => {
    expect(cardImageUrl('gojo-satoru', '2', 0)).toBe(
      `${CARD_CDN_BASE}/cards/gojo-satoru-2.jpg`
    )
  })

  it('uses the versioned path when version is greater than 0', () => {
    expect(cardImageUrl('nezuko-kamado', '2', 1)).toBe(
      `${CARD_CDN_BASE}/cards/versioned/nezuko-kamado-2-1.jpg`
    )
  })
})
