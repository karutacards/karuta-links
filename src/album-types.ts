export type CompactCard = {
  instanceKey: string
  code: string
  character: string
  edition: number
  number: number
  quality: number
  version: number
  dye?: string
}

export type SnapshotAlbum = {
  id: string
  cards: Array<string | null>
  background: string
}

export type AlbumSnapshot = {
  albums: SnapshotAlbum[]
  cards: CompactCard[]
  backgrounds: string[]
  emptyAlbum: number
  emptyPage: number
}

export type EditorAlbum = {
  sourceId: string | null
  name: string
  page: number
  pages: number
  slots: Record<string, CompactCard>
  background: string
}

export const ALBUM_REFRESH_MS = 10 * 60 * 1000
export const ALBUM_MAX_PAGES = 100
export const DEFAULT_ALBUM_BACKGROUND = 'default'
