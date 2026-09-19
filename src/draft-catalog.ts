import {
  DraftError,
  type DraftCatalogInput,
  type DraftCharacterInput,
  type DraftImportAction,
  type DraftSeriesInput
} from './draft-types'

const MAX_NAME = 200
const MAX_ALIAS = 200
const MAX_ALIASES = 50
const MAX_ENTITIES = 10_000

export function draftKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .join(' ')
    .replace(/ /g, '-')
}

export type DraftSeriesRef = {
  key: string
  name: string
}

export function resolveDraftSeriesKey(raw: unknown, series: readonly DraftSeriesRef[]): string {
  if (typeof raw !== 'string') {
    return ''
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  const slug = draftKey(trimmed)
  const exactKey = series.find((item) => item.key === trimmed)
  if (exactKey) {
    return exactKey.key
  }
  const lowered = trimmed.toLowerCase()
  const exactName = series.find((item) => item.name.toLowerCase() === lowered)
  if (exactName) {
    return exactName.key
  }
  const slugKey = slug ? series.find((item) => item.key === slug) : undefined
  if (slugKey) {
    return slugKey.key
  }
  const slugName = slug ? series.find((item) => draftKey(item.name) === slug) : undefined
  if (slugName) {
    return slugName.key
  }
  return ''
}

export function characterIdentity(name: string, seriesKey: string): string {
  return `${name.trim().toLowerCase()}\0${seriesKey}`
}

export function uniqueDraftKey(name: string, used: Set<string>): string {
  const primary = draftKey(name)
  if (!primary) {
    throw new DraftError('INVALID_INPUT', 'Name does not produce a valid key.', 400)
  }
  if (!used.has(primary)) {
    return primary
  }
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${primary}-${suffix}`
    if (!used.has(candidate)) {
      return candidate
    }
  }
  throw new DraftError('INVALID_INPUT', 'A unique key could not be allocated.', 400)
}

function cleanAliases(raw: unknown): string[] {
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    throw new DraftError('INVALID_INPUT', 'Aliases must be an array of strings.', 400)
  }
  if (raw.length > MAX_ALIASES) {
    throw new DraftError('INVALID_INPUT', 'An entity cannot have that many aliases.', 400)
  }
  const aliases: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new DraftError('INVALID_INPUT', 'Aliases must be an array of strings.', 400)
    }
    const alias = item.trim()
    if (!alias) {
      continue
    }
    if (alias.length > MAX_ALIAS) {
      throw new DraftError('INVALID_INPUT', 'An alias is too long.', 400)
    }
    const key = alias.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    aliases.push(alias)
  }
  return aliases
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new DraftError('INVALID_INPUT', 'Name is required.', 400)
  }
  const name = raw.trim()
  if (!name) {
    throw new DraftError('INVALID_INPUT', 'Name is required.', 400)
  }
  if (name.length > MAX_NAME) {
    throw new DraftError('INVALID_INPUT', 'Name is too long.', 400)
  }
  return name
}

function cleanAction(raw: unknown): DraftImportAction {
  if (raw === undefined || raw === null || raw === '') {
    return 'add'
  }
  if (raw === 'add' || raw === 'update') {
    return raw
  }
  throw new DraftError('INVALID_INPUT', 'Action must be add or update.', 400)
}

function cleanKey(raw: unknown, name: string, used: Set<string>): string {
  if (raw === undefined || raw === null || raw === '') {
    return uniqueDraftKey(name, used)
  }
  if (typeof raw !== 'string') {
    throw new DraftError('INVALID_INPUT', 'Key must be a string.', 400)
  }
  const key = draftKey(raw)
  if (!key) {
    throw new DraftError('INVALID_INPUT', 'Key is invalid.', 400)
  }
  if (used.has(key)) {
    throw new DraftError('INVALID_INPUT', 'That key is already in this draft.', 400)
  }
  return key
}

export function parseDraftCatalog(raw: unknown): {
  series: DraftSeriesInput[]
  characters: DraftCharacterInput[]
} {
  if (!raw || typeof raw !== 'object') {
    throw new DraftError('INVALID_INPUT', 'The catalog must be a JSON object.', 400)
  }
  const record = raw as DraftCatalogInput
  const seriesRaw = record.series ?? []
  const charactersRaw = record.characters ?? []
  if (!Array.isArray(seriesRaw) || !Array.isArray(charactersRaw)) {
    throw new DraftError('INVALID_INPUT', 'Series and characters must be arrays.', 400)
  }
  if (seriesRaw.length + charactersRaw.length > MAX_ENTITIES) {
    throw new DraftError('INVALID_INPUT', 'The catalog has too many entities.', 400)
  }

  const usedSeries = new Set<string>()
  const series: DraftSeriesInput[] = []
  for (const item of seriesRaw) {
    if (!item || typeof item !== 'object') {
      throw new DraftError('INVALID_INPUT', 'Each series must be an object.', 400)
    }
    const name = cleanName(item.name)
    const key = cleanKey(item.key, name, usedSeries)
    usedSeries.add(key)
    series.push({
      key,
      name,
      aliases: cleanAliases(item.aliases),
      action: cleanAction(item.action)
    })
  }

  const usedCharacters = new Set<string>()
  const usedIdentities = new Set<string>()
  const characters: DraftCharacterInput[] = []
  for (const item of charactersRaw) {
    if (!item || typeof item !== 'object') {
      throw new DraftError('INVALID_INPUT', 'Each character must be an object.', 400)
    }
    const name = cleanName(item.name)
    const seriesKey = resolveDraftSeriesKey(item.seriesKey, series)
    if (!seriesKey) {
      throw new DraftError('INVALID_INPUT', 'Each character needs a series.', 400)
    }
    const identity = characterIdentity(name, seriesKey)
    if (usedIdentities.has(identity)) {
      throw new DraftError('INVALID_INPUT', 'That character is already on this series.', 400)
    }
    const key = cleanKey(item.key, name, usedCharacters)
    usedCharacters.add(key)
    usedIdentities.add(identity)
    characters.push({
      key,
      name,
      seriesKey,
      aliases: cleanAliases(item.aliases),
      action: cleanAction(item.action)
    })
  }

  return { series, characters }
}
