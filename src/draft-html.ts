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
      color-scheme: light;
      --bg: #fff;
      --ink: #111;
      --muted: #3d3d3d;
      --line: #8a8a8a;
      --fill: #f4f4f4;
      --accent: #0b57d0;
      --danger: #8a1010;
      --ok: #0b4d1e;
    }
    * { box-sizing: border-box; }
    html { font-size: 100%; }
    body {
      margin: 0;
      padding: 0.75rem;
      font: 1rem/1.45 system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.35rem; }
    h2 { font-size: 1.1rem; margin: 1.25rem 0 0.5rem; }
    p { margin: 0 0 0.75rem; }
    .meta, .copy { color: var(--muted); }
    .banner[hidden] { display: none; }
    .banner {
      margin: 0 0 0.75rem;
      padding: 0.65rem 0.75rem;
      border: 2px solid var(--ink);
    }
    .banner.error { border-color: var(--danger); color: var(--danger); }
    .banner.ok { border-color: var(--ok); color: var(--ok); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1rem; }
    button, .file, summary {
      min-height: 2.75rem;
      padding: 0.5rem 0.75rem;
      border: 2px solid var(--ink);
      background: var(--bg);
      color: var(--ink);
      font: inherit;
      cursor: pointer;
    }
    .file { display: inline-flex; align-items: center; text-decoration: none; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.danger { border-color: var(--danger); color: var(--danger); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    label { display: grid; gap: 0.25rem; font-weight: 600; }
    input {
      width: 100%;
      min-height: 2.75rem;
      padding: 0.45rem 0.6rem;
      border: 2px solid var(--ink);
      background: var(--bg);
      color: var(--ink);
      font: inherit;
    }
    .fields { display: grid; gap: 0.65rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .actions button, .actions .file { flex: 1 1 8rem; }
    details { margin: 0 0 1rem; }
    details > .fields { margin-top: 0.65rem; }
    .row {
      padding: 0.75rem 0;
      border-top: 1px solid var(--line);
    }
    .row-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.35rem 0.75rem;
      margin-bottom: 0.5rem;
    }
    .kind { font-weight: 700; }
    .audit { margin: 0.5rem 0 0; padding-left: 1.2rem; color: var(--muted); }
    .audit[hidden] { display: none; }
    .empty { color: var(--muted); }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend { font-weight: 600; padding: 0; }
    .alias-list {
      list-style: none;
      margin: 0.4rem 0 0.55rem;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .alias-list:empty { display: none; }
    .alias-list li {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      border: 2px solid var(--ink);
      padding: 0.15rem 0.3rem 0.15rem 0.55rem;
    }
    .alias-list button { min-height: 2.25rem; }
    .alias-add { display: grid; gap: 0.5rem; }
    @media (min-width: 640px) {
      body { padding: 1.25rem; }
      .row .fields { grid-template-columns: 1fr 1fr; }
      .row .fields .name,
      .row .fields .aliases,
      .row .fields .actions { grid-column: 1 / -1; }
      .alias-add { grid-template-columns: 1fr auto; align-items: end; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
    }
  </style>
</head>
<body>
  ${body}
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
  return layout(
    `Draft ${draft.id}`,
    `<h1>Draft ${draft.id}</h1>
     <p class="meta">${escapeHtml(lockLine)}</p>
     <p id="draft-status" class="banner" role="status" hidden></p>
     <div class="toolbar">
       ${options.canLock && !locked ? '<button type="button" id="lock-draft" class="primary">Lock draft</button>' : ''}
       ${options.canLock && locked ? `<a class="file" id="export-draft" href="/api/v1/drafts/${draft.id}/export.csv">Export CSV</a>` : ''}
     </div>
     ${locked ? '' : `<details>
       <summary>Add series</summary>
       <div class="fields">
         <label>Name <input id="add-series-name" autocomplete="off"></label>
         <fieldset class="aliases" id="add-series-aliases">
           <legend>Aliases</legend>
           <ul class="alias-list" data-alias-list></ul>
           <div class="alias-add">
             <label>New alias <input data-alias-input autocomplete="off"></label>
             <button type="button" data-alias-add>Add alias</button>
           </div>
         </fieldset>
         <div class="actions"><button type="button" id="add-series">Add series</button></div>
       </div>
     </details>
     <details>
       <summary>Add character</summary>
       <div class="fields">
         <label>Name <input id="add-character-name" autocomplete="off"></label>
         <label>Series key <input id="add-character-series" autocomplete="off"></label>
         <fieldset class="aliases" id="add-character-aliases">
           <legend>Aliases</legend>
           <ul class="alias-list" data-alias-list></ul>
           <div class="alias-add">
             <label>New alias <input data-alias-input autocomplete="off"></label>
             <button type="button" data-alias-add>Add alias</button>
           </div>
         </fieldset>
         <div class="actions"><button type="button" id="add-character">Add character</button></div>
       </div>
     </details>`}
     <h2>Series</h2>
     <div id="series-list"></div>
     <h2>Characters</h2>
     <div id="character-list"></div>
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
