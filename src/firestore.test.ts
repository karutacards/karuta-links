import { describe, expect, it } from 'vitest'
import { convertFirestoreFields, documentIdFromName } from './firestore'

describe('convertFirestoreFields', () => {
  it('unwraps scalars, maps and arrays', () => {
    const row = convertFirestoreFields({
      eventCounter: { integerValue: '12' },
      rewarded: { booleanValue: true },
      prompt: { stringValue: 'Find gold.' },
      winners: {
        arrayValue: {
          values: [{
            mapValue: {
              fields: {
                place: { integerValue: '1' },
                userId: { stringValue: '99' }
              }
            }
          }]
        }
      }
    })
    expect(row.eventCounter).toBe(12)
    expect(row.rewarded).toBe(true)
    expect(row.prompt).toBe('Find gold.')
    expect(row.winners).toEqual([{ place: 1, userId: '99' }])
  })
})

describe('documentIdFromName', () => {
  it('takes the last path segment', () => {
    expect(documentIdFromName('projects/p/databases/(default)/documents/contests/card_hunt/events/12/contest_entries/ab-cd'))
      .toBe('ab-cd')
  })
})
