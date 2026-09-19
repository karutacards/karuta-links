import type { DraftRecord } from './draft-types'

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function draftToCsv(draft: DraftRecord): string {
  const lines = ['type,action,name,seriesKey,aliases,groups']
  for (const series of draft.series) {
    lines.push([
      csvField('series'),
      csvField(series.importAction),
      csvField(series.name),
      csvField(series.key),
      csvField(series.aliases.join('|')),
      ''
    ].join(','))
  }
  for (const character of draft.characters) {
    lines.push([
      csvField('character'),
      csvField(character.importAction),
      csvField(character.name),
      csvField(character.seriesKey),
      csvField(character.aliases.join('|')),
      ''
    ].join(','))
  }
  return `${lines.join('\n')}\n`
}
