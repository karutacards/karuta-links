import { describe, expect, it } from 'vitest'
import { bearerToken, tokensMatch } from './auth'

describe('auth', () => {
  it('reads a Bearer token', () => {
    expect(bearerToken('Bearer secret-token')).toBe('secret-token')
    expect(bearerToken('bearer secret-token')).toBe('secret-token')
    expect(bearerToken('Basic nope')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })

  it('rejects mismatched or empty expected tokens', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true)
    expect(tokensMatch('abc', 'abd')).toBe(false)
    expect(tokensMatch('ab', 'abc')).toBe(false)
    expect(tokensMatch('abc', '')).toBe(false)
  })
})
