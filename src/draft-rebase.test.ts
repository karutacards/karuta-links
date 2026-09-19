import { describe, expect, it } from 'vitest'
import { rebaseDraftPending, type DraftPendingEdit, type DraftRebaseBase } from './draft-rebase'

const base: DraftRebaseBase = {
  name: 'Hana Kurusu',
  seriesLabel: 'Jujutsu Kaisen',
  aliases: ['Hana', 'Sweetie']
}

function mine(extra: Partial<DraftPendingEdit> = {}): DraftPendingEdit {
  return {
    name: base.name,
    seriesLabel: base.seriesLabel,
    aliases: [...base.aliases],
    removed: [],
    pending: '',
    pendingDelete: false,
    ...extra
  }
}

describe('rebaseDraftPending', () => {
  it('takes their rename when this tab only added an alias', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, name: 'Hana Kurusz' },
      mine({ aliases: ['Hana', 'Sweetie', 'Angel'] })
    )
    expect(result).toMatchObject({
      name: 'Hana Kurusz',
      aliases: ['Hana', 'Sweetie', 'Angel'],
      gone: false,
      conflicts: []
    })
  })

  it('keeps this tab\'s rename when they only changed aliases', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, aliases: ['Hana', 'Sweetie', 'Angel'] },
      mine({ name: 'Hana Kurusz' })
    )
    expect(result).toMatchObject({
      name: 'Hana Kurusz',
      aliases: ['Hana', 'Sweetie', 'Angel'],
      conflicts: []
    })
  })

  it('marks a name conflict when both sides rename differently', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, name: 'Hana A' },
      mine({ name: 'Hana B' })
    )
    expect(result.name).toBe('Hana B')
    expect(result.conflicts).toEqual(['name'])
  })

  it('clears a matching rename', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, name: 'Hana Kurusz' },
      mine({ name: 'Hana Kurusz' })
    )
    expect(result.name).toBe('Hana Kurusz')
    expect(result.conflicts).toEqual([])
  })

  it('takes their alias add when this tab did not touch aliases', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, aliases: ['Hana', 'Sweetie', 'Angel'] },
      mine()
    )
    expect(result.aliases).toEqual(['Hana', 'Sweetie', 'Angel'])
    expect(result.removed).toEqual([])
  })

  it('keeps a faded remove and their new alias', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, aliases: ['Hana', 'Sweetie', 'Angel'] },
      mine({ aliases: ['Hana'], removed: ['Sweetie'] })
    )
    expect(result.aliases).toEqual(['Hana', 'Angel'])
    expect(result.removed).toEqual(['Sweetie'])
    expect(result.conflicts).toEqual([])
  })

  it('conflicts when this tab faded an alias they also added', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, aliases: ['Hana', 'Sweetie', 'Angel'] },
      mine({ aliases: ['Hana', 'Sweetie'], removed: ['Angel'] })
    )
    expect(result.conflicts).toEqual(['aliases'])
    expect(result.aliases).toEqual(['Hana', 'Sweetie'])
    expect(result.removed).toEqual(['Angel'])
  })

  it('conflicts a pending delete against their edit', () => {
    const result = rebaseDraftPending(
      base,
      { ...base, name: 'Hana Kurusz' },
      mine({ pendingDelete: true })
    )
    expect(result.pendingDelete).toBe(true)
    expect(result.conflicts).toEqual(['delete'])
    expect(result.name).toBe('Hana Kurusz')
  })

  it('keeps a pending delete when they did not change the row', () => {
    const result = rebaseDraftPending(base, base, mine({ pendingDelete: true }))
    expect(result.pendingDelete).toBe(true)
    expect(result.conflicts).toEqual([])
  })

  it('marks the row gone when they deleted it', () => {
    const result = rebaseDraftPending(base, null, mine({ name: 'Hana Kurusz' }))
    expect(result.gone).toBe(true)
    expect(result.pendingDelete).toBe(false)
  })

  it('is a self-contained function the editor can inline', () => {
    expect(rebaseDraftPending.toString()).toContain('function rebaseDraftPending')
    expect(rebaseDraftPending.toString()).not.toContain('rebaseTrim')
  })
})
