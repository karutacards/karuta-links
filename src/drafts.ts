import type { Hono } from 'hono'
import {
  ACCESS_DENIED_MESSAGE,
  ACCESS_UNAVAILABLE_MESSAGE,
  draftAccessForEnv,
  draftIdentityForEnv,
  type AccessDecision,
  type AccessDenied
} from './draft-access'
import { draftToCsv } from './draft-csv'
import {
  renderDraftEditor,
  renderDraftForbidden,
  renderDraftImport,
  renderDraftNotFound,
  renderDraftUnavailable
} from './draft-html'
import { actorName, draftAuditSentence, draftAuditSpans, restoreTargetId } from './draft-audit'
import { type DraftMutation } from './draft-mutation'
import {
  createDraft,
  getDraft,
  getDraftSummary,
  hideDraft,
  setDraftAccessConfig,
  listDraftReviews,
  listEntityAudit,
  lockDraft,
  mutateDraftEntity,
  pollDraftEvents,
  restoreDraft,
  setDraftDescription,
  setDraftReview,
  unhideDraft,
  unlockDraft
} from './draft-store'
import { DRAFT_WRITE_PERIOD_SEC, limitDraftWrite } from './draft-rate'
import { DraftError, type DraftEntityType, type DraftRecord, type DraftSummary } from './draft-types'
import {
  canAdminDrafts,
  draftHiddenFromViewer,
  draftsConfig,
  mergeDraftsConfig,
  parseDraftAccessOverride,
  publicDraftAccess,
  type DraftsConfig
} from './drafts-config'
import { formatApDate } from './html'
import { oauthConfigured } from './oauth'
import { getSession, type Session } from './session'
import { readLimitedText } from './request-body'
import { html, json, SECURITY_HEADERS } from './responses'

const MAX_DRAFT_BYTES = 1_000_000

export type DraftGate = (
  env: Env,
  discordId: string,
  config: DraftsConfig
) => Promise<AccessDecision>

function draftErrorResponse(error: DraftError): Response {
  const extra: Record<string, string> = {}
  if (error.status === 429) {
    extra['retry-after'] = String(DRAFT_WRITE_PERIOD_SEC)
  }
  return json({
    error: error.message,
    code: error.code,
    entity: error.entity
  }, error.status, extra)
}

async function rejectDraftWriteIfLimited(env: Env, discordId: string): Promise<Response | null> {
  try {
    await limitDraftWrite(env, discordId)
    return null
  } catch (error) {
    if (error instanceof DraftError) {
      return draftErrorResponse(error)
    }
    throw error
  }
}

function accessHtml(decision: AccessDenied): Response {
  if (decision.status === 503) {
    return html(renderDraftUnavailable(), 503)
  }
  return html(renderDraftForbidden(), 403)
}

function accessJson(decision: AccessDenied): Response {
  return json({
    error: decision.message,
    code: decision.code
  }, decision.status)
}

export function parsePositiveDraftId(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return null
  }
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

function parseEntityType(raw: string): DraftEntityType | null {
  return raw === 'series' || raw === 'character' ? raw : null
}

function parseMutation(body: unknown): DraftMutation {
  if (!body || typeof body !== 'object') {
    throw new DraftError('INVALID_INPUT', 'Body must be JSON.', 400)
  }
  const record = body as Record<string, unknown>
  const type = parseEntityType(String(record.type ?? ''))
  if (!type) {
    throw new DraftError('INVALID_INPUT', 'Type must be series or character.', 400)
  }
  const action = record.action
  if (action !== 'add' && action !== 'update' && action !== 'delete') {
    throw new DraftError('INVALID_INPUT', 'Action must be add, update or delete.', 400)
  }
  const aliases = record.aliases
  if (aliases !== undefined && !Array.isArray(aliases)) {
    throw new DraftError('INVALID_INPUT', 'Aliases must be an array of strings.', 400)
  }
  return {
    type,
    action,
    key: typeof record.key === 'string' ? record.key : undefined,
    expectedRevision: typeof record.expectedRevision === 'number'
      ? record.expectedRevision
      : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    seriesKey: typeof record.seriesKey === 'string' ? record.seriesKey : undefined,
    aliases: aliases as string[] | undefined
  }
}

