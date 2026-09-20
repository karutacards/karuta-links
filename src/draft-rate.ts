import { DraftError } from './draft-types'

export const DRAFT_WRITE_LIMIT = 60
export const DRAFT_WRITE_PERIOD_SEC = 10

export async function limitDraftWrite(env: Env, discordId: string): Promise<void> {
  const limiter = env.DRAFT_WRITE
  if (!limiter) {
    throw new DraftError('UNAVAILABLE', 'Draft access could not be verified.', 503)
  }
  const { success } = await limiter.limit({ key: discordId })
  if (!success) {
    throw new DraftError('RATE_LIMITED', 'Too many draft actions. Wait a few seconds.', 429)
  }
}
