import { formatContestScore } from './contest'
import { escapeHtml } from './escape'
import { dumpCounts } from './ingest'
import type {
  ContentSnapshot,
  ContestEntry,
  ContestSnapshot,
  EditionRecord,
  ListedContest,
  ListedDump,
  SeriesRecord
} from './types'

const MONTHS = [
  'Jan.',
  'Feb.',
  'March',
  'April',
  'May',
  'June',
  'July',
  'Aug.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dec.'
] as const

export function formatApDate(ms: number): string {
  const date = new Date(ms)
  const month = MONTHS[date.getUTCMonth()]
  if (!month) {
    return date.toISOString()
  }
  const day = date.getUTCDate()
  const year = date.getUTCFullYear()
  let hours = date.getUTCHours()
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'p.m.' : 'a.m.'
  hours = hours % 12
  if (hours === 0) {
    hours = 12
  }
  return `${month} ${day}, ${year}, ${hours}:${minutes} ${period} UTC`
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    header p, .meta, footer { color: var(--muted); }
    h1, h2, h3 { font-weight: 600; letter-spacing: 0.01em; }
    main { padding: 1.5rem 0 4rem; }
    footer { padding: 1rem 0 2rem; font-size: 0.9rem; }
    .kicker { letter-spacing: 0.12em; font-size: 0.8rem; color: var(--accent); }
    .list { display: grid; gap: 0.75rem; }
    .card, .empty {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem 1.1rem;
    }
    .counts { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; font-size: 0.95rem; }
    .gallery { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    figure img { width: 100%; aspect-ratio: 520 / 720; object-fit: cover; display: block; background: #0d0f14; }
    figcaption { padding: 0.7rem 0.8rem 0.9rem; font-size: 0.92rem; }
    figcaption strong { display: block; }
    .series-list { columns: 2; gap: 1.5rem; }
    @media (max-width: 720px) { .series-list { columns: 1; } }
    .series-list li { break-inside: avoid; margin: 0 0 0.35rem; }
  </style>
</head>
<body>
  <header>
    <p class="kicker"><a href="/">krta.cc</a></p>
    <h1>${escapeHtml(title)}</h1>
  </header>
  <main>
    ${body}
  </main>
  <footer>Official Karuta dumps. Card art belongs to its owners.</footer>
</body>
</html>`
}

function countLine(snapshot: ContentSnapshot): string {
  const counts = dumpCounts(snapshot)
  const parts = [
    counts.newSeries ? `${counts.newSeries} new series` : '',
    counts.updatedSeries ? `${counts.updatedSeries} updated series` : '',
    counts.newCharacters
      ? `${counts.newCharacters} new ${counts.newCharacters === 1 ? 'character' : 'characters'}`
      : '',
    counts.newEditions
      ? `${counts.newEditions} ${counts.newEditions === 1 ? 'character' : 'characters'} with new editions`
      : '',
    counts.updatedEditions
      ? `${counts.updatedEditions} ${counts.updatedEditions === 1 ? 'character' : 'characters'} with updated editions`
      : ''
  ].filter(Boolean)
  return parts.join(', ')
}

function seriesList(title: string, rows: SeriesRecord[]): string {
  if (rows.length === 0) {
    return ''
  }
  const items = rows
    .map((row) => `<li>${escapeHtml(row.name)}</li>`)
    .join('')
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <ul class="series-list">${items}</ul>
  </section>`
}

function editionGallery(title: string, rows: EditionRecord[]): string {
  if (rows.length === 0) {
    return ''
  }
  const figures = rows.flatMap((row) =>
    row.editions.map((edition) => `<figure>
      <img src="${escapeHtml(edition.imageUrl)}" alt="${escapeHtml(`${row.name} edition ${edition.edition}`)}">
      <figcaption>
        <strong>${escapeHtml(row.name)}</strong>
        ${escapeHtml(row.seriesName)} · Edition ${escapeHtml(edition.edition)}
      </figcaption>
    </figure>`)
  ).join('')
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <div class="gallery">${figures}</div>
  </section>`
}

function characterNames(title: string, rows: { name: string; seriesName: string }[]): string {
  if (rows.length === 0) {
    return ''
  }
  const items = rows
    .map((row) => `<li>${escapeHtml(row.name)} (${escapeHtml(row.seriesName)})</li>`)
    .join('')
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <ul class="series-list">${items}</ul>
  </section>`
}

export function renderHome(dumps: ListedDump[]): string {
  const body = dumps.length === 0
    ? '<p class="empty">No content dumps yet.</p>'
    : `<div class="list">${dumps.map((dump) => {
      const href = dump.slug ? `/${dump.slug}` : `/content/${dump.id}`
      return `<article class="card">
        <p class="meta">${escapeHtml(formatApDate(dump.createdAt))}</p>
        <h2><a href="${escapeHtml(href)}">Content dump ${dump.id}</a></h2>
        <p class="counts">${escapeHtml(countLine(dump.snapshot))}</p>
      </article>`
    }).join('')}</div>`

  return layout(
    'Content dumps',
    `<p class="meta">Published Karuta series, characters and editions. <a href="/contests">Card Hunt results</a>.</p>${body}`
  )
}

export function renderContentDump(
  id: number,
  createdAt: number,
  snapshot: ContentSnapshot,
  slug: string | null
): string {
  const short = slug ? ` Short URL: /${slug}.` : ''
  const envNote = snapshot.environment !== 'production'
    ? ` Environment: ${snapshot.environment}.`
    : ''
  const body = `
    <p class="meta">${escapeHtml(formatApDate(createdAt))}.${escapeHtml(envNote)}${escapeHtml(short)}</p>
    <p class="counts">${escapeHtml(countLine(snapshot))}</p>
    ${seriesList('New series', snapshot.newSeries)}
    ${seriesList('Updated series', snapshot.updatedSeries)}
    ${characterNames('New characters', snapshot.newCharacters)}
    ${editionGallery('New editions', snapshot.newEditions)}
    ${editionGallery('Updated editions', snapshot.updatedEditions)}
  `
  return layout(`Content dump ${id}`, body)
}

function contestTile(entry: ContestEntry, label: string): string {
  const caption = `${entry.code} · E${entry.edition} · P${entry.number}`
  const submitter = entry.submitter
    ? `<span>User ID: ${escapeHtml(entry.submitter)}</span>`
    : ''
  return `<figure>
    <img src="${escapeHtml(entry.imageUrl)}" alt="${escapeHtml(label)}"${entry.imageUrl ? '' : ' hidden'}>
    <figcaption>
      <strong>${escapeHtml(label)}</strong>
      ${escapeHtml(caption)}
      ${submitter}
    </figcaption>
  </figure>`
}

export function renderContestHome(dumps: ListedContest[]): string {
  const body = dumps.length === 0
    ? '<p class="empty">No Card Hunt dumps yet.</p>'
    : `<div class="list">${dumps.map((dump) => {
      const href = dump.slug ? `/${dump.slug}` : `/contests/${dump.id}`
      return `<article class="card">
        <p class="meta">${escapeHtml(formatApDate(dump.createdAt))}</p>
        <h2><a href="${escapeHtml(href)}">Card Hunt #${dump.snapshot.eventCounter}</a></h2>
        <p class="counts">${dump.snapshot.entries.length} ${dump.snapshot.entries.length === 1 ? 'entry' : 'entries'}.</p>
      </article>`
    }).join('')}</div>`

  return layout(
    'Card Hunt results',
    `<p class="meta">Finished contests, newest first. <a href="/">Content dumps</a>.</p>${body}`
  )
}

export function renderContestDump(
  id: number,
  createdAt: number,
  snapshot: ContestSnapshot,
  slug: string | null
): string {
  const short = slug ? ` Short URL: /${slug}.` : ''
  const winners = snapshot.winners.length === 0
    ? ''
    : `<section>
        <h2>Winners</h2>
        <ul class="series-list">${snapshot.winners.map((winner) =>
          `<li>Place ${winner.place}: user ${escapeHtml(winner.userId)}, score ${escapeHtml(formatContestScore(winner.score))}, award ${winner.reward}</li>`
        ).join('')}</ul>
      </section>`
  const reference = snapshot.reference
    ? `<section>
        <h2>Reference card</h2>
        <div class="gallery">${contestTile(snapshot.reference, `Reference · ${formatContestScore(snapshot.reference.score)}`)}</div>
      </section>`
    : '<p class="empty">The reference card was not saved for this contest.</p>'
  const gallery = snapshot.entries.length === 0
    ? '<p class="empty">No entries.</p>'
    : `<div class="gallery">${snapshot.entries.map((row, index) =>
      contestTile(row, `#${index + 1} · ${formatContestScore(row.score)}`)
    ).join('')}</div>`

  const body = `
    <p class="meta">${escapeHtml(formatApDate(createdAt))}.${escapeHtml(short)}</p>
    <p class="counts">${snapshot.entries.length} ${snapshot.entries.length === 1 ? 'entry' : 'entries'} · Highest score first.</p>
    <section>
      <h2>Prompt</h2>
      <p class="meta" style="white-space:pre-wrap">${escapeHtml(snapshot.prompt || '(No prompt)')}</p>
    </section>
    ${winners}
    ${reference}
    <section>
      <h2>Results</h2>
      ${gallery}
    </section>
  `
  return layout(`Card Hunt #${snapshot.eventCounter}`, body)
}

export function renderNotFound(): string {
  return layout('Not found', '<p class="empty">That dump or short link does not exist.</p>')
}
