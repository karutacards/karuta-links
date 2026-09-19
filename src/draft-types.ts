export const DRAFT_SECTION = 'drafts'
export const DRAFT_SAVES_SECTION = 'draft-saves'

export type DraftEntityType = 'series' | 'character'

export type DraftAuditSubject = DraftEntityType | 'draft'

export type DraftImportAction = 'add' | 'update'

export type DraftSeriesInput = {
  key: string
  name: string
  aliases?: string[]
  action?: DraftImportAction
}

export type DraftCharacterInput = {
  key: string
  name: string
  seriesKey: string
  aliases?: string[]
  action?: DraftImportAction
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
  importAction: DraftImportAction
  baseAliases: string[]
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
  importAction: DraftImportAction
  baseAliases: string[]
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
  description: string
  series: DraftSeries[]
  characters: DraftCharacter[]
}

export type DraftAuditRow = {
  id: number
  entityType: DraftAuditSubject
  entityKey: string
  action: string
  beforeJson: string | null
  afterJson: string | null
  discordId: string
  username: string
  createdAt: number
  saveId: number | null
}

export type DraftAuditSpan = {
  text: string
  entity?: boolean
}

export type DraftAuditEvent = DraftAuditRow & {
  summary: string
  actor: string
  spans: DraftAuditSpan[]
}

export type DraftPresence = {
  discordId: string
  username: string
}

export type DraftEventsSnapshot = {
  after: number
  events: DraftAuditEvent[]
  series: DraftSeries[]
  characters: DraftCharacter[]
  presence: DraftPresence[]
  lockedAt: number | null
  lockedBy: string | null
  description: string
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
