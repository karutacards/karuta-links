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
      color-scheme: dark;
      --bg: #12141a;
      --panel: #1b1f29;
      --ink: #f4f1ea;
      --muted: #b7b0a3;
      --line: #2c3342;
      --accent: #e8c27a;
      --pill: #2a3348;
      --danger: #f0a3a3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.5;
    }
    a { color: var(--accent); }
    header, main, footer { width: min(1100px, calc(100% - 2rem)); margin: 0 auto; }
    header { padding: 1.5rem 0 1rem; border-bottom: 1px solid var(--line); }
    header h1 { margin: 0.35rem 0 0; }
    .kicker { letter-spacing: 0.12em; font-size: 0.8rem; color: var(--accent); }
    main { padding: 1.5rem 0 4rem; }
    footer { color: var(--muted); padding: 1rem 0 2rem; font-size: 0.9rem; }
    .meta, .copy { color: var(--muted); }
    .banner { padding: 0.75rem 1rem; border-radius: 8px; margin: 0 0 1rem; }
    .banner.error { background: #3a2228; color: var(--danger); }
    .banner.ok { background: #223228; color: #c8e6c9; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0 0 1.25rem; }
    button, .file {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 6px;
      padding: 0.45rem 0.8rem;
      cursor: pointer;
      font: inherit;
    }
    button.primary { border-color: var(--accent); color: var(--accent); }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .row {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      margin: 0 0 0.65rem;
    }
    .row-head { display: flex; flex-wrap: wrap; gap: 0.5rem 0.85rem; align-items: center; }
    .kind { letter-spacing: 0.08em; font-size: 0.75rem; color: var(--accent); }
    .pills { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.45rem 0 0; }
    .pill {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: var(--pill);
      font-size: 0.85rem;
    }
    .chip {
      border: 0;
      background: #2f3a2f;
      color: #d7ecd8;
      border-radius: 999px;
      padding: 0.15rem 0.55rem;
      font-size: 0.8rem;
    }
    .editor { display: grid; gap: 0.45rem; margin-top: 0.65rem; }
    .editor input {
      width: 100%;
      padding: 0.4rem 0.5rem;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: #12151c;
      color: var(--ink);
      font: inherit;
    }
    .row-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .audit {
      display: none;
      margin-top: 0.6rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .audit.open { display: block; }
    .audit li { margin: 0 0 0.35rem; }
    .add-form {
      background: var(--panel);
      border: 1px dashed var(--line);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      margin: 0 0 1.5rem;
    }
  </style>
</head>
<body>
  <header>
    <p class="kicker"><a href="/">krta.cc</a></p>
    <h1>${escapeHtml(title)}</h1>
  </header>
  <main>${body}</main>
  <footer>Card art belongs to its owners.</footer>
  ${script}
</body>
</html>`
}

export function renderDraftForbidden(): string {
  return layout(
    'Draft unavailable',
    '<p class="copy">You do not have access to this draft.</p>'
  )
}

export function renderDraftUnavailable(): string {
  return layout(
    'Draft unavailable',
    '<p class="copy">Draft access could not be verified.</p>'
  )
}

export function renderDraftImport(): string {
  return layout(
    'Import draft',
    `<p class="copy">Waiting for a catalog from Karuta Admin.</p>
     <p id="import-status" class="meta"></p>`,
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
    : 'Unlocked. Saves use the revision on each series or character.'
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
    `<p class="meta">${escapeHtml(lockLine)}</p>
     <p id="draft-status" class="banner" hidden></p>
     <div class="toolbar">
       ${options.canLock && !locked ? '<button type="button" id="lock-draft" class="primary">Lock draft</button>' : ''}
       ${options.canLock && locked ? '<a class="file" id="export-draft" href="/api/v1/drafts/' + draft.id + '/export.csv">Export CSV</a>' : ''}
     </div>
     ${locked ? '' : `<section class="add-form">
       <h2>Add series</h2>
       <div class="editor">
         <input id="add-series-name" placeholder="Series name">
         <input id="add-series-aliases" placeholder="Aliases, separated by |">
         <button type="button" id="add-series">Add series</button>
       </div>
       <h2>Add character</h2>
       <div class="editor">
         <input id="add-character-name" placeholder="Character name">
         <input id="add-character-series" placeholder="Series key">
         <input id="add-character-aliases" placeholder="Aliases, separated by |">
         <button type="button" id="add-character">Add character</button>
       </div>
     </section>`}
     <section>
       <h2>Series</h2>
       <div id="series-list"></div>
     </section>
     <section>
       <h2>Characters</h2>
       <div id="character-list"></div>
     </section>
     <script type="application/json" id="draft-data">${embedJson(payload)}</script>`,
    `<script>${DRAFT_CLIENT_SCRIPT}</script>
     <script>window.krtaDraftEditor()</script>`
  )
}

export function renderDraftNotFound(): string {
  return layout('Draft not found', '<p class="copy">That draft does not exist.</p>')
}
