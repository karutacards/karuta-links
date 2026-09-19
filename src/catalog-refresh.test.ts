import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_REFRESH_EVENT,
  catalogDispatchRepo,
  dispatchCatalogRefresh
} from './catalog-refresh'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('catalogDispatchRepo', () => {
  it('accepts a public GitHub repo slug', () => {
    expect(catalogDispatchRepo({ CATALOG_DISPATCH_REPO: 'karutacards/karuta-submissions' })).toBe(
      'karutacards/karuta-submissions'
    )
  })

  it('rejects missing or unsafe slugs', () => {
    expect(catalogDispatchRepo({})).toBeNull()
    expect(catalogDispatchRepo({ CATALOG_DISPATCH_REPO: '  ' })).toBeNull()
    expect(catalogDispatchRepo({ CATALOG_DISPATCH_REPO: '../oops' })).toBeNull()
    expect(catalogDispatchRepo({ CATALOG_DISPATCH_REPO: 'only-owner' })).toBeNull()
  })
})

describe('dispatchCatalogRefresh', () => {
  it('does nothing when the token or repo is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await dispatchCatalogRefresh({ CATALOG_DISPATCH_REPO: 'karutacards/karuta-submissions' }, 12)
    await dispatchCatalogRefresh({ GITHUB_DISPATCH_TOKEN: 'token' }, 12)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts repository_dispatch with the dump id only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await dispatchCatalogRefresh(
      {
        GITHUB_DISPATCH_TOKEN: 'token',
        CATALOG_DISPATCH_REPO: 'karutacards/karuta-submissions'
      },
      44
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/karutacards/karuta-submissions/dispatches')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(headers.get('Accept')).toBe('application/vnd.github+json')
    expect(JSON.parse(String(init.body))).toEqual({
      event_type: CATALOG_REFRESH_EVENT,
      client_payload: { contentId: 44 }
    })
  })

  it('swallows a failed dispatch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(
      dispatchCatalogRefresh(
        {
          GITHUB_DISPATCH_TOKEN: 'token',
          CATALOG_DISPATCH_REPO: 'karutacards/karuta-submissions'
        },
        1
      )
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('swallows a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(
      dispatchCatalogRefresh(
        {
          GITHUB_DISPATCH_TOKEN: 'token',
          CATALOG_DISPATCH_REPO: 'karutacards/karuta-submissions'
        },
        1
      )
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
