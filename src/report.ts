import type { Hono } from 'hono'
import type { AccessDenied } from './draft-access'
import { oauthConfigured } from './oauth'
import { reportAccessForEnv } from './report-access'
import {
  renderReportForbidden,
  renderReportForm,
  renderReportRateLimited,
  renderReportThanks,
  renderReportUnavailable
} from './report-html'
import {
  countRecentReports,
  insertReport,
  REPORT_RATE_LIMIT,
  REPORT_RATE_WINDOW_MS
} from './report-store'
import { fieldsFromForm, parseReportFields } from './report-validate'
import { getSession, type Session } from './session'

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY'
    }
  })
}

function accessHtml(decision: AccessDenied): Response {
  if (decision.status === 503) {
    return html(renderReportUnavailable(), 503)
  }
  return html(renderReportForbidden(decision.message), decision.status)
}

async function requireReportSession(
  request: Request,
  env: Env
): Promise<{ session: Session } | Response> {
  if (!oauthConfigured(env)) {
    return html(renderReportUnavailable(), 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    const url = new URL('/api/auth/discord', request.url)
    url.searchParams.set('next', '/report')
    return Response.redirect(url.toString(), 302)
  }
  const decision = await reportAccessForEnv(env, session.discordId)
  if (!decision.ok) {
    return accessHtml(decision)
  }
  return { session }
}

export function registerReports(app: Hono<{ Bindings: Env }>): void {
  app.get('/report', async (c) => {
    const gated = await requireReportSession(c.req.raw, c.env)
    if (gated instanceof Response) {
      return gated
    }
    return html(renderReportForm())
  })

  app.post('/report', async (c) => {
    const gated = await requireReportSession(c.req.raw, c.env)
    if (gated instanceof Response) {
      return gated
    }
    const form = await c.req.formData()
    const parsed = parseReportFields(fieldsFromForm(form))
    if ('error' in parsed) {
      return html(renderReportForm({ error: parsed.message, fields: parsed.fields }), 400)
    }
    const since = Date.now() - REPORT_RATE_WINDOW_MS
    const recent = await countRecentReports(c.env.DB, gated.session.discordId, since)
    if (recent >= REPORT_RATE_LIMIT) {
      return html(renderReportRateLimited(), 429)
    }
    await insertReport(c.env.DB, {
      reporterId: gated.session.discordId,
      reporterUsername: gated.session.username,
      payload: parsed
    })
    return html(renderReportThanks())
  })
}
