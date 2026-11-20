import { describe, expect, it } from 'vitest'
import { ALBUM_CLIENT_HELPERS, ALBUM_CLIENT_SCRIPT } from './album-client'
import { albumBackgroundName } from './album-backgrounds'
import { albumCommandDiff, editorAlbumsFromSnapshot } from './album-commands'
import { isValidAlbumName, planAlbumRenames } from './album-names'
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

  it('frees a name before another album takes it in a swap', () => {
    const swap: AlbumSnapshot = {
      albums: [
        { id: 'a', cards: [], background: 'default' },
        { id: 'b', cards: [], background: 'default' }
      ],
      cards: []
    }
    const editors = editorAlbumsFromSnapshot(swap)
    ;(editors[0] as EditorAlbum).name = 'b'
    ;(editors[1] as EditorAlbum).name = 'a'
    expect(albumCommandDiff(swap, editors)).toBe(
      ['k!arename a tmp1', 'k!arename b a', 'k!arename tmp1 b'].join('\n')
    )
  })

  it('renames in the order that frees each target name', () => {
    expect(planAlbumRenames(['a', 'b'], [['a', 'b'], ['b', 'c']])).toEqual([
      ['b', 'c'],
      ['a', 'b']
    ])
    expect(planAlbumRenames(['a', 'b', 'tmp1'], [['a', 'b'], ['b', 'a']])).toEqual([
      ['a', 'tmp2'],
      ['b', 'a'],
      ['tmp2', 'b']
    ])
    expect(planAlbumRenames(['a', 'b'], [['a', 'b']])).toBeNull()
  })

  it('refuses a new album that takes a name Karuta still holds', () => {
    const created: EditorAlbum = {
      sourceId: null,
      name: 'summer',
      page: 1,
      pages: 1,
      slots: {},
      background: 'default'
    }
    expect(albumCommandDiff(snapshot, [created])).toBe(
      '# That name is already used by another album.'
    )
  })

  it('allows 16-character names and says so', () => {
    expect(isValidAlbumName('a'.repeat(16))).toBe(true)
    expect(isValidAlbumName('a'.repeat(17))).toBe(false)
    expect(isValidAlbumName('_a')).toBe(false)
    const long: EditorAlbum = {
      sourceId: null,
      name: 'a'.repeat(17),
      page: 1,
      pages: 1,
      slots: {},
      background: 'default'
    }
    expect(albumCommandDiff(snapshot, [long])).toBe(
      '# Album names start with a letter and are 16 characters or fewer.'
    )
  })
})

type ClientHelpers = {
  esc: (value: unknown) => string
  chrome: (card: CompactCard & { dye?: string }) => string
  isValidAlbumName: (value: string) => boolean
  diffAlbums: (
    snapshot: AlbumSnapshot,
    albums: EditorAlbum[],
    bgName: (key: string) => string
  ) => string
}

function clientHelpers(): ClientHelpers {
  return new Function(
    `${ALBUM_CLIENT_HELPERS}\nreturn { esc, chrome, isValidAlbumName, diffAlbums };`
  )() as ClientHelpers
}

describe('album client helpers', () => {
  it('ships a page script that parses', () => {
    expect(() => new Function(ALBUM_CLIENT_SCRIPT)).not.toThrow()
  })

  it('escapes Firestore strings before they reach innerHTML', () => {
    const { chrome, esc } = clientHelpers()
    expect(esc('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
    const tile = chrome({
      ...card,
      code: '<img src=x onerror=alert(1)>',
      dye: '"><script>alert(1)</script>'
    })
    expect(tile).not.toContain('<img src=x')
    expect(tile).not.toContain('<script>')
    expect(tile).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('builds the same commands as the server diff', () => {
    const { diffAlbums, isValidAlbumName: clientValid } = clientHelpers()
    const swap: AlbumSnapshot = {
      albums: [
        { id: 'a', cards: [card.instanceKey], background: 'default' },
        { id: 'b', cards: [], background: 'default' }
      ],
      cards: [card]
    }
    const editors = editorAlbumsFromSnapshot(swap)
    ;(editors[0] as EditorAlbum).name = 'b'
    ;(editors[0] as EditorAlbum).background = 'autumnleaves'
    ;(editors[1] as EditorAlbum).name = 'a'
    ;(editors[1] as EditorAlbum).pages = 2
    editors.push({
      sourceId: null,
      name: 'fresh',
      page: 1,
      pages: 1,
      slots: { '1:2': card },
      background: 'default'
    })
    const server = albumCommandDiff(swap, editors)
    expect(diffAlbums(swap, editors, albumBackgroundName)).toBe(server)
    expect(server).toContain('k!arename a tmp1')
    for (const name of ['a'.repeat(16), 'a'.repeat(17), '_a', '1a', 'ab-c_d']) {
      expect(clientValid(name)).toBe(isValidAlbumName(name))
    }
  })
})
