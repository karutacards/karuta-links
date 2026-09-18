import rawConfig from '../drafts.config.json' with { type: 'json' }

export type DraftAccessMode = 'open' | 'credentials' | 'whitelist'

export type DraftsConfig = {
  access: DraftAccessMode
  whitelist: string[]
  lockIds: string[]
  credentials: {
    minDrops: number
    minGrabs: number
    minPurchases: number
  }
}

function isAccessMode(value: string): value is DraftAccessMode {
  return value === 'open' || value === 'credentials' || value === 'whitelist'
}

export function parseDraftsConfig(raw: unknown): DraftsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Drafts config must be an object.')
  }
  const record = raw as Record<string, unknown>
  if (typeof record.access !== 'string' || !isAccessMode(record.access)) {
    throw new Error('Drafts config access must be open, credentials or whitelist.')
  }
  const whitelist = Array.isArray(record.whitelist)
    ? record.whitelist.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const lockIds = Array.isArray(record.lockIds)
    ? record.lockIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
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
    whitelist,
    lockIds,
    credentials: { minDrops, minGrabs, minPurchases }
  }
}

export const draftsConfig = parseDraftsConfig(rawConfig)

export function canLockDrafts(discordId: string, config: DraftsConfig = draftsConfig): boolean {
  return config.lockIds.includes(discordId)
}
