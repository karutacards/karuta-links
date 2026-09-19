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
    saveId: null,
    ...overrides
  }
}

describe('draft audit sentences', () => {
  it('names add, rename, alias and delete actions', () => {
    expect(draftAuditSentence(row({ action: 'add' }))).toBe('@craig added series New Series.')
    expect(draftAuditSentence(row({
      action: 'import'
    }))).toBe('@craig imported series New Series.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'hana-kurusu',
      action: 'import',
      afterJson: JSON.stringify({
        type: 'character',
        key: 'hana-kurusu',
        name: 'Hana Kurusu',
        seriesKey: 'jujutsu-kaisen',
        aliases: ['Hana', 'Sweetie']
      })
    }))).toBe('@craig imported character Hana Kurusu with aliases: Hana, Sweetie.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'hana-kurusu',
      action: 'import',
      afterJson: JSON.stringify({
        type: 'character',
        key: 'hana-kurusu',
        name: 'Hana Kurusu',
        seriesKey: 'jujutsu-kaisen',
        aliases: ['Hana']
      })
    }))).toBe('@craig imported character Hana Kurusu with alias: Hana.')
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
    }))).toBe('@craig renamed character Neji Hyuuga to character Neji.')
    expect(draftAuditSentence(row({
      entityType: 'character',
      entityKey: 'hana-kurusu',
      action: 'update',
      beforeJson: JSON.stringify({
        type: 'character',
        key: 'hana-kurusu',
        name: 'Hana Kurusu',
        seriesKey: 'naruto',
        aliases: []
      }),
      afterJson: JSON.stringify({
        type: 'character',
        key: 'hana-kurusu',
        name: 'Hana Kurusu',
        seriesKey: 'jujutsu-kaisen',
        seriesName: 'Jujutsu Kaisen',
        aliases: []
      })
    }))).toBe('@craig moved character Hana Kurusu to series Jujutsu Kaisen.')
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
      action: 'hide',
      beforeJson: null,
      afterJson: null
    }))).toBe('@craig hid this draft.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'unhide',
      beforeJson: null,
      afterJson: null
    }))).toBe('@craig unhid this draft.')
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'config',
      beforeJson: JSON.stringify({ override: { access: 'open' } }),
      afterJson: JSON.stringify({ override: { access: 'whitelist' } })
    }))).toBe("@craig updated this draft's access settings.")
    expect(draftAuditSentence(row({
      entityType: 'draft',
      entityKey: '',
      action: 'config',
      beforeJson: JSON.stringify({ override: { access: 'open' } }),
      afterJson: JSON.stringify({ override: null })
    }))).toBe("@craig reset this draft's access settings.")
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
      entityType: 'draft',
      entityKey: '',
      action: 'restore',
      beforeJson: JSON.stringify({ eventId: 2, createdAt: 10 }),
      afterJson: JSON.stringify({ eventId: 2, createdAt: 10 })
    }))).toBe('@craig restored this draft to #2.')
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
