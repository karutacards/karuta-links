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
            <ul class="alias-list" data-alias-list></ul>
            <input data-alias-input aria-label="Add alias" autocomplete="off">
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
    body {
      margin: 0;
      padding: 0.75rem 1rem 1.5rem;
      font: 0.9375rem/1.35 system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    .page { max-width: 88rem; margin: 0 auto; }
    .top { margin: 0 0 0.75rem; }
    .lede {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.75rem;
      margin: 0 0 0.55rem;
    }
    .lede .meta { margin: 0; }
    h1 { font-size: 1.15rem; margin: 0; }
    h2 { font-size: 0.95rem; margin: 1.15rem 0 0.4rem; }
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
    .wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 0.35rem 0.45rem;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
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
    .name { width: 16rem; }
    .series { width: 12rem; }
    .edited {
      width: 11rem;
      max-width: 11rem;
    }
    .acts {
      position: relative;
      z-index: 1;
      width: 11.5rem;
      white-space: nowrap;
      background: var(--bg);
    }
    tbody tr:hover td.acts { background: #181c26; }
    .add-row td.acts { background: #0d0f14; }
    .add-row:hover td.acts { background: #121722; }
    .aliases {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      align-items: center;
    }
    .alias-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin: 0;
      padding: 0;
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
    .aliases input { width: 8rem; flex: 1 1 7rem; }
    .edited [data-last-edit] {
      display: block;
      white-space: nowrap;
    }
    .mention {
      display: inline;
      padding: 0 0.2rem;
      border-radius: 3px;
      color: var(--mention-ink);
      background: var(--mention-fill);
      font-weight: 500;
    }
    .audit {
      margin: 0.35rem 0 0;
      padding-left: 1.1rem;
      color: var(--muted);
    }
    .audit[hidden] { display: none; }
    .audit li { margin: 0 0 0.25rem; }
    .acts button { margin: 0 0.2rem 0.2rem 0; }
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
    ? `Locked ${formatApDate(draft.lockedAt)}.`
    : 'Unlocked. Each save uses the revision on that series or character.'
  const payload = {
    id: draft.id,
    locked,
    canLock: options.canLock,
    username: options.username,
    series: draft.series,
    characters: draft.characters
  }
  const addSeries = locked
    ? ''
    : `<tr class="add-row" id="add-series-card">
         <td><input id="add-series-name" aria-label="Name" autocomplete="off"></td>
         <td>${aliasCell('add-series-aliases')}</td>
         <td></td>
         <td class="acts"><button type="button" id="add-series">Add series</button></td>
       </tr>`
  const addCharacter = locked
    ? ''
    : `<tr class="add-row" id="add-character-card">
         <td><input id="add-character-name" aria-label="Name" autocomplete="off"></td>
         <td><input id="add-character-series" aria-label="Series key" autocomplete="off"></td>
         <td>${aliasCell('add-character-aliases')}</td>
         <td></td>
         <td class="acts"><button type="button" id="add-character">Add character</button></td>
       </tr>`
  return layout(
    `Draft ${draft.id}`,
    `<div class="top">
       <div class="lede">
         <h1>Draft ${draft.id}</h1>
         <p class="meta">${escapeHtml(lockLine)}</p>
       </div>
       ${options.canLock && !locked ? '<button type="button" id="lock-draft" class="primary">Lock draft</button>' : ''}
       ${options.canLock && locked ? `<a class="file" id="export-draft" href="/api/v1/drafts/${draft.id}/export.csv">Export CSV</a>` : ''}
     </div>
     <p id="draft-status" class="banner" role="status" hidden></p>
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
             <th class="series">Series key</th>
             <th>Aliases</th>
             <th class="edited">Last edited</th>
             <th class="acts"></th>
           </tr>
         </thead>
         <tbody id="character-list">${addCharacter}</tbody>
       </table>
     </div>
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
