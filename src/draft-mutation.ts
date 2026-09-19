import { resolveDraftSeriesKey, uniqueDraftKey, type DraftSeriesRef } from './draft-catalog'
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
}

function requireName(value: string | undefined): string {
  const name = value?.trim() ?? ''
  if (!name) {
    throw new DraftError('INVALID_INPUT', 'Name is required.', 400)
  }
  return name
}

function aliasesOf(value: string[] | undefined, fallback: string[]): string[] {
  return value ?? fallback
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
  draftSeries: readonly DraftSeriesRef[] = []
): MutationResult {
  switch (mutation.action) {
    case 'add':
      return addEntity(current, mutation, usedKeys, editorId, editorName, draftSeries)
    case 'update':
      return updateEntity(current, mutation, editorId, editorName, draftSeries)
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
  draftSeries: readonly DraftSeriesRef[]
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
  const entity: DraftEntity = mutation.type === 'series'
    ? {
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
    : {
        type: 'character',
        key,
        name,
        seriesKey: resolveDraftSeriesKey(mutation.seriesKey, draftSeries),
        aliases,
        importAction: 'add',
        baseAliases: [],
        revision: 1,
        lastEditorId: editorId,
        lastEditorName: editorName
      }
  if (entity.type === 'character' && !entity.seriesKey) {
    throw new DraftError(
      'INVALID_INPUT',
      mutation.seriesKey && mutation.seriesKey.trim()
        ? 'That series is not on this draft.'
        : 'Each character needs a series.',
      400
    )
  }
  return { action: 'add', entity, before: null, after: entity }
}

function updateEntity(
  current: DraftEntity | null,
  mutation: DraftMutation,
  editorId: string,
  editorName: string,
  draftSeries: readonly DraftSeriesRef[]
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
  const nextSeriesKey = character
    ? (mutation.seriesKey !== undefined && mutation.seriesKey.trim() !== ''
      ? resolveDraftSeriesKey(mutation.seriesKey, draftSeries)
      : character.seriesKey)
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
      throw new DraftError(
        'INVALID_INPUT',
        mutation.seriesKey && mutation.seriesKey.trim()
          ? 'That series is not on this draft.'
          : 'Each character needs a series.',
        400
      )
    }
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
  return { action: 'update', entity: next, before: current, after: next }
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
