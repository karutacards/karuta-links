import { escapeHtml } from './escape'
import {
  MAX_CODE_COUNT,
  MAX_DATE_COUNT,
  MAX_ID_COUNT,
  MAX_NOTES_LENGTH,
  REPORT_REASON_COPY,
  REPORT_REASONS,
  EARLIEST_OFFENSE_DATE,
  emptyReportFields,
  utcDateString,
  type ReportFields
} from './report-validate'
import {
  REPORT_OG_ALT,
  REPORT_OG_CONTENT_TYPE,
  REPORT_OG_HEIGHT,
  REPORT_OG_URL,
  REPORT_OG_WIDTH
} from './report-og'

export const REPORT_EMBED_TITLE = 'Karuta report form'
export const REPORT_EMBED_DESCRIPTION =
  'Report cheating in Karuta. Share what happened and who or where we should look into. A false report is a permanent ban from this form.'
export const REPORT_FORM_LEDE =
  'Report cheating in Karuta. Share what happened and who or where we should look into. Required sections are marked with an asterisk.'

function headed(heading: string, rest: string, refreshTo?: string): string {
  return layout(
    `<p class="brand"><a href="https://karuta.com">Karuta</a></p>
    <h1>${escapeHtml(heading)}</h1>
    ${rest}`,
    refreshTo
  )
}

