import { Hono } from 'hono'
import { bearerToken, tokensMatch } from './auth'
import { getContestDocument, getDocument, insertContentDump, listRecentContests, listRecentContent, resolveSlug } from './db'
import { renderContentDump, renderContestDump, renderContestHome, renderHome, renderNotFound } from './html'
import { IngestError, MAX_INGEST_BYTES, parseContentSnapshot } from './ingest'
import { ensureSnapshotImages, serveKeyedImage } from './images'
import { CONTENT_SECTION } from './types'

export const app = new Hono<{ Bindings: Env }>()

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

  const lengthHeader = c.req.header('content-length')
  if (lengthHeader && Number(lengthHeader) > MAX_INGEST_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }

  try {
    const snapshot = parseContentSnapshot(body)
    const created = await insertContentDump(c.env.DB, snapshot)
    if (c.env.IMAGES) {
      c.executionCtx.waitUntil(ensureSnapshotImages(c.env.IMAGES, snapshot))
    }
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
  if (!c.env.IMAGES) {
    return new Response('Not found', { status: 404 })
  }
  return serveKeyedImage(c.env.IMAGES, objectKey, c.req.url)
})

app.get('/contests', async (c) => {
  const dumps = await listRecentContests(c.env.DB)
  return html(renderContestHome(dumps))
})

app.get('/contests/:id', async (c) => {
  const rawId = c.req.param('id')
  const id = /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN
  if (!Number.isSafeInteger(id)) {
    return html(renderNotFound(), 404)
  }
  const document = await getContestDocument(c.env.DB, id)
  if (!document) {
    return html(renderNotFound(), 404)
  }
  return html(renderContestDump(id, document.createdAt, document.snapshot, document.slug))
})

app.get('/content/:id', async (c) => {
  const rawId = c.req.param('id')
  const id = /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN
  if (!Number.isSafeInteger(id)) {
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
  if (!/^[a-z0-9]{6}$/.test(slug)) {
    return html(renderNotFound(), 404)
  }
  const target = await resolveSlug(c.env.DB, slug)
  if (!target) {
    return html(renderNotFound(), 404)
  }
  return c.redirect(`/${target.section}/${target.id}`, 302)
})

app.notFound((c) => html(renderNotFound(), 404))
