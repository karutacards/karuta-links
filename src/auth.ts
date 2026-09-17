export function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null
  }
  const match = header.match(/^Bearer\s+(\S+)\s*$/i)
  return match?.[1] ?? null
}

export function tokensMatch(provided: string, expected: string): boolean {
  if (!expected || provided.length !== expected.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
