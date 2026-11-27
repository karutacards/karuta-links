import { Hono } from 'hono'
import { bearerToken, tokensMatch } from './auth'
import { dispatchCatalogRefresh } from './catalog-refresh'
import { getContestDocument, getDocument, insertContentDump, listRecentContests, listRecentContent, resolveSlug } from './db'
import { renderContentDump, renderContestDump, renderContestHome, renderHome, renderNotFound } from './html'
import { IngestError, MAX_INGEST_BYTES, parseContentSnapshot } from './ingest'
import { ensureSnapshotImages, serveKeyedImage } from './images'
import { registerAlbums } from './albums'
import { registerDrafts } from './drafts'
import { registerOAuth } from './oauth'
import { registerReports } from './report'
import { readLimitedText } from './request-body'
import { html, json } from './responses'
import { parsePositiveInt, isShortLinkSegment } from './routing'
import { CONTENT_SECTION } from './types'

export const app = new Hono<{ Bindings: Env }>()

registerOAuth(app)
registerDrafts(app)
registerReports(app)
registerAlbums(app)

function absoluteUrl(request: Request, path: string): string {
  return new URL(path, request.url).toString()
}

app.get('/health', (c) => c.text('ok'))

app.get('/robots.txt', (c) => c.text('User-agent: *\nAllow: /\n'))

app.get('/', async (c) => {
  const [drafts, results] = await Promise.all([
    listRecentContent(c.env.DB),
    listRecentContests(c.env.DB)
  ])
  return html(renderHome(drafts, results))
})

app.post('/api/v1/content', async (c) => {
  const expected = c.env.INGEST_TOKEN
  const provided = bearerToken(c.req.header('Authorization'))
  if (!provided || !tokensMatch(provided, expected)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // Stops reading at the limit, whether or not the client sent a Content-Length.
  const raw = await readLimitedText(c.req.raw, MAX_INGEST_BYTES)
  if (raw === null) {
    return json({ error: 'Payload too large' }, 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }

  try {
    const snapshot = parseContentSnapshot(body)
    const created = await insertContentDump(c.env.DB, snapshot)
    c.executionCtx.waitUntil(ensureSnapshotImages(c.env.IMAGES, snapshot))
    c.executionCtx.waitUntil(dispatchCatalogRefresh(c.env, created.id))
    const path = `/content/${created.id}`
    const shortPath = `/${created.slug}`
    return json({
      section: CONTENT_SECTION,
      id: created.id,
      slug: created.slug,
      path,
      shortPath,
      url: absoluteUrl(c.req.raw, path),
      shortUrl: absoluteUrl(c.req.raw, shortPath)
    }, 201)
  } catch (error) {
    if (error instanceof IngestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
})

app.get('/images/*', async (c) => {
  const objectKey = new URL(c.req.url).pathname.replace(/^\/images\//, '')
  return serveKeyedImage(c.env.IMAGES, objectKey, c.req.url)
})

app.get('/contests', async (c) => {
  const dumps = await listRecentContests(c.env.DB)
  return html(renderContestHome(dumps))
})

app.get('/contests/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'))
  if (id === null) {
    return html(renderNotFound(), 404)
  }
  const document = await getContestDocument(c.env.DB, id)
  if (!document) {
    return html(renderNotFound(), 404)
  }
  return html(renderContestDump(id, document.createdAt, document.snapshot, document.slug))
})

app.get('/content/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'))
  if (id === null) {
    return html(renderNotFound(), 404)
  }
  const document = await getDocument(c.env.DB, CONTENT_SECTION, id)
  if (!document) {
    return html(renderNotFound(), 404)
  }
  return html(renderContentDump(id, document.createdAt, document.snapshot, document.slug))
})

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!isShortLinkSegment(slug)) {
    return html(renderNotFound(), 404)
  }
  const target = await resolveSlug(c.env.DB, slug)
  if (!target) {
    return html(renderNotFound(), 404)
  }
  return c.redirect(`/${target.section}/${target.id}`, 302)
})

app.notFound((c) => html(renderNotFound(), 404))
