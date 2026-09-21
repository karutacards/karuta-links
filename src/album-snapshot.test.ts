import { describe, expect, it } from 'vitest'
import { ALBUM_REFRESH_MS } from './album-types'
import {
  AlbumRefreshLimited,
  compactCard,
  parseAlbumSnapshot,
  refreshWaitSeconds
} from './album-snapshot'

describe('compactCard', () => {
  it('keeps instance identity and drops unused card fields', () => {
    expect(
      compactCard('gojo-satoru:4:12', {
        code: 'AbC12',
        metaCharacterId: 'gojo-satoru',
        edition: 4,
        number: 12,
        quality: 1,
        version: 2,
        dye: { color: '#AABBCC' },
        frame: { key: 'gold' },
        wishlist: true
      })
    ).toEqual({
      instanceKey: 'gojo-satoru:4:12',
      code: 'abc12',
      character: 'gojo-satoru',
      edition: 4,
      number: 12,
      quality: 1,
      version: 2,
      dye: '#aabbcc'
    })
  })

  it('reads the document id when fields are missing', () => {
    expect(compactCard('natsu:1:8', { code: 'xyz' })).toEqual({
      instanceKey: 'natsu:1:8',
      code: 'xyz',
      character: 'natsu',
      edition: 1,
      number: 8,
      quality: 0,
      version: 0
    })
  })

  it('rejects a card without a code', () => {
    expect(compactCard('natsu:1:8', {})).toBeNull()
  })
})

describe('parseAlbumSnapshot', () => {
  it('accepts a compact payload', () => {
    const snapshot = {
      albums: [{ id: 'summer', cards: [null], background: 'default' }],
      cards: []
    }
    expect(parseAlbumSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('rejects malformed JSON', () => {
    expect(parseAlbumSnapshot('{')).toBeNull()
    expect(parseAlbumSnapshot('{}')).toBeNull()
    expect(parseAlbumSnapshot(JSON.stringify({
      albums: [],
      cards: [],
      backgrounds: ['default'],
      emptyAlbum: 2,
      emptyPage: 4
    }))).toEqual({ albums: [], cards: [] })
  })
})

describe('refreshWaitSeconds', () => {
  it('counts remaining seconds inside the 10-minute window', () => {
    const fetchedAt = 1_000_000
    expect(refreshWaitSeconds(fetchedAt, fetchedAt + 60_000)).toBe(540)
    expect(refreshWaitSeconds(fetchedAt, fetchedAt + ALBUM_REFRESH_MS)).toBe(0)
  })
})

describe('AlbumRefreshLimited', () => {
  it('uses a complete sentence', () => {
    const error = new AlbumRefreshLimited(12)
    expect(error.message.endsWith('.')).toBe(true)
    expect(error.retryAfter).toBe(12)
  })
})
