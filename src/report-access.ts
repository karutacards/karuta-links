import {
  envAccessLoaders,
  meetsCredentials,
  type AccessDecision,
  type AccessDenied,
  type DraftAccessLoaders
} from './draft-access'
import { canAdminDrafts, draftsConfig } from './drafts-config'
import { isReportBanned } from './report-store'

export const REPORT_ACCESS_DENIED_MESSAGE = 'You do not have access to the report form.'
export const REPORT_ACCESS_UNAVAILABLE_MESSAGE = 'Report access could not be verified.'
export const REPORT_BANNED_MESSAGE = 'You cannot use the report form.'

export type ReportAccessLoaders = DraftAccessLoaders & {
  isReportBanned: (discordId: string) => Promise<boolean>
}

function denied(message: string, status: 403 | 503, code: AccessDenied['code']): AccessDenied {
  return { ok: false, status, code, message }
}

export function reportAccessConfig() {
  return {
    ...draftsConfig,
    access: 'credentials' as const
  }
}

export async function evaluateReportAccess(
  discordId: string,
  loaders: ReportAccessLoaders
): Promise<AccessDecision> {
  try {
    if (await loaders.isReportBanned(discordId)) {
      return denied(REPORT_BANNED_MESSAGE, 403, 'FORBIDDEN')
    }
  } catch {
    return denied(REPORT_ACCESS_UNAVAILABLE_MESSAGE, 503, 'UNAVAILABLE')
  }

  try {
    if (await loaders.isBlacklisted(discordId)) {
      return denied(REPORT_ACCESS_DENIED_MESSAGE, 403, 'FORBIDDEN')
    }
  } catch {
    return denied(REPORT_ACCESS_UNAVAILABLE_MESSAGE, 503, 'UNAVAILABLE')
  }

  if (canAdminDrafts(discordId)) {
    return { ok: true }
  }

  let stats
  try {
    stats = await loaders.getPlayerStats(discordId)
  } catch {
    return denied(REPORT_ACCESS_UNAVAILABLE_MESSAGE, 503, 'UNAVAILABLE')
  }
  if (!stats || !meetsCredentials(stats, reportAccessConfig())) {
    return denied(REPORT_ACCESS_DENIED_MESSAGE, 403, 'FORBIDDEN')
  }
  return { ok: true }
}

export async function reportAccessForEnv(
  env: Env,
  discordId: string
): Promise<AccessDecision> {
  const loaded = envAccessLoaders(env)
  if ('error' in loaded) {
    return denied(REPORT_ACCESS_UNAVAILABLE_MESSAGE, 503, 'UNAVAILABLE')
  }
  return evaluateReportAccess(discordId, {
    ...loaded,
    isReportBanned: (id) => isReportBanned(env.DB, id)
  })
}
