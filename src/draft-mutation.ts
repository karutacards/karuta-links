import {
  characterIdentity,
  cleanDraftAliases,
  cleanDraftName,
  draftKey,
  resolveDraftSeriesKey,
  uniqueDraftKey,
  type DraftSeriesRef
} from './draft-catalog'
import {
  DraftError,
  type DraftCharacter,
  type DraftEntity,
  type DraftEntityType,
  type DraftSeries
} from './draft-types'

export type DraftMutationAction = 'add' | 'update' | 'delete'

export type DraftMutation = {
  type: DraftEntityType
  action: DraftMutationAction
  key?: string
  expectedRevision?: number
  name?: string
  seriesKey?: string
  aliases?: string[]
}

export type MutationResult = {
  action: DraftMutationAction
  entity: DraftEntity | null
  before: DraftEntity | null
  after: DraftEntity | null
  adoptedSeries?: DraftSeries
}

export type DraftCharacterRef = {
  key: string
  name: string
  seriesKey: string
}

function requireName(value: string | undefined): string {
  return cleanDraftName(value)
}

function aliasesOf(value: string[] | undefined, fallback: string[]): string[] {
  return value === undefined ? fallback : cleanDraftAliases(value)
}

function sameAliases(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((alias, index) => alias === right[index])
}

function aliasIdentity(value: string): string {
  return value.trim().toLowerCase()
}

function assertLiveRow(
  current: DraftEntity,
  name: string,
  seriesKey: string,
  aliases: string[]
): void {
  if (current.importAction !== 'update') {
    return
  }
  if (name !== current.name) {
    throw new DraftError('INVALID_INPUT', 'This live row cannot be renamed.', 400)
  }
  if (current.type === 'character' && seriesKey !== current.seriesKey) {
    throw new DraftError('INVALID_INPUT', 'This live row cannot change series.', 400)
  }
  const nextKeys = new Set(aliases.map(aliasIdentity))
  for (const alias of current.baseAliases) {
    if (!nextKeys.has(aliasIdentity(alias))) {
      throw new DraftError('INVALID_INPUT', 'Imported aliases cannot be removed.', 400)
    }
  }
}

function assertUniqueCharacter(
  name: string,
  seriesKey: string,
  key: string,
  characters: readonly DraftCharacterRef[]
): void {
  const identity = characterIdentity(name, seriesKey)
  for (const other of characters) {
    if (other.key === key) {
      continue
    }
    if (characterIdentity(other.name, other.seriesKey) === identity) {
      throw new DraftError('INVALID_INPUT', 'That character is already on this series.', 400)
    }
  }
}

