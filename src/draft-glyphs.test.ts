import { describe, expect, it } from 'vitest'
import {
  assertDraftFontText,
  DRAFT_FONT_CODE_POINTS,
  keepDraftFontText
} from './draft-glyphs'
import { DraftError } from './draft-types'

describe('draft font glyphs', () => {
  it('matches the Admin Amaranth allowlist', () => {
    expect(DRAFT_FONT_CODE_POINTS).toContain(32)
    expect(DRAFT_FONT_CODE_POINTS).toContain(91)
    expect(DRAFT_FONT_CODE_POINTS).not.toContain(92)
    expect(DRAFT_FONT_CODE_POINTS).toContain(93)
    expect(DRAFT_FONT_CODE_POINTS).not.toContain(173)
    expect(DRAFT_FONT_CODE_POINTS).toContain(235)
    expect(DRAFT_FONT_CODE_POINTS).toContain(8725)
  })

  it('keeps supported letters and drops macrons', () => {
    expect(keepDraftFontText('Zoë')).toBe('Zoë')
    expect(keepDraftFontText('Chōno')).toBe('Chno')
  })

  it('rejects repeated spaces and unsupported glyphs', () => {
    expect(() => assertDraftFontText('Two  spaces', 'name')).toThrow(DraftError)
    expect(() => assertDraftFontText('Two  spaces', 'name')).toThrow(
      'Name cannot contain repeated spaces.'
    )
    expect(() => assertDraftFontText('Chōno', 'alias')).toThrow(
      'An alias contains characters the Karuta font cannot display.'
    )
  })
})
