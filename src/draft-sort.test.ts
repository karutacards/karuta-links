import { describe, expect, it } from 'vitest'
import { sortDraftEntities } from './draft-sort'

describe('draft sort', () => {
  const rows = [
    { key: 'beta', name: 'Beta', addedAt: 1, lastEditedAt: 30 },
    { key: 'alpha', name: 'Alpha', addedAt: 2, lastEditedAt: 10 },
    { key: 'gamma', name: 'Gamma', addedAt: 2, lastEditedAt: 20 }
  ]

  it('puts newest additions first', () => {
    expect(sortDraftEntities(rows, 'added').map((row) => row.key)).toEqual([
      'alpha',
      'gamma',
      'beta'
    ])
  })

  it('puts the most recently edited row first', () => {
    expect(sortDraftEntities(rows, 'edited').map((row) => row.key)).toEqual([
      'beta',
      'gamma',
      'alpha'
    ])
  })

  it('sorts by name', () => {
    expect(sortDraftEntities(rows, 'name').map((row) => row.key)).toEqual([
      'alpha',
      'beta',
      'gamma'
    ])
  })
})