function adoptSeries(
  raw: unknown,
  series: readonly DraftSeriesRef[],
  editorId: string,
  editorName: string,
  usedSeriesKeys: Set<string>
): { seriesKey: string; adopted?: DraftSeries } {
  const resolved = resolveDraftSeriesKey(raw, series)
  if (resolved) {
    return { seriesKey: resolved }
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return { seriesKey: '' }
  }
  const name = cleanDraftName(raw)
  if (!draftKey(name)) {
    return { seriesKey: '' }
  }
  const reserved = new Set(usedSeriesKeys)
  series.forEach((item) => reserved.add(item.key))
  const key = uniqueDraftKey(name, reserved)
  return {
    seriesKey: key,
    adopted: {
      type: 'series',
      key,
      name,
      aliases: [],
      importAction: 'update',
      baseAliases: [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
  }
}

function sameEntityContent(left: DraftEntity, right: DraftEntity): boolean {
  if (left.type !== right.type || left.name !== right.name || !sameAliases(left.aliases, right.aliases)) {
    return false
  }
  if (left.type === 'character' && right.type === 'character') {
    return left.seriesKey === right.seriesKey
  }
  return true
}

function asSeries(entity: DraftEntity | null): DraftSeries | null {
  if (!entity || entity.type !== 'series') {
    return null
  }
  return entity
}

function asCharacter(entity: DraftEntity | null): DraftCharacter | null {
  if (!entity || entity.type !== 'character') {
    return null
  }
  return entity
}

export function applyDraftMutation(
  current: DraftEntity | null,
  mutation: DraftMutation,
  usedKeys: Set<string>,
  editorId: string,
  editorName: string,
  draftSeries: readonly DraftSeriesRef[] = [],
  draftCharacters: readonly DraftCharacterRef[] = [],
  reservedSeriesKeys: Set<string> = new Set()
): MutationResult {
  switch (mutation.action) {
    case 'add':
      return addEntity(
        current,
        mutation,
        usedKeys,
        editorId,
        editorName,
        draftSeries,
        draftCharacters,
        reservedSeriesKeys
      )
    case 'update':
      return updateEntity(
        current,
        mutation,
        editorId,
        editorName,
        draftSeries,
        draftCharacters,
        reservedSeriesKeys
      )
    case 'delete':
      return deleteEntity(current, mutation)
    default: {
      const exhaustive: never = mutation.action
      return exhaustive
    }
  }
}

function addEntity(
  current: DraftEntity | null,
  mutation: DraftMutation,
  usedKeys: Set<string>,
  editorId: string,
  editorName: string,
  draftSeries: readonly DraftSeriesRef[],
  draftCharacters: readonly DraftCharacterRef[],
  reservedSeriesKeys: Set<string>
): MutationResult {
  if (current) {
    throw new DraftError(
      'CONFLICT',
      'Someone else already added this entity.',
      409,
      current
    )
  }
  const name = requireName(mutation.name)
  const key = mutation.key && mutation.key.trim()
    ? mutation.key.trim()
    : uniqueDraftKey(name, usedKeys)
  if (usedKeys.has(key)) {
    throw new DraftError('INVALID_INPUT', 'That key is already in this draft.', 400)
  }
  const aliases = aliasesOf(mutation.aliases, [])
  if (mutation.type === 'series') {
    const entity: DraftSeries = {
      type: 'series',
      key,
      name,
      aliases,
      importAction: 'add',
      baseAliases: [],
      revision: 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
    return { action: 'add', entity, before: null, after: entity }
  }
  const adopted = adoptSeries(
    mutation.seriesKey,
    draftSeries,
    editorId,
    editorName,
    reservedSeriesKeys
  )
  if (!adopted.seriesKey) {
    throw new DraftError('INVALID_INPUT', 'Each character needs a series.', 400)
  }
  assertUniqueCharacter(name, adopted.seriesKey, '', draftCharacters)
  const entity: DraftCharacter = {
    type: 'character',
    key,
    name,
    seriesKey: adopted.seriesKey,
    aliases,
    importAction: 'add',
    baseAliases: [],
    revision: 1,
    lastEditorId: editorId,
    lastEditorName: editorName
  }
  return {
    action: 'add',
    entity,
    before: null,
    after: entity,
    adoptedSeries: adopted.adopted
  }
}

function updateEntity(
  current: DraftEntity | null,
  mutation: DraftMutation,
  editorId: string,
  editorName: string,
  draftSeries: readonly DraftSeriesRef[],
  draftCharacters: readonly DraftCharacterRef[],
  reservedSeriesKeys: Set<string>
): MutationResult {
  if (!current) {
    throw new DraftError('ENTITY_GONE', 'That entity was deleted.', 409, null)
  }
  if (mutation.expectedRevision !== current.revision) {
    throw new DraftError(
      'CONFLICT',
      'Someone else changed this entity. Reload it and try again.',
      409,
      current
    )
  }
  const name = requireName(mutation.name ?? current.name)
  const aliases = aliasesOf(mutation.aliases, current.aliases)
  let next: DraftEntity
  const series = asSeries(current)
  const character = asCharacter(current)
  const adopted = character && mutation.seriesKey !== undefined && mutation.seriesKey.trim() !== ''
    ? adoptSeries(mutation.seriesKey, draftSeries, editorId, editorName, reservedSeriesKeys)
    : { seriesKey: character ? character.seriesKey : '', adopted: undefined }
  const nextSeriesKey = character
    ? adopted.seriesKey
    : current.type === 'series' ? current.key : ''
  assertLiveRow(current, name, nextSeriesKey, aliases)
  if (series) {
    next = {
      ...series,
      name,
      aliases,
      revision: series.revision + 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
  } else if (character) {
    const seriesKey = nextSeriesKey
    if (!seriesKey) {
      throw new DraftError('INVALID_INPUT', 'Each character needs a series.', 400)
    }
    assertUniqueCharacter(name, seriesKey, character.key, draftCharacters)
    next = {
      ...character,
      name,
      seriesKey,
      aliases,
      revision: character.revision + 1,
      lastEditorId: editorId,
      lastEditorName: editorName
    }
  } else {
    throw new DraftError('INVALID_INPUT', 'Unknown entity type.', 400)
  }
  if (sameEntityContent(current, next)) {
    throw new DraftError('INVALID_INPUT', 'Nothing about this row changed.', 400)
  }
  return {
    action: 'update',
    entity: next,
    before: current,
    after: next,
    adoptedSeries: adopted.adopted
  }
}

function deleteEntity(current: DraftEntity | null, mutation: DraftMutation): MutationResult {
  if (!current) {
    throw new DraftError('ENTITY_GONE', 'That entity was deleted.', 409, null)
  }
  if (mutation.expectedRevision !== current.revision) {
    throw new DraftError(
      'CONFLICT',
      'Someone else changed this entity. Reload it and try again.',
      409,
      current
    )
  }
  if (current.importAction === 'update') {
    throw new DraftError('INVALID_INPUT', 'This live row cannot be deleted.', 400)
  }
  return { action: 'delete', entity: null, before: current, after: null }
}
