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

function snowflakeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

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
  const minDrops = typeof credentialsRaw.minDrops === 'number' ? credentialsRaw.minDrops : 1000
  const minGrabs = typeof credentialsRaw.minGrabs === 'number' ? credentialsRaw.minGrabs : 1000
  const minPurchases = typeof credentialsRaw.minPurchases === 'number'
    ? credentialsRaw.minPurchases
    : 1
  return {
    access: record.access,
    whitelist: snowflakeList(record.whitelist),
    adminIds: snowflakeList(record.adminIds),
    credentials: { minDrops, minGrabs, minPurchases }
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
    if (!Array.isArray(record.whitelist)) {
      throw new Error('Whitelist must be an array of Discord IDs.')
    }
    override.whitelist = snowflakeList(record.whitelist)
  }
  if (record.credentials !== undefined) {
    if (!record.credentials || typeof record.credentials !== 'object' || Array.isArray(record.credentials)) {
      throw new Error('Credentials must be an object.')
    }
    const credentialsRaw = record.credentials as Record<string, unknown>
    const credentials: Partial<DraftCredentials> = {}
    const minDrops = optionalNumber(credentialsRaw.minDrops)
    const minGrabs = optionalNumber(credentialsRaw.minGrabs)
    const minPurchases = optionalNumber(credentialsRaw.minPurchases)
    if (minDrops !== undefined) credentials.minDrops = minDrops
    if (minGrabs !== undefined) credentials.minGrabs = minGrabs
    if (minPurchases !== undefined) credentials.minPurchases = minPurchases
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
