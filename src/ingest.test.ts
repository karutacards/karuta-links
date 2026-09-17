import { describe, expect, it } from 'vitest'
import { IngestError, parseContentSnapshot } from './ingest'
import { cardImageUrl } from './images'

describe('parseContentSnapshot', () => {
  it('builds image URLs and fills series names from the same payload', () => {
    const snapshot = parseContentSnapshot({
      environment: 'development',
      newSeries: [{ key: 'jujutsu-kaisen', name: 'Jujutsu Kaisen' }],
      newCharacters: [{
        key: 'gojo-satoru',
        name: 'Gojo Satoru',
        series: 'jujutsu-kaisen'
      }],
      newEditions: [{
        key: 'gojo-satoru',
        name: 'Gojo Satoru',
        series: 'jujutsu-kaisen',
        editions: ['1', { edition: '2', version: 1 }]
      }]
    })

    expect(snapshot.environment).toBe('development')
    expect(snapshot.newCharacters[0]?.seriesName).toBe('Jujutsu Kaisen')
    expect(snapshot.newEditions[0]?.editions[0]?.imageUrl).toBe(
      cardImageUrl('gojo-satoru', '1', 0)
    )
    expect(snapshot.newEditions[0]?.editions[1]?.imageUrl).toBe(
      cardImageUrl('gojo-satoru', '2', 1)
    )
  })

  it('rejects an empty payload', () => {
    expect(() => parseContentSnapshot({})).toThrow(IngestError)
  })

  it('rejects a character whose series name cannot be resolved', () => {
    expect(() => parseContentSnapshot({
      newCharacters: [{
        key: 'gojo-satoru',
        name: 'Gojo Satoru',
        series: 'missing'
      }]
    })).toThrow(/seriesName/)
  })
})
