import { describe, expect, it } from 'vitest'
import {
  buildContestSnapshot,
  compareContestEntries,
  formatContestScore,
  nextPollAction,
  parentEventCounter,
  parseContestEntry,
  readContestSnapshot
} from './contest'
import { CONTEST_KIND } from './types'
import { contestImageUrl } from './images'

function entry(partial: Partial<ReturnType<typeof parseContestEntry>> & { cardId: string; score: number }) {
  return parseContestEntry(partial.cardId, {
    code: partial.code ?? partial.cardId,
    edition: 1,
    number: 1,
    contestScore: partial.score,
    contestSubmittedAt: partial.submittedAt ?? 100,
    contestImageUrl: 'https://example.test/card.png'
  }, 4)
}

describe('contest ranking', () => {
  it('sorts by score, then earliest submission, then code', () => {
    const lateHigh = entry({ cardId: 'b', score: 900, submittedAt: 300 })
    const earlyHigh = entry({ cardId: 'a', score: 900, submittedAt: 100 })
    const low = entry({ cardId: 'c', score: 100, submittedAt: 50 })
    const rows = [lateHigh, low, earlyHigh].sort(compareContestEntries)
    expect(rows.map((row) => row.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('formats scores the same way the bot report does', () => {
    expect(formatContestScore(-1)).toBe('Not scored')
    expect(formatContestScore(1)).toBe('Judging failed')
    expect(formatContestScore(1300)).toBe('100.00')
  })
})

describe('contest poll decision', () => {
  it('skips when the event counter has not moved', () => {
    expect(nextPollAction(4, 4, true)).toBe('skipped')
    expect(nextPollAction(4, null, true)).toBe('skipped')
  })

  it('waits when a newer event is not rewarded yet', () => {
    expect(nextPollAction(4, 5, false)).toBe('waiting')
  })

  it('dumps when a newer event is rewarded', () => {
    expect(nextPollAction(4, 5, true)).toBe('dump')
    expect(nextPollAction(0, 1, true)).toBe('dump')
  })
})

describe('contest snapshot', () => {
  it('reads the parent event counter and builds ranked rows', () => {
    expect(parentEventCounter({ eventCounter: 12 })).toBe(12)
    expect(parentEventCounter({ eventCounter: 0 })).toBe(null)

    const snapshot = buildContestSnapshot(12, {
      prompt: 'Find the gold frame.',
      rewarded: true,
      referenceCard: { code: 'AAAAA', edition: 2, number: 9 },
      referenceScore: 980,
      referenceImageUrl: 'https://example.test/ref.png',
      winners: [{ place: 1, userId: '1', score: 1100, reward: 500 }],
      submissionCount: 2
    }, [
      {
        id: 'card-b',
        data: {
          code: 'BBBBB',
          edition: 3,
          number: 4,
          contestScore: 800,
          contestSubmittedAt: 20,
          contestSubmitter: '99',
          contestImageUrl: 'https://example.test/b.png'
        }
      },
      {
        id: 'card-a',
        data: {
          code: 'AAAAA',
          edition: 1,
          number: 2,
          contestScore: 1100,
          contestSubmittedAt: 10,
          contestSubmitter: '1',
          contestImageUrl: 'https://example.test/a.png'
        }
      }
    ])

    expect(snapshot.eventCounter).toBe(12)
    expect(snapshot.entries.map((row) => row.cardId)).toEqual(['card-a', 'card-b'])
    expect(snapshot.entries[0]?.imageUrl).toBe(contestImageUrl(12, 1))
    expect(snapshot.entries[1]?.imageUrl).toBe(contestImageUrl(12, 2))
    expect(snapshot.reference?.imageUrl).toBe(contestImageUrl(12, 'ref'))
    expect(snapshot.winners[0]?.place).toBe(1)
    expect(snapshot.description).toBe('Find the gold frame.')
  })

  it('reads a stored snapshot that still uses prompt', () => {
    const snapshot = readContestSnapshot(JSON.stringify({
      kind: CONTEST_KIND,
      contestName: 'card_hunt',
      eventCounter: 1,
      prompt: 'Old stored copy.',
      judgingFinishedAt: null,
      buyInPrice: null,
      currency: null,
      prizePool: null,
      submissionCount: 0,
      reference: null,
      winners: [],
      entries: []
    }))
    expect(snapshot.description).toBe('Old stored copy.')
  })

  it('rewrites stored image URLs to place slots', () => {
    const snapshot = readContestSnapshot(JSON.stringify({
      kind: CONTEST_KIND,
      contestName: 'card_hunt',
      eventCounter: 1,
      description: 'Hunt.',
      judgingFinishedAt: null,
      buyInPrice: null,
      currency: null,
      prizePool: null,
      submissionCount: 1,
      reference: {
        cardId: 'reference',
        code: 'AAAAA',
        edition: '1',
        number: '1',
        characterKey: '',
        seriesKey: '',
        submitter: '',
        submittedAt: 0,
        score: 900,
        imageUrl: '/images/contests/card_hunt/1/reference',
        sourceUrl: null
      },
      winners: [],
      entries: [{
        cardId: 'ichika-nakano:4:12741',
        code: 'ABCDE',
        edition: '4',
        number: '12741',
        characterKey: '',
        seriesKey: '',
        submitter: '1',
        submittedAt: 1,
        score: 800,
        imageUrl: '/images/contests/card_hunt/1/ichika-nakano%3A4%3A12741',
        sourceUrl: null
      }]
    }))
    expect(snapshot.reference?.imageUrl).toBe(contestImageUrl(1, 'ref'))
    expect(snapshot.entries[0]?.imageUrl).toBe(contestImageUrl(1, 1))
  })
})
