import type { DraftRecord } from './draft-types'

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function draftToCsv(draft: DraftRecord): string {
  const lines = ['type,action,name,seriesKey,aliases']
  for (const series of draft.series) {
    lines.push([
      csvField('series'),
      csvField('add'),
      csvField(series.name),
      csvField(series.key),
      csvField(series.aliases.join('|'))
    ].join(','))
  }
  for (const character of draft.characters) {
    lines.push([
      csvField('character'),
      csvField('add'),
      csvField(character.name),
      csvField(character.seriesKey),
      csvField(character.aliases.join('|'))
    ].join(','))
  }
  return `${lines.join('\n')}\n`
}
