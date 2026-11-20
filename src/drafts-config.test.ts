import { describe, expect, it } from 'vitest'
import {
  canAdminDrafts,
  draftHiddenFromViewer,
  draftsConfig,
  mergeDraftsConfig,
  parseDraftAccessOverride,
  parseDraftsConfig
} from './drafts-config'

describe('drafts config', () => {
  it('loads credentials mode with the submission bars', () => {
    expect(['open', 'credentials', 'whitelist']).toContain(draftsConfig.access)
    expect(draftsConfig.whitelist).toEqual([])
    expect(draftsConfig.adminIds).toEqual(['141431182792458241'])
    expect(draftsConfig.credentials).toEqual({
      minDrops: 1000,
      minGrabs: 1000,
      minPurchases: 1
    })
  })

  it('rejects an unknown access mode', () => {
    expect(() => parseDraftsConfig({ access: 'everyone' })).toThrow(
      /open, credentials or whitelist/
    )
  })

  it('treats admin ids as a closed list', () => {
    const config = parseDraftsConfig({
      access: 'open',
      adminIds: ['111111111111111111']
    })
    expect(canAdminDrafts('111111111111111111', config)).toBe(true)
    expect(canAdminDrafts('222222222222222222', config)).toBe(false)
  })

  it('refuses ids that are not Discord snowflakes in the global file', () => {
    expect(() => parseDraftsConfig({ access: 'open', adminIds: ['1'] })).toThrow(
      'Admin IDs must hold only Discord IDs of 17 to 20 digits.'
    )
    expect(() => parseDraftsConfig({ access: 'open', whitelist: [''] })).toThrow(
      'Whitelist must hold only Discord IDs of 17 to 20 digits.'
    )
  })

  it('refuses credential bars below one in the global file and an override', () => {
    expect(() => parseDraftsConfig({ access: 'credentials', credentials: { minDrops: 0 } })).toThrow(
      'The drop bar must be a whole number of at least 1.'
    )
    expect(() => parseDraftAccessOverride({ credentials: { minGrabs: -5 } })).toThrow(
      'The grab bar must be a whole number of at least 1.'
    )
    expect(() => parseDraftAccessOverride({ credentials: { minPurchases: 1.5 } })).toThrow(
      'The purchase bar must be a whole number of at least 1.'
    )
    expect(parseDraftAccessOverride({ credentials: { minDrops: 25 } })).toEqual({
      credentials: { minDrops: 25 }
    })
  })

  it('refuses override whitelist entries that are not Discord snowflakes', () => {
    expect(() => parseDraftAccessOverride({ whitelist: ['111111111111111111', 'craig'] })).toThrow(
      'Whitelist must hold only Discord IDs of 17 to 20 digits.'
    )
    expect(() => parseDraftAccessOverride({ whitelist: [12345678901234567] })).toThrow(
      'Whitelist must hold only Discord IDs of 17 to 20 digits.'
    )
    expect(parseDraftAccessOverride({ whitelist: ['111111111111111111', '111111111111111111'] })).toEqual({
      whitelist: ['111111111111111111']
    })
  })

  it('hides a locked draft from everyone except admin ids', () => {
    const config = parseDraftsConfig({
      access: 'open',
      adminIds: ['111111111111111111']
    })
    expect(draftHiddenFromViewer(9, '222222222222222222', config)).toBe(true)
    expect(draftHiddenFromViewer(9, '111111111111111111', config)).toBe(false)
    expect(draftHiddenFromViewer(null, '222222222222222222', config)).toBe(false)
  })

  it('lets a local override replace global access fields', () => {
    const base = parseDraftsConfig({
      access: 'credentials',
      whitelist: ['999999999999999999'],
      adminIds: ['111111111111111111'],
      credentials: { minDrops: 1000, minGrabs: 1000, minPurchases: 1 }
    })
    const merged = mergeDraftsConfig(base, {
      access: 'whitelist',
      whitelist: ['222222222222222222'],
      credentials: { minDrops: 5 }
    })
    expect(merged.access).toBe('whitelist')
    expect(merged.whitelist).toEqual(['222222222222222222'])
    expect(merged.adminIds).toEqual(['111111111111111111'])
    expect(merged.credentials).toEqual({ minDrops: 5, minGrabs: 1000, minPurchases: 1 })
    expect(parseDraftAccessOverride({})).toBeNull()
  })
})
