import type { DraftAuditRow, DraftAuditSpan } from './draft-types'

type AuditPayload = {
  name: string
  aliases: string[]
  seriesKey: string
  seriesName: string
}

export type DraftAuditSeriesRef = {
  key: string
  name: string
}

export function actorName(username: string): string {
  const raw = username.trim()
  if (!raw) return 'unknown'
  return raw.charAt(0) === '@' ? raw.slice(1) : raw
}

export function restoreTargetId(raw: string | null): number | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const eventId = Number((parsed as Record<string, unknown>).eventId)
    return Number.isSafeInteger(eventId) && eventId > 0 ? eventId : null
  } catch {
    return null
  }
}

function parseDescription(raw: string | null): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return ''
    const description = (parsed as Record<string, unknown>).description
    return typeof description === 'string' ? description : ''
  } catch {
    return ''
  }
}

function parsePayload(raw: string | null): AuditPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const aliases = Array.isArray(record.aliases)
      ? record.aliases.filter((item): item is string => typeof item === 'string')
      : []
    return {
      name: typeof record.name === 'string' ? record.name : '',
      aliases,
      seriesKey: typeof record.seriesKey === 'string' ? record.seriesKey : '',
      seriesName: typeof record.seriesName === 'string' ? record.seriesName : ''
    }
  } catch {
    return null
  }
}

function aliasKey(value: string): string {
  return value.trim().toLowerCase()
}

function aliasKeys(values: string[]): string {
  return values.map(aliasKey).filter(Boolean).sort().join('\u0000')
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const key = aliasKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(value.trim())
  }
  return unique
}

function aliasDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeKeys = new Set(uniqueAliases(before).map(aliasKey))
  const afterKeys = new Set(uniqueAliases(after).map(aliasKey))
  return {
    added: uniqueAliases(after).filter((value) => !beforeKeys.has(aliasKey(value))),
    removed: uniqueAliases(before).filter((value) => !afterKeys.has(aliasKey(value)))
  }
}

function nameList(names: string[]): DraftAuditSpan[] {
  return names.flatMap((name, index) => {
    if (index === 0) return [entity(name)]
    return [text(index === names.length - 1 ? ' and ' : ', '), entity(name)]
  })
}

function commaList(names: string[]): DraftAuditSpan[] {
  return names.flatMap((name, index) => {
    if (index === 0) return [entity(name)]
    return [text(', '), entity(name)]
  })
}

function aliasUpdateSpans(
  before: string[],
  after: string[],
  type: string,
  owner: string
): DraftAuditSpan[] | null {
  const { added, removed } = aliasDiff(before, after)
  if (!added.length && !removed.length) return null
  const spans: DraftAuditSpan[] = []
  if (added.length) {
    spans.push(text(added.length === 1 ? ' added alias ' : ' added aliases '), ...nameList(added))
  }
  if (removed.length) {
    if (added.length) spans.push(text(' and'))
    spans.push(text(removed.length === 1 ? ' removed alias ' : ' removed aliases '), ...nameList(removed))
  }
  spans.push(text(` to ${type} `), entity(owner), text('.'))
  return spans
}

function entityName(entry: DraftAuditRow, payload: AuditPayload | null): string {
  return payload?.name.trim() || entry.entityKey
}

function seriesLabel(
  payload: AuditPayload | null,
  series: readonly DraftAuditSeriesRef[]
): string {
  const named = payload?.seriesName.trim()
  if (named) return named
  const key = payload?.seriesKey.trim() || ''
  if (!key) return 'a new series'
  const match = series.find((item) => item.key === key)
  return match?.name.trim() || key
}

function text(value: string): DraftAuditSpan {
  return { text: value }
}

function entity(value: string): DraftAuditSpan {
  return { text: value, entity: true }
}

export function draftAuditSpans(
  entry: DraftAuditRow,
  series: readonly DraftAuditSeriesRef[] = []
): DraftAuditSpan[] {
  if (entry.action === 'lock') {
    return [text(' locked this draft.')]
  }
  if (entry.action === 'unlock') {
    return [text(' unlocked this draft.')]
  }
  if (entry.action === 'describe') {
    const before = parseDescription(entry.beforeJson)
    const after = parseDescription(entry.afterJson)
    if (!before && after) return [text(' set the draft description.')]
    if (before && !after) return [text(' cleared the draft description.')]
    return [text(' updated the draft description.')]
  }
  if (entry.action === 'restore') {
    const target = restoreTargetId(entry.afterJson) ?? restoreTargetId(entry.beforeJson)
    if (target) return [text(` restored this draft to #${target}.`)]
    return [text(' restored this draft to an earlier save.')]
  }
  const before = parsePayload(entry.beforeJson)
  const after = parsePayload(entry.afterJson)
  const type = entry.entityType
  if (entry.action === 'import') {
    const name = entityName(entry, after)
    const aliases = uniqueAliases(after?.aliases ?? [])
    const spans: DraftAuditSpan[] = [text(` imported ${type} `), entity(name)]
    if (aliases.length) {
      spans.push(
        text(aliases.length === 1 ? ' with alias: ' : ' with aliases: '),
        ...commaList(aliases)
      )
    }
    spans.push(text('.'))
    return spans
  }
  if (entry.action === 'add') {
    return [text(` added ${type} `), entity(entityName(entry, after)), text('.')]
  }
  if (entry.action === 'delete') {
    return [text(` deleted ${type} `), entity(entityName(entry, before)), text('.')]
  }
  if (entry.action === 'update') {
    const beforeName = entityName(entry, before)
    const afterName = entityName(entry, after)
    if (before && after && beforeName !== afterName) {
      return [
        text(` renamed ${type} `),
        entity(beforeName),
        text(` to ${type} `),
        entity(afterName),
        text('.')
      ]
    }
    if (before && after && aliasKeys(before.aliases) !== aliasKeys(after.aliases)) {
      return aliasUpdateSpans(before.aliases, after.aliases, type, afterName)
        ?? [text(` updated ${type} `), entity(afterName), text('.')]
    }
    if (before && after && before.seriesKey !== after.seriesKey) {
      return [
        text(` moved ${type} `),
        entity(afterName),
        text(' to series '),
        entity(seriesLabel(after, series)),
        text('.')
      ]
    }
    return [text(` updated ${type} `), entity(afterName), text('.')]
  }
  return [text(` changed ${type} `), entity(entityName(entry, after ?? before)), text('.')]
}

export function draftAuditSentence(
  entry: DraftAuditRow,
  series: readonly DraftAuditSeriesRef[] = []
): string {
  const body = draftAuditSpans(entry, series).map((span) => span.text).join('')
  return `@${actorName(entry.username)}${body}`
}
