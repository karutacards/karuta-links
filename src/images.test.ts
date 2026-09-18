import { describe, expect, it } from 'vitest'
import {
  characterImageUrl,
  contestImagePath,
  contestImageUrl,
  legacyContestImagePath,
  isContestObjectPath,
  isKeyedObjectPath,
  keyedImagePath,
  originImageUrl,
  originKeyFromImagePath,
  publicCharacterPath
} from './images'

describe('keyed image paths', () => {
  it('encodes the character key the same way today does', () => {
    expect(keyedImagePath('a b', '2', 0)).toBe('cards/a%20b-2.jpg')
    expect(originImageUrl('a b', '2', 0)).toBe(
      'https://d29rfjkp84y49u.cloudfront.net/cards/a%20b-2.jpg'
    )
  })

  it('publishes character-art URLs under /images/characters', () => {
    expect(keyedImagePath('gojo-satoru', '8', 1)).toBe('cards/versioned/gojo-satoru-8-1.jpg')
    expect(publicCharacterPath('gojo-satoru', '8', 1)).toBe(
      'characters/versioned/gojo-satoru-8-1.jpg'
    )
    expect(characterImageUrl('gojo-satoru', '8', 1)).toBe(
      '/images/characters/versioned/gojo-satoru-8-1.jpg'
    )
    expect(originKeyFromImagePath('characters/gojo-satoru-1.jpg')).toBe(
      'cards/gojo-satoru-1.jpg'
    )
  })

  it('rejects traversal in the image route', () => {
    expect(isKeyedObjectPath('characters/gojo-satoru-1.jpg')).toBe(true)
    expect(isKeyedObjectPath('cards/gojo-satoru-1.jpg')).toBe(true)
    expect(isKeyedObjectPath('../cards/x.jpg')).toBe(false)
    expect(isKeyedObjectPath('cards/../secret')).toBe(false)
    expect(isKeyedObjectPath('characters/../secret')).toBe(false)
  })

  it('keeps framed contest cards off the character-art prefix', () => {
    expect(contestImagePath(12, 3)).toBe('contests/card/12/3')
    expect(contestImageUrl(12, 3)).toBe('/images/contests/card/12/3')
    expect(contestImagePath(12, 'ref')).toBe('contests/card/12/ref')
    expect(isContestObjectPath('contests/card/12/3')).toBe(true)
    expect(isContestObjectPath('contests/card/12/ref')).toBe(true)
    expect(isContestObjectPath('contests/card/12/0')).toBe(false)
    expect(isContestObjectPath('contests/card_hunt/12/ab-cd')).toBe(false)
    expect(isContestObjectPath('contests/card/12/../secret')).toBe(false)
    expect(isKeyedObjectPath('contests/card/12/3')).toBe(false)
    expect(legacyContestImagePath(1, 'ichika-nakano:4:12741')).toEqual([
      'contests/card_hunt/1/ichika-nakano%3A4%3A12741',
      'contests/card_hunt/1/ichika-nakano:4:12741'
    ])
  })
})
