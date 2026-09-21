export function normalizeAlbumName(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidAlbumName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 16 &&
    !value.startsWith('_') &&
    /^[a-zA-Z][a-zA-Z0-9\-_]*$/.test(value)
  )
}
