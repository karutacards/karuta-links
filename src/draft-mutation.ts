import { uniqueDraftKey } from './draft-catalog'
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
  editorName: string
): MutationResult {
  switch (mutation.action) {
    case 'add':
      return addEntity(current, mutation, usedKeys, editorId, editorName)
    case 'update':
      return updateEntity(current, mutation, editorId, editorName)
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
  editorName: string
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
        revision: 1,
        lastEditorId: editorId,
        lastEditorName: editorName
      }
    : {
        type: 'character',
        key,
        name,
        seriesKey: mutation.seriesKey?.trim() ?? '',
        aliases,
        revision: 1,
        lastEditorId: editorId,
        lastEditorName: editorName
      }
  if (entity.type === 'character' && !entity.seriesKey) {
    throw new DraftError('INVALID_INPUT', 'Each character needs a series key.', 400)
  }
  return { action: 'add', entity, before: null, after: entity }
}

function updateEntity(
  current: DraftEntity | null,
  mutation: DraftMutation,
  editorId: string,
  editorName: string
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
    const seriesKey = mutation.seriesKey?.trim() || character.seriesKey
    if (!seriesKey) {
      throw new DraftError('INVALID_INPUT', 'Each character needs a series key.', 400)
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
  return { action: 'delete', entity: null, before: current, after: null }
}
