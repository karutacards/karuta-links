type FirestoreFieldValue = {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean | string
  timestampValue?: string
  nullValue?: null
  mapValue?: { fields?: Record<string, FirestoreFieldValue> }
  arrayValue?: { values?: FirestoreFieldValue[] }
}

type FirestoreDocument = {
  name?: string
  fields?: Record<string, FirestoreFieldValue>
}

type ListDocumentsResponse = {
  documents?: FirestoreDocument[]
  nextPageToken?: string
}

let tokenCache: { token: string; expiresAt: number } | null = null
const TOKEN_TTL_MS = 50 * 60 * 1000

export function convertFirestoreFields(
  fields: Record<string, FirestoreFieldValue>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    result[key] = convertField(value)
  }
  return result
}

function convertField(value: FirestoreFieldValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue
  if (value.integerValue !== undefined) return Number.parseInt(value.integerValue, 10)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.booleanValue !== undefined) {
    return value.booleanValue === true || value.booleanValue === 'true'
  }
  if (value.timestampValue !== undefined) return new Date(value.timestampValue).getTime()
  if (value.nullValue !== undefined) return null
  if (value.mapValue?.fields) return convertFirestoreFields(value.mapValue.fields)
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map((item) => convertField(item))
  }
  return null
}

export function documentIdFromName(name: string): string {
  const parts = name.split('/')
  const last = parts[parts.length - 1]
  return last ? decodeURIComponent(last) : ''
}

async function accessToken(serviceAccountJson: string): Promise<string> {
  const now = Date.now()
  if (tokenCache && now < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const serviceAccount = JSON.parse(serviceAccountJson) as {
    client_email: string
    private_key: string
  }
  const nowSeconds = Math.floor(now / 1000)
  const header = b64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSeconds + 3600,
    iat: nowSeconds
  }))
  const message = `${header}.${claim}`
  const signature = await signJwt(message, serviceAccount.private_key)
  const jwt = `${message}.${signature}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })
  if (!tokenResponse.ok) {
    throw new Error(`Firestore auth failed: ${tokenResponse.status}`)
  }
  const tokenData = (await tokenResponse.json()) as { access_token: string }
  tokenCache = { token: tokenData.access_token, expiresAt: now + TOKEN_TTL_MS }
  return tokenCache.token
}

function b64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function signJwt(message: string, pem: string): Promise<string> {
  const contents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(contents)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const key = await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(message)
  )
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function documentsUrl(projectId: string, documentPath: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`
}

export async function getFirestoreDocument(
  projectId: string,
  serviceAccountJson: string,
  documentPath: string
): Promise<Record<string, unknown> | null> {
  const token = await accessToken(serviceAccountJson)
  const response = await fetch(documentsUrl(projectId, documentPath), {
    headers: { authorization: `Bearer ${token}` }
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Firestore read failed: ${response.status}`)
  }
  const data = (await response.json()) as FirestoreDocument
  return data.fields ? convertFirestoreFields(data.fields) : {}
}

export async function listFirestoreDocuments(
  projectId: string,
  serviceAccountJson: string,
  collectionPath: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const token = await accessToken(serviceAccountJson)
  const rows: Array<{ id: string; data: Record<string, unknown> }> = []
  let pageToken = ''
  do {
    const url = new URL(documentsUrl(projectId, collectionPath))
    url.searchParams.set('pageSize', '300')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    })
    if (response.status === 404) return rows
    if (!response.ok) {
      throw new Error(`Firestore list failed: ${response.status}`)
    }
    const data = (await response.json()) as ListDocumentsResponse
    for (const document of data.documents ?? []) {
      if (!document.name) continue
      rows.push({
        id: documentIdFromName(document.name),
        data: document.fields ? convertFirestoreFields(document.fields) : {}
      })
    }
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return rows
}
