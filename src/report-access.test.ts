import { describe, expect, it } from 'vitest'
import { draftsConfig } from './drafts-config'
import {
  evaluateReportAccess,
  REPORT_ACCESS_DENIED_MESSAGE,
  REPORT_ACCESS_UNAVAILABLE_MESSAGE,
  REPORT_BANNED_MESSAGE
} from './report-access'

const loaders = {
  isReportBanned: async () => false,
  isBlacklisted: async () => false,
  getPlayerStats: async () => ({ drops: 1000, grabs: 0, purchases: 0 })
}

describe('report access', () => {
  it('rejects a form-banned user before credentials', async () => {
    await expect(evaluateReportAccess('1', {
      ...loaders,
      isReportBanned: async () => true,
      getPlayerStats: async () => {
        throw new Error('should not read stats')
      }
    })).resolves.toEqual({
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: REPORT_BANNED_MESSAGE
    })
  })

  it('rejects a blacklisted user without naming a bar', async () => {
    await expect(evaluateReportAccess('1', {
      ...loaders,
      isBlacklisted: async () => true
    })).resolves.toEqual({
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: REPORT_ACCESS_DENIED_MESSAGE
    })
  })

  it('allows a player who meets one credential bar', async () => {
    await expect(evaluateReportAccess('1', loaders)).resolves.toEqual({ ok: true })
  })

  it('denies a player who meets none of the bars', async () => {
    const decision = await evaluateReportAccess('1', {
      ...loaders,
      getPlayerStats: async () => ({ drops: 1, grabs: 1, purchases: 0 })
    })
    expect(decision).toEqual({
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: REPORT_ACCESS_DENIED_MESSAGE
    })
  })

  it('lets an admin skip the credential bars after the ban check', async () => {
    const adminId = draftsConfig.adminIds[0]
    expect(adminId).toBeTruthy()
    await expect(evaluateReportAccess(adminId ?? '', {
      ...loaders,
      getPlayerStats: async () => ({ drops: 0, grabs: 0, purchases: 0 })
    })).resolves.toEqual({ ok: true })
  })

  it('fails closed when the ban list cannot be read', async () => {
    await expect(evaluateReportAccess('1', {
      ...loaders,
      isReportBanned: async () => {
        throw new Error('missing')
      }
    })).resolves.toEqual({
      ok: false,
      status: 503,
      code: 'UNAVAILABLE',
      message: REPORT_ACCESS_UNAVAILABLE_MESSAGE
    })
  })
})
