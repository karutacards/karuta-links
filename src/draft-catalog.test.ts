import { describe, expect, it } from 'vitest'
import { draftKey, parseDraftCatalog, uniqueDraftKey } from './draft-catalog'
import { DraftError } from './draft-types'

describe('draft catalog', () => {
  it('builds keys the same way as the importer', () => {
    expect(draftKey('New Series')).toBe('new-series')
    expect(uniqueDraftKey('New Series', new Set(['new-series']))).toBe('new-series-2')
  })

  it('normalizes a text-only catalog and drops groups', () => {
    expect(parseDraftCatalog({
      series: [{ name: 'New Series', aliases: ['Alt', 'alt', ''] }],
      characters: [{ name: 'Hero', seriesKey: 'New Series', aliases: ['Champ'] }]
    })).toEqual({
      series: [{ key: 'new-series', name: 'New Series', aliases: ['Alt'] }],
      characters: [{
        key: 'hero',
        name: 'Hero',
        seriesKey: 'new-series',
        aliases: ['Champ']
      }]
    })
  })

  it('rejects a character without a series key', () => {
    expect(() => parseDraftCatalog({
      characters: [{ name: 'Hero' }]
    })).toThrow(DraftError)
  })
})
