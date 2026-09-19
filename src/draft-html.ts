import { escapeHtml } from './escape'
import type { DraftRecord } from './draft-types'
import { formatApDate } from './html'
import { DRAFT_CLIENT_SCRIPT } from './draft-client'

function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function aliasCell(id: string): string {
  return `<div class="aliases" id="${id}">
            <input data-alias-input aria-label="Add alias" autocomplete="off">
            <ul class="alias-list" data-alias-list></ul>
          </div>`
}

function layout(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #12141a;
      --panel: #1b1f29;
      --ink: #f4f1ea;
      --muted: #b7b0a3;
      --line: #2c3342;
      --accent: #e8c27a;
      --danger: #f28b82;
      --ok: #81c995;
      --mention-ink: #c9cdfb;
      --mention-fill: rgba(88, 101, 242, 0.3);
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      padding:
        max(0.75rem, env(safe-area-inset-top, 0px))
        max(1rem, env(safe-area-inset-right, 0px))
        max(1.5rem, env(safe-area-inset-bottom, 0px))
        max(1rem, env(safe-area-inset-left, 0px));
      font: 0.9375rem/1.35 system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    .page { max-width: 88rem; margin: 0 auto; }
    .top {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      margin: 0 0 0.75rem;
    }
    .lede {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.75rem;
      margin: 0;
    }
    .draft-note, .draft-note-view {
      display: block;
      width: 100%;
      max-width: 48rem;
      margin: 0 0 0.75rem;
      color: var(--ink);
      font: inherit;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .draft-note {
      min-height: 2.5rem;
      padding: 0.35rem 0.45rem;
      border: 1px solid var(--line);
      background: #0e1016;
      resize: vertical;
    }
    .draft-note-view {
      margin: 0 0 0.75rem;
      color: var(--muted);
    }
    .draft-note-view[hidden] { display: none; }
    .top-tools {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem 0.65rem;
    }
    .presence {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.3rem;
      min-height: 1.5rem;
    }
    .workspace {
      display: grid;
      grid-template-areas:
        "catalog"
        "activity";
      gap: 1.25rem;
    }
    .catalog { grid-area: catalog; min-width: 0; }
    .activity {
      grid-area: activity;
      display: flex;
      flex-direction: column;
      min-height: 8rem;
      max-height: min(14rem, 40dvh);
      overflow: hidden;
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 0.65rem 0.75rem;
      font-size: 0.75rem;
      line-height: 1.35;
    }
    .activity h2 {
      flex: none;
      margin: 0 0 0.45rem;
      font-size: 0.8rem;
    }
    .activity ol {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .activity li {
      margin: 0 0 0.55rem;
      color: var(--ink);
      overflow-wrap: anywhere;
    }
    .activity .when {
      display: block;
      margin: 0 0 0.12rem;
      color: var(--muted);
      font-size: 0.625rem;
      line-height: 1.2;
      font-weight: 400;
    }
    .activity p { margin: 0; }
    .activity .actor {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.72rem;
    }
    .activity strong { font-weight: 700; }
    @media (min-width: 64rem) {
      .workspace {
        grid-template-columns: minmax(0, 1fr) 18rem;
        grid-template-areas: "catalog activity";
        align-items: stretch;
      }
      .activity {
        position: sticky;
        top: 0.75rem;
        align-self: stretch;
        min-height: 0;
        max-height: calc(100dvh - 2.25rem);
      }
    }
    @media (max-width: 63.99rem) {
      th.edited, td.edited { display: none; }
    }
    @media (max-height: 36rem) {
      .activity { max-height: min(10rem, 32dvh); }
    }
    @media (pointer: coarse) {
      button, .file, input { min-height: 2.75rem; }
    }
    .lede .meta { margin: 0; }
    h1 { font-size: 1.15rem; margin: 0; }
    h2 { font-size: 0.95rem; margin: 1.15rem 0 0.4rem; }
    .catalog > h2:first-child { margin-top: 0; }
    p { margin: 0 0 0.6rem; }
    .meta, .copy, .empty { color: var(--muted); }
    .banner[hidden] { display: none; }
    .banner {
      margin: 0 0 0.65rem;
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .banner.error { border-color: var(--danger); color: var(--danger); }
    .banner.ok { border-color: var(--ok); color: var(--ok); }
    button, .file {
      min-height: 2rem;
      padding: 0.2rem 0.5rem;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      font: inherit;
      cursor: pointer;
    }
    .file { display: inline-flex; align-items: center; text-decoration: none; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #12141a; }
    button.danger { border-color: var(--danger); color: var(--danger); background: transparent; }
    button.quiet { background: transparent; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    input {
      width: 100%;
      min-height: 2rem;
      padding: 0.2rem 0.4rem;
      border: 1px solid var(--line);
      background: #0e1016;
      color: var(--ink);
      font: inherit;
    }
    input:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .wrap { overflow-x: auto; }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    th, td {
      min-width: 0;
      padding: 0.35rem 0.45rem;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
    }
    th {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    tbody tr:hover td { background: #181c26; }
    .add-row td { background: #0d0f14; }
    .add-row:hover td { background: #121722; }
    .add-row input {
      background: #2a3344;
      border-color: #5a6578;
    }
    .name { width: 12rem; }
    .series { width: 9rem; }
    .edited {
      width: 9rem;
      max-width: 9rem;
      min-width: 0;
      overflow: hidden;
    }
    .acts {
      position: relative;
      z-index: 1;
      width: 8.5rem;
      white-space: normal;
    }
    .acts-row {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
    .acts-edit {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
    }
    @media (max-width: 39.99rem) {
      .name { width: 28%; }
      .series { width: 22%; }
      .acts { width: 26%; }
    }
    @media (min-width: 64rem) {
      .name { width: 16rem; }
      .series { width: 12rem; }
      .edited { width: 11rem; max-width: 11rem; }
      .acts { width: 13rem; white-space: nowrap; }
      .acts-row, .acts-edit { flex-wrap: nowrap; }
    }
    .aliases {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.3rem;
      min-width: 0;
      overflow: hidden;
    }
    .alias-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    .alias-list:empty { display: none; }
    .alias-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      min-height: 1.5rem;
      padding: 0 0.4rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      color: var(--ink);
      font: inherit;
      cursor: pointer;
    }
    .alias-chip .alias-x { color: var(--muted); }
    .alias-chip:hover, .alias-chip:hover .alias-x {
      border-color: var(--danger);
      color: var(--danger);
    }
    li.alias-chip { cursor: default; }
    .aliases input { width: 100%; flex: none; }
    .edited [data-last-edit] {
      display: block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mention {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
      padding: 0 0.2rem;
      border-radius: 3px;
      color: var(--mention-ink);
      background: var(--mention-fill);
      font-weight: 500;
    }
    .history-dialog {
      width: min(28rem, calc(100vw - 2rem));
      max-height: min(32rem, calc(100dvh - 3rem));
      padding: 0;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
    }
    .history-dialog::backdrop { background: rgba(8, 10, 14, 0.65); }
    .history-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid var(--line);
    }
    .history-lede { min-width: 0; }
    .history-kind {
      margin: 0;
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 600;
    }
    .history-head h2 {
      margin: 0.15rem 0 0;
      font-size: 1.15rem;
      line-height: 1.25;
      color: var(--accent);
    }
    .history-series {
      margin: 0.2rem 0 0;
      color: var(--ink);
      font-size: 0.8rem;
      font-weight: 400;
      font-style: italic;
    }
    .history-series[hidden] { display: none; }
    .history-log {
      list-style: none;
      margin: 0;
      padding: 0.75rem 0.85rem 1rem;
      overflow: auto;
      max-height: min(24rem, calc(100dvh - 9rem));
      font-size: 0.75rem;
      line-height: 1.35;
    }
    .history-log li { margin: 0 0 0.55rem; }
    .history-log .when {
      display: block;
      margin: 0 0 0.12rem;
      color: var(--muted);
      font-size: 0.625rem;
      line-height: 1.2;
    }
    .history-log p { margin: 0; }
    .history-log .actor {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.72rem;
    }
    .history-log strong { font-weight: 700; }
    .acts button { margin: 0; }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${body}
  </div>
  ${script}
</body>
</html>`
}

export function renderDraftForbidden(): string {
  return layout(
    'Draft unavailable',
    '<h1>Draft unavailable</h1><p class="copy">You do not have access to this draft.</p>'
  )
}

export function renderDraftUnavailable(): string {
  return layout(
    'Draft unavailable',
    '<h1>Draft unavailable</h1><p class="copy">Draft access could not be verified.</p>'
  )
}

export function renderDraftImport(): string {
  return layout(
    'Import draft',
    `<h1>Import draft</h1>
     <p class="copy">Waiting for a catalog from Karuta Admin.</p>
     <p id="import-status" class="banner" role="status" hidden></p>`,
    `<script>${DRAFT_CLIENT_SCRIPT}</script>
     <script>window.krtaDraftImport()</script>`
  )
}

export function renderDraftEditor(
  draft: DraftRecord,
  options: { canLock: boolean; username: string }
): string {
  const locked = Boolean(draft.lockedAt)
  const lockLine = locked && draft.lockedAt
    ? `<p class="meta">Locked ${escapeHtml(formatApDate(draft.lockedAt))}.</p>`
    : ''
  const payload = {
    id: draft.id,
    locked,
    canLock: options.canLock,
    username: options.username,
    description: draft.description,
    series: draft.series,
    characters: draft.characters
  }
  const addSeries = locked
    ? ''
    : `<tr class="add-row" id="add-series-card">
         <td><input id="add-series-name" aria-label="Name" autocomplete="off"></td>
         <td>${aliasCell('add-series-aliases')}</td>
         <td></td>
         <td class="acts"><div class="acts-row"><button type="button" id="add-series">Add series</button></div></td>
       </tr>`
  const addCharacter = locked
    ? ''
    : `<tr class="add-row" id="add-character-card">
         <td><input id="add-character-name" aria-label="Name" autocomplete="off"></td>
         <td><input id="add-character-series" aria-label="Series" autocomplete="off"></td>
         <td>${aliasCell('add-character-aliases')}</td>
         <td></td>
         <td class="acts"><div class="acts-row"><button type="button" id="add-character">Add character</button></div></td>
       </tr>`
  return layout(
    `Draft ${draft.id}`,
    `<div class="top">
       <div class="lede">
         <h1>Draft ${draft.id}</h1>
         ${lockLine}
       </div>
       <div class="top-tools">
         <div id="draft-presence" class="presence" aria-label="Editors on this draft"></div>
         ${options.canLock && !locked ? '<button type="button" id="lock-draft" class="primary">Lock draft</button>' : ''}
         ${options.canLock && locked ? `<a class="file" id="export-draft" href="/api/v1/drafts/${draft.id}/export.txt">Download</a>` : ''}
         ${options.canLock && locked ? '<button type="button" id="unlock-draft">Unlock draft</button>' : ''}
       </div>
     </div>
     ${options.canLock
       ? `<textarea id="draft-description" class="draft-note" aria-label="Draft description" maxlength="1000" placeholder="Add a description.">${escapeHtml(draft.description)}</textarea>`
       : `<p id="draft-description-view" class="draft-note-view"${draft.description ? '' : ' hidden'}>${escapeHtml(draft.description)}</p>`}
     <p id="draft-status" class="banner" role="status" hidden></p>
     <div class="workspace">
       <div class="catalog">
         <h2>Series</h2>
         <div class="wrap">
           <table>
             <thead>
               <tr>
                 <th class="name">Name</th>
                 <th>Aliases</th>
                 <th class="edited">Last edited</th>
                 <th class="acts"></th>
               </tr>
             </thead>
             <tbody id="series-list">${addSeries}</tbody>
           </table>
         </div>
         <h2>Characters</h2>
         <div class="wrap">
           <table>
             <thead>
               <tr>
                 <th class="name">Name</th>
                 <th class="series">Series</th>
                 <th>Aliases</th>
                 <th class="edited">Last edited</th>
                 <th class="acts"></th>
               </tr>
             </thead>
             <tbody id="character-list">${addCharacter}</tbody>
           </table>
         </div>
       </div>
       <aside class="activity" aria-label="Activity">
         <h2>Activity</h2>
         <ol id="draft-activity"></ol>
       </aside>
     </div>
     <dialog id="draft-history" class="history-dialog" aria-labelledby="draft-history-kind draft-history-title">
       <div class="history-head">
         <div class="history-lede">
           <p class="history-kind" id="draft-history-kind">Series</p>
           <h2 id="draft-history-title">History</h2>
           <p class="history-series" id="draft-history-series" hidden></p>
         </div>
         <button type="button" id="draft-history-close">Close</button>
       </div>
       <ol id="draft-history-list" class="history-log"></ol>
     </dialog>
     <script type="application/json" id="draft-data">${embedJson(payload)}</script>`,
    `<script>${DRAFT_CLIENT_SCRIPT}</script>
     <script>window.krtaDraftEditor()</script>`
  )
}

export function renderDraftNotFound(): string {
  return layout(
    'Draft not found',
    '<h1>Draft not found</h1><p class="copy">That draft does not exist.</p>'
  )
}
