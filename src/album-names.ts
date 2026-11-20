export function normalizeAlbumName(value: string): string {
  return value.trim().toLowerCase()
}

export const MAX_ALBUM_NAME_LENGTH = 16
export const ALBUM_NAME_RULE =
  'Album names start with a letter and are 16 characters or fewer.'
export const ALBUM_NAME_TAKEN = 'That name is already used by another album.'

export function isValidAlbumName(value: string): boolean {
  return value.length <= MAX_ALBUM_NAME_LENGTH && /^[a-zA-Z][a-zA-Z0-9\-_]*$/.test(value)
}

// Orders renames so each target name is free when its rename runs. A swap or a
// longer cycle goes through a temporary name. `held` is every name Karuta has now.
// Returns the [from, to] pairs to emit, or null when a target belongs to an album
// that is not being renamed away.
export function planAlbumRenames(
  held: Iterable<string>,
  renames: Array<[string, string]>
): Array<[string, string]> | null {
  const taken = new Set(held)
  const targets = new Set(renames.map(([, to]) => to))
  const pending = renames.map(([from, to]) => ({ from, to }))
  const plan: Array<[string, string]> = []
  let spare = 1
  while (pending.length > 0) {
    const index = pending.findIndex((rename) => !taken.has(rename.to))
    if (index !== -1) {
      const [rename] = pending.splice(index, 1)
      if (!rename) break
      plan.push([rename.from, rename.to])
      taken.delete(rename.from)
      taken.add(rename.to)
      continue
    }
    const sources = new Set(pending.map((rename) => rename.from))
    if (pending.some((rename) => !sources.has(rename.to))) {
      return null
    }
    const first = pending[0]
    if (!first) break
    while (taken.has(`tmp${spare}`) || targets.has(`tmp${spare}`)) spare += 1
    const temporary = `tmp${spare}`
    plan.push([first.from, temporary])
    taken.delete(first.from)
    taken.add(temporary)
    first.from = temporary
  }
  return plan
}
