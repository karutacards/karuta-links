import { describe, expect, it } from 'vitest'
import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_UNAVAILABLE_MESSAGE,
  collectBlacklistIds,
  evaluateDraftAccess,
  meetsCredentials,
  playerStatsFromFirestore
} from './draft-access'
import { parseDraftsConfig } from './drafts-config'

const credentials = parseDraftsConfig({
  access: 'credentials',
  credentials: { minDrops: 1000, minGrabs: 1000, minPurchases: 1 }
})

describe('draft access', () => {
  it('reads user blacklist ids from records or strings', () => {
    expect([...collectBlacklistIds([
      { type: 'User', id: '1' },
      '2',
      { type: 'User', id: 3 },
      { type: 'Guild', id: '9' }
    ])].sort()).toEqual(['1', '2', '3'])
    expect(() => collectBlacklistIds({ users: [] })).toThrow('Blacklist must be an array.')
  })

  it('maps Firestore player stats to the submission bars', () => {
    expect(playerStatsFromFirestore({
      cardDropped: 12,
      cardGrabbed: '40',
      usdSpent: 2.5
    })).toEqual({ drops: 12, grabs: 40, purchases: 1 })
    expect(meetsCredentials({ drops: 1000, grabs: 0, purchases: 0 }, credentials)).toBe(true)
    expect(meetsCredentials({ drops: 0, grabs: 0, purchases: 0 }, credentials)).toBe(false)
  })

  it('denies a blacklisted user in every mode without naming the reason', async () => {
    const loaders = {
      isBlacklisted: async () => true,
      getPlayerStats: async () => ({ drops: 5000, grabs: 5000, purchases: 1 })
    }
    const denied = {
      ok: false as const,
      status: 403 as const,
      code: 'FORBIDDEN' as const,
      message: ACCESS_DENIED_MESSAGE
    }
    await expect(evaluateDraftAccess('1', parseDraftsConfig({ access: 'open' }), loaders))
      .resolves.toEqual(denied)
    await expect(evaluateDraftAccess('1', parseDraftsConfig({
      access: 'whitelist',
      whitelist: ['1']
    }), loaders)).resolves.toEqual(denied)
    await expect(evaluateDraftAccess('1', credentials, loaders)).resolves.toEqual(denied)
  })

  it('allows an open, non-blacklisted user', async () => {
    await expect(evaluateDraftAccess('1', parseDraftsConfig({ access: 'open' }), {
      isBlacklisted: async () => false,
      getPlayerStats: async () => null
    })).resolves.toEqual({ ok: true })
  })

  it('allows a credentials user who meets one bar', async () => {
    await expect(evaluateDraftAccess('1', credentials, {
      isBlacklisted: async () => false,
      getPlayerStats: async () => ({ drops: 0, grabs: 0, purchases: 1 })
    })).resolves.toEqual({ ok: true })
  })

  it('denies a credentials user who meets none of the bars', async () => {
    const decision = await evaluateDraftAccess('1', credentials, {
      isBlacklisted: async () => false,
      getPlayerStats: async () => ({ drops: 10, grabs: 10, purchases: 0 })
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.message).toBe(ACCESS_DENIED_MESSAGE)
      expect(decision.status).toBe(403)
    }
  })

  it('limits whitelist mode to listed ids', async () => {
    const config = parseDraftsConfig({ access: 'whitelist', whitelist: ['9'] })
    await expect(evaluateDraftAccess('9', config, {
      isBlacklisted: async () => false,
      getPlayerStats: async () => null
    })).resolves.toEqual({ ok: true })
    await expect(evaluateDraftAccess('8', config, {
      isBlacklisted: async () => false,
      getPlayerStats: async () => null
    })).resolves.toMatchObject({ ok: false, status: 403 })
  })

  it('fails closed when the blacklist cannot be loaded', async () => {
    const decision = await evaluateDraftAccess('1', parseDraftsConfig({ access: 'open' }), {
      isBlacklisted: async () => {
        throw new Error('missing')
      },
      getPlayerStats: async () => null
    })
    expect(decision).toEqual({
      ok: false,
      status: 503,
      code: 'UNAVAILABLE',
      message: ACCESS_UNAVAILABLE_MESSAGE
    })
  })
})
