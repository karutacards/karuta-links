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

  it('treats lock ids as a closed list', () => {
    const config = parseDraftsConfig({
      access: 'open',
      adminIds: ['1', '']
    })
    expect(canAdminDrafts('1', config)).toBe(true)
    expect(canAdminDrafts('2', config)).toBe(false)
  })

  it('hides a locked draft from everyone except admin ids', () => {
    const config = parseDraftsConfig({
      access: 'open',
      adminIds: ['1']
    })
    expect(draftHiddenFromViewer(9, '2', config)).toBe(true)
    expect(draftHiddenFromViewer(9, '1', config)).toBe(false)
    expect(draftHiddenFromViewer(null, '2', config)).toBe(false)
  })

  it('lets a local override replace global access fields', () => {
    const base = parseDraftsConfig({
      access: 'credentials',
      whitelist: ['9'],
      adminIds: ['1'],
      credentials: { minDrops: 1000, minGrabs: 1000, minPurchases: 1 }
    })
    const merged = mergeDraftsConfig(base, {
      access: 'whitelist',
      whitelist: ['2'],
      credentials: { minDrops: 5 }
    })
    expect(merged.access).toBe('whitelist')
    expect(merged.whitelist).toEqual(['2'])
    expect(merged.adminIds).toEqual(['1'])
    expect(merged.credentials).toEqual({ minDrops: 5, minGrabs: 1000, minPurchases: 1 })
    expect(parseDraftAccessOverride({})).toBeNull()
  })
})
