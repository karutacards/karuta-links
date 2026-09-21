import { isReservedSegment } from './reserved'
import { isSlug } from './slug'
import type { Route } from './types'

function assertNever(value: never): never {
  throw new Error(`Unhandled route: ${JSON.stringify(value)}`)
}

export function parsePositiveInt(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    return null
  }
  return parsed
}

export function classifyPath(pathname: string): Route {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/'
  if (path === '/') {
    return { type: 'home' }
  }
  if (path === '/health') {
    return { type: 'health' }
  }
  if (path === '/robots.txt') {
    return { type: 'robots' }
  }
  if (path === '/api/v1/content') {
    return { type: 'ingest' }
  }
  if (path === '/contests') {
    return { type: 'contestHome' }
  }
  if (path === '/drafts/import') {
    return { type: 'draftImport' }
  }
  if (path === '/report') {
    return { type: 'report' }
  }
  if (path === '/albums') {
    return { type: 'albums' }
  }

  const segments = path.slice(1).split('/')
  if (segments.length === 2) {
    const [section, rawId] = segments
    if (section === 'drafts') {
      const id = rawId ? parsePositiveInt(rawId) : null
      if (id === null) {
        return { type: 'notFound' }
      }
      return { type: 'draft', id }
    }
    if (!section || (section !== 'content' && section !== 'contests')) {
      return { type: 'notFound' }
    }
    const id = rawId ? parsePositiveInt(rawId) : null
    if (id === null) {
      return { type: 'notFound' }
    }
    return { type: 'document', section, id }
  }

  if (segments.length === 1) {
    const [slug] = segments
    if (!slug || isReservedSegment(slug) || !isSlug(slug)) {
      return { type: 'notFound' }
    }
    return { type: 'slug', slug }
  }

  return { type: 'notFound' }
}

export function describeRoute(route: Route): string {
  switch (route.type) {
    case 'home':
      return 'home'
    case 'health':
      return 'health'
    case 'robots':
      return 'robots'
    case 'ingest':
      return 'ingest'
    case 'contestHome':
      return 'contestHome'
    case 'draftImport':
      return 'draftImport'
    case 'report':
      return 'report'
    case 'albums':
      return 'albums'
    case 'draft':
      return `drafts/${route.id}`
    case 'document':
      return `${route.section}/${route.id}`
    case 'slug':
      return route.slug
    case 'notFound':
      return 'notFound'
    default:
      return assertNever(route)
  }
}
