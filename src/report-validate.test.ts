import { describe, expect, it } from 'vitest'
import {
  emptyReportFields,
  isDiscordSnowflake,
  isValidCardCodeSyntax,
  isValidDyeCodeSyntax,
  isValidIdolCodeSyntax,
  parseReportFields,
  tokenize,
  uniqueCodeTokens,
  uniqueTokens
} from './report-validate'

function fields(overrides: Partial<ReturnType<typeof emptyReportFields>> = {}) {
  return {
    ...emptyReportFields(),
    reason: 'alting',
    userIds: '135694375647838208',
    acknowledged: true,
    ...overrides
  }
}

describe('report validation', () => {
  it('splits and dedupes tokens', () => {
    expect(tokenize('  a, b\nc  ')).toEqual(['a', 'b', 'c'])
    expect(uniqueTokens(['a', 'a', 'b'])).toEqual(['a', 'b'])
  })

  it('accepts a user-only report', () => {
    const parsed = parseReportFields(fields())
    expect(parsed).toMatchObject({
      reason: 'alting',
      userIds: ['135694375647838208'],
      serverIds: [],
      channelIds: [],
      acknowledged: true
    })
  })

  it('accepts a server-only gambling report', () => {
    const parsed = parseReportFields(fields({
      reason: 'gambling',
      userIds: '',
      serverIds: '135694375647838208'
    }))
    expect('error' in parsed).toBe(false)
    if (!('error' in parsed)) {
      expect(parsed.serverIds).toEqual(['135694375647838208'])
      expect(parsed.userIds).toEqual([])
    }
  })

  it('requires a reason, an ID and the acknowledgment', () => {
    expect(parseReportFields(fields({ reason: '' }))).toMatchObject({
      error: true,
      message: 'Select a reason for this report.'
    })
    expect(parseReportFields(fields({ userIds: '' }))).toMatchObject({
      error: true,
      message: 'Enter at least one user ID, server ID, or channel ID.'
    })
    expect(parseReportFields(fields({ acknowledged: false }))).toMatchObject({
      error: true,
      message: 'Acknowledge the false-report warning to submit.'
    })
  })

  it('rejects a short Discord id', () => {
    expect(parseReportFields(fields({ userIds: '12345' }))).toMatchObject({
      error: true,
      message: 'Each user ID must be a Discord snowflake (17–19 digits).'
    })
  })

  it('rejects an overlong notes field', () => {
    expect(parseReportFields(fields({ notes: 'x'.repeat(2001) }))).toMatchObject({
      error: true,
      status: 400
    })
  })

  it('matches Karuta card, dye and Idol code syntax', () => {
    expect(isValidCardCodeSyntax('abc')).toBe(true)
    expect(isValidCardCodeSyntax('Ab12Cxyz')).toBe(true)
    expect(isValidCardCodeSyntax('ab')).toBe(false)
    expect(isValidCardCodeSyntax('abcdefghi')).toBe(false)
    expect(isValidCardCodeSyntax('$abc')).toBe(false)
    expect(isValidDyeCodeSyntax('$ab')).toBe(true)
    expect(isValidDyeCodeSyntax('$Ab12Cxy')).toBe(true)
    expect(isValidDyeCodeSyntax('ab12')).toBe(false)
    expect(isValidDyeCodeSyntax('$a')).toBe(false)
    expect(isValidDyeCodeSyntax('$abcdefghi')).toBe(false)
    expect(isValidIdolCodeSyntax('&xy')).toBe(true)
    expect(isValidIdolCodeSyntax('&m7q')).toBe(true)
    expect(isValidIdolCodeSyntax('m7q')).toBe(false)
    expect(isValidIdolCodeSyntax('&x')).toBe(false)
    expect(isDiscordSnowflake('135694375647838208')).toBe(true)
    expect(isDiscordSnowflake('12345')).toBe(false)
  })

  it('stores Karuta codes in lowercase and rejects a misplaced prefix', () => {
    const parsed = parseReportFields(fields({
      cardCodes: 'Ab12C, ab12c',
      dyeCodes: '$Xy9',
      idolCodes: '&M7Q'
    }))
    expect(parsed).toMatchObject({
      cardCodes: ['ab12c'],
      dyeCodes: ['$xy9'],
      idolCodes: ['&m7q']
    })
    expect(uniqueCodeTokens(['$Xy9', '$xy9'])).toEqual(['$xy9'])
    expect(parseReportFields(fields({ dyeCodes: 'xy9' }))).toMatchObject({
      error: true,
      message: 'Each dye code must start with $ followed by 2–8 letters or numbers.'
    })
    expect(parseReportFields(fields({ idolCodes: 'm7q' }))).toMatchObject({
      error: true,
      message: 'Each Idol code must start with & followed by 2–8 letters or numbers.'
    })
    expect(parseReportFields(fields({ cardCodes: 'ab' }))).toMatchObject({
      error: true,
      message: 'Each card code must be 3–8 letters or numbers.'
    })
  })
})
