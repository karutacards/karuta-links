import { describe, expect, it } from 'vitest'
import { albumCommandDiff, editorAlbumsFromSnapshot } from './album-commands'
import type { AlbumSnapshot, CompactCard, EditorAlbum } from './album-types'

const card: CompactCard = {
  instanceKey: 'gojo-satoru:4:12',
  code: 'abc12',
  character: 'gojo-satoru',
  edition: 4,
  number: 12,
  quality: 0,
  version: 0
}

const snapshot: AlbumSnapshot = {
  albums: [{
    id: 'summer',
    cards: [card.instanceKey, null, null, null, null, null, null, null],
    background: 'default'
  }],
  cards: [card],
  backgrounds: ['default', 'autumnleaves'],
  emptyAlbum: 1,
  emptyPage: 2
}

describe('albumCommandDiff', () => {
  it('emits nothing when the editor matches the snapshot', () => {
    expect(albumCommandDiff(snapshot, editorAlbumsFromSnapshot(snapshot)))
      .toBe('# No changes to paste.')
  })

  it('diffs an existing album instead of creating it again', () => {
    const editors = editorAlbumsFromSnapshot(snapshot)
    const current = editors[0] as EditorAlbum
    current.name = 'winter'
    current.background = 'autumnleaves'
    current.pages = 2
    delete current.slots['1:1']
    current.slots['2:3'] = card
    expect(albumCommandDiff(snapshot, editors)).toBe([
      'k!arename summer winter',
      'k!apage winter 2',
      'k!abg winter Autumn Leaves',
      'k!aremove winter abc12',
      'k!aadd winter abc12 2 3'
    ].join('\n'))
  })

  it('creates a new name that is not in the snapshot', () => {
    const created: EditorAlbum = {
      sourceId: null,
      name: 'fresh',
      page: 1,
      pages: 1,
      slots: { '1:1': card },
      background: 'default'
    }
    expect(albumCommandDiff(snapshot, [...editorAlbumsFromSnapshot(snapshot), created]))
      .toBe('k!acreate fresh\nk!aadd fresh abc12 1 1')
  })
})
