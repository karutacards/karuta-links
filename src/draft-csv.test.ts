import { describe, expect, it } from 'vitest'
import { draftToCsv } from './draft-csv'
import type { DraftRecord } from './draft-types'

describe('draft CSV', () => {
  it('exports locked drafts in the importer column order', () => {
    const draft: DraftRecord = {
      id: 4,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: 3,
      lockedBy: '1',
      series: [{
        type: 'series',
        key: 'new-series',
        name: 'New Series',
        aliases: ['Alt', 'Other'],
        importAction: 'add',
        baseAliases: [],
        revision: 1,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: [{
        type: 'character',
        key: 'hero',
        name: 'Hero',
        seriesKey: 'new-series',
        aliases: ['Champ'],
        importAction: 'add',
        baseAliases: [],
        revision: 1,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }]
    }
    expect(draftToCsv(draft)).toBe(
      [
        'type,action,name,seriesKey,aliases',
        'series,add,New Series,new-series,Alt|Other',
        'character,add,Hero,new-series,Champ',
        ''
      ].join('\n')
    )
  })

  it('exports imported live rows as update', () => {
    const draft: DraftRecord = {
      id: 4,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: 3,
      lockedBy: '1',
      series: [{
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja', 'Draft Alias'],
        importAction: 'update',
        baseAliases: ['Ninja'],
        revision: 2,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: []
    }
    expect(draftToCsv(draft)).toContain('series,update,Naruto,naruto,Ninja|Draft Alias')
  })
})