function parseReviewDecision(body: unknown): 'approve' | 'reject' | null {
  if (!body || typeof body !== 'object') {
    throw new DraftError('INVALID_INPUT', 'Body must be JSON.', 400)
  }
  const decision = (body as { decision?: unknown }).decision
  if (decision === null) return null
  if (decision === 'approve' || decision === 'reject') return decision
  throw new DraftError('INVALID_INPUT', 'Decision must be approve, reject or null.', 400)
}

function parseOptionalSaveId(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as { saveId?: unknown }).saveId
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DraftError('INVALID_INPUT', 'Save id must be a positive integer.', 400)
  }
  return value
}

// Signs the visitor in and runs an access check. With a next path the answers are pages
// and a missing session redirects to Discord. Without one they are JSON.
async function requireDraftSignIn(
  request: Request,
  env: Env,
  check: (discordId: string) => Promise<AccessDecision>,
  nextPath: string | null
): Promise<{ session: Session } | Response> {
  const asHtml = nextPath !== null
  if (!oauthConfigured(env)) {
    return asHtml
      ? html(renderDraftUnavailable(), 503)
      : json({ error: ACCESS_UNAVAILABLE_MESSAGE, code: 'UNAVAILABLE' }, 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    if (!asHtml) {
      return json({ error: 'Sign in with Discord to continue.', code: 'UNAUTHENTICATED' }, 401)
    }
    const url = new URL('/api/auth/discord', request.url)
    url.searchParams.set('next', nextPath)
    return Response.redirect(url.toString(), 302)
  }
  const decision = await check(session.discordId)
  if (!decision.ok) {
    return asHtml ? accessHtml(decision) : accessJson(decision)
  }
  return { session }
}

function requireDraftApiIdentity(
  request: Request,
  env: Env
): Promise<{ session: Session } | Response> {
  return requireDraftSignIn(request, env, (discordId) => draftIdentityForEnv(env, discordId), null)
}

async function authorizeDraft(
  env: Env,
  discordId: string,
  draft: DraftSummary,
  asHtml: boolean,
  gate: DraftGate
): Promise<DraftsConfig | Response> {
  const config = mergeDraftsConfig(draftsConfig, draft.accessOverride)
  if (canAdminDrafts(discordId)) {
    return config
  }
  const decision = await gate(env, discordId, config)
  if (!decision.ok) {
    return asHtml ? accessHtml(decision) : accessJson(decision)
  }
  return config
}

function missingDraft(asHtml: boolean): Response {
  if (asHtml) {
    return html(renderDraftNotFound(), 404)
  }
  return json({ error: 'That draft does not exist.', code: 'NOT_FOUND' }, 404)
}

// Reads the draft with `load`: the row alone for access checks, or with its entities
// for the routes that show or export them.
async function requireVisibleDraft<T extends DraftSummary>(
  db: D1Database,
  id: number | null,
  discordId: string,
  load: (db: D1Database, id: number) => Promise<T | null>,
  asHtml = false
): Promise<T | Response> {
  if (id === null) {
    return missingDraft(asHtml)
  }
  let draft: T
  try {
    const found = await load(db, id)
    if (!found || draftHiddenFromViewer(found.hiddenAt, discordId)) {
      return missingDraft(asHtml)
    }
    draft = found
  } catch (error) {
    if (error instanceof DraftError && error.code === 'UNAVAILABLE') {
      return asHtml
        ? html(renderDraftUnavailable(), 503)
        : json({ error: ACCESS_UNAVAILABLE_MESSAGE, code: 'UNAVAILABLE' }, 503)
    }
    throw error
  }
  return draft
}

async function readJsonBody(request: Request): Promise<{ body: unknown } | Response> {
  try {
    return { body: await request.json() }
  } catch {
    return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
  }
}

function draftResult(run: () => Promise<Response>): Promise<Response> {
  return run().catch((error: unknown) => {
    if (error instanceof DraftError) {
      return draftErrorResponse(error)
    }
    throw error
  })
}

type DraftRouteOptions = {
  // Counts toward the editor's write rate limit.
  write?: boolean
  // Only `adminIds` may call it.
  admin?: boolean
  // Runs after the sign-in, rate and admin checks and before the draft is read.
  precheck?: () => Response | null
}

export function registerDrafts(
  app: Hono<{ Bindings: Env }>,
  options: { gate?: DraftGate } = {}
): void {
  const gate = options.gate ?? draftAccessForEnv

  // The front of every API route that names a draft: sign-in and identity, the write
  // rate limit, the admin check, then the draft's visibility and its access rules.
  // It reads only the draft row; a route that needs the entities calls withEntities.
  async function openDraft(
    request: Request,
    env: Env,
    rawId: string,
    route: DraftRouteOptions = {}
  ): Promise<{ session: Session; draft: DraftSummary } | Response> {
    const auth = await requireDraftApiIdentity(request, env)
    if (auth instanceof Response) {
      return auth
    }
    const discordId = auth.session.discordId
    if (route.write) {
      const limited = await rejectDraftWriteIfLimited(env, discordId)
      if (limited) {
        return limited
      }
    }
    if (route.admin && !canAdminDrafts(discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const early = route.precheck?.()
    if (early) {
      return early
    }
    const draft = await requireVisibleDraft(
      env.DB,
      parsePositiveDraftId(rawId),
      discordId,
      getDraftSummary
    )
    if (draft instanceof Response) {
      return draft
    }
    const allowed = await authorizeDraft(env, discordId, draft, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    return { session: auth.session, draft }
  }

  // Reads the entities of a draft that openDraft has already let the viewer open.
  async function withEntities(
    env: Env,
    opened: { session: Session; draft: DraftSummary }
  ): Promise<{ session: Session; draft: DraftRecord } | Response> {
    const draft = await requireVisibleDraft(
      env.DB,
      opened.draft.id,
      opened.session.discordId,
      getDraft
    )
    if (draft instanceof Response) {
      return draft
    }
    return { session: opened.session, draft }
  }

  app.get('/drafts/import', async (c) => {
    const auth = await requireDraftSignIn(
      c.req.raw,
      c.env,
      (discordId) => gate(c.env, discordId, draftsConfig),
      '/drafts/import'
    )
    if (auth instanceof Response) {
      return auth
    }
    return html(renderDraftImport())
  })

  app.get('/drafts/:id', async (c) => {
    const id = parsePositiveDraftId(c.req.param('id'))
    if (id === null) {
      return html(renderDraftNotFound(), 404)
    }
    const auth = await requireDraftSignIn(
      c.req.raw,
      c.env,
      (discordId) => draftIdentityForEnv(c.env, discordId),
      `/drafts/${id}`
    )
    if (auth instanceof Response) {
      return auth
    }
    const draft = await requireVisibleDraft(c.env.DB, id, auth.session.discordId, getDraft, true)
    if (draft instanceof Response) {
      return draft
    }
    const config = await authorizeDraft(c.env, auth.session.discordId, draft, true, gate)
    if (config instanceof Response) {
      return config
    }
    const canAdmin = canAdminDrafts(auth.session.discordId)
    return html(renderDraftEditor(draft, {
      canAdmin,
      username: auth.session.username,
      discordId: auth.session.discordId,
      reviews: await listDraftReviews(c.env.DB, id),
      accessConfig: canAdmin
        ? {
            global: publicDraftAccess(draftsConfig),
            override: draft.accessOverride,
            effective: publicDraftAccess(config)
          }
        : null
    }))
  })

  app.post('/api/v1/drafts', async (c) => {
    const auth = await requireDraftSignIn(
      c.req.raw,
      c.env,
      (discordId) => gate(c.env, discordId, draftsConfig),
      null
    )
    if (auth instanceof Response) {
      return auth
    }
    const limited = await rejectDraftWriteIfLimited(c.env, auth.session.discordId)
    if (limited) {
      return limited
    }
    const text = await readLimitedText(c.req.raw, MAX_DRAFT_BYTES)
    if (text === null) {
      return json({ error: 'Payload too large.', code: 'TOO_LARGE' }, 413)
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    return draftResult(async () => {
      const created = await createDraft(c.env.DB, body, auth.session.discordId, auth.session.username)
      return json({ id: created.id, path: `/drafts/${created.id}` }, 201)
    })
  })

  app.get('/api/v1/drafts/:id', async (c) => {
    const access = await openDraft(c.req.raw, c.env, c.req.param('id'))
    if (access instanceof Response) {
      return access
    }
    const opened = await withEntities(c.env, access)
    if (opened instanceof Response) {
      return opened
    }
    return json({
      ...opened.draft,
      canAdmin: canAdminDrafts(opened.session.discordId)
    })
  })

  app.patch('/api/v1/drafts/:id', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    const read = await readJsonBody(c.req.raw)
    if (read instanceof Response) {
      return read
    }
    const description = read.body && typeof read.body === 'object'
      ? (read.body as { description?: unknown }).description
      : undefined
    if (typeof description !== 'string') {
      return json({ error: 'Description must be a string.', code: 'INVALID_INPUT' }, 400)
    }
    return draftResult(async () => {
      const result = await setDraftDescription(
        c.env.DB,
        opened.draft.id,
        description,
        opened.session.discordId,
        opened.session.username
      )
      return json({ description: result.draft.description })
    })
  })

  app.get('/api/v1/drafts/:id/events', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'))
    if (opened instanceof Response) {
      return opened
    }
    const afterRaw = c.req.query('after')
    let after = 0
    if (afterRaw !== undefined && afterRaw !== '') {
      if (!/^[0-9]+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) {
        return json({ error: 'After must be a non-negative integer.', code: 'INVALID_INPUT' }, 400)
      }
      after = Number(afterRaw)
    }
    return draftResult(async () => {
      const snapshot = await pollDraftEvents(
        c.env.DB,
        opened.draft.id,
        after,
        opened.session.discordId,
        opened.session.username,
        Date.now(),
        opened.session.avatar
      )
      return json({
        after: snapshot.after,
        events: snapshot.events.map((entry) => ({
          id: entry.id,
          entityType: entry.entityType,
          entityKey: entry.entityKey,
          action: entry.action,
          username: entry.username,
          createdAt: formatApDate(entry.createdAt),
          summary: entry.summary,
          actor: entry.actor,
          spans: entry.spans,
          saveId: entry.saveId,
          targetId: restoreTargetId(entry.afterJson) ?? restoreTargetId(entry.beforeJson)
        })),
        series: snapshot.series,
        characters: snapshot.characters,
        presence: snapshot.presence,
        reviews: snapshot.reviews,
        lockedAt: snapshot.lockedAt,
        lockedBy: snapshot.lockedBy,
        hiddenAt: snapshot.hiddenAt,
        description: snapshot.description
      }, 200, { 'cache-control': 'no-store' })
    })
  })

  app.patch('/api/v1/drafts/:id/entities', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true })
    if (opened instanceof Response) {
      return opened
    }
    const read = await readJsonBody(c.req.raw)
    if (read instanceof Response) {
      return read
    }
    return draftResult(async () => {
      const mutation = parseMutation(read.body)
      const result = await mutateDraftEntity(
        c.env.DB,
        opened.draft.id,
        mutation,
        opened.session.discordId,
        opened.session.username,
        Date.now(),
        parseOptionalSaveId(read.body)
      )
      return json({
        entity: result.entity,
        saveId: result.saveId,
        adoptedSeries: result.adoptedSeries
      })
    })
  })

  app.get('/api/v1/drafts/:id/entities/:type/:key/audit', async (c) => {
    const type = parseEntityType(c.req.param('type'))
    const key = c.req.param('key')
    const access = await openDraft(c.req.raw, c.env, c.req.param('id'), {
      precheck: () => (
        parsePositiveDraftId(c.req.param('id')) === null || !type || !key
          ? json({ error: 'That entity does not exist.', code: 'NOT_FOUND' }, 404)
          : null
      )
    })
    if (access instanceof Response) {
      return access
    }
    const opened = await withEntities(c.env, access)
    if (opened instanceof Response) {
      return opened
    }
    const entries = await listEntityAudit(c.env.DB, opened.draft.id, type as DraftEntityType, key)
    const series = opened.draft.series
    return json({
      entries: entries.map((entry) => ({
        id: entry.id,
        summary: draftAuditSentence(entry, series),
        actor: actorName(entry.username),
        spans: draftAuditSpans(entry, series),
        username: entry.username,
        createdAt: formatApDate(entry.createdAt),
        action: entry.action,
        saveId: entry.saveId,
        targetId: restoreTargetId(entry.afterJson) ?? restoreTargetId(entry.beforeJson)
      }))
    })
  })

  app.post('/api/v1/drafts/:id/review', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true })
    if (opened instanceof Response) {
      return opened
    }
    const read = await readJsonBody(c.req.raw)
    if (read instanceof Response) {
      return read
    }
    return draftResult(async () => {
      const reviews = await setDraftReview(
        c.env.DB,
        opened.draft.id,
        opened.session.discordId,
        opened.session.username,
        parseReviewDecision(read.body)
      )
      return json({ reviews })
    })
  })

  app.post('/api/v1/drafts/:id/lock', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    return draftResult(async () => {
      const draft = await lockDraft(
        c.env.DB,
        opened.draft.id,
        opened.session.discordId,
        opened.session.username
      )
      return json({ locked: true, lockedAt: draft.lockedAt })
    })
  })

  app.post('/api/v1/drafts/:id/unlock', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    return draftResult(async () => {
      const draft = await unlockDraft(
        c.env.DB,
        opened.draft.id,
        opened.session.discordId,
        opened.session.username
      )
      return json({ locked: false, lockedAt: draft.lockedAt })
    })
  })

  app.patch('/api/v1/drafts/:id/config', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    const read = await readJsonBody(c.req.raw)
    if (read instanceof Response) {
      return read
    }
    const body = read.body
    const record = body && typeof body === 'object' ? body as { override?: unknown } : null
    let override
    try {
      override = record && 'override' in record
        ? parseDraftAccessOverride(record.override)
        : parseDraftAccessOverride(body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Draft access is invalid.'
      const ended = /[.!?]$/.test(message) ? message : `${message}.`
      return json({ error: ended, code: 'INVALID_INPUT' }, 400)
    }
    return draftResult(async () => {
      const draft = await setDraftAccessConfig(
        c.env.DB,
        opened.draft.id,
        override,
        opened.session.discordId,
        opened.session.username
      )
      const config = mergeDraftsConfig(draftsConfig, draft.accessOverride)
      return json({
        override: draft.accessOverride,
        effective: publicDraftAccess(config)
      })
    })
  })

  app.post('/api/v1/drafts/:id/hide', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    return draftResult(async () => {
      const draft = await hideDraft(
        c.env.DB,
        opened.draft.id,
        opened.session.discordId,
        opened.session.username
      )
      return json({ hidden: true, hiddenAt: draft.hiddenAt })
    })
  })

  app.post('/api/v1/drafts/:id/unhide', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    return draftResult(async () => {
      const draft = await unhideDraft(
        c.env.DB,
        opened.draft.id,
        opened.session.discordId,
        opened.session.username
      )
      return json({ hidden: false, hiddenAt: draft.hiddenAt })
    })
  })

  app.post('/api/v1/drafts/:id/restore', async (c) => {
    const opened = await openDraft(c.req.raw, c.env, c.req.param('id'), { write: true, admin: true })
    if (opened instanceof Response) {
      return opened
    }
    const read = await readJsonBody(c.req.raw)
    if (read instanceof Response) {
      return read
    }
    const saveId = read.body && typeof read.body === 'object'
      ? Number((read.body as { saveId?: unknown }).saveId)
      : Number.NaN
    if (!Number.isSafeInteger(saveId) || saveId < 1) {
      return json({ error: 'Save id must be a positive integer.', code: 'INVALID_INPUT' }, 400)
    }
    return draftResult(async () => {
      const draft = await restoreDraft(
        c.env.DB,
        opened.draft.id,
        saveId,
        opened.session.discordId,
        opened.session.username
      )
      return json({
        restored: true,
        description: draft.description,
        series: draft.series,
        characters: draft.characters
      })
    })
  })

  app.get('/api/v1/drafts/:id/export.txt', async (c) => {
    const access = await openDraft(c.req.raw, c.env, c.req.param('id'), { admin: true })
    if (access instanceof Response) {
      return access
    }
    const opened = await withEntities(c.env, access)
    if (opened instanceof Response) {
      return opened
    }
    const draft = opened.draft
    if (!draft.lockedAt) {
      return json({ error: 'Lock this draft before exporting it.', code: 'LOCKED' }, 409)
    }
    return new Response(draftToCsv(draft), {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="draft-${draft.id}.txt"`,
        ...SECURITY_HEADERS
      }
    })
  })
}
