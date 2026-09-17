export const CONTENT_SECTION = 'content'
export const CONTENT_KIND = 'content_publish'

export type SeriesRecord = {
  key: string
  name: string
}

export type CharacterRecord = {
  key: string
  name: string
  seriesKey: string
  seriesName: string
}

export type EditionImage = {
  edition: string
  version: number
  imageUrl: string
}

export type EditionRecord = {
  key: string
  name: string
  seriesKey: string
  seriesName: string
  editions: EditionImage[]
}

export type ContentSnapshot = {
  kind: typeof CONTENT_KIND
  environment: string
  newSeries: SeriesRecord[]
  updatedSeries: SeriesRecord[]
  newCharacters: CharacterRecord[]
  newEditions: EditionRecord[]
  updatedEditions: EditionRecord[]
}

export type DocumentRow = {
  section: string
  id: number
  created_at: number
  kind: string
  payload: string
}

export type SlugRow = {
  slug: string
  section: string
  id: number
}

export type ListedDump = {
  id: number
  createdAt: number
  slug: string | null
  snapshot: ContentSnapshot
}

export type IngestResult = {
  section: string
  id: number
  slug: string
  path: string
  shortPath: string
  url: string
  shortUrl: string
}

export type Route =
  | { type: 'home' }
  | { type: 'health' }
  | { type: 'robots' }
  | { type: 'ingest' }
  | { type: 'document'; section: string; id: number }
  | { type: 'slug'; slug: string }
  | { type: 'notFound' }
