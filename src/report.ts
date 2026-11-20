import type { Hono } from 'hono'
import type { AccessDenied } from './draft-access'
import { oauthConfigured } from './oauth'
import { reportAccessForEnv } from './report-access'
import {
  REPORT_SAVE_FAILED_MESSAGE,
  renderReportForbidden,
  renderReportForm,
  renderReportRateLimited,
  renderReportStart,
  renderReportThanks,
  renderReportUnavailable
} from './report-html'
import {
  REPORT_OG_BYTES,
  REPORT_OG_CONTENT_TYPE,
  REPORT_OG_PATH
} from './report-og'
import { registerReportReview } from './report-review'
import { insertReport } from './report-store'
import { fieldsFromForm, parseReportFields } from './report-validate'
import { getSession, viewerOf, type Session } from './session'

export const REPORT_SENT_PATH = '/report?sent=1'
export const REPORT_FORM_UNREADABLE_MESSAGE = 'The form could not be read. Please try again.'

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY'
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS }
  })
}

function accessHtml(decision: AccessDenied, session: Session): Response {
  const viewer = viewerOf(session)
  if (decision.status === 503) {
    return html(renderReportUnavailable(viewer), 503)
  }
  return html(renderReportForbidden(decision.message, viewer), decision.status)
}

function startOAuth(request: Request): Response {
  const url = new URL('/api/auth/discord', request.url)
  url.searchParams.set('next', '/report')
  return Response.redirect(url.toString(), 302)
}

async function gateReport(
  request: Request,
  env: Env
): Promise<{ session: Session } | { missing: true } | Response> {
  if (!oauthConfigured(env)) {
    return html(renderReportUnavailable(), 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    return { missing: true }
  }
  const decision = await reportAccessForEnv(env, session.discordId)
  if (!decision.ok) {
    return accessHtml(decision, session)
  }
  return { session }
}

export function registerReports(app: Hono<{ Bindings: Env }>): void {
  registerReportReview(app)

  app.get(REPORT_OG_PATH, () => {
    return new Response(REPORT_OG_BYTES, {
      headers: {
        'content-type': REPORT_OG_CONTENT_TYPE,
        'cache-control': 'public, max-age=604800',
        'x-content-type-options': 'nosniff'
      }
    })
  })

  app.get('/report', async (c) => {
    const gated = await gateReport(c.req.raw, c.env)
    if (gated instanceof Response) {
      return gated
    }
    if ('missing' in gated) {
      return html(renderReportStart())
    }
    const viewer = viewerOf(gated.session)
    if (c.req.query('sent') === '1') {
      return html(renderReportThanks(viewer))
    }
    return html(renderReportForm({ viewer }))
  })

  app.post('/report', async (c) => {
    const gated = await gateReport(c.req.raw, c.env)
    if (gated instanceof Response) {
      return gated
    }
    if ('missing' in gated) {
      return startOAuth(c.req.raw)
    }
    const viewer = viewerOf(gated.session)
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      return html(renderReportForm({ error: REPORT_FORM_UNREADABLE_MESSAGE, viewer }), 400)
    }
    const parsed = parseReportFields(fieldsFromForm(form))
    if ('error' in parsed) {
      return html(renderReportForm({ error: parsed.message, fields: parsed.fields, viewer }), 400)
    }
    let stored
    try {
      stored = await insertReport(c.env.DB, {
        reporterId: gated.session.discordId,
        reporterUsername: gated.session.username,
        payload: parsed
      })
    } catch (error) {
      console.error(`REPORT SAVE :: ${error instanceof Error ? error.message : String(error)}`)
      return html(renderReportUnavailable(viewer, REPORT_SAVE_FAILED_MESSAGE), 503)
    }
    if (!stored) {
      return html(renderReportRateLimited(viewer), 429)
    }
    // Post/Redirect/Get, so refreshing the thank-you page cannot submit the report again.
    return new Response(null, {
      status: 303,
      headers: { Location: REPORT_SENT_PATH, ...SECURITY_HEADERS }
    })
  })
}
