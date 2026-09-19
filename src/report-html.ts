import { escapeHtml } from './escape'
import {
  MAX_NOTES_LENGTH,
  REPORT_REASON_COPY,
  REPORT_REASONS,
  type ReportFields
} from './report-validate'

function layout(title: string, body: string): string {
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
      width: min(40rem, calc(100% - 2rem));
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
    .field { display: grid; gap: 0.3rem; }
    .field label { font-size: 0.92rem; font-weight: 700; }
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
    .notes-field {
      margin-top: 0.35rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
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
  hintId: string
): string {
  return `<div class="field">
        <label for="${name}">${escapeHtml(label)}</label>
        <textarea id="${name}" name="${name}" class="codes" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
        <p class="hint" id="${hintId}" aria-live="polite"></p>
      </div>`
}

function emptyFields(): ReportFields {
  return {
    reason: '',
    userIds: '',
    serverIds: '',
    channelIds: '',
    cardCodes: '',
    dyeCodes: '',
    idolCodes: '',
    notes: '',
    acknowledged: false
  }
}

export function renderReportForm(options: { error?: string; fields?: ReportFields } = {}): string {
  const fields = options.fields ?? emptyFields()
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

  return layout('Karuta report', `<p class="brand">Karuta</p>
    <h1>Report a player</h1>
    <p class="lede">Report cheating in Karuta. Say what happened and who or where we should look. Required sections are marked with an asterisk.</p>
    ${error}
    <form class="form" id="report-form" method="post" action="/report" novalidate>
      <fieldset class="block">
        <legend class="visually-hidden">Why</legend>
        <h2>Why are you reporting? <abbr class="req" title="required">*</abbr></h2>
        <p class="help">Pick the closest match. One reason only.</p>
        <ul class="reasons">${reasons}</ul>
      </fieldset>
      <fieldset class="block">
        <legend class="visually-hidden">Who or where</legend>
        <h2>Who or where should we look? <abbr class="req" title="required">*</abbr></h2>
        <p class="help">Add at least one Discord user, server, or channel ID. Each ID is a 17–19 digit snowflake. Turn on Developer Mode, then right-click the user, server, or channel and copy the ID. Separate several IDs with spaces or commas.</p>
        <div class="fields">
          ${textarea('user_ids', 'User IDs', fields.userIds, '135694375647838208', 'user-status')}
          ${textarea('server_ids', 'Server IDs', fields.serverIds, '135694375647838208', 'server-status')}
          ${textarea('channel_ids', 'Channel IDs', fields.channelIds, '135694375647838208', 'channel-status')}
        </div>
      </fieldset>
      <fieldset class="block">
        <legend class="visually-hidden">Evidence</legend>
        <h2>What else helps?</h2>
        <p class="help">Card codes are 3–8 letters or numbers. Dye codes start with a dollar sign, then 2–8 letters or numbers. Idol codes start with an ampersand, then 2–8 letters or numbers.</p>
        <div class="fields">
          ${textarea('card_codes', 'Card codes', fields.cardCodes, 'a3f9k', 'card-status')}
          ${textarea('dye_codes', 'Dye codes', fields.dyeCodes, `${String.fromCharCode(36)}b2x4`, 'dye-status')}
          ${textarea('idol_codes', 'Idol codes', fields.idolCodes, '&m7q', 'idol-status')}
        </div>
        <div class="field notes-field">
          <label for="notes">Notes</label>
          <p class="help">Write anything the IDs and codes do not capture.</p>
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
        function tokens(value) {
          return String(value || '').split(/[\\s,]+/).map(function (token) {
            return token.replace(/^\\s+|\\s+$/g, '');
          }).filter(Boolean);
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
        function review(name, hintId, check, emptyText, okOne, okMany, badText) {
          var list = fieldTokens(name);
          var good = 0;
          var bad = 0;
          list.forEach(function (token) {
            if (check(token)) good += 1;
            else bad += 1;
          });
          if (!list.length) setHint(hintId, emptyText, false);
          else if (bad) setHint(hintId, badText, true);
          else setHint(hintId, good === 1 ? okOne : good + ' ' + okMany, false);
          return { good: good, bad: bad };
        }
        function gaps() {
          var missing = [];
          if (!form.querySelector('input[name="reason"]:checked')) missing.push('a reason');
          var users = review(
            'user_ids', 'user-status', isSnowflake,
            'Copy User ID from Discord Developer Mode.',
            '1 user ID recognized.', 'user IDs recognized.',
            'Each user ID must be a Discord snowflake (17–19 digits).'
          );
          var servers = review(
            'server_ids', 'server-status', isSnowflake,
            'Copy Server ID from the server icon menu.',
            '1 server ID recognized.', 'server IDs recognized.',
            'Each server ID must be a Discord snowflake (17–19 digits).'
          );
          var channels = review(
            'channel_ids', 'channel-status', isSnowflake,
            'Copy Channel ID from the channel menu.',
            '1 channel ID recognized.', 'channel IDs recognized.',
            'Each channel ID must be a Discord snowflake (17–19 digits).'
          );
          var cards = review(
            'card_codes', 'card-status', isCard,
            '3–8 letters or numbers, such as a3f9k.',
            '1 card code recognized.', 'card codes recognized.',
            'Each card code must be 3–8 letters or numbers.'
          );
          var dyes = review(
            'dye_codes', 'dye-status', isDye,
            'A dollar sign, then 2–8 letters or numbers.',
            '1 dye code recognized.', 'dye codes recognized.',
            'Each dye code must start with a dollar sign followed by 2–8 letters or numbers.'
          );
          var idols = review(
            'idol_codes', 'idol-status', isIdol,
            'An ampersand, then 2–8 letters or numbers.',
            '1 Idol code recognized.', 'Idol codes recognized.',
            'Each Idol code must start with an ampersand followed by 2–8 letters or numbers.'
          );
          if (!users.good && !servers.good && !channels.good) {
            missing.push('a user, server, or channel ID');
          }
          if (users.bad || servers.bad || channels.bad) missing.push('valid Discord IDs');
          if (cards.bad || dyes.bad || idols.bad) missing.push('valid Karuta codes');
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
          submit.disabled = missing.length > 0;
          needed.textContent = missing.length
            ? 'Still needed: ' + joinList(missing)
            : 'Ready to submit.';
        }
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
  return layout(
    'Report submitted',
    `<p class="brand">Karuta</p>
    <h1>We have the report.</h1>
    <p class="lede">Your report was submitted. We will review it.</p>`
  )
}

export function renderReportForbidden(message: string): string {
  return layout(
    'Report unavailable',
    `<p class="brand">Karuta</p>
    <h1>This form is closed for you.</h1>
    <p class="lede">${escapeHtml(message)}</p>`
  )
}

export function renderReportUnavailable(): string {
  return renderReportForbidden('Report access could not be verified.')
}

export function renderReportRateLimited(): string {
  return layout(
    'Too many reports',
    `<p class="brand">Karuta</p>
    <h1>Too many reports today.</h1>
    <p class="error" role="alert">You have submitted too many reports. Try again later.</p>`
  )
}
