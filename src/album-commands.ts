import { albumBackgroundName } from './album-backgrounds'
import {
  ALBUM_NAME_RULE,
  ALBUM_NAME_TAKEN,
  isValidAlbumName,
  normalizeAlbumName,
  planAlbumRenames
} from './album-names'
import { DEFAULT_ALBUM_BACKGROUND, type AlbumSnapshot, type CompactCard, type EditorAlbum, type SnapshotAlbum } from './album-types'

const PREFIX = 'k!'

function slotKey(page: number, slot: number): string {
  return `${page}:${slot}`
}

function snapshotPages(album: SnapshotAlbum): number {
  return Math.max(1, Math.ceil(album.cards.length / 8) || 1)
}

export function slotsFromSnapshot(
  album: SnapshotAlbum,
  cards: Map<string, CompactCard>
): Record<string, CompactCard> {
  const slots: Record<string, CompactCard> = {}
  album.cards.forEach((instanceKey, index) => {
    if (!instanceKey) {
      return
    }
    const card = cards.get(instanceKey)
    if (!card) {
      return
    }
    const page = Math.floor(index / 8) + 1
    const slot = (index % 8) + 1
    slots[slotKey(page, slot)] = card
  })
  return slots
}

export function editorAlbumsFromSnapshot(snapshot: AlbumSnapshot): EditorAlbum[] {
  const cards = new Map(snapshot.cards.map((card) => [card.instanceKey, card]))
  return snapshot.albums.map((album) => ({
    sourceId: album.id,
    name: album.id,
    page: 1,
    pages: snapshotPages(album),
    slots: slotsFromSnapshot(album, cards),
    background: album.background || DEFAULT_ALBUM_BACKGROUND
  }))
}

function sameCard(left?: CompactCard, right?: CompactCard): boolean {
  return Boolean(left && right && left.instanceKey === right.instanceKey)
}

// Renames run before this, so `working` is already the album's final name.
function emitAlbumDiff(
  lines: string[],
  snapshotAlbum: SnapshotAlbum | null,
  editor: EditorAlbum,
  cards: Map<string, CompactCard>
): void {
  const working = normalizeAlbumName(editor.name)
  if (!snapshotAlbum) {
    lines.push(`${PREFIX}acreate ${working}`)
  }

  const beforePages = snapshotAlbum ? snapshotPages(snapshotAlbum) : 1
  if (editor.pages > beforePages) {
    for (let page = beforePages + 1; page <= editor.pages; page += 1) {
      lines.push(`${PREFIX}apage ${working} ${page}`)
    }
  } else if (snapshotAlbum && editor.pages < beforePages) {
    for (let page = beforePages; page > editor.pages; page -= 1) {
      lines.push(`${PREFIX}apageremove ${working} ${page}`)
    }
  }

  const beforeBg = snapshotAlbum?.background || DEFAULT_ALBUM_BACKGROUND
  const afterBg = editor.background || DEFAULT_ALBUM_BACKGROUND
  if (beforeBg !== afterBg) {
    lines.push(`${PREFIX}abg ${working} ${albumBackgroundName(afterBg)}`)
  }

  const beforeSlots = snapshotAlbum ? slotsFromSnapshot(snapshotAlbum, cards) : {}
  const maxPages = Math.max(editor.pages, beforePages)
  for (let page = 1; page <= maxPages; page += 1) {
    for (let slot = 1; slot <= 8; slot += 1) {
      const key = slotKey(page, slot)
      const before = beforeSlots[key]
      const after = editor.slots[key]
      if (before && !sameCard(before, after)) {
        lines.push(`${PREFIX}aremove ${working} ${before.code}`)
      }
    }
  }
  for (let page = 1; page <= editor.pages; page += 1) {
    for (let slot = 1; slot <= 8; slot += 1) {
      const key = slotKey(page, slot)
      const before = beforeSlots[key]
      const after = editor.slots[key]
      if (after && !sameCard(before, after)) {
        lines.push(`${PREFIX}aadd ${working} ${after.code} ${page} ${slot}`)
      }
    }
  }
}

export function albumCommandDiff(snapshot: AlbumSnapshot, editors: EditorAlbum[]): string {
  const names = editors.map((album) => normalizeAlbumName(album.name))
  if (names.some((name) => !isValidAlbumName(name))) {
    return `# ${ALBUM_NAME_RULE}`
  }
  if (new Set(names).size !== names.length) {
    return `# ${ALBUM_NAME_TAKEN}`
  }
  const cards = new Map(snapshot.cards.map((card) => [card.instanceKey, card]))
  const byId = new Map(snapshot.albums.map((album) => [album.id, album]))
  const sources = editors.map((editor) =>
    editor.sourceId ? byId.get(editor.sourceId) ?? null : null
  )
  const renames: Array<[string, string]> = []
  sources.forEach((source, index) => {
    const name = names[index]
    if (source && name !== undefined && source.id !== name) {
      renames.push([source.id, name])
    }
  })
  const plan = planAlbumRenames(byId.keys(), renames)
  if (!plan) {
    return `# ${ALBUM_NAME_TAKEN}`
  }
  const held = new Set(byId.keys())
  for (const [from, to] of plan) {
    held.delete(from)
    held.add(to)
  }
  if (names.some((name, index) => !sources[index] && held.has(name))) {
    return `# ${ALBUM_NAME_TAKEN}`
  }
  const lines = plan.map(([from, to]) => `${PREFIX}arename ${from} ${to}`)
  editors.forEach((editor, index) => {
    emitAlbumDiff(lines, sources[index] ?? null, editor, cards)
  })
  return lines.length ? lines.join('\n') : '# No changes to paste.'
}
