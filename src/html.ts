import { formatContestScore } from './contest'
import { escapeHtml } from './escape'
import { dumpCounts } from './ingest'
import type {
  CharacterAliasRecord,
  ContentSnapshot,
  ContestEntry,
  ContestSnapshot,
  ContestWinner,
  EditionRecord,
  ListedContest,
  ListedDump,
  SeriesAliasRecord,
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

function layout(
  title: string,
  body: string,
  options: { description?: string; environment?: string } = {}
): string {
  const { description, environment } = options
  const descriptionTags = description
    ? `
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">`
    : ''
  const environmentMark = environment
    ? `<p class="environment">${escapeHtml(environment)}</p>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${descriptionTags}
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
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.5rem 0 1rem;
      border-bottom: 1px solid var(--line);
    }
    header .brand { min-width: 0; }
    header .brand h1 { margin: 0.35rem 0 0; }
    header .environment {
      margin: 0;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
    }
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
    .copy { white-space: pre-wrap; color: var(--muted); }
    .winners {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }
    .winner {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem 1.1rem;
    }
    .winner .place { margin: 0; font-weight: 600; }
    .winner .meta { margin: 0.35rem 0 0; }
    .user-id {
      display: block;
      margin: 0.35rem 0 0;
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      color: var(--accent);
    }
    .gallery { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    figure img { width: 100%; aspect-ratio: 520 / 720; object-fit: cover; display: block; background: #0d0f14; }
    figcaption { padding: 0.7rem 0.8rem 0.9rem; font-size: 0.92rem; }
    figcaption strong { display: block; }
    figcaption .series { display: block; color: var(--muted); }
    figcaption .edition {
      display: block;
      margin-top: 0.45rem;
      color: var(--accent);
      font-size: 0.8rem;
      letter-spacing: 0.06em;
    }
    .series-list { columns: 2; gap: 1.5rem; }
    @media (max-width: 720px) { .series-list { columns: 1; } }
    .series-list li { break-inside: avoid; margin: 0 0 0.35rem; }
    main > section + section { margin-top: 2.5rem; }
    main > section > h2 { margin: 0 0 0.85rem; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <p class="kicker"><a href="/">krta.cc</a></p>
      <h1>${escapeHtml(title)}</h1>
    </div>
    ${environmentMark}
  </header>
  <main>
    ${body}
  </main>
  <footer>Card art belongs to its owners.</footer>
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
      : '',
    counts.newSeriesAliases
      ? `${counts.newSeriesAliases} series with new aliases`
      : '',
    counts.newCharacterAliases
      ? `${counts.newCharacterAliases} ${counts.newCharacterAliases === 1 ? 'character' : 'characters'} with new aliases`
      : ''
  ].filter(Boolean)
  return parts.join(', ')
}

function countDescription(snapshot: ContentSnapshot): string {
  const line = countLine(snapshot)
  return line ? `${line}.` : ''
}

function moneyAmount(amount: number, currency: string | null): string {
  const formatted = amount.toLocaleString('en-US')
  if (!currency) {
    return formatted
  }
  const unit = currency === 'ticket' && amount !== 1 ? 'tickets' : currency
  return `${formatted} ${unit}`
}

function contestDescription(snapshot: ContestSnapshot): string {
  const winners = snapshot.winners.length
  const entries = snapshot.entries.length
  const counts = `${winners} ${winners === 1 ? 'winner' : 'winners'}, ${entries} ${entries === 1 ? 'entry' : 'entries'}.`
  const fees: string[] = []
  if (snapshot.buyInPrice !== null) {
    fees.push(`${moneyAmount(snapshot.buyInPrice, snapshot.currency)} entry fee`)
  }
  if (snapshot.prizePool !== null) {
    fees.push(`${moneyAmount(snapshot.prizePool, snapshot.currency)} prize pool`)
  }
  return fees.length === 0 ? counts : `${counts} ${fees.join(', ')}.`
}

function dumpByline(createdAt: number, slug: string | null, notes: string[] = []): string {
  const lines = [
    `<p class="meta">${escapeHtml(formatApDate(createdAt))}</p>`,
    ...notes.map((note) => `<p class="meta">${escapeHtml(note)}</p>`)
  ]
  if (slug) {
    lines.push(
      `<p class="meta"><a href="/${escapeHtml(slug)}">${escapeHtml(`krta.cc/${slug}`)}</a></p>`
    )
  }
  return lines.join('\n    ')
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
        <span class="series">${escapeHtml(row.seriesName)}</span>
        <span class="edition">Edition ${escapeHtml(edition.edition)}</span>
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

function aliasLine(name: string, aliases: string[]): string {
  return `${escapeHtml(name)}: ${escapeHtml(aliases.join(', '))}`
}

function aliasLists(
  seriesRows: SeriesAliasRecord[],
  characterRows: CharacterAliasRecord[]
): string {
  if (seriesRows.length === 0 && characterRows.length === 0) {
    return ''
  }
  const seriesItems = seriesRows
    .map((row) => `<li>${aliasLine(row.name, row.aliases)}</li>`)
    .join('')
  const characterItems = characterRows
    .map((row) => `<li>${aliasLine(`${row.name} (${row.seriesName})`, row.aliases)}</li>`)
    .join('')
  return `<section>
    <h2>New aliases</h2>
    <ul class="series-list">${seriesItems}${characterItems}</ul>
  </section>`
}

function draftCards(dumps: ListedDump[]): string {
  if (dumps.length === 0) {
    return '<p class="empty">No content drafts yet.</p>'
  }
  return `<div class="list">${dumps.map((dump) => {
    const href = dump.slug ? `/${dump.slug}` : `/content/${dump.id}`
    return `<article class="card">
        <p class="meta">${escapeHtml(formatApDate(dump.createdAt))}</p>
        <h3><a href="${escapeHtml(href)}">Content draft ${dump.id}</a></h3>
        <p class="counts">${escapeHtml(countDescription(dump.snapshot))}</p>
      </article>`
  }).join('')}</div>`
}

function resultCards(dumps: ListedContest[]): string {
  if (dumps.length === 0) {
    return '<p class="empty">No contest results yet.</p>'
  }
  return `<div class="list">${dumps.map((dump) => {
    const href = dump.slug ? `/${dump.slug}` : `/contests/${dump.id}`
    return `<article class="card">
        <p class="meta">${escapeHtml(formatApDate(dump.createdAt))}</p>
        <h3><a href="${escapeHtml(href)}">Card Hunt #${dump.snapshot.eventCounter}</a></h3>
        <p class="counts">${escapeHtml(contestDescription(dump.snapshot))}</p>
      </article>`
  }).join('')}</div>`
}

export function renderHome(drafts: ListedDump[], results: ListedContest[]): string {
  return layout(
    'Karuta dumps',
    `<p class="meta">Dumps of published drafts and contest results.</p>
    <section>
      <h2>Content drafts</h2>
      ${draftCards(drafts)}
    </section>
    <section>
      <h2>Contest results</h2>
      ${resultCards(results)}
    </section>`,
    { description: 'Dumps of published drafts and contest results.' }
  )
}

export function renderContentDump(
  id: number,
  createdAt: number,
  snapshot: ContentSnapshot,
  slug: string | null
): string {
  const description = countDescription(snapshot)
  const environment = snapshot.environment !== 'production'
    ? `${snapshot.environment.charAt(0).toUpperCase()}${snapshot.environment.slice(1)}`
    : undefined
  const body = `
    ${description ? `<p class="meta">${escapeHtml(description)}</p>` : ''}
    ${dumpByline(createdAt, slug)}
    ${seriesList('New series', snapshot.newSeries)}
    ${seriesList('Updated series', snapshot.updatedSeries)}
    ${characterNames('New characters', snapshot.newCharacters)}
    ${aliasLists(snapshot.newSeriesAliases ?? [], snapshot.newCharacterAliases ?? [])}
    ${editionGallery('New editions', snapshot.newEditions)}
    ${editionGallery('Updated editions', snapshot.updatedEditions)}
  `
  return layout(`Content draft ${id}`, body, {
    description: description || undefined,
    environment
  })
}

function winnerList(winners: ContestWinner[]): string {
  if (winners.length === 0) {
    return ''
  }
  const items = winners.map((winner) => `<li class="winner">
      <p class="place">Place ${winner.place}</p>
      <p class="user-id">${escapeHtml(winner.userId)}</p>
      <p class="meta">${escapeHtml(formatContestScore(winner.score))} · Award ${winner.reward}</p>
    </li>`).join('')
  return `<section>
    <h2>Winners</h2>
    <ol class="winners">${items}</ol>
  </section>`
}

function contestTile(entry: ContestEntry, label: string): string {
  const caption = `${entry.code} · E${entry.edition} · P${entry.number}`
  const submitter = entry.submitter
    ? `<span class="user-id">${escapeHtml(entry.submitter)}</span>`
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
    ? '<p class="empty">No contest results yet.</p>'
    : `<div class="list">${dumps.map((dump) => {
      const href = dump.slug ? `/${dump.slug}` : `/contests/${dump.id}`
      return `<article class="card">
        <p class="meta">${escapeHtml(formatApDate(dump.createdAt))}</p>
        <h2><a href="${escapeHtml(href)}">Card Hunt #${dump.snapshot.eventCounter}</a></h2>
        <p class="counts">${escapeHtml(contestDescription(dump.snapshot))}</p>
      </article>`
    }).join('')}</div>`

  return layout(
    'Contest results',
    `<p class="meta">Finished contests, newest first. <a href="/">Karuta dumps</a>.</p>${body}`,
    { description: 'Finished contests, newest first.' }
  )
}

export function renderContestDump(
  id: number,
  createdAt: number,
  snapshot: ContestSnapshot,
  slug: string | null
): string {
  const winners = winnerList(snapshot.winners)
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

  const entryLine = contestDescription(snapshot)
  const body = `
    <p class="meta">${escapeHtml(entryLine)}</p>
    ${dumpByline(createdAt, slug)}
    <section>
      <h2>Description</h2>
      <p class="copy">${escapeHtml(snapshot.description || '(No description).')}</p>
    </section>
    ${winners}
    ${reference}
    <section>
      <h2>Results</h2>
      <p class="meta">Highest score first.</p>
      ${gallery}
    </section>
  `
  return layout(`Card Hunt #${snapshot.eventCounter}`, body, { description: entryLine })
}

export function renderNotFound(): string {
  return layout('Not found', '<p class="empty">That dump or short link does not exist.</p>')
}
