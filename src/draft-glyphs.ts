import { DraftError } from './draft-types'

const ASCII_EXCEPT_BACKSLASH: number[] = []
for (let code = 32; code <= 126; code += 1) {
  if (code !== 92) ASCII_EXCEPT_BACKSLASH.push(code)
}

const LATIN_1: number[] = []
for (let code = 161; code <= 255; code += 1) {
  if (code !== 173) LATIN_1.push(code)
}

export const DRAFT_FONT_CODE_POINTS: readonly number[] = [
  ...ASCII_EXCEPT_BACKSLASH,
  ...LATIN_1,
  305, 338, 339, 700, 710, 730, 732,
  8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8226,
  8249, 8250, 8260, 8308, 8364, 8722, 8725
]

const FONT_GLYPHS = new Set(DRAFT_FONT_CODE_POINTS.map((code) => String.fromCodePoint(code)))

export function isDraftFontGlyph(character: string): boolean {
  return FONT_GLYPHS.has(character)
}

export type DraftTextKind = 'name' | 'alias' | 'description'

function draftTextError(kind: DraftTextKind, angle: boolean, spaces: boolean): string {
  if (angle) {
    if (kind === 'alias') return 'An alias cannot contain < or >.'
    if (kind === 'description') return 'The draft description cannot contain < or >.'
    return 'Name cannot contain < or >.'
  }
  if (spaces) {
    if (kind === 'alias') return 'An alias cannot contain repeated spaces.'
    if (kind === 'description') return 'The draft description cannot contain repeated spaces.'
    return 'Name cannot contain repeated spaces.'
  }
  if (kind === 'alias') return 'An alias contains characters the Karuta font cannot display.'
  if (kind === 'description') {
    return 'The draft description contains characters the Karuta font cannot display.'
  }
  return 'Name contains characters the Karuta font cannot display.'
}

export function draftFontError(value: string, kind: DraftTextKind): string | null {
  const text = value.normalize('NFC')
  if (text.includes('<') || text.includes('>')) {
    return draftTextError(kind, true, false)
  }
  if (text.includes('  ')) {
    return draftTextError(kind, false, true)
  }
  for (const character of text) {
    if (!FONT_GLYPHS.has(character)) {
      return draftTextError(kind, false, false)
    }
  }
  return null
}

export function assertDraftFontText(value: string, kind: DraftTextKind): string {
  const text = value.normalize('NFC')
  const error = draftFontError(text, kind)
  if (error) {
    throw new DraftError('INVALID_INPUT', error, 400)
  }
  return text
}

export function keepDraftFontText(value: string): string {
  let next = ''
  for (const character of value.normalize('NFC')) {
    if (character === '<' || character === '>') continue
    if (FONT_GLYPHS.has(character)) next += character
  }
  return next
}
