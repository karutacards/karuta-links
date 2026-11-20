import rawConfig from '../drafts.config.json' with { type: 'json' }

// `access` in drafts.config.json:
// open — signed-in and not Karuta-blacklisted
// credentials — not blacklisted, and at least one drop, grab or purchase bar
// whitelist — only Discord IDs in `whitelist`
// See SPEC.md for the full access rules.
export type DraftAccessMode = 'open' | 'credentials' | 'whitelist'

export type DraftCredentials = {
  minDrops: number
  minGrabs: number
  minPurchases: number
}

export type DraftsConfig = {
  access: DraftAccessMode
  whitelist: string[]
  adminIds: string[]
  credentials: DraftCredentials
}

export type DraftAccessOverride = {
  access?: DraftAccessMode
  whitelist?: string[]
  credentials?: Partial<DraftCredentials>
}

export type DraftAccessPublic = {
  access: DraftAccessMode
  whitelist: string[]
  credentials: DraftCredentials
}

function isAccessMode(value: string): value is DraftAccessMode {
  return value === 'open' || value === 'credentials' || value === 'whitelist'
}

const SNOWFLAKE = /^[0-9]{17,20}$/

// The global file and a draft's override follow the same rules, so an admin cannot save
// an override the global file would refuse.
function snowflakeList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of Discord IDs.`)
  }
  for (const id of value) {
    if (typeof id !== 'string' || !SNOWFLAKE.test(id)) {
      throw new Error(`${label} must hold only Discord IDs of 17 to 20 digits.`)
    }
  }
  return [...new Set(value as string[])]
}

function credentialBar(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of at least 1.`)
  }
  return value
}

const CREDENTIAL_BARS = [
  ['minDrops', 'The drop bar'],
  ['minGrabs', 'The grab bar'],
  ['minPurchases', 'The purchase bar']
] as const

export function parseDraftsConfig(raw: unknown): DraftsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Drafts config must be an object.')
  }
  const record = raw as Record<string, unknown>
  if (typeof record.access !== 'string' || !isAccessMode(record.access)) {
    throw new Error('Drafts config access must be open, credentials or whitelist.')
  }
  const credentialsRaw = record.credentials && typeof record.credentials === 'object'
    ? record.credentials as Record<string, unknown>
    : {}
  const defaults: DraftCredentials = { minDrops: 1000, minGrabs: 1000, minPurchases: 1 }
  const credentials = { ...defaults }
  for (const [field, label] of CREDENTIAL_BARS) {
    if (credentialsRaw[field] !== undefined) {
      credentials[field] = credentialBar(credentialsRaw[field], label)
    }
  }
  return {
    access: record.access,
    whitelist: record.whitelist === undefined ? [] : snowflakeList(record.whitelist, 'Whitelist'),
    adminIds: record.adminIds === undefined ? [] : snowflakeList(record.adminIds, 'Admin IDs'),
    credentials
  }
}

export function parseDraftAccessOverride(raw: unknown): DraftAccessOverride | null {
  if (raw == null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Draft access override must be an object.')
  }
  const record = raw as Record<string, unknown>
  const override: DraftAccessOverride = {}
  if (record.access !== undefined) {
    if (typeof record.access !== 'string' || !isAccessMode(record.access)) {
      throw new Error('Draft access must be open, credentials or whitelist.')
    }
    override.access = record.access
  }
  if (record.whitelist !== undefined) {
    override.whitelist = snowflakeList(record.whitelist, 'Whitelist')
  }
  if (record.credentials !== undefined) {
    if (!record.credentials || typeof record.credentials !== 'object' || Array.isArray(record.credentials)) {
      throw new Error('Credentials must be an object.')
    }
    const credentialsRaw = record.credentials as Record<string, unknown>
    const credentials: Partial<DraftCredentials> = {}
    for (const [field, label] of CREDENTIAL_BARS) {
      if (credentialsRaw[field] !== undefined && credentialsRaw[field] !== null) {
        credentials[field] = credentialBar(credentialsRaw[field], label)
      }
    }
    if (Object.keys(credentials).length) override.credentials = credentials
  }
  return isEmptyOverride(override) ? null : override
}

export function isEmptyOverride(override: DraftAccessOverride | null | undefined): boolean {
  if (!override) return true
  return override.access === undefined
    && override.whitelist === undefined
    && !override.credentials
}

export function mergeDraftsConfig(
  base: DraftsConfig,
  override: DraftAccessOverride | null | undefined
): DraftsConfig {
  return {
    access: override?.access ?? base.access,
    whitelist: override?.whitelist ?? base.whitelist,
    adminIds: base.adminIds,
    credentials: {
      minDrops: override?.credentials?.minDrops ?? base.credentials.minDrops,
      minGrabs: override?.credentials?.minGrabs ?? base.credentials.minGrabs,
      minPurchases: override?.credentials?.minPurchases ?? base.credentials.minPurchases
    }
  }
}

export function publicDraftAccess(config: DraftsConfig): DraftAccessPublic {
  return {
    access: config.access,
    whitelist: config.whitelist,
    credentials: config.credentials
  }
}

export const draftsConfig = parseDraftsConfig(rawConfig)

export function canAdminDrafts(discordId: string, config: DraftsConfig = draftsConfig): boolean {
  return config.adminIds.includes(discordId)
}

export function draftHiddenFromViewer(
  hiddenAt: number | null | undefined,
  discordId: string,
  config: DraftsConfig = draftsConfig
): boolean {
  return Boolean(hiddenAt) && !canAdminDrafts(discordId, config)
}
