import { describe, expect, it } from 'vitest'
import { formatApDate, renderContentDump, renderContestDump, renderHome } from './html'
import { CONTENT_KIND, CONTEST_KIND } from './types'

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
    expect(page).toContain('content="1 entry."')
    expect(page).toContain('>krta.cc/abc123</a>')
    expect(page).not.toContain('Short URL:')
    expect(page).not.toContain('UTC. krta.cc')
    expect(page).not.toContain('>/abc123<')
  })
})

describe('renderHome', () => {
  it('lists content drafts and contest results under Karuta dumps', () => {
    const page = renderHome([{
      id: 1,
      createdAt: Date.UTC(2026, 8, 17, 12, 0),
      slug: 'yjxndx',
      snapshot: {
        kind: CONTENT_KIND,
        environment: 'production',
        newSeries: [],
        updatedSeries: [],
        newCharacters: [],
        newEditions: [],
        updatedEditions: [],
        newSeriesAliases: [],
        newCharacterAliases: []
      }
    }], [])

    expect(page).toContain('<title>Karuta dumps</title>')
    expect(page).toContain('content="Dumps of published drafts and contest results."')
    expect(page).toContain('Content drafts')
    expect(page).toContain('Contest results')
    expect(page).toContain('Content draft 1')
    expect(page).toContain('No contest results yet.')
    expect(page).not.toContain('Official')
    expect(page).not.toContain('Content dumps')
  })
})

describe('renderContentDump', () => {
  it('lists new aliases and omits groups', () => {
    const page = renderContentDump(4, Date.UTC(2026, 8, 17, 12, 0), {
      kind: CONTENT_KIND,
      environment: 'production',
      newSeries: [],
      updatedSeries: [],
      newCharacters: [],
      newEditions: [],
      updatedEditions: [],
      newSeriesAliases: [{
        key: 'jujutsu-kaisen',
        name: 'Jujutsu Kaisen',
        aliases: ['JJK']
      }],
      newCharacterAliases: [{
        key: 'gojo-satoru',
        name: 'Gojo Satoru',
        seriesKey: 'jujutsu-kaisen',
        seriesName: 'Jujutsu Kaisen',
        aliases: ['The Honored One']
      }]
    }, 'abcd12')

    expect(page).toContain('New aliases')
    expect(page).toContain('Jujutsu Kaisen: JJK')
    expect(page).toContain('Gojo Satoru (Jujutsu Kaisen): The Honored One')
    expect(page).not.toContain('shonen')
    expect(page).toContain('1 series with new aliases, 1 character with new aliases')
    expect(page).not.toContain('1 series with new aliases, 1 character with new aliases.')
    expect(page).toContain('content="1 series with new aliases, 1 character with new aliases"')
    expect(page).toContain('>krta.cc/abcd12</a>')
    expect(page).not.toContain('Short URL:')
  })

  it('puts the edition on its own line under the series', () => {
    const page = renderContentDump(5, Date.UTC(2026, 8, 17, 12, 0), {
      kind: CONTENT_KIND,
      environment: 'production',
      newSeries: [],
      updatedSeries: [],
      newCharacters: [],
      newEditions: [{
        key: 'neji-hyuuga',
        name: 'Neji Hyuuga',
        seriesKey: 'naruto',
        seriesName: 'Naruto',
        editions: [{
          edition: '5',
          version: 0,
          imageUrl: '/images/characters/neji-hyuuga-5.jpg'
        }]
      }],
      updatedEditions: [],
      newSeriesAliases: [],
      newCharacterAliases: []
    }, null)

    expect(page).toContain('class="series">Naruto</span>')
    expect(page).toContain('class="edition">Edition 5</span>')
    expect(page).not.toContain('Naruto · Edition 5')
    expect(page).not.toContain('class="environment"')
  })

  it('puts a non-production environment in the header', () => {
    const page = renderContentDump(6, Date.UTC(2026, 8, 17, 12, 0), {
      kind: CONTENT_KIND,
      environment: 'development',
      newSeries: [],
      updatedSeries: [],
      newCharacters: [],
      newEditions: [],
      updatedEditions: [],
      newSeriesAliases: [],
      newCharacterAliases: []
    }, null)

    expect(page).toContain('class="environment">Development</p>')
    expect(page).not.toContain('Environment: development')
  })
})
