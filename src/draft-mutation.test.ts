import { describe, expect, it } from 'vitest'
import { applyDraftMutation } from './draft-mutation'
import { DraftError, type DraftSeries } from './draft-types'

const series = (revision: number, extra: Partial<DraftSeries> = {}): DraftSeries => ({
  type: 'series',
  key: 'new-series',
  name: 'New Series',
  aliases: ['Alt'],
  importAction: 'add',
  baseAliases: [],
  revision,
  lastEditorId: '1',
  lastEditorName: 'first',
  ...extra
})

describe('draft mutation', () => {
  it('adds a series at revision 1', () => {
    const result = applyDraftMutation(
      null,
      { type: 'series', action: 'add', name: 'New Series', aliases: ['Alt'] },
      new Set(),
      '2',
      'second'
    )
    expect(result.entity).toMatchObject({
      type: 'series',
      key: 'new-series',
      revision: 1,
      importAction: 'add',
      lastEditorName: 'second'
    })
  })

  it('renames when the revision matches', () => {
    const result = applyDraftMutation(
      series(3),
      {
        type: 'series',
        action: 'update',
        key: 'new-series',
        expectedRevision: 3,
        name: 'Renamed'
      },
      new Set(['new-series']),
      '2',
      'second'
    )
    expect(result.entity).toMatchObject({
      name: 'Renamed',
      revision: 4,
      lastEditorName: 'second'
    })
  })

  it('rejects an update when the row did not change', () => {
    try {
      applyDraftMutation(
        series(3),
        {
          type: 'series',
          action: 'update',
          key: 'new-series',
          expectedRevision: 3,
          name: '  New Series  ',
          aliases: ['Alt']
        },
        new Set(['new-series']),
        '2',
        'second'
      )
      throw new Error('expected no change')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        status: 400,
        message: 'Nothing about this row changed.'
      })
    }
  })

  it('returns 409 CONFLICT when the revision does not match', () => {
    try {
      applyDraftMutation(
        series(3),
        {
          type: 'series',
          action: 'update',
          key: 'new-series',
          expectedRevision: 2,
          name: 'Renamed'
        },
        new Set(['new-series']),
        '2',
        'second'
      )
      throw new Error('expected conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({ code: 'CONFLICT', status: 409 })
      expect((error as DraftError).entity?.revision).toBe(3)
    }
  })

  it('resolves a character series from the draft series name', () => {
    const result = applyDraftMutation(
      null,
      { type: 'character', action: 'add', name: 'Hero', seriesKey: 'New Series!' },
      new Set(),
      '2',
      'second',
      [
        { key: 'new-series', name: 'New Series' },
        { key: 'new-series-2', name: 'New Series!' }
      ]
    )
    expect(result.entity).toMatchObject({
      type: 'character',
      key: 'hero',
      seriesKey: 'new-series-2'
    })
  })

  it('returns 409 ENTITY_GONE when the row was deleted', () => {
    try {
      applyDraftMutation(
        null,
        {
          type: 'series',
          action: 'delete',
          key: 'new-series',
          expectedRevision: 3
        },
        new Set(),
        '2',
        'second'
      )
      throw new Error('expected gone')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({ code: 'ENTITY_GONE', status: 409, entity: null })
    }
  })

  it('rejects a rename on a live imported row', () => {
    try {
      applyDraftMutation(
        series(3, { importAction: 'update', baseAliases: ['Alt'] }),
        {
          type: 'series',
          action: 'update',
          key: 'new-series',
          expectedRevision: 3,
          name: 'Renamed'
        },
        new Set(['new-series']),
        '2',
        'second'
      )
      throw new Error('expected live rename')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'This live row cannot be renamed.'
      })
    }
  })

  it('adds an alias on a live imported row', () => {
    const result = applyDraftMutation(
      series(3, { importAction: 'update', baseAliases: ['Alt'] }),
      {
        type: 'series',
        action: 'update',
        key: 'new-series',
        expectedRevision: 3,
        name: 'New Series',
        aliases: ['Alt', 'Extra']
      },
      new Set(['new-series']),
      '2',
      'second'
    )
    expect(result.entity).toMatchObject({
      aliases: ['Alt', 'Extra'],
      importAction: 'update',
      baseAliases: ['Alt']
    })
  })

  it('adopts a missing series name as a live update', () => {
    const result = applyDraftMutation(
      null,
      { type: 'character', action: 'add', name: 'Hero', seriesKey: 'Missing' },
      new Set(),
      '2',
      'second',
      [{ key: 'new-series', name: 'New Series' }]
    )
    expect(result.entity).toMatchObject({
      type: 'character',
      seriesKey: 'missing'
    })
    expect(result.adoptedSeries).toMatchObject({
      type: 'series',
      key: 'missing',
      name: 'Missing',
      importAction: 'update'
    })
  })

  it('rejects a duplicate character name on the same series', () => {
    try {
      applyDraftMutation(
        null,
        { type: 'character', action: 'add', name: 'Hero', seriesKey: 'New Series' },
        new Set(),
        '2',
        'second',
        [{ key: 'new-series', name: 'New Series' }],
        [{ key: 'hero', name: 'Hero', seriesKey: 'new-series' }]
      )
      throw new Error('expected duplicate')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'That character is already on this series.'
      })
    }
  })

  it('rejects deleting a live imported row', () => {
    try {
      applyDraftMutation(
        series(3, { importAction: 'update', baseAliases: ['Alt'] }),
        {
          type: 'series',
          action: 'delete',
          key: 'new-series',
          expectedRevision: 3
        },
        new Set(['new-series']),
        '2',
        'second'
      )
      throw new Error('expected live delete')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'This live row cannot be deleted.'
      })
    }
  })

  it('rejects removing an imported alias', () => {
    try {
      applyDraftMutation(
        series(3, { importAction: 'update', baseAliases: ['Alt'] }),
        {
          type: 'series',
          action: 'update',
          key: 'new-series',
          expectedRevision: 3,
          name: 'New Series',
          aliases: []
        },
        new Set(['new-series']),
        '2',
        'second'
      )
      throw new Error('expected imported alias')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'Imported aliases cannot be removed.'
      })
    }
  })

  it('rejects a name or alias that is too long', () => {
    try {
      applyDraftMutation(
        null,
        { type: 'series', action: 'add', name: 'A'.repeat(201) },
        new Set(),
        '2',
        'second'
      )
      throw new Error('expected long name')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'Name is too long.'
      })
    }
    try {
      applyDraftMutation(
        null,
        { type: 'series', action: 'add', name: 'Naruto', aliases: ['B'.repeat(201)] },
        new Set(),
        '2',
        'second'
      )
      throw new Error('expected long alias')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'An alias is too long.'
      })
    }
  })
})
