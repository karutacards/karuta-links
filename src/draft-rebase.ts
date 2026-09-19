export type DraftRebaseField = 'name' | 'series' | 'aliases' | 'delete'

export type DraftRebaseBase = {
  name: string
  seriesLabel: string
  aliases: readonly string[]
}

export type DraftPendingEdit = {
  name: string
  seriesLabel: string
  aliases: readonly string[]
  removed: readonly string[]
  pending: string
  pendingDelete: boolean
}

export type DraftRebaseResult = {
  name: string
  seriesLabel: string
  aliases: string[]
  removed: string[]
  pending: string
  pendingDelete: boolean
  conflicts: DraftRebaseField[]
  gone: boolean
}

export function rebaseDraftPending(
  base: DraftRebaseBase | null,
  theirs: DraftRebaseBase | null,
  mine: DraftPendingEdit
): DraftRebaseResult {
  function trim(value: unknown): string {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '')
  }
  function aliasKey(value: unknown): string {
    return trim(value).toLowerCase()
  }
  function same(left: unknown, right: unknown): boolean {
    return trim(left) === trim(right)
  }
  function aliasMap(list: readonly string[] | null | undefined): Record<string, string> {
    const map: Record<string, string> = {}
    const rows = list || []
    for (let i = 0; i < rows.length; i++) {
      const alias = trim(rows[i])
      const key = aliasKey(alias)
      if (!key || map[key]) continue
      map[key] = alias
    }
    return map
  }
  const pending = typeof mine.pending === 'string' ? mine.pending : ''
  if (!theirs) {
    const kept: string[] = []
    const source = mine.aliases || []
    for (let i = 0; i < source.length; i++) {
      const alias = trim(source[i])
      if (alias) kept.push(alias)
    }
    return {
      name: trim(mine.name),
      seriesLabel: trim(mine.seriesLabel),
      aliases: kept,
      removed: [],
      pending,
      pendingDelete: false,
      conflicts: [],
      gone: true
    }
  }
  const from = base || theirs
  const conflicts: DraftRebaseField[] = []
  function pick(baseValue: string, theirValue: string, myValue: string, field: DraftRebaseField): string {
    if (same(myValue, baseValue)) return theirValue
    if (same(theirValue, baseValue) || same(myValue, theirValue)) return myValue
    conflicts.push(field)
    return myValue
  }
  const name = pick(from.name, theirs.name, mine.name, 'name')
  const seriesLabel = pick(from.seriesLabel, theirs.seriesLabel, mine.seriesLabel, 'series')
  const baseMap = aliasMap(from.aliases)
  const theirMap = aliasMap(theirs.aliases)
  const mineKept = aliasMap(mine.aliases)
  const mineRemoved = aliasMap(mine.removed)
  const mineAdded: Record<string, string> = {}
  const mineDropped: Record<string, string> = {}
  Object.keys(mineKept).forEach(function (key) {
    if (!baseMap[key]) mineAdded[key] = mineKept[key]
  })
  Object.keys(baseMap).forEach(function (key) {
    if (!mineKept[key]) mineDropped[key] = baseMap[key]
  })
  Object.keys(mineRemoved).forEach(function (key) {
    mineDropped[key] = mineRemoved[key]
  })
  const theirsAdded: Record<string, string> = {}
  const theirsRemoved: Record<string, string> = {}
  Object.keys(theirMap).forEach(function (key) {
    if (!baseMap[key]) theirsAdded[key] = theirMap[key]
  })
  Object.keys(baseMap).forEach(function (key) {
    if (!theirMap[key]) theirsRemoved[key] = baseMap[key]
  })
  let aliasConflict = false
  Object.keys(mineDropped).forEach(function (key) {
    if (theirsAdded[key]) aliasConflict = true
  })
  Object.keys(mineAdded).forEach(function (key) {
    if (theirsRemoved[key]) aliasConflict = true
  })
  if (aliasConflict) conflicts.push('aliases')
  const kept: Record<string, string> = {}
  Object.keys(theirMap).forEach(function (key) {
    if (!mineDropped[key]) kept[key] = theirMap[key]
  })
  Object.keys(mineAdded).forEach(function (key) {
    if (!theirsRemoved[key] || aliasConflict) kept[key] = mineAdded[key]
  })
  const aliases: string[] = []
  const seen: Record<string, boolean> = {}
  function pushAlias(raw: string): void {
    const alias = trim(raw)
    const key = aliasKey(alias)
    if (!key || seen[key] || !kept[key]) return
    seen[key] = true
    aliases.push(kept[key])
  }
  const theirAliases = theirs.aliases || []
  for (let i = 0; i < theirAliases.length; i++) pushAlias(theirAliases[i])
  const myAliases = mine.aliases || []
  for (let j = 0; j < myAliases.length; j++) pushAlias(myAliases[j])
  const removed: string[] = []
  Object.keys(mineDropped).forEach(function (key) {
    if (theirMap[key]) removed.push(theirMap[key])
  })
  let pendingDelete = !!mine.pendingDelete
  if (pendingDelete) {
    let changed = !same(from.name, theirs.name) || !same(from.seriesLabel, theirs.seriesLabel)
    if (!changed) {
      const leftKeys = Object.keys(baseMap)
      const rightKeys = Object.keys(theirMap)
      if (leftKeys.length !== rightKeys.length) changed = true
      for (let k = 0; k < leftKeys.length && !changed; k++) {
        if (!theirMap[leftKeys[k]]) changed = true
      }
    }
    if (changed) conflicts.push('delete')
  }
  return {
    name,
    seriesLabel,
    aliases,
    removed,
    pending,
    pendingDelete,
    conflicts,
    gone: false
  }
}
