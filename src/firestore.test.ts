import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  convertFirestoreFields,
  documentIdFromName,
  getFirestoreDocument,
  resetFirestoreTokenCache
} from './firestore'

afterEach(() => {
  resetFirestoreTokenCache()
  vi.unstubAllGlobals()
})

async function serviceAccountJson(): Promise<string> {
  const keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer
  )
  const body = btoa(String.fromCharCode(...pkcs8))
  return JSON.stringify({
    client_email: 'reader@test-project.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----
${body}
-----END PRIVATE KEY-----
`
  })
}

describe('Firestore access token', () => {
  it('drops a refused cached token and retries once with a fresh one', async () => {
    const account = await serviceAccountJson()
    let issued = 0
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).startsWith('https://oauth2.googleapis.com/token')) {
          issued += 1
          return new Response(JSON.stringify({ access_token: `token-${issued}` }), { status: 200 })
        }
        const auth = new Headers(init?.headers).get('authorization') ?? ''
        seen.push(auth)
        if (auth === 'Bearer token-1') {
          return new Response('{}', { status: 401 })
        }
        return new Response(
          JSON.stringify({ fields: { cardDropped: { integerValue: '7' } } }),
          { status: 200 }
        )
      })
    )
    await expect(
      getFirestoreDocument('test-project', account, 'statistics_user/1')
    ).resolves.toEqual({ cardDropped: 7 })
    expect(seen).toEqual(['Bearer token-1', 'Bearer token-2'])
    expect(issued).toBe(2)

    await getFirestoreDocument('test-project', account, 'statistics_user/1')
    expect(seen.at(-1)).toBe('Bearer token-2')
    expect(issued).toBe(2)
  })
})

describe('convertFirestoreFields', () => {
  it('unwraps scalars, maps and arrays', () => {
    const row = convertFirestoreFields({
      eventCounter: { integerValue: '12' },
      rewarded: { booleanValue: true },
      prompt: { stringValue: 'Find gold.' },
      winners: {
        arrayValue: {
          values: [{
            mapValue: {
              fields: {
                place: { integerValue: '1' },
                userId: { stringValue: '99' }
              }
            }
          }]
        }
      }
    })
    expect(row.eventCounter).toBe(12)
    expect(row.rewarded).toBe(true)
    expect(row.prompt).toBe('Find gold.')
    expect(row.winners).toEqual([{ place: 1, userId: '99' }])
  })
})

describe('documentIdFromName', () => {
  it('takes the last path segment', () => {
    expect(documentIdFromName('projects/p/databases/(default)/documents/contests/card_hunt/events/12/contest_entries/ab-cd'))
      .toBe('ab-cd')
  })
})