// TODO: Remove the ?v=badge og:image query after Discord's crawler shows the current thumbnail.
function layout(body: string, refreshTo?: string): string {
  const refresh = refreshTo
    ? `\n  <meta http-equiv="refresh" content="0;url=${escapeHtml(refreshTo)}">`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="description" content="${escapeHtml(REPORT_EMBED_DESCRIPTION)}">
  <meta property="og:title" content="${escapeHtml(REPORT_EMBED_TITLE)}">
  <meta property="og:description" content="${escapeHtml(REPORT_EMBED_DESCRIPTION)}">
  <meta property="og:image" content="${escapeHtml(`${REPORT_OG_URL}?v=badge`)}">
  <meta property="og:image:type" content="${escapeHtml(REPORT_OG_CONTENT_TYPE)}">
  <meta property="og:image:width" content="${REPORT_OG_WIDTH}">
  <meta property="og:image:height" content="${REPORT_OG_HEIGHT}">
  <meta property="og:image:alt" content="${escapeHtml(REPORT_OG_ALT)}">
  <meta name="twitter:card" content="summary">${refresh}
  <title>${escapeHtml(REPORT_EMBED_TITLE)}</title>
  <style>
    :root {
      color-scheme: dark;
      --night: #0b001c;
      --ink: #f4f2f8;
      --muted: #b8b0c6;
      --line: #3d3352;
      --field: rgba(11, 0, 28, 0.55);
      --karuta: #7187dd;
      --karuta-soft: rgba(113, 135, 221, 0.18);
      --warn: #e8b86d;
      --danger: #f0a0a8;
      --danger-bg: rgba(140, 40, 60, 0.28);
      --danger-line: #8c3a4a;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font: 1rem/1.5 Roboto, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #0b001c;
      background: linear-gradient(135deg, #0b001c 0%, #151330 40%, #23112b 60%, #0b001c 100%);
      background-attachment: fixed;
      color: var(--ink);
    }
    .page {
      width: min(46rem, calc(100% - 2rem));
      margin: 0 auto;
      padding:
        max(2.25rem, env(safe-area-inset-top, 0px))
        0
        max(3rem, env(safe-area-inset-bottom, 0px));
    }
    .brand {
      margin: 0 0 0.45rem;
      color: var(--karuta);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .brand a {
      color: inherit;
      text-decoration: none;
    }
    .brand a:focus-visible {
      outline: 2px solid var(--karuta);
      outline-offset: 2px;
    }
    h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--ink);
    }
    .lede { margin: 0.65rem 0 0; color: var(--muted); max-width: 34rem; }
    .error {
      margin: 1.15rem 0 0;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--danger-line);
      background: var(--danger-bg);
      color: var(--danger);
    }
    .form { margin: 1.75rem 0 0; }
    .block {
      margin: 0;
      padding: 1.5rem 0 0.25rem;
      border: 0;
      border-top: 1px solid var(--line);
    }
    .block:first-of-type { padding-top: 0; border-top: 0; }
    .block h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--ink);
    }
    abbr.req {
      color: var(--karuta);
      font-weight: 700;
      text-decoration: none;
      cursor: help;
    }
    .help { margin: 0.3rem 0 0.9rem; color: var(--muted); font-size: 0.95rem; }
    .hint {
      margin: 0.35rem 0 0;
      min-height: 1.25em;
      color: var(--karuta);
      font-size: 0.88rem;
    }
    .hint.is-warn { color: var(--warn); }
    .reasons { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
    .reason {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.2rem 0.75rem;
      align-items: start;
      padding: 0.7rem 0.75rem;
      border-left: 3px solid transparent;
      cursor: pointer;
    }
    .reason input { margin-top: 0.3rem; accent-color: var(--karuta); }
    .reason strong { color: var(--ink); }
    .reason em {
      display: block;
      margin-top: 0.15rem;
      color: var(--muted);
      font-style: normal;
      font-size: 0.92rem;
    }
    .reason:has(input:checked) {
      background: var(--karuta-soft);
      border-left-color: var(--karuta);
    }
    .reason:has(input:focus-visible) { outline: 2px solid var(--karuta); outline-offset: 2px; }
    .fields { display: grid; gap: 1rem; }
    .id-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 0.55rem;
      align-items: stretch;
    }
    .id-brace-col {
      display: grid;
      grid-template-columns: 0.75rem auto;
      align-items: center;
      column-gap: 0.4rem;
      margin-top: 1.4rem;
      margin-bottom: 1.55rem;
    }
    .id-brace {
      align-self: stretch;
      position: relative;
      border: 1.5px solid #f4f2f8;
      border-left: none;
      border-radius: 0 6px 6px 0;
    }
    .id-brace::after {
      content: "";
      position: absolute;
      left: 0;
      top: 50%;
      width: calc(100% + 0.4rem);
      border-top: 1.5px solid #f4f2f8;
    }
    .id-required-label {
      margin: 0;
      color: var(--muted);
      font-size: 0.82rem;
      line-height: 1.3;
      white-space: nowrap;
    }
    @media (max-width: 40rem) {
      .id-group { grid-template-columns: 1fr; }
      .id-brace-col {
        display: block;
        margin: 0.45rem 0 0;
      }
      .id-brace { display: none; }
      .id-required-label { white-space: normal; }
    }
    .field { display: grid; gap: 0.3rem; }
    .field-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.75rem;
    }
    .field label { font-size: 0.92rem; font-weight: 700; }
    .count {
      margin: 0;
      color: var(--muted);
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .count.is-warn { color: var(--warn); }
    textarea.codes {
      width: 100%;
      min-height: 3.4rem;
      padding: 0.5rem 0.6rem;
      border: 1px solid var(--line);
      border-radius: 0.35rem;
      background: var(--field);
      color: var(--ink);
      font: 0.875rem/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace;
      resize: vertical;
    }
    .notes-field, .dates-field {
      margin-top: 0.35rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
    }
    .date-add {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .date-add input[type="date"] {
      padding: 0.45rem 0.55rem;
      border: 1px solid var(--line);
      border-radius: 0.35rem;
      background: var(--field);
      color: var(--ink);
      font: 0.95rem/1.4 Roboto, "Segoe UI", sans-serif;
    }
    .date-add button {
      padding: 0.45rem 0.8rem;
      border: 0;
      border-radius: 0.35rem;
      background: var(--karuta);
      color: #fff;
      font: 700 0.92rem/1 Roboto, "Segoe UI", sans-serif;
      cursor: pointer;
    }
    .date-add button:focus-visible,
    .date-add input[type="date"]:focus {
      outline: 2px solid var(--karuta);
      outline-offset: 1px;
    }
    .date-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0.45rem 0 0;
      padding: 0;
      list-style: none;
    }
    .date-list:empty { display: none; }
    .date-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.55rem;
      border: 1px solid #4a5ea8;
      border-radius: 999px;
      background: var(--karuta-soft);
      font-size: 0.88rem;
    }
    .date-chip button {
      border: 0;
      background: transparent;
      color: var(--ink);
      font: 700 1rem/1 Roboto, "Segoe UI", sans-serif;
      cursor: pointer;
    }
    textarea.notes {
      width: 100%;
      min-height: 9rem;
      padding: 0.9rem 1rem;
      border: 1px solid #4a5ea8;
      border-radius: 0.5rem;
      background: rgba(21, 19, 48, 0.72);
      color: var(--ink);
      font: 1.05rem/1.55 Roboto, "Segoe UI", Helvetica, Arial, sans-serif;
      resize: vertical;
    }
    textarea:focus { outline: 2px solid var(--karuta); outline-offset: 1px; }
    .sign {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      align-items: start;
      padding: 0.9rem 1rem;
      background: var(--karuta-soft);
      border: 1px solid #4a5ea8;
      color: var(--ink);
    }
    .sign input { margin-top: 0.25rem; width: 1.1rem; height: 1.1rem; accent-color: var(--karuta); }
    .actions { margin: 1.25rem 0 0; display: grid; gap: 0.55rem; }
    .submit {
      justify-self: start;
      padding: 0.7rem 1.2rem;
      border: 0;
      border-radius: 0.35rem;
      background: var(--karuta);
      color: #fff;
      font: 700 1.05rem/1 Roboto, "Segoe UI", sans-serif;
      cursor: pointer;
    }
    .submit:disabled { background: #4a4e6a; color: #9aa0b8; cursor: not-allowed; }
    .submit:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    a.submit { display: inline-block; text-decoration: none; }
    .needed { margin: 0; color: var(--muted); font-size: 0.95rem; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .reason, .submit { transition: background-color 140ms ease, border-color 140ms ease; }
    }
  </style>
</head>
<body>
  <main class="page">${body}</main>
</body>
</html>`
}

function textarea(
  name: string,
  label: string,
  value: string,
  placeholder: string,
  hintId: string,
  max: number,
  describedBy?: string
): string {
  const described = describedBy ? ` aria-describedby="${describedBy}"` : ''
  return `<div class="field">
        <div class="field-head">
          <label for="${name}">${escapeHtml(label)}</label>
          <p class="count" id="${name}-count" aria-live="polite">0 / ${max}</p>
        </div>
        <textarea id="${name}" name="${name}" class="codes" placeholder="${escapeHtml(placeholder)}"${described}>${escapeHtml(value)}</textarea>
        <p class="hint" id="${hintId}" aria-live="polite"></p>
      </div>`
}

export const REPORT_OAUTH_START = '/api/auth/discord?next=/report'

export function renderReportStart(): string {
  return headed(
    'Report a player',
    `<p class="lede">${REPORT_FORM_LEDE}</p>
    <p class="actions"><a class="submit" href="${REPORT_OAUTH_START}">Continue to Discord.</a></p>`,
    REPORT_OAUTH_START
  )
}

export function renderReportForm(options: { error?: string; fields?: ReportFields } = {}): string {
  const fields = options.fields ?? emptyReportFields()
  const today = utcDateString()
  const error = options.error
    ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
    : ''
  const reasons = REPORT_REASONS.map((reason) => {
    const copy = REPORT_REASON_COPY[reason]
    const checked = fields.reason === reason ? ' checked' : ''
    return `<li>
          <label class="reason">
            <input type="radio" name="reason" value="${reason}" required${checked}>
            <span><strong>${escapeHtml(copy.label)}</strong><em>${escapeHtml(copy.help)}</em></span>
          </label>
        </li>`
  }).join('')
  const ackChecked = fields.acknowledged ? ' checked' : ''

  return headed('Report a player', `<p class="lede">${REPORT_FORM_LEDE}</p>
    ${error}
    <form class="form" id="report-form" method="post" action="/report" novalidate>
      <fieldset class="block">
        <legend class="visually-hidden">Why</legend>
        <h2>Why are you reporting? <abbr class="req" title="required">*</abbr></h2>
        <p class="help">Select the reportable offense. If reporting multiple offenses, split up the reports.</p>
        <ul class="reasons">${reasons}</ul>
      </fieldset>
      <fieldset class="block">
        <legend class="visually-hidden">Who or where</legend>
        <h2>Who or where should we look? <abbr class="req" title="required">*</abbr></h2>
        <p class="help">Add at least one Discord user, server, or channel ID. Each ID is a 17–19 digit snowflake. Turn on Developer Mode, then right-click the user, server, or channel and copy the ID. Separate several IDs with spaces or commas. Up to ${MAX_ID_COUNT} IDs in each field.</p>
        <div class="id-group">
          <div class="fields">
          ${textarea('user_ids', 'User IDs', fields.userIds, '135694375647838208', 'user-status', MAX_ID_COUNT, 'id-required')}
          ${textarea('server_ids', 'Server IDs', fields.serverIds, '135694375647838208', 'server-status', MAX_ID_COUNT, 'id-required')}
          ${textarea('channel_ids', 'Channel IDs', fields.channelIds, '135694375647838208', 'channel-status', MAX_ID_COUNT, 'id-required')}
          </div>
          <div class="id-brace-col">
            <div class="id-brace" aria-hidden="true"></div>
            <p class="id-required-label" id="id-required">At least one required</p>
          </div>
        </div>
      </fieldset>
      <fieldset class="block">
        <legend class="visually-hidden">Evidence</legend>
        <h2>What else helps?</h2>
        <p class="help">Card codes are 3–8 letters or numbers. Dye codes start with a dollar sign, then 2–8 letters or numbers. Idol codes start with an ampersand, then 2–8 letters or numbers. Separate several codes with spaces or commas. Up to ${MAX_CODE_COUNT} codes in each field.</p>
        <div class="fields">
          ${textarea('card_codes', 'Card codes', fields.cardCodes, 'a3f9k', 'card-status', MAX_CODE_COUNT)}
          ${textarea('dye_codes', 'Dye codes', fields.dyeCodes, `${String.fromCharCode(36)}b2x4`, 'dye-status', MAX_CODE_COUNT)}
          ${textarea('idol_codes', 'Idol codes', fields.idolCodes, '&m7q', 'idol-status', MAX_CODE_COUNT)}
        </div>
        <div class="field dates-field">
          <div class="field-head">
            <label for="date-pick">Dates</label>
            <p class="count" id="date-count" aria-live="polite">0 / ${MAX_DATE_COUNT}</p>
          </div>
          <p class="help">Dates related to the offending behavior. Add up to ${MAX_DATE_COUNT}.</p>
          <div class="date-add">
            <input type="date" id="date-pick" min="${EARLIEST_OFFENSE_DATE}" max="${today}">
            <button type="button" id="date-add">Add date</button>
          </div>
          <p class="hint" id="date-status" aria-live="polite"></p>
          <ul class="date-list" id="date-list"></ul>
          <input type="hidden" name="offense_dates" id="offense_dates" value="${escapeHtml(fields.offenseDates)}">
        </div>
        <div class="field notes-field">
          <div class="field-head">
            <label for="notes">Notes</label>
            <p class="count" id="notes-count" aria-live="polite">0 / ${MAX_NOTES_LENGTH}</p>
          </div>
          <p class="help">Any additional context that your report requires. Please try to be clear and concise. ${MAX_NOTES_LENGTH} characters or fewer.</p>
          <textarea id="notes" name="notes" class="notes" maxlength="${MAX_NOTES_LENGTH}" placeholder="What should we check?">${escapeHtml(fields.notes)}</textarea>
        </div>
      </fieldset>
      <fieldset class="block">
        <legend class="visually-hidden">Confirm</legend>
        <h2>Sign this report <abbr class="req" title="required">*</abbr></h2>
        <p class="help">A false report is a permanent ban from this form, the support server and later resources.</p>
        <label class="sign">
          <input type="checkbox" name="acknowledged" value="on" required${ackChecked}>
          <span>I understand that falsely reporting a player will result in a permanent ban from the report form, the support server, and any future resources.</span>
        </label>
        <div class="actions">
          <button class="submit" id="report-submit" type="submit">Submit report</button>
          <p class="needed" id="needed" aria-live="polite"></p>
        </div>
      </fieldset>
    </form>
    <script>
      (function () {
        var form = document.getElementById('report-form');
        var submit = document.getElementById('report-submit');
        var needed = document.getElementById('needed');
        if (!form || !submit || !needed) return;
        var dollar = String.fromCharCode(36);
        var amp = String.fromCharCode(38);
        var body = /^[a-zA-Z0-9]+$/;
        function isSnowflake(value) {
          return /^[0-9]{17,19}$/.test(value);
        }
        function isCard(value) {
          return body.test(value) && value.length >= 3 && value.length <= 8;
        }
        function isDye(value) {
          return value.charAt(0) === dollar && body.test(value.slice(1)) && value.length >= 3 && value.length <= 9;
        }
        function isIdol(value) {
          return value.charAt(0) === amp && body.test(value.slice(1)) && value.length >= 3 && value.length <= 9;
        }
        var maxIds = ${MAX_ID_COUNT};
        var maxCodes = ${MAX_CODE_COUNT};
        var maxNotes = ${MAX_NOTES_LENGTH};
        function tokens(value) {
          return String(value || '').split(/[\\s,]+/).map(function (token) {
            return token.replace(/^\\s+|\\s+$/g, '');
          }).filter(Boolean);
        }
        function uniqueTokens(list, fold) {
          var seen = {};
          var out = [];
          list.forEach(function (token) {
            var key = fold ? token.toLowerCase() : token;
            if (seen[key]) return;
            seen[key] = true;
            out.push(token);
          });
          return out;
        }
        function fieldTokens(name) {
          return tokens(form.elements[name] && form.elements[name].value);
        }
        function setHint(id, text, warn) {
          var node = document.getElementById(id);
          if (!node) return;
          node.className = warn ? 'hint is-warn' : 'hint';
          node.textContent = text;
        }
        function setCount(id, used, max) {
          var node = document.getElementById(id);
          if (!node) return;
          node.className = used > max ? 'count is-warn' : 'count';
          node.textContent = used + ' / ' + max;
        }
        function review(name, hintId, max, check, emptyText, okOne, okMany, badText, noun, fold) {
          var list = uniqueTokens(fieldTokens(name), fold);
          var good = 0;
          var bad = 0;
          list.forEach(function (token) {
            if (check(token)) good += 1;
            else bad += 1;
          });
          setCount(name + '-count', list.length, max);
          if (!list.length) setHint(hintId, emptyText, false);
          else if (bad) setHint(hintId, badText, true);
          else if (list.length > max) setHint(hintId, 'Enter no more than ' + max + ' ' + noun + '.', true);
          else setHint(hintId, good === 1 ? okOne : good + ' ' + okMany, false);
          return { good: good, bad: bad, over: list.length > max };
        }
        function gaps() {
          var missing = [];
          if (!form.querySelector('input[name="reason"]:checked')) missing.push('a reason');
          var users = review(
            'user_ids', 'user-status', maxIds, isSnowflake,
            'Copy User ID from Discord Developer Mode.',
            '1 user ID recognized.', 'user IDs recognized.',
            'Each user ID must be a Discord snowflake (17–19 digits).',
            'user IDs', false
          );
          var servers = review(
            'server_ids', 'server-status', maxIds, isSnowflake,
            'Copy Server ID from the server icon menu.',
            '1 server ID recognized.', 'server IDs recognized.',
            'Each server ID must be a Discord snowflake (17–19 digits).',
            'server IDs', false
          );
          var channels = review(
            'channel_ids', 'channel-status', maxIds, isSnowflake,
            'Copy Channel ID from the channel menu.',
            '1 channel ID recognized.', 'channel IDs recognized.',
            'Each channel ID must be a Discord snowflake (17–19 digits).',
            'channel IDs', false
          );
          var cards = review(
            'card_codes', 'card-status', maxCodes, isCard,
            '3–8 letters or numbers, such as a3f9k.',
            '1 card code recognized.', 'card codes recognized.',
            'Each card code must be 3–8 letters or numbers.',
            'card codes', true
          );
          var dyes = review(
            'dye_codes', 'dye-status', maxCodes, isDye,
            'A dollar sign, then 2–8 letters or numbers.',
            '1 dye code recognized.', 'dye codes recognized.',
            'Each dye code must start with a dollar sign followed by 2–8 letters or numbers.',
            'dye codes', true
          );
          var idols = review(
            'idol_codes', 'idol-status', maxCodes, isIdol,
            'An ampersand, then 2–8 letters or numbers.',
            '1 Idol code recognized.', 'Idol codes recognized.',
            'Each Idol code must start with an ampersand followed by 2–8 letters or numbers.',
            'Idol codes', true
          );
          if (!users.good && !servers.good && !channels.good) {
            missing.push('a user, server, or channel ID');
          }
          if (users.bad || servers.bad || channels.bad) missing.push('valid Discord IDs');
          if (users.over || servers.over || channels.over) missing.push(maxIds + ' or fewer IDs in each field');
          if (cards.bad || dyes.bad || idols.bad) missing.push('valid Karuta codes');
          if (cards.over || dyes.over || idols.over) missing.push(maxCodes + ' or fewer codes in each field');
          if (!form.elements.acknowledged || !form.elements.acknowledged.checked) {
            missing.push('the signature');
          }
          return missing;
        }
        function joinList(items) {
          if (items.length === 1) return items[0];
          return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
        }
        function sync() {
          var missing = gaps();
          var notes = form.elements.notes;
          setCount('notes-count', notes ? notes.value.length : 0, maxNotes);
          submit.disabled = missing.length > 0;
          needed.textContent = missing.length
            ? 'Still needed: ' + joinList(missing) + '.'
            : 'Ready to submit.';
        }
        var datePick = document.getElementById('date-pick');
        var dateAdd = document.getElementById('date-add');
        var dateList = document.getElementById('date-list');
        var dateHidden = document.getElementById('offense_dates');
        var maxDates = ${MAX_DATE_COUNT};
        var todayLimit = datePick && datePick.getAttribute('max');
        var earliest = datePick && datePick.getAttribute('min');
        function dateTokens() {
          return String(dateHidden && dateHidden.value || '').split(/[\\s,]+/).filter(Boolean);
        }
        function isListedDate(value) {
          if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
          var year = Number(value.slice(0, 4));
          var month = Number(value.slice(5, 7));
          var day = Number(value.slice(8, 10));
          var date = new Date(Date.UTC(year, month - 1, day));
          if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            return false;
          }
          if (earliest && value < earliest) return false;
          return !todayLimit || value <= todayLimit;
        }
        function writeDates(values) {
          values.sort();
          if (dateHidden) dateHidden.value = values.join(',');
          if (!dateList) return;
          dateList.textContent = '';
          values.forEach(function (value) {
            var item = document.createElement('li');
            item.className = 'date-chip';
            var label = document.createElement('span');
            label.textContent = value;
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove ' + value);
            remove.textContent = '\\u00d7';
            remove.addEventListener('click', function () {
              writeDates(dateTokens().filter(function (token) { return token !== value; }));
              setHint('date-status', '', false);
            });
            item.appendChild(label);
            item.appendChild(remove);
            dateList.appendChild(item);
          });
          setCount('date-count', values.length, maxDates);
        }
        function addDate() {
          var value = datePick && datePick.value;
          if (!value) {
            setHint('date-status', 'Choose a date first.', true);
            return;
          }
          if (!isListedDate(value)) {
            setHint('date-status', 'Each date must be a real calendar day from Nov. 24, 2019, through today.', true);
            return;
          }
          var values = dateTokens();
          if (values.indexOf(value) >= 0) {
            setHint('date-status', 'That date is already listed.', true);
            return;
          }
          if (values.length >= maxDates) {
            setHint('date-status', 'Enter no more than ' + maxDates + ' dates.', true);
            return;
          }
          values.push(value);
          writeDates(values);
          if (datePick) datePick.value = '';
          setHint('date-status', values.length === 1 ? '1 date added.' : values.length + ' dates added.', false);
        }
        if (dateAdd) dateAdd.addEventListener('click', addDate);
        if (datePick) {
          datePick.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
              event.preventDefault();
              addDate();
            }
          });
        }
        writeDates(dateTokens());
        form.addEventListener('input', sync);
        form.addEventListener('change', sync);
        form.addEventListener('submit', function (event) {
          if (gaps().length) event.preventDefault();
        });
        sync();
      })();
    </script>`)
}

export function renderReportThanks(): string {
  return headed(
    'Report submitted',
    `<p class="lede">Your report has been received. We will review it when we have time.</p>
    <p class="actions"><a class="submit" href="/report">Back to the form</a></p>`
  )
}

export function renderReportForbidden(message: string): string {
  return headed('Access denied', `<p class="lede">${escapeHtml(message)}</p>`)
}

export function renderReportUnavailable(): string {
  return headed('Unavailable', `<p class="lede">Report access could not be verified.</p>`)
}

export function renderReportRateLimited(): string {
  return headed(
    'Too many reports',
    `<p class="error" role="alert">You have submitted too many reports in a short timeframe.</p>`
  )
}
