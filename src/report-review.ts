import type { Hono } from 'hono'
import { bearerToken, tokensMatch } from './auth'
import {
  getReport,
  listReports,
  REPORT_LIST_DEFAULT,
  REPORT_LIST_MAX
} from './report-store'

export const REPORT_REVIEW_LIMIT = 60
export const REPORT_REVIEW_PERIOD_SEC = 10

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY'
    }
  })
}

function parseId(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') {
    return REPORT_LIST_DEFAULT
  }
  const limit = parseId(raw)
  if (limit === null || limit > REPORT_LIST_MAX) {
    return null
  }
  return limit
}

async function authorizeReview(request: Request, env: Env): Promise<Response | null> {
  const expected = env.REPORT_REVIEW_TOKEN
  if (!expected) {
    return json({ error: 'Unavailable' }, 503)
  }
  const provided = bearerToken(request.headers.get('Authorization') ?? undefined)
  if (!provided || !tokensMatch(provided, expected)) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const limiter = env.REPORT_REVIEW
  if (!limiter) {
    return json({ error: 'Unavailable' }, 503)
  }
  const { success } = await limiter.limit({ key: 'review' })
  if (!success) {
    return json({ error: 'Rate limited' }, 429)
  }
  return null
}

export function registerReportReview(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/v1/reports', async (c) => {
    const denied = await authorizeReview(c.req.raw, c.env)
    if (denied) {
      return denied
    }
    const afterRaw = c.req.query('after')
    let after: number | undefined
    if (afterRaw) {
      const parsed = parseId(afterRaw)
      if (parsed === null) {
        return json({ error: 'Invalid after' }, 400)
      }
      after = parsed
    }
    const limit = parseLimit(c.req.query('limit'))
    if (limit === null) {
      return json({ error: 'Invalid limit' }, 400)
    }
    try {
      const reports = await listReports(c.env.DB, { after, limit })
      const next =
        reports.length === limit ? reports[reports.length - 1]?.id : undefined
      return json(next === undefined ? { reports } : { reports, after: next })
    } catch {
      return json({ error: 'Unavailable' }, 503)
    }
  })

  app.get('/api/v1/reports/:id', async (c) => {
    const denied = await authorizeReview(c.req.raw, c.env)
    if (denied) {
      return denied
    }
    const id = parseId(c.req.param('id'))
    if (id === null) {
      return json({ error: 'Not found' }, 404)
    }
    try {
      const report = await getReport(c.env.DB, id)
      if (!report) {
        return json({ error: 'Not found' }, 404)
      }
      return json(report)
    } catch {
      return json({ error: 'Unavailable' }, 503)
    }
  })
}
