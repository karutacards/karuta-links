import { app } from './app'
import { pollCardHunt } from './poll'

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(pollCardHunt(env).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.error(`CONTEST POLL :: ${message}`)
    }))
  }
}
