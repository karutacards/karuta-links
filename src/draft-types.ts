export const DRAFT_SECTION = 'drafts'

export type DraftEntityType = 'series' | 'character'

export type DraftSeriesInput = {
  key: string
  name: string
  aliases?: string[]
}

export type DraftCharacterInput = {
  key: string
  name: string
  seriesKey: string
  aliases?: string[]
}

export type DraftCatalogInput = {
  series?: DraftSeriesInput[]
  characters?: DraftCharacterInput[]
}

export type DraftSeries = {
  type: 'series'
  key: string
  name: string
  aliases: string[]
  revision: number
  lastEditorId: string | null
  lastEditorName: string | null
}

export type DraftCharacter = {
  type: 'character'
  key: string
  name: string
  seriesKey: string
  aliases: string[]
  revision: number
  lastEditorId: string | null
  lastEditorName: string | null
}

export type DraftEntity = DraftSeries | DraftCharacter

export type DraftRecord = {
  id: number
  createdAt: number
  updatedAt: number
  lockedAt: number | null
  lockedBy: string | null
  series: DraftSeries[]
  characters: DraftCharacter[]
}

export type DraftAuditRow = {
  id: number
  entityType: DraftEntityType
  entityKey: string
  action: string
  beforeJson: string | null
  afterJson: string | null
  discordId: string
  username: string
  createdAt: number
}

export type DraftConflict = {
  code: 'CONFLICT' | 'ENTITY_GONE' | 'LOCKED'
  entity: DraftEntity | null
}

export class DraftError extends Error {
  readonly status: number
  readonly code: string
  readonly entity: DraftEntity | null

  constructor(code: string, message: string, status: number, entity: DraftEntity | null = null) {
    super(message)
    this.code = code
    this.status = status
    this.entity = entity
  }
}
