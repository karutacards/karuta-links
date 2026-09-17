import { cardImageUrl } from './images'
import {
  CONTENT_KIND,
  type CharacterRecord,
  type ContentSnapshot,
  type EditionImage,
  type EditionRecord,
  type SeriesRecord
} from './types'

export const MAX_INGEST_BYTES = 1_000_000

export class IngestError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'IngestError'
    this.status = status
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asOptionalArray(value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new IngestError(`${label} must be an array`)
  }
  return value
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new IngestError(`${label} requires a non-empty ${key}`)
  }
  return value.trim()
}

function parseSeriesList(value: unknown, label: string): SeriesRecord[] {
  return asOptionalArray(value, label).map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`)
    return {
      key: requiredString(record, 'key', `${label}[${index}]`),
      name: requiredString(record, 'name', `${label}[${index}]`)
    }
  })
}

function seriesNameFor(
  record: Record<string, unknown>,
  seriesByKey: Map<string, string>,
  label: string
): { seriesKey: string; seriesName: string } {
  const seriesKey = requiredString(record, 'series', label)
  const named = typeof record.seriesName === 'string' ? record.seriesName.trim() : ''
  const seriesName = named || seriesByKey.get(seriesKey) || ''
  if (!seriesName) {
    throw new IngestError(`${label} requires seriesName or a matching series in this payload`)
  }
  return { seriesKey, seriesName }
}

function parseCharacterList(
  value: unknown,
  label: string,
  seriesByKey: Map<string, string>
): CharacterRecord[] {
  return asOptionalArray(value, label).map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`)
    const series = seriesNameFor(record, seriesByKey, `${label}[${index}]`)
    return {
      key: requiredString(record, 'key', `${label}[${index}]`),
      name: requiredString(record, 'name', `${label}[${index}]`),
      seriesKey: series.seriesKey,
      seriesName: series.seriesName
    }
  })
}

function parseEditionRef(value: unknown, label: string): { edition: string; version: number } {
  if (typeof value === 'string' || typeof value === 'number') {
    const edition = String(value).trim()
    if (!edition) {
      throw new IngestError(`${label} edition is empty`)
    }
    return { edition, version: 0 }
  }
  const record = asRecord(value, label)
  const editionValue = record.edition
  const edition = typeof editionValue === 'string' || typeof editionValue === 'number'
    ? String(editionValue).trim()
    : ''
  if (!edition) {
    throw new IngestError(`${label} requires edition`)
  }
  const version = typeof record.version === 'number' && Number.isFinite(record.version)
    ? Math.max(0, Math.trunc(record.version))
    : 0
  return { edition, version }
}

function parseEditionList(
  value: unknown,
  label: string,
  seriesByKey: Map<string, string>
): EditionRecord[] {
  return asOptionalArray(value, label).map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}]`)
    const series = seriesNameFor(record, seriesByKey, `${label}[${index}]`)
    const key = requiredString(record, 'key', `${label}[${index}]`)
    const rawEditions = record.editions
    if (!Array.isArray(rawEditions) || rawEditions.length === 0) {
      throw new IngestError(`${label}[${index}] requires a non-empty editions array`)
    }
    const editions: EditionImage[] = rawEditions.map((edition, editionIndex) => {
      const parsed = parseEditionRef(edition, `${label}[${index}].editions[${editionIndex}]`)
      return {
        edition: parsed.edition,
        version: parsed.version,
        imageUrl: cardImageUrl(key, parsed.edition, parsed.version)
      }
    })
    return {
      key,
      name: requiredString(record, 'name', `${label}[${index}]`),
      seriesKey: series.seriesKey,
      seriesName: series.seriesName,
      editions
    }
  })
}

export function parseContentSnapshot(body: unknown): ContentSnapshot {
  const record = asRecord(body, 'body')
  const environment = typeof record.environment === 'string' && record.environment.trim()
    ? record.environment.trim()
    : 'production'

  const newSeries = parseSeriesList(record.newSeries, 'newSeries')
  const updatedSeries = parseSeriesList(record.updatedSeries, 'updatedSeries')
  const seriesByKey = new Map<string, string>()
  for (const series of [...newSeries, ...updatedSeries]) {
    seriesByKey.set(series.key, series.name)
  }

  const snapshot: ContentSnapshot = {
    kind: CONTENT_KIND,
    environment,
    newSeries,
    updatedSeries,
    newCharacters: parseCharacterList(record.newCharacters, 'newCharacters', seriesByKey),
    newEditions: parseEditionList(record.newEditions, 'newEditions', seriesByKey),
    updatedEditions: parseEditionList(record.updatedEditions, 'updatedEditions', seriesByKey)
  }

  const count =
    snapshot.newSeries.length +
    snapshot.updatedSeries.length +
    snapshot.newCharacters.length +
    snapshot.newEditions.length +
    snapshot.updatedEditions.length

  if (count === 0) {
    throw new IngestError('Payload must include at least one series, character or edition change')
  }

  return snapshot
}

export function dumpCounts(snapshot: ContentSnapshot): {
  newSeries: number
  updatedSeries: number
  newCharacters: number
  newEditions: number
  updatedEditions: number
} {
  return {
    newSeries: snapshot.newSeries.length,
    updatedSeries: snapshot.updatedSeries.length,
    newCharacters: snapshot.newCharacters.length,
    newEditions: snapshot.newEditions.length,
    updatedEditions: snapshot.updatedEditions.length
  }
}
