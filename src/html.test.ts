import { describe, expect, it } from 'vitest'
import { formatApDate, renderContestDump } from './html'
import { CONTEST_KIND } from './types'

describe('formatApDate', () => {
  it('formats a UTC timestamp in AP style', () => {
    expect(formatApDate(Date.UTC(2026, 8, 17, 5, 40))).toBe(
      'Sept. 17, 2026, 5:40 a.m. UTC'
    )
  })
})

describe('renderContestDump', () => {
  it('escapes the prompt and lists ranked entries', () => {
    const page = renderContestDump(1, Date.UTC(2026, 8, 17, 12, 0), {
      kind: CONTEST_KIND,
      contestName: 'card_hunt',
      eventCounter: 3,
      prompt: '<script>alert(1)</script>',
      judgingFinishedAt: null,
      buyInPrice: 100,
      currency: 'gold',
      prizePool: 500,
      submissionCount: 1,
      reference: null,
      winners: [],
      entries: [{
        cardId: 'ab',
        code: 'ABCDE',
        edition: '1',
        number: '2',
        characterKey: '',
        seriesKey: '',
        submitter: '99',
        submittedAt: 1,
        score: 1300,
        imageUrl: '/images/contests/card_hunt/3/ab',
        sourceUrl: null
      }]
    }, 'abc123')
    expect(page).toContain('Card Hunt #3')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page).not.toContain('<script>alert(1)</script>')
    expect(page).toContain('User ID: 99')
  })
})
