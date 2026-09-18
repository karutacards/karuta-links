import { describe, expect, it } from 'vitest'
import { canLockDrafts, draftsConfig, parseDraftsConfig } from './drafts-config'

describe('drafts config', () => {
  it('loads credentials mode with the submission bars', () => {
    expect(draftsConfig.access).toBe('credentials')
    expect(draftsConfig.whitelist).toEqual([])
    expect(draftsConfig.lockIds).toEqual(['141431182792458241'])
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
      lockIds: ['1', '']
    })
    expect(canLockDrafts('1', config)).toBe(true)
    expect(canLockDrafts('2', config)).toBe(false)
  })
})
