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
import { DraftError, type DraftEntityType, type DraftRecord } from './draft-types'
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

const MAX_DRAFT_BYTES = 1_000_000

export type DraftGate = (
  env: Env,
  discordId: string,
  config: DraftsConfig
) => Promise<AccessDecision>

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

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      ...extra
    }
  })
}

function draftErrorResponse(error: DraftError): Response {
  return json({
    error: error.message,
    code: error.code,
    entity: error.entity
  }, error.status)
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

async function requireDraftSession(
  request: Request,
  env: Env,
  nextPath: string,
  gate: DraftGate
): Promise<{ session: Session } | Response> {
  if (!oauthConfigured(env)) {
    return html(renderDraftUnavailable(), 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    const url = new URL('/api/auth/discord', request.url)
    url.searchParams.set('next', nextPath)
    return Response.redirect(url.toString(), 302)
  }
  const decision = await gate(env, session.discordId, draftsConfig)
  if (!decision.ok) {
    return accessHtml(decision)
  }
  return { session }
}

async function requireDraftApiSession(
  request: Request,
  env: Env,
  gate: DraftGate
): Promise<{ session: Session } | Response> {
  if (!oauthConfigured(env)) {
    return json({ error: ACCESS_UNAVAILABLE_MESSAGE, code: 'UNAVAILABLE' }, 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    return json({ error: 'Sign in with Discord to continue.', code: 'UNAUTHENTICATED' }, 401)
  }
  const decision = await gate(env, session.discordId, draftsConfig)
  if (!decision.ok) {
    return accessJson(decision)
  }
  return { session }
}



async function requireDraftIdentity(
  request: Request,
  env: Env,
  nextPath: string
): Promise<{ session: Session } | Response> {
  if (!oauthConfigured(env)) {
    return html(renderDraftUnavailable(), 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    const url = new URL('/api/auth/discord', request.url)
    url.searchParams.set('next', nextPath)
    return Response.redirect(url.toString(), 302)
  }
  const decision = await draftIdentityForEnv(env, session.discordId)
  if (!decision.ok) {
    return accessHtml(decision)
  }
  return { session }
}

async function requireDraftApiIdentity(
  request: Request,
  env: Env
): Promise<{ session: Session } | Response> {
  if (!oauthConfigured(env)) {
    return json({ error: ACCESS_UNAVAILABLE_MESSAGE, code: 'UNAVAILABLE' }, 503)
  }
  const session = await getSession(request, env.SESSION_SECRET)
  if (!session) {
    return json({ error: 'Sign in with Discord to continue.', code: 'UNAUTHENTICATED' }, 401)
  }
  const decision = await draftIdentityForEnv(env, session.discordId)
  if (!decision.ok) {
    return accessJson(decision)
  }
  return { session }
}

async function authorizeDraft(
  env: Env,
  discordId: string,
  draft: DraftRecord,
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

async function requireVisibleDraft(
  db: D1Database,
  id: number | null,
  discordId: string,
  asHtml = false
): Promise<DraftRecord | Response> {
  if (id === null) {
    return missingDraft(asHtml)
  }
  let draft: DraftRecord
  try {
    const found = await getDraft(db, id)
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

export function registerDrafts(
  app: Hono<{ Bindings: Env }>,
  options: { gate?: DraftGate } = {}
): void {
  const gate = options.gate ?? draftAccessForEnv

  app.get('/drafts/import', async (c) => {
    const auth = await requireDraftSession(c.req.raw, c.env, '/drafts/import', gate)
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
    const auth = await requireDraftIdentity(c.req.raw, c.env, `/drafts/${id}`)
    if (auth instanceof Response) {
      return auth
    }
    const draft = await requireVisibleDraft(c.env.DB, id, auth.session.discordId, true)
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
    const auth = await requireDraftApiSession(c.req.raw, c.env, gate)
    if (auth instanceof Response) {
      return auth
    }
    const lengthHeader = c.req.header('content-length')
    if (lengthHeader && Number(lengthHeader) > MAX_DRAFT_BYTES) {
      return json({ error: 'Payload too large.', code: 'TOO_LARGE' }, 413)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    try {
      const created = await createDraft(c.env.DB, body, auth.session.discordId, auth.session.username)
      return json({ id: created.id, path: `/drafts/${created.id}` }, 201)
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.get('/api/v1/drafts/:id', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    if (id === null) {
      return json({ error: 'That draft does not exist.', code: 'NOT_FOUND' }, 404)
    }
    const draft = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (draft instanceof Response) {
      return draft
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, draft, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    return json({
      ...draft,
      canAdmin: canAdminDrafts(auth.session.discordId)
    })
  })

  app.patch('/api/v1/drafts/:id', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const draft = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (draft instanceof Response) {
      return draft
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, draft, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    if (!body || typeof body !== 'object' || typeof (body as { description?: unknown }).description !== 'string') {
      return json({ error: 'Description must be a string.', code: 'INVALID_INPUT' }, 400)
    }
    try {
      const result = await setDraftDescription(
        c.env.DB,
        draft.id,
        (body as { description: string }).description,
        auth.session.discordId,
        auth.session.username
      )
      return json({ description: result.draft.description })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.get('/api/v1/drafts/:id/events', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    const afterRaw = c.req.query('after')
    let after = 0
    if (afterRaw !== undefined && afterRaw !== '') {
      if (!/^[0-9]+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) {
        return json({ error: 'After must be a non-negative integer.', code: 'INVALID_INPUT' }, 400)
      }
      after = Number(afterRaw)
    }
    try {
      const snapshot = await pollDraftEvents(
        c.env.DB,
        visible.id,
        after,
        auth.session.discordId,
        auth.session.username,
        Date.now(),
        auth.session.avatar
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
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.patch('/api/v1/drafts/:id/entities', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    try {
      const mutation = parseMutation(body)
      const result = await mutateDraftEntity(
        c.env.DB,
        visible.id,
        mutation,
        auth.session.discordId,
        auth.session.username,
        Date.now(),
        parseOptionalSaveId(body)
      )
      return json({
        entity: result.entity,
        saveId: result.saveId,
        adoptedSeries: result.adoptedSeries
      })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.get('/api/v1/drafts/:id/entities/:type/:key/audit', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const type = parseEntityType(c.req.param('type'))
    const key = c.req.param('key')
    if (id === null || !type || !key) {
      return json({ error: 'That entity does not exist.', code: 'NOT_FOUND' }, 404)
    }
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    const entries = await listEntityAudit(c.env.DB, id, type, key)
    const draft = visible
    const series = draft?.series ?? []
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
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    try {
      const reviews = await setDraftReview(
        c.env.DB,
        visible.id,
        auth.session.discordId,
        auth.session.username,
        parseReviewDecision(body)
      )
      return json({ reviews })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.post('/api/v1/drafts/:id/lock', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    try {
      const draft = await lockDraft(
        c.env.DB,
        visible.id,
        auth.session.discordId,
        auth.session.username
      )
      return json({ locked: true, lockedAt: draft.lockedAt })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.post('/api/v1/drafts/:id/unlock', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    try {
      const draft = await unlockDraft(
        c.env.DB,
        visible.id,
        auth.session.discordId,
        auth.session.username
      )
      return json({ locked: false, lockedAt: draft.lockedAt })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.patch('/api/v1/drafts/:id/config', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
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
    try {
      const draft = await setDraftAccessConfig(
        c.env.DB,
        visible.id,
        override,
        auth.session.discordId,
        auth.session.username
      )
      const config = mergeDraftsConfig(draftsConfig, draft.accessOverride)
      return json({
        override: draft.accessOverride,
        effective: publicDraftAccess(config)
      })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.post('/api/v1/drafts/:id/hide', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    try {
      const draft = await hideDraft(
        c.env.DB,
        visible.id,
        auth.session.discordId,
        auth.session.username
      )
      return json({ hidden: true, hiddenAt: draft.hiddenAt })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.post('/api/v1/drafts/:id/unhide', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    try {
      const draft = await unhideDraft(
        c.env.DB,
        visible.id,
        auth.session.discordId,
        auth.session.username
      )
      return json({ hidden: false, hiddenAt: draft.hiddenAt })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.post('/api/v1/drafts/:id/restore', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    const visible = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (visible instanceof Response) {
      return visible
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, visible, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return json({ error: 'Body must be JSON.', code: 'INVALID_INPUT' }, 400)
    }
    const record = body && typeof body === 'object' ? body as { saveId?: unknown; eventId?: unknown } : null
    const eventId = Number(record?.saveId ?? record?.eventId)
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
      return json({ error: 'Save id must be a positive integer.', code: 'INVALID_INPUT' }, 400)
    }
    try {
      const draft = await restoreDraft(
        c.env.DB,
        visible.id,
        eventId,
        auth.session.discordId,
        auth.session.username
      )
      return json({
        restored: true,
        description: draft.description,
        series: draft.series,
        characters: draft.characters
      })
    } catch (error) {
      if (error instanceof DraftError) {
        return draftErrorResponse(error)
      }
      throw error
    }
  })

  app.get('/api/v1/drafts/:id/export.txt', async (c) => {
    const auth = await requireDraftApiIdentity(c.req.raw, c.env)
    if (auth instanceof Response) {
      return auth
    }
    if (!canAdminDrafts(auth.session.discordId)) {
      return json({ error: ACCESS_DENIED_MESSAGE, code: 'FORBIDDEN' }, 403)
    }
    const id = parsePositiveDraftId(c.req.param('id'))
    if (id === null) {
      return json({ error: 'That draft does not exist.', code: 'NOT_FOUND' }, 404)
    }
    const draft = await requireVisibleDraft(c.env.DB, id, auth.session.discordId)
    if (draft instanceof Response) {
      return draft
    }
    const allowed = await authorizeDraft(c.env, auth.session.discordId, draft, false, gate)
    if (allowed instanceof Response) {
      return allowed
    }
    if (!draft.lockedAt) {
      return json({ error: 'Lock this draft before exporting it.', code: 'LOCKED' }, 409)
    }
    return new Response(draftToCsv(draft), {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="draft-${id}.txt"`,
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY'
      }
    })
  })
}
