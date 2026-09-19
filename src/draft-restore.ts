import type {
  DraftAuditRow,
  DraftCharacter,
  DraftEntity,
  DraftEntityType,
  DraftImportAction,
  DraftRecord,
  DraftSeries
} from './draft-types'

export type DraftRestoreIdentity = {
  type: DraftEntityType
  key: string
  importAction: DraftImportAction
  baseAliases: string[]
}

export type DraftRestoreSeries = {
  type: 'series'
  key: string
  name: string
  aliases: string[]
  importAction: DraftImportAction
  baseAliases: string[]
}

export type DraftRestoreCharacter = {
  type: 'character'
  key: string
  name: string
  seriesKey: string
  aliases: string[]
  importAction: DraftImportAction
  baseAliases: string[]
}

export type DraftRestoreCatalog = {
  description: string
  series: DraftRestoreSeries[]
  characters: DraftRestoreCharacter[]
}

export type DraftRestoreSnapshot = DraftRestoreCatalog & {
  eventId: number
  createdAt: number
}

type EntityPayload = {
  type: DraftEntityType
  key: string
  name: string
  aliases: string[]
  seriesKey: string
  importAction: DraftImportAction | null
  baseAliases: string[] | null
}

export function isRestorableAuditAction(action: string): boolean {
  return action !== 'lock' && action !== 'unlock'
}

export function restoreIdentityFromCatalog(
  catalog: Pick<DraftRecord, 'series' | 'characters'>
): DraftRestoreIdentity[] {
  return [
    ...catalog.series.map((entity) => identityFromEntity(entity)),
    ...catalog.characters.map((entity) => identityFromEntity(entity))
  ]
}

export function catalogsMatch(
  current: Pick<DraftRecord, 'description' | 'series' | 'characters'>,
  next: DraftRestoreCatalog
): boolean {
  if ((current.description ?? '') !== next.description) return false
  return (
    sameSeries(current.series, next.series)
    && sameCharacters(current.characters, next.characters)
  )
}

export function replayDraftAudit(
  rows: readonly DraftAuditRow[],
  throughId: number,
  identity: readonly DraftRestoreIdentity[] = []
): DraftRestoreCatalog {
  const catalog: WorkingCatalog = {
    description: '',
    series: new Map(),
    characters: new Map()
  }
  const known = new Map(
    identity.map((item) => [identityKey(item.type, item.key), item])
  )
  for (const row of rows) {
    if (row.id > throughId) break
    applyAuditRow(catalog, row, known)
  }
  return {
    description: catalog.description,
    series: [...catalog.series.values()],
    characters: [...catalog.characters.values()]
  }
}

function applyAuditRow(
  catalog: WorkingCatalog,
  row: DraftAuditRow,
  identity: Map<string, DraftRestoreIdentity>
): void {
  if (!isRestorableAuditAction(row.action)) return
  if (row.action === 'restore') {
    const snapshot = parseRestoreSnapshot(row.afterJson)
    if (!snapshot) return
    catalog.description = snapshot.description
    catalog.series = new Map(snapshot.series.map((item) => [item.key, item]))
    catalog.characters = new Map(snapshot.characters.map((item) => [item.key, item]))
    return
  }
  if (row.action === 'describe') {
    catalog.description = parseDescription(row.afterJson)
    return
  }
  if (row.entityType === 'draft') return
  if (row.action === 'delete') {
    if (row.entityType === 'series') catalog.series.delete(row.entityKey)
    else catalog.characters.delete(row.entityKey)
    return
  }
  const payload = parseEntityPayload(row.afterJson)
  if (!payload) return
  const key = payload.key || row.entityKey
  if (!key) return
  const known = identity.get(identityKey(row.entityType, key))
  const importAction = payload.importAction
    ?? known?.importAction
    ?? 'add'
  const baseAliases = payload.baseAliases
    ?? known?.baseAliases
    ?? []
  if (row.entityType === 'series') {
    catalog.series.set(key, {
      type: 'series',
      key,
      name: payload.name || key,
      aliases: payload.aliases,
      importAction,
      baseAliases
    })
    return
  }
  catalog.characters.set(key, {
    type: 'character',
    key,
    name: payload.name || key,
    seriesKey: payload.seriesKey,
    aliases: payload.aliases,
    importAction,
    baseAliases
  })
}

