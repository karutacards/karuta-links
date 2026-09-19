import { describe, expect, it } from 'vitest'
import {
  catalogsMatch,
  isRestorableAuditAction,
  replayDraftAudit,
  restoreIdentityFromCatalog
} from './draft-restore'
import type { DraftAuditRow, DraftRecord } from './draft-types'

function audit(overrides: Partial<DraftAuditRow>): DraftAuditRow {
  return {
    id: 1,
    entityType: 'series',
    entityKey: 'naruto',
    action: 'import',
    beforeJson: null,
    afterJson: JSON.stringify({
      type: 'series',
      key: 'naruto',
      name: 'Naruto',
      aliases: ['Ninja'],
      importAction: 'add',
      baseAliases: []
    }),
    discordId: '1',
    username: 'craig',
    createdAt: 10,
    ...overrides
  }
}

describe('draft activity restore replay', () => {
  it('skips lock and unlock and restores description with the catalog', () => {
    const rows = [
      audit({ id: 1 }),
      audit({
        id: 2,
        entityType: 'draft',
        entityKey: '',
        action: 'describe',
        afterJson: JSON.stringify({ description: 'Season 3 notes.' })
      }),
      audit({
        id: 3,
        entityType: 'draft',
        entityKey: '',
        action: 'lock',
        afterJson: null
      }),
      audit({
        id: 4,
        entityType: 'series',
        entityKey: 'naruto',
        action: 'update',
        beforeJson: JSON.stringify({ type: 'series', key: 'naruto', name: 'Naruto', aliases: ['Ninja'] }),
        afterJson: JSON.stringify({
          type: 'series',
          key: 'naruto',
          name: 'Naruto Shippuden',
          aliases: ['Ninja', 'Leaf'],
          importAction: 'add',
          baseAliases: []
        })
      }),
      audit({
        id: 5,
        entityType: 'draft',
        entityKey: '',
        action: 'unlock',
        afterJson: null
      })
    ]
    expect(replayDraftAudit(rows, 2)).toEqual({
      description: 'Season 3 notes.',
      series: [{
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja'],
        importAction: 'add',
        baseAliases: []
      }],
      characters: []
    })
    expect(replayDraftAudit(rows, 4).series[0]?.name).toBe('Naruto Shippuden')
    expect(replayDraftAudit(rows, 4).series[0]?.aliases).toEqual(['Ninja', 'Leaf'])
    expect(replayDraftAudit(rows, 5).description).toBe('Season 3 notes.')
  })

  it('replays deletes and later restore snapshots', () => {
    const rows = [
      audit({ id: 1 }),
      audit({
        id: 2,
        entityType: 'character',
        entityKey: 'naruto-uzumaki',
        action: 'import',
        afterJson: JSON.stringify({
          type: 'character',
          key: 'naruto-uzumaki',
          name: 'Naruto Uzumaki',
          seriesKey: 'naruto',
          aliases: ['Kid'],
          importAction: 'update',
          baseAliases: ['Kid']
        })
      }),
      audit({
        id: 3,
        entityType: 'character',
        entityKey: 'naruto-uzumaki',
        action: 'delete',
        beforeJson: JSON.stringify({
          type: 'character',
          key: 'naruto-uzumaki',
          name: 'Naruto Uzumaki',
          seriesKey: 'naruto'
        }),
        afterJson: null
      }),
      audit({
        id: 4,
        entityType: 'draft',
        entityKey: '',
        action: 'restore',
        afterJson: JSON.stringify({
          eventId: 2,
          createdAt: 20,
          description: '',
          series: [{
            type: 'series',
            key: 'naruto',
            name: 'Naruto',
            aliases: ['Ninja'],
            importAction: 'add',
            baseAliases: []
          }],
          characters: [{
            type: 'character',
            key: 'naruto-uzumaki',
            name: 'Naruto Uzumaki',
            seriesKey: 'naruto',
            aliases: ['Kid'],
            importAction: 'update',
            baseAliases: ['Kid']
          }]
        })
      })
    ]
    expect(replayDraftAudit(rows, 3).characters).toEqual([])
    expect(replayDraftAudit(rows, 4).characters).toEqual([{
      type: 'character',
      key: 'naruto-uzumaki',
      name: 'Naruto Uzumaki',
      seriesKey: 'naruto',
      aliases: ['Kid'],
      importAction: 'update',
      baseAliases: ['Kid']
    }])
  })

  it('fills import identity from the current catalog when old audits omit it', () => {
    const current: Pick<DraftRecord, 'series' | 'characters'> = {
      series: [{
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja', 'Leaf'],
        importAction: 'update',
        baseAliases: ['Ninja'],
        revision: 4,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: []
    }
    const replayed = replayDraftAudit([
      audit({
        afterJson: JSON.stringify({
          type: 'series',
          key: 'naruto',
          name: 'Naruto',
          aliases: ['Ninja']
        })
      })
    ], 1, restoreIdentityFromCatalog(current))
    expect(replayed.series[0]?.importAction).toBe('update')
    expect(replayed.series[0]?.baseAliases).toEqual(['Ninja'])
  })

  it('treats matching catalogs as a no-op and rejects lock targets', () => {
    expect(isRestorableAuditAction('import')).toBe(true)
    expect(isRestorableAuditAction('restore')).toBe(true)
    expect(isRestorableAuditAction('lock')).toBe(false)
    expect(isRestorableAuditAction('unlock')).toBe(false)
    expect(catalogsMatch({
      description: 'Hold.',
      series: [{
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja'],
        importAction: 'add',
        baseAliases: [],
        revision: 2,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: []
    }, {
      description: 'Hold.',
      series: [{
        type: 'series',
        key: 'naruto',
        name: 'Naruto',
        aliases: ['Ninja'],
        importAction: 'add',
        baseAliases: []
      }],
      characters: []
    })).toBe(true)
  })
})
