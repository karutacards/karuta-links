import { ALBUM_BACKGROUND_NAMES } from './album-backgrounds'
import { ALBUM_CLIENT_SCRIPT } from './album-client'
import { ALBUM_CSS } from './album-css'
import { escapeHtml } from './escape'
import { discordAvatarUrl } from './discord-avatar'
import type { AlbumSnapshot } from './album-types'
import type { Session } from './session'

export const ALBUM_OAUTH_START = '/api/auth/discord?next=/albums'
export const ALBUM_START_LEDE =
  'Sign in with Discord to plan albums from the cards you already own.'

export type AlbumViewer = {
  discordId: string
  username: string
  avatar: string
}

function embedJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function layout(title: string, body: string, refreshTo?: string): string {
  const refresh = refreshTo
    ? `\n  <meta http-equiv="refresh" content="0;url=${escapeHtml(refreshTo)}">`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>${refresh}
  <style>${ALBUM_CSS}</style>
</head>
<body>
${body}
</body>
</html>`
}

export function renderAlbumStart(): string {
  return layout(
    'Albums',
    `<header class="bar"><p class="mark">Karuta</p></header>
    <main class="start">
      <p>${escapeHtml(ALBUM_START_LEDE)}</p>
      <p><a href="${ALBUM_OAUTH_START}">Continue to Discord</a></p>
    </main>`,
    ALBUM_OAUTH_START
  )
}

export function renderAlbumUnavailable(message = 'Album snapshots are unavailable.'): string {
  return layout(
    'Albums',
    `<header class="bar"><p class="mark">Karuta</p></header>
    <main class="start"><p>${escapeHtml(message)}</p></main>`
  )
}

export function renderAlbumEditor(
  viewer: AlbumViewer,
  snapshot: AlbumSnapshot,
  fetchedAt: number
): string {
  const boot = {
    snapshot,
    fetchedAt,
    names: ALBUM_BACKGROUND_NAMES,
    viewer
  }
  const face = escapeHtml(discordAvatarUrl(viewer.discordId, viewer.avatar))
  const name = escapeHtml(viewer.username)
  return layout(
    'Albums',
    `<header class="bar">
      <p class="mark">Karuta</p>
      <div class="bar-tools">
        <p class="script-note" id="refresh-note" hidden></p>
        <button type="button" class="ghost" id="refresh">Refresh</button>
        <p class="session"><img class="face" src="${face}" alt="${name}" width="28" height="28" decoding="async" referrerpolicy="no-referrer"><span>${name}</span></p>
      </div>
    </header>
    <main class="app" id="app" data-sheet="">
      <aside class="shelf" id="shelf" aria-label="Collection and albums">
        <section class="panel collection" id="collection" aria-label="Your cards">
          <div class="panel-head">
            <h1>Collection</h1>
            <input id="search" type="search" placeholder="Code">
            <button type="button" class="ghost close-sheet" data-close>Done</button>
          </div>
          <div class="stack scroll" id="stack"></div>
        </section>
        <section class="panel albums" id="albums" aria-label="Your albums">
          <div class="panel-head">
            <h1>Albums</h1>
            <button type="button" class="ghost" id="new-album">New</button>
          </div>
          <div class="album-list scroll" id="album-list"></div>
          <p class="name-hint" id="name-hint" hidden></p>
        </section>
      </aside>
      <section class="stage" aria-label="Album page">
        <div class="spread" id="spread">
          <img class="backdrop" id="backdrop" src="https://karuta-bot.s3.us-east-2.amazonaws.com/images/backgrounds/default.jpg" alt="">
          <div class="slots" id="slots"></div>
        </div>
        <div class="stage-tools">
          <div class="pages" id="pages" role="tablist" aria-label="Album pages"></div>
        </div>
        <p class="stage-note" id="stage-note">Eight slots to a page. Drag a card onto a slot, or tap a card and then a slot.</p>
      </section>
      <aside class="rail" id="rail" aria-label="Commands and backgrounds">
        <section class="panel script" id="script" aria-label="Karuta commands">
          <div class="panel-head">
            <h1>Commands</h1>
            <button type="button" class="copy desktop-copy" id="copy-desktop" disabled>Copy</button>
            <button type="button" class="ghost close-sheet" data-close>Done</button>
          </div>
          <pre class="scroll" id="commands" tabindex="0"></pre>
          <p class="script-note">Paste in Discord. Extra pages spend an empty page.</p>
        </section>
        <section class="panel backgrounds" id="backgrounds" aria-label="Album backgrounds">
          <div class="panel-head">
            <h1>Background</h1>
            <input id="bg-search" type="search" placeholder="Name">
          </div>
          <div class="bg-grid scroll" id="bg-grid"></div>
        </section>
      </aside>
      <div class="sheet-backdrop" id="sheet-backdrop" hidden data-close></div>
    </main>
    <footer class="dock">
      <button type="button" class="dock-btn" id="open-cards">Cards</button>
      <button type="button" class="copy dock-copy" id="copy-dock" disabled>Copy</button>
      <button type="button" class="dock-btn" id="open-script">Script</button>
    </footer>
    <script>window.__ALBUMS__ = ${embedJson(boot)};</script>
    <script>${ALBUM_CLIENT_SCRIPT}</script>`
  )
}

export function viewerOf(session: Session): AlbumViewer {
  return {
    discordId: session.discordId,
    username: session.username,
    avatar: session.avatar
  }
}
