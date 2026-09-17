import { describe, expect, it } from 'vitest'
import {
  cardImageUrl,
  contestImagePath,
  contestImageUrl,
  isContestObjectPath,
  isKeyedObjectPath,
  keyedImagePath,
  originImageUrl
} from './images'

describe('keyed image paths', () => {
  it('encodes the character key the same way today does', () => {
    expect(keyedImagePath('a b', '2', 0)).toBe('cards/a%20b-2.jpg')
    expect(originImageUrl('a b', '2', 0)).toBe(
      'https://d29rfjkp84y49u.cloudfront.net/cards/a%20b-2.jpg'
    )
  })

  it('uses the versioned path when version is greater than zero', () => {
    expect(keyedImagePath('gojo-satoru', '8', 1)).toBe('cards/versioned/gojo-satoru-8-1.jpg')
    expect(cardImageUrl('gojo-satoru', '8', 1)).toBe('/images/cards/versioned/gojo-satoru-8-1.jpg')
  })

  it('rejects traversal in the image route', () => {
    expect(isKeyedObjectPath('cards/gojo-satoru-1.jpg')).toBe(true)
    expect(isKeyedObjectPath('../cards/x.jpg')).toBe(false)
    expect(isKeyedObjectPath('cards/../secret')).toBe(false)
  })

  it('keeps framed contest cards off the character-art prefix', () => {
    expect(contestImagePath(12, 'ab-cd')).toBe('contests/card_hunt/12/ab-cd')
    expect(contestImageUrl(12, 'ab-cd')).toBe('/images/contests/card_hunt/12/ab-cd')
    expect(isContestObjectPath('contests/card_hunt/12/ab-cd')).toBe(true)
    expect(isContestObjectPath('contests/card_hunt/12/../secret')).toBe(false)
    expect(isKeyedObjectPath('contests/card_hunt/12/ab-cd')).toBe(false)
  })
})
