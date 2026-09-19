export type DraftSortMode = 'added' | 'edited' | 'name'

export type DraftSortable = {
  key: string
  name: string
  addedAt?: number
  lastEditedAt?: number
}

export function sortDraftEntities<T extends DraftSortable>(
  list: readonly T[],
  mode: DraftSortMode
): T[] {
  return list.slice().sort((left, right) => {
    if (mode === 'name') {
      const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      if (byName) return byName
      return left.key.localeCompare(right.key)
    }
    const leftTime = mode === 'edited' ? (left.lastEditedAt ?? 0) : (left.addedAt ?? 0)
    const rightTime = mode === 'edited' ? (right.lastEditedAt ?? 0) : (right.addedAt ?? 0)
    if (rightTime !== leftTime) return rightTime - leftTime
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    if (byName) return byName
    return left.key.localeCompare(right.key)
  })
}
