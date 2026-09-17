import { describe, expect, it } from 'vitest'
import { classifyPath } from './routing'

describe('classifyPath', () => {
  it('routes the home, health, robots and ingest paths', () => {
    expect(classifyPath('/')).toEqual({ type: 'home' })
    expect(classifyPath('/health')).toEqual({ type: 'health' })
    expect(classifyPath('/robots.txt')).toEqual({ type: 'robots' })
    expect(classifyPath('/api/v1/content')).toEqual({ type: 'ingest' })
    expect(classifyPath('/contests')).toEqual({ type: 'contestHome' })
  })

  it('routes canonical content dumps', () => {
    expect(classifyPath('/content/1')).toEqual({ type: 'document', section: 'content', id: 1 })
    expect(classifyPath('/content/42/')).toEqual({ type: 'document', section: 'content', id: 42 })
  })

  it('routes canonical contest dumps', () => {
    expect(classifyPath('/contests/1')).toEqual({ type: 'document', section: 'contests', id: 1 })
  })

  it('rejects unknown sections and invalid ids', () => {
    expect(classifyPath('/logs/1')).toEqual({ type: 'notFound' })
    expect(classifyPath('/content/0')).toEqual({ type: 'notFound' })
    expect(classifyPath('/content/01')).toEqual({ type: 'notFound' })
    expect(classifyPath('/content/abc')).toEqual({ type: 'notFound' })
  })

  it('treats a six-character unreserved segment as a slug', () => {
    expect(classifyPath('/a1b2c3')).toEqual({ type: 'slug', slug: 'a1b2c3' })
  })

  it('does not treat reserved or wrong-length segments as slugs', () => {
    expect(classifyPath('/static')).toEqual({ type: 'notFound' })
    expect(classifyPath('/health')).toEqual({ type: 'health' })
    expect(classifyPath('/abcde')).toEqual({ type: 'notFound' })
    expect(classifyPath('/abcdefg')).toEqual({ type: 'notFound' })
  })
})
