import { getFirestoreDocument } from './firestore'
import type { DraftsConfig } from './drafts-config'
import { draftsConfig } from './drafts-config'
import { presentSecret } from './session'

export const ACCESS_DENIED_MESSAGE = 'You do not have access to this draft.'
export const ACCESS_UNAVAILABLE_MESSAGE = 'Draft access could not be verified.'

export type PlayerStats = {
  drops: number
  grabs: number
  purchases: number
}

export type AccessDenied = {
  ok: false
  status: 403 | 503
  code: 'FORBIDDEN' | 'UNAVAILABLE'
  message: string
}

export type AccessDecision = { ok: true } | AccessDenied

export type DraftAccessLoaders = {
  isBlacklisted: (discordId: string) => Promise<boolean>
  getPlayerStats: (discordId: string) => Promise<PlayerStats | null>
}

export function numericField(data: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return 0
}

export function playerStatsFromFirestore(data: Record<string, unknown>): PlayerStats {
  const drops = numericField(data, ['cardDropped', 'totalDrops', 'drops'])
  const grabs = numericField(data, ['cardGrabbed', 'totalGrabs', 'grabs'])
  const usdSpent = numericField(data, ['usdSpent'])
  return {
    drops,
    grabs,
    purchases: usdSpent > 0 ? 1 : 0
  }
}

export function meetsCredentials(stats: PlayerStats, config: DraftsConfig): boolean {
  const { minDrops, minGrabs, minPurchases } = config.credentials
  return stats.drops >= minDrops || stats.grabs >= minGrabs || stats.purchases >= minPurchases
}

export function collectBlacklistIds(data: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(data)) {
    return ids
  }
  for (const row of data) {
    if (typeof row === 'string' && row.length > 0) {
      ids.add(row)
      continue
    }
    if (row && typeof row === 'object' && 'id' in row) {
      const id = (row as { id: unknown }).id
      if (typeof id === 'string' && id.length > 0) {
        ids.add(id)
      }
    }
  }
  return ids
}

export async function gunzipJson(bytes: ArrayBuffer): Promise<unknown> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  return JSON.parse(text) as unknown
}

const BLACKLIST_TTL_MS = 60 * 60 * 1000
let blacklistCache: { ids: Set<string>; expiresAt: number } | null = null

export function resetBlacklistCache(): void {
  blacklistCache = null
}

export async function loadBlacklist(bucket: R2Bucket): Promise<Set<string>> {
  const now = Date.now()
  if (blacklistCache && now < blacklistCache.expiresAt) {
    return blacklistCache.ids
  }
  const keys = ['blacklist.json.gz', 'karuta-data/blacklist.json.gz']
  for (const key of keys) {
    const object = await bucket.get(key)
    if (!object) {
      continue
    }
    const ids = collectBlacklistIds(await gunzipJson(await object.arrayBuffer()))
    blacklistCache = { ids, expiresAt: now + BLACKLIST_TTL_MS }
    return ids
  }
  throw new Error('Blacklist is missing.')
}

export async function loadPlayerStats(
  projectId: string,
  serviceAccount: string,
  discordId: string
): Promise<PlayerStats | null> {
  const document = await getFirestoreDocument(projectId, serviceAccount, `statistics_user/${discordId}`)
  if (!document) {
    return null
  }
  return playerStatsFromFirestore(document)
}

export function envAccessLoaders(env: Env): DraftAccessLoaders | { error: AccessDecision } {
  if (!env.KARUTA_DATA) {
    return {
      error: {
        ok: false,
        status: 503,
        code: 'UNAVAILABLE',
        message: ACCESS_UNAVAILABLE_MESSAGE
      }
    }
  }
  const bucket = env.KARUTA_DATA
  const loaders: DraftAccessLoaders = {
    isBlacklisted: async (discordId) => {
      const ids = await loadBlacklist(bucket)
      return ids.has(discordId)
    },
    getPlayerStats: async (discordId) => {
      if (!presentSecret(env.FIRESTORE_PROJECT_ID) || !presentSecret(env.FIRESTORE_SERVICE_ACCOUNT)) {
        throw new Error('Firestore is not configured.')
      }
      return loadPlayerStats(env.FIRESTORE_PROJECT_ID, env.FIRESTORE_SERVICE_ACCOUNT, discordId)
    }
  }
  return loaders
}

export async function evaluateDraftAccess(
  discordId: string,
  config: DraftsConfig,
  loaders: DraftAccessLoaders
): Promise<AccessDecision> {
  try {
    if (await loaders.isBlacklisted(discordId)) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN',
        message: ACCESS_DENIED_MESSAGE
      }
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: 'UNAVAILABLE',
      message: ACCESS_UNAVAILABLE_MESSAGE
    }
  }

  switch (config.access) {
    case 'open':
      return { ok: true }
    case 'whitelist':
      if (!config.whitelist.includes(discordId)) {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN',
          message: ACCESS_DENIED_MESSAGE
        }
      }
      return { ok: true }
    case 'credentials': {
      let stats: PlayerStats | null
      try {
        stats = await loaders.getPlayerStats(discordId)
      } catch {
        return {
          ok: false,
          status: 503,
          code: 'UNAVAILABLE',
          message: ACCESS_UNAVAILABLE_MESSAGE
        }
      }
      if (!stats || !meetsCredentials(stats, config)) {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN',
          message: ACCESS_DENIED_MESSAGE
        }
      }
      return { ok: true }
    }
    default: {
      const exhaustive: never = config.access
      return exhaustive
    }
  }
}

export async function draftAccessForEnv(
  env: Env,
  discordId: string,
  config: DraftsConfig = draftsConfig
): Promise<AccessDecision> {
  const loaded = envAccessLoaders(env)
  if ('error' in loaded) {
    return loaded.error
  }
  return evaluateDraftAccess(discordId, config, loaded)
}
