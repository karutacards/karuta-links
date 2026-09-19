import { describe, expect, it } from 'vitest'
import { draftKey, parseDraftCatalog, resolveDraftSeriesKey, uniqueDraftKey } from './draft-catalog'
import { DraftError } from './draft-types'

describe('draft catalog', () => {
  it('resolves a series only when it is already on the draft', () => {
    const series = [
      { key: 'new-series', name: 'New Series' },
      { key: 'new-series-2', name: 'New Series!' }
    ]
    expect(resolveDraftSeriesKey('New Series!', series)).toBe('new-series-2')
    expect(resolveDraftSeriesKey('Jujutsu Kaisen', series)).toBe('')
  })

  it('builds keys the same way as the importer', () => {
    expect(draftKey('New Series')).toBe('new-series')
    expect(uniqueDraftKey('New Series', new Set(['new-series']))).toBe('new-series-2')
  })

  it('normalizes a text-only catalog and drops groups', () => {
    expect(parseDraftCatalog({
      series: [{ name: 'New Series', aliases: ['Alt', 'alt', ''] }],
      characters: [{ name: 'Hero', seriesKey: 'New Series', aliases: ['Champ'] }]
    })).toEqual({
      series: [{ key: 'new-series', name: 'New Series', aliases: ['Alt'], action: 'add' }],
      characters: [{
        key: 'hero',
        name: 'Hero',
        seriesKey: 'new-series',
        aliases: ['Champ'],
        action: 'add'
      }]
    })
  })

  it('rejects a character without a series key', () => {
    expect(() => parseDraftCatalog({
      characters: [{ name: 'Hero' }]
    })).toThrow(DraftError)
  })

  it('resolves a character series name when two slugs collide', () => {
    expect(parseDraftCatalog({
      series: [{ name: 'New Series' }, { name: 'New Series!' }],
      characters: [{ name: 'Hero', seriesKey: 'New Series!' }]
    })).toMatchObject({
      series: [
        { key: 'new-series', name: 'New Series' },
        { key: 'new-series-2', name: 'New Series!' }
      ],
      characters: [{ key: 'hero', seriesKey: 'new-series-2' }]
    })
  })

  it('keeps an imported update action', () => {
    expect(parseDraftCatalog({
      series: [{ key: 'naruto', name: 'Naruto', aliases: ['Ninja'], action: 'update' }],
      characters: [{
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: ['Neji'],
        action: 'update'
      }]
    })).toMatchObject({
      series: [{ key: 'naruto', action: 'update' }],
      characters: [{ key: 'neji-hyuuga', action: 'update' }]
    })
  })

  it('rejects a duplicate character name on the same series', () => {
    expect(() => parseDraftCatalog({
      series: [{ name: 'Naruto' }],
      characters: [
        { name: 'Neji Hyuuga', seriesKey: 'naruto' },
        { name: 'neji hyuuga', seriesKey: 'Naruto' }
      ]
    })).toThrow('That character is already on this series.')
  })

  it('rejects names and aliases the Karuta font cannot display', () => {
    expect(() => parseDraftCatalog({
      series: [{ name: 'Chōno' }]
    })).toThrow('Name contains characters the Karuta font cannot display.')
    expect(() => parseDraftCatalog({
      series: [{ name: 'Naruto', aliases: ['Chō'] }]
    })).toThrow('An alias contains characters the Karuta font cannot display.')
    expect(parseDraftCatalog({
      series: [{ name: 'Zoë', aliases: ['Zoë'] }]
    }).series[0]).toMatchObject({ name: 'Zoë', aliases: ['Zoë'] })
  })

  it('rejects names and aliases over 200 characters', () => {
    const longName = 'A'.repeat(201)
    const longAlias = 'B'.repeat(201)
    expect(() => parseDraftCatalog({
      series: [{ name: longName }]
    })).toThrow('Name is too long.')
    expect(() => parseDraftCatalog({
      series: [{ name: 'Naruto', aliases: [longAlias] }]
    })).toThrow('An alias is too long.')
  })

  it('rejects a character whose series is not on the draft', () => {
    expect(() => parseDraftCatalog({
      characters: [{ name: 'Hero', seriesKey: 'Jujutsu Kaisen' }]
    })).toThrow(DraftError)
    expect(() => parseDraftCatalog({
      characters: [{ name: 'Hero', seriesKey: 'Jujutsu Kaisen' }]
    })).toThrow('Each character needs a series.')
  })
})
