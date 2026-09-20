export const REPORT_REASONS = ['alting', 'botting', 'scamming', 'gambling'] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export type ReportFields = {
  reason: string
  userIds: string
  serverIds: string
  channelIds: string
  cardCodes: string
  dyeCodes: string
  idolCodes: string
  offenseDates: string
  notes: string
  acknowledged: boolean
}

export type ReportPayload = {
  reason: ReportReason
  userIds: string[]
  serverIds: string[]
  channelIds: string[]
  cardCodes: string[]
  dyeCodes: string[]
  idolCodes: string[]
  offenseDates: string[]
  notes: string
}

export type ReportValidationError = {
  error: true
  status: 400
  message: string
  fields: ReportFields
}

export const SNOWFLAKE_PATTERN = /^[0-9]{17,19}$/
export const CARD_CODE_BODY = /^[a-zA-Z0-9]{3,}$/
export const DYE_CODE_PATTERN = /^\$[a-zA-Z0-9]{2,}$/
export const IDOL_CODE_PATTERN = /^&[a-zA-Z0-9]{2,}$/
export const MAX_CARD_CODE_LENGTH = 8
export const MAX_PREFIXED_CODE_LENGTH = 9
export const MAX_ID_COUNT = 10
export const MAX_CODE_COUNT = 50
export const MAX_DATE_COUNT = 20
export const MAX_NOTES_LENGTH = 500
export const OFFENSE_DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
export const EARLIEST_OFFENSE_DATE = '2019-11-24'

export function utcDateString(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10)
}

export function isOffenseDate(value: string, today = utcDateString()): boolean {
  if (!OFFENSE_DATE_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false
  }
  return value >= EARLIEST_OFFENSE_DATE && value <= today
}

export function isDiscordSnowflake(value: string): boolean {
  return SNOWFLAKE_PATTERN.test(value)
}

export function isValidCardCodeSyntax(value: string): boolean {
  return Boolean(value.match(CARD_CODE_BODY)) && value.length <= MAX_CARD_CODE_LENGTH
}

export function isValidDyeCodeSyntax(value: string): boolean {
  return Boolean(value.match(DYE_CODE_PATTERN)) && value.length <= MAX_PREFIXED_CODE_LENGTH
}

export function isValidIdolCodeSyntax(value: string): boolean {
  return Boolean(value.match(IDOL_CODE_PATTERN)) && value.length <= MAX_PREFIXED_CODE_LENGTH
}

export const REPORT_REASON_COPY: Record<ReportReason, { label: string; help: string }> = {
  alting: {
    label: 'Alting',
    help: 'Using multiple accounts to play the bot with.'
  },
  botting: {
    label: 'Botting',
    help: 'Using automated methods to play the bot with.'
  },
  scamming: {
    label: 'Scamming',
    help: 'Existing only to exploit and deceive other players.'
  },
  gambling: {
    label: 'Gambling',
    help: 'Operating a server facilitating gambling-related services.'
  }
}

function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value)
}

export function emptyReportFields(): ReportFields {
  return {
    reason: '',
    userIds: '',
    serverIds: '',
    channelIds: '',
    cardCodes: '',
    dyeCodes: '',
    idolCodes: '',
    offenseDates: '',
    notes: '',
    acknowledged: false
  }
}

export function fieldsFromForm(form: FormData): ReportFields {
  const acknowledged = form.get('acknowledged')
  return {
    reason: readFormString(form, 'reason'),
    userIds: readFormString(form, 'user_ids'),
    serverIds: readFormString(form, 'server_ids'),
    channelIds: readFormString(form, 'channel_ids'),
    cardCodes: readFormString(form, 'card_codes'),
    dyeCodes: readFormString(form, 'dye_codes'),
    idolCodes: readFormString(form, 'idol_codes'),
    offenseDates: readFormString(form, 'offense_dates'),
    notes: readFormString(form, 'notes'),
    acknowledged: acknowledged === 'on' || acknowledged === 'true' || acknowledged === '1'
  }
}

function readFormString(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export function tokenize(raw: string): string[] {
  return raw.split(/[\s,]+/).map((token) => token.trim()).filter((token) => token.length > 0)
}

export function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    unique.push(token)
  }
  return unique
}

