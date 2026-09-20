import { describe, expect, it } from 'vitest'
import { limitDraftWrite } from './draft-rate'
import { DraftError } from './draft-types'

function envWithLimiter(limit: RateLimit['limit'] | undefined): Env {
  return {
    INGEST_TOKEN: 'test-ingest',
    DB: {} as D1Database,
    IMAGES: {} as R2Bucket,
    DRAFT_WRITE: limit ? { limit } : undefined as unknown as RateLimit
  }
}

describe('draft write rate limit', () => {
  it('allows a write when the limiter succeeds', async () => {
    await expect(limitDraftWrite(
      envWithLimiter(async () => ({ success: true })),
      '1'
    )).resolves.toBeUndefined()
  })

  it('rejects a write when the limiter is exhausted', async () => {
    try {
      await limitDraftWrite(
        envWithLimiter(async () => ({ success: false })),
        '1'
      )
      throw new Error('expected RATE_LIMITED')
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError)
      expect(error).toMatchObject({
        code: 'RATE_LIMITED',
        status: 429,
        message: 'Too many draft actions. Wait a few seconds.'
      })
    }
  })

  it('fails closed when the limiter binding is missing', async () => {
    await expect(limitDraftWrite(envWithLimiter(undefined), '1')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503
    })
  })
})
