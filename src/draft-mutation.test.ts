import { describe, expect, it } from 'vitest'
import { applyDraftMutation } from './draft-mutation'
import { DraftError, type DraftSeries } from './draft-types'

const series = (revision: number): DraftSeries => ({
  type: 'series',
  key: 'new-series',
  name: 'New Series',
  aliases: ['Alt'],
  revision,
  lastEditorId: '1',
  lastEditorName: 'first'
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
})