export function uniqueCodeTokens(tokens: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const token of tokens) {
    const normalized = token.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(normalized)
  }
  return unique
}

function invalid(
  fields: ReportFields,
  message: string
): ReportValidationError {
  return { error: true, status: 400, message, fields }
}

function parseSnowflakes(
  raw: string,
  fields: ReportFields,
  noun: string
): string[] | ReportValidationError {
  const tokens = uniqueTokens(tokenize(raw))
  if (tokens.length > MAX_ID_COUNT) {
    return invalid(fields, `Enter no more than ${MAX_ID_COUNT} ${noun}.`)
  }
  for (const token of tokens) {
    if (!isDiscordSnowflake(token)) {
      return invalid(fields, `Each ${noun.replace(/s$/, '')} must be a Discord snowflake (17–19 digits).`)
    }
  }
  return tokens
}

function parseCodes(
  raw: string,
  fields: ReportFields,
  noun: string,
  isValid: (token: string) => boolean,
  message: string
): string[] | ReportValidationError {
  const tokens = uniqueCodeTokens(tokenize(raw))
  if (tokens.length > MAX_CODE_COUNT) {
    return invalid(fields, `Enter no more than ${MAX_CODE_COUNT} ${noun}.`)
  }
  for (const token of tokens) {
    if (!isValid(token)) {
      return invalid(fields, message)
    }
  }
  return tokens
}

function parseOffenseDates(
  raw: string,
  fields: ReportFields,
  today: string
): string[] | ReportValidationError {
  const tokens = uniqueTokens(tokenize(raw)).sort()
  if (tokens.length > MAX_DATE_COUNT) {
    return invalid(fields, `Enter no more than ${MAX_DATE_COUNT} dates.`)
  }
  for (const token of tokens) {
    if (!isOffenseDate(token, today)) {
      return invalid(fields, 'Each date must be a real calendar day from Nov. 24, 2019, through today.')
    }
  }
  return tokens
}

export function parseReportFields(
  fields: ReportFields,
  now = Date.now()
): ReportPayload | ReportValidationError {
  if (!isReportReason(fields.reason)) {
    return invalid(fields, 'Select a reason for this report.')
  }

  const userIds = parseSnowflakes(fields.userIds, fields, 'user IDs')
  if ('error' in userIds) return userIds
  const serverIds = parseSnowflakes(fields.serverIds, fields, 'server IDs')
  if ('error' in serverIds) return serverIds
  const channelIds = parseSnowflakes(fields.channelIds, fields, 'channel IDs')
  if ('error' in channelIds) return channelIds

  if (userIds.length === 0 && serverIds.length === 0 && channelIds.length === 0) {
    return invalid(fields, 'Enter at least one user ID, server ID, or channel ID.')
  }

  const cardCodes = parseCodes(
    fields.cardCodes,
    fields,
    'card codes',
    isValidCardCodeSyntax,
    'Each card code must be 3–8 letters or numbers.'
  )
  if ('error' in cardCodes) return cardCodes
  const dyeCodes = parseCodes(
    fields.dyeCodes,
    fields,
    'dye codes',
    isValidDyeCodeSyntax,
    'Each dye code must start with $ followed by 2–8 letters or numbers.'
  )
  if ('error' in dyeCodes) return dyeCodes
  const idolCodes = parseCodes(
    fields.idolCodes,
    fields,
    'Idol codes',
    isValidIdolCodeSyntax,
    'Each Idol code must start with & followed by 2–8 letters or numbers.'
  )
  if ('error' in idolCodes) return idolCodes

  const offenseDates = parseOffenseDates(fields.offenseDates, fields, utcDateString(now))
  if ('error' in offenseDates) return offenseDates

  if (fields.notes.length > MAX_NOTES_LENGTH) {
    return invalid(fields, `Notes must be ${MAX_NOTES_LENGTH.toLocaleString('en-US')} characters or fewer.`)
  }

  if (!fields.acknowledged) {
    return invalid(fields, 'Acknowledge the false-report warning to submit.')
  }

  return {
    reason: fields.reason,
    userIds,
    serverIds,
    channelIds,
    cardCodes,
    dyeCodes,
    idolCodes,
    offenseDates,
    notes: fields.notes.trim()
  }
}