function identityFromEntity(entity: DraftEntity): DraftRestoreIdentity {
  return {
    type: entity.type,
    key: entity.key,
    importAction: entity.importAction,
    baseAliases: entity.baseAliases.slice()
  }
}

function identityKey(type: DraftEntityType, key: string): string {
  return `${type}:${key}`
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

function parseEntityPayload(raw: string | null): EntityPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const type = record.type === 'character' ? 'character' : 'series'
    return {
      type,
      key: typeof record.key === 'string' ? record.key : '',
      name: typeof record.name === 'string' ? record.name : '',
      aliases: stringList(record.aliases),
      seriesKey: typeof record.seriesKey === 'string' ? record.seriesKey : '',
      importAction: record.importAction === 'update' || record.importAction === 'add'
        ? record.importAction
        : null,
      baseAliases: Array.isArray(record.baseAliases) ? stringList(record.baseAliases) : null
    }
  } catch {
    return null
  }
}

export function parseRestoreSnapshot(raw: string | null): DraftRestoreSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const eventId = Number(record.eventId)
    const createdAt = Number(record.createdAt)
    if (!Number.isSafeInteger(eventId) || eventId < 1) return null
    if (!Number.isSafeInteger(createdAt)) return null
    return {
      eventId,
      createdAt,
      description: typeof record.description === 'string' ? record.description : '',
      series: Array.isArray(record.series)
        ? record.series.flatMap((item) => parseRestoreSeries(item) ?? [])
        : [],
      characters: Array.isArray(record.characters)
        ? record.characters.flatMap((item) => parseRestoreCharacter(item) ?? [])
        : []
    }
  } catch {
    return null
  }
}

function parseRestoreSeries(value: unknown): DraftRestoreSeries | null {
  const payload = parseEntityPayload(JSON.stringify(value))
  if (!payload || !payload.key) return null
  return {
    type: 'series',
    key: payload.key,
    name: payload.name || payload.key,
    aliases: payload.aliases,
    importAction: payload.importAction ?? 'add',
    baseAliases: payload.baseAliases ?? []
  }
}

function parseRestoreCharacter(value: unknown): DraftRestoreCharacter | null {
  const payload = parseEntityPayload(JSON.stringify(value))
  if (!payload || !payload.key) return null
  return {
    type: 'character',
    key: payload.key,
    name: payload.name || payload.key,
    seriesKey: payload.seriesKey,
    aliases: payload.aliases,
    importAction: payload.importAction ?? 'add',
    baseAliases: payload.baseAliases ?? []
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function sameSeries(left: readonly DraftSeries[], right: readonly DraftRestoreSeries[]): boolean {
  if (left.length !== right.length) return false
  const theirs = new Map(right.map((item) => [item.key, item]))
  return left.every((item) => {
    const match = theirs.get(item.key)
    return !!match
      && item.name === match.name
      && item.importAction === match.importAction
      && sameAliases(item.aliases, match.aliases)
      && sameAliases(item.baseAliases, match.baseAliases)
  })
}

function sameCharacters(
  left: readonly DraftCharacter[],
  right: readonly DraftRestoreCharacter[]
): boolean {
  if (left.length !== right.length) return false
  const theirs = new Map(right.map((item) => [item.key, item]))
  return left.every((item) => {
    const match = theirs.get(item.key)
    return !!match
      && item.name === match.name
      && item.seriesKey === match.seriesKey
      && item.importAction === match.importAction
      && sameAliases(item.aliases, match.aliases)
      && sameAliases(item.baseAliases, match.baseAliases)
  })
}

function sameAliases(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

type WorkingCatalog = {
  description: string
  series: Map<string, DraftRestoreSeries>
  characters: Map<string, DraftRestoreCharacter>
}
