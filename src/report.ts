import type { Hono } from 'hono'
import type { AccessDenied } from './draft-access'
import { oauthConfigured } from './oauth'
import { reportAccessForEnv } from './report-access'
import {
  renderReportForbidden,
  renderReportForm,
  renderReportRateLimited,
  renderReportStart,
  renderReportThanks,
  renderReportUnavailable,
  type ReportViewer
} from './report-html'
import {
  REPORT_OG_BYTES,
  REPORT_OG_CONTENT_TYPE,
  REPORT_OG_PATH
} from './report-og'
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

function viewerOf(session: Session): ReportViewer {
  return {
    discordId: session.discordId,
    username: session.username,
    avatar: session.avatar
  }
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
    return html(renderReportForm({ viewer: viewerOf(gated.session) }))
  })

  app.post('/report', async (c) => {
    const gated = await gateReport(c.req.raw, c.env)
    if (gated instanceof Response) {
      return gated
    }
    if ('missing' in gated) {
      return startOAuth(c.req.raw)
    }
    const form = await c.req.formData()
    const parsed = parseReportFields(fieldsFromForm(form))
    if ('error' in parsed) {
      return html(
        renderReportForm({
          error: parsed.message,
          fields: parsed.fields,
          viewer: viewerOf(gated.session)
        }),
        400
      )
    }
    const since = Date.now() - REPORT_RATE_WINDOW_MS
    const recent = await countRecentReports(c.env.DB, gated.session.discordId, since)
    if (recent >= REPORT_RATE_LIMIT) {
      return html(renderReportRateLimited(viewerOf(gated.session)), 429)
    }
    await insertReport(c.env.DB, {
      reporterId: gated.session.discordId,
      reporterUsername: gated.session.username,
      payload: parsed
    })
    return html(renderReportThanks(viewerOf(gated.session)))
  })
}
