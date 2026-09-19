import { describe, expect, it } from 'vitest'
import { actorName, draftAuditSentence, draftAuditSpans } from './draft-audit'
import type { DraftAuditRow } from './draft-types'

function row(overrides: Partial<DraftAuditRow>): DraftAuditRow {
  return {
    id: 1,
    entityType: 'series',
    entityKey: 'new-series',
    action: 'add',
    beforeJson: null,
    afterJson: JSON.stringify({ type: 'series', key: 'new-series', name: 'New Series', aliases: [] }),
    discordId: '1',
    username: 'craig',
    createdAt: 1,
    ...overrides
  }
}

describe('draft audit sentences', () => {
  it('names add, rename, alias and delete actions', () => {
    expect(draftAuditSentence(row({ action: 'add' }))).toBe('@craig added series New Series.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'neji-hyuuga',
      action: 'update',
      beforeJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: []
      }),
      afterJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji',
        seriesKey: 'naruto',
        aliases: []
      })
    }))).toBe('@craig renamed Neji Hyuuga to Neji.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'neji-hyuuga',
      action: 'update',
      beforeJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: []
      }),
      afterJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: ['Neji']
      })
    }))).toBe('@craig added alias Neji to character Neji Hyuuga.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'neji-hyuuga',
      action: 'update',
      beforeJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: ['Neji', 'Hyuuga']
      }),
      afterJson: JSON.stringify({
        type: 'character',
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        aliases: ['Neji', 'Hyuga']
      })
    }))).toBe('@craig added alias Hyuga and removed alias Hyuuga to character Neji Hyuuga.')
    expect(draftAuditSentence(row({
      entityType: 'series',
      entityKey: 'naruto',
      action: 'update',
      beforeJson: JSON.stringify({
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja']
      }),
      afterJson: JSON.stringify({
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: []
      })
    }))).toBe('@craig removed alias Ninja to series Naruto.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'lock',
      beforeJson: null,
      afterJson: null
    }))).toBe('@craig locked this draft.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'unlock',
      beforeJson: null,
      afterJson: null
    }))).toBe('@craig unlocked this draft.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'describe',
      beforeJson: JSON.stringify({ description: '' }),
      afterJson: JSON.stringify({ description: 'Season 3 notes.' })
    }))).toBe('@craig set the draft description.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'describe',
      beforeJson: JSON.stringify({ description: 'Season 3 notes.' }),
      afterJson: JSON.stringify({ description: 'Hold Part 2.' })
    }))).toBe('@craig updated the draft description.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'describe',
      beforeJson: JSON.stringify({ description: 'Hold Part 2.' }),
      afterJson: JSON.stringify({ description: '' })
    }))).toBe('@craig cleared the draft description.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'x',
      action: 'delete',
      beforeJson: JSON.stringify({
        type: 'character',
        key: 'x',
        name: 'X',
        seriesKey: 's',
        aliases: []
      }),
      afterJson: null
    }))).toBe('@craig deleted character X.')
  })

  it('splits the actor from boldable entity names', () => {
    expect(actorName('@craig')).toBe('craig')
    expect(draftAuditSpans(row({ action: 'add' }))).toEqual([
      { text: ' added series ' },
      { text: 'New Series', entity: true },
      { text: '.' }
    ])
  })
})
