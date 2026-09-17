import { app } from './app'
import { pollCardHunt, type PollEnv } from './poll'

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: PollEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(pollCardHunt(env).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.error(`CONTEST POLL :: ${message}`)
    }))
  }
}
