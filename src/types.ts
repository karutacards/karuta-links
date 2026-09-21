export const CONTENT_SECTION = 'content'
export const CONTENT_KIND = 'content_publish'
export const CONTEST_SECTION = 'contests'
export const CONTEST_KIND = 'card_hunt_results'
export const CARD_HUNT_NAME = 'card_hunt'

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

export type SeriesAliasRecord = {
  key: string
  name: string
  aliases: string[]
}

export type CharacterAliasRecord = {
  key: string
  name: string
  seriesKey: string
  seriesName: string
  aliases: string[]
}

export type ContentSnapshot = {
  kind: typeof CONTENT_KIND
  environment: string
  newSeries: SeriesRecord[]
  updatedSeries: SeriesRecord[]
  newCharacters: CharacterRecord[]
  newEditions: EditionRecord[]
  updatedEditions: EditionRecord[]
  newSeriesAliases: SeriesAliasRecord[]
  newCharacterAliases: CharacterAliasRecord[]
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

export type ContestWinner = {
  place: number
  userId: string
  score: number
  reward: number
}

export type ContestEntry = {
  cardId: string
  code: string
  edition: string
  number: string
  characterKey: string
  seriesKey: string
  submitter: string
  submittedAt: number
  score: number
  imageUrl: string
  sourceUrl: string | null
}

export type ContestSnapshot = {
  kind: typeof CONTEST_KIND
  contestName: string
  eventCounter: number
  description: string
  judgingFinishedAt: number | null
  buyInPrice: number | null
  currency: string | null
  prizePool: number | null
  submissionCount: number
  reference: ContestEntry | null
  winners: ContestWinner[]
  entries: ContestEntry[]
}

export type ListedDump = {
  id: number
  createdAt: number
  slug: string | null
  snapshot: ContentSnapshot
}

export type ListedContest = {
  id: number
  createdAt: number
  slug: string | null
  snapshot: ContestSnapshot
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
  | { type: 'contestHome' }
  | { type: 'draftImport' }
  | { type: 'report' }
  | { type: 'albums' }
  | { type: 'draft'; id: number }
  | { type: 'document'; section: string; id: number }
  | { type: 'slug'; slug: string }
  | { type: 'notFound' }
