import { DRAFT_FONT_CODE_POINTS } from './draft-glyphs'
import { rebaseDraftPending } from './draft-rebase'
import { groupDraftActivity, lastEventIdForSave, liveActivityIds } from './draft-restore'

export const DRAFT_CLIENT_SCRIPT = 'var FONT_CODE_POINTS = ' + JSON.stringify(DRAFT_FONT_CODE_POINTS) + ';\nvar rebaseDraftPending = ' + rebaseDraftPending.toString() + ';\nvar lastEventIdForSave = ' + lastEventIdForSave.toString() + ';\nvar groupDraftActivity = ' + groupDraftActivity.toString() + ';\nvar liveActivityIds = ' + liveActivityIds.toString() + ';\n' + `
var MAX_NAME = 200;
var MAX_ALIAS = 200;
var FONT_GLYPHS = {};
FONT_CODE_POINTS.forEach(function (code) {
  FONT_GLYPHS[String.fromCodePoint(code)] = true;
});
function keepDraftFontText(value) {
  var text = String(value || '').normalize('NFC');
  var next = '';
  for (var i = 0; i < text.length; ) {
    var point = text.codePointAt(i);
    var ch = String.fromCodePoint(point);
    i += ch.length;
    if (FONT_GLYPHS[ch]) next += ch;
  }
  return next;
}
function draftFontError(value, kind) {
  var text = String(value || '').normalize('NFC');
  if (text.indexOf('  ') !== -1) {
    return kind === 'alias'
      ? 'An alias cannot contain repeated spaces.'
      : 'Name cannot contain repeated spaces.';
  }
  for (var i = 0; i < text.length; ) {
    var point = text.codePointAt(i);
    var ch = String.fromCodePoint(point);
    i += ch.length;
    if (!FONT_GLYPHS[ch]) {
      return kind === 'alias'
        ? 'An alias contains characters the Karuta font cannot display.'
        : 'Name contains characters the Karuta font cannot display.';
    }
  }
  return '';
}
function showStatus(el, message, isError) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = 'banner ' + (isError === 'warn' ? 'warn' : (isError ? 'error' : 'ok'));
}
function draftKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .join('-');
}
function seriesOnDraft(label, series) {
  var trimmed = String(label || '').trim();
  if (!trimmed) return false;
  var slug = draftKey(trimmed);
  var rows = series || [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === trimmed || rows[i].key === slug) return true;
    if (String(rows[i].name || '').toLowerCase() === trimmed.toLowerCase()) return true;
    if (slug && draftKey(rows[i].name) === slug) return true;
  }
  return false;
}
function seriesHintText() {
  return 'This series is not on this draft. Confirm it matches the exact name in Karuta. It will be treated as an update.';
}
function aliasEditorHtml() {
  return '<div class="aliases">' +
    '<input data-alias-input aria-label="Add alias" autocomplete="off" maxlength="200">' +
    '<ul class="alias-list" data-alias-list></ul>' +
  '</div>';
}
function aliasKey(value) {
  return String(value || '').trim().toLowerCase();
}
function collectAliases(root) {
  if (!root) return [];
  lockPendingAlias(root);
  var values = [];
  var seen = {};
  root.querySelectorAll('[data-alias]').forEach(function (node) {
    if (aliasChipRemoved(node)) return;
    var alias = node.getAttribute('data-alias') || '';
    var key = aliasKey(alias);
    if (!key || seen[key]) return;
    seen[key] = true;
    values.push(alias);
  });
  return values;
}
function aliasChipRemoved(node) {
  if (!node) return false;
  return node.hasAttribute('data-alias-removed') || node.classList.contains('removed');
}
function restoreAliasChip(node) {
  var chip = node && node.hasAttribute('data-alias-remove')
    ? node
    : (node ? node.querySelector('[data-alias-remove]') : null);
  var item = node ? node.closest('li') : null;
  if (item) item.classList.remove('removed');
  if (!chip) return;
  chip.classList.remove('removed');
  chip.removeAttribute('data-alias-removed');
  chip.setAttribute('aria-label', 'Remove alias ' + (chip.getAttribute('data-alias') || ''));
  if (document.activeElement === chip) chip.blur();
}
function markAliasRemoved(chip) {
  var item = chip.closest('li');
  if (item) item.classList.add('removed');
  chip.classList.add('removed');
  chip.setAttribute('data-alias-removed', '1');
  chip.setAttribute('aria-label', 'Restore alias ' + (chip.getAttribute('data-alias') || ''));
}
function addAliasChip(list, raw, status, removable) {
  var alias = String(raw || '').trim();
  if (!alias) return false;
  if (alias.length > MAX_ALIAS) {
    showStatus(status, 'An alias is too long.', true);
    return false;
  }
  var aliasFont = draftFontError(alias, 'alias');
  if (aliasFont) {
    showStatus(status, aliasFont, true);
    return false;
  }
  if (alias.indexOf('|') !== -1) {
    showStatus(status, 'An alias cannot contain |.', true);
    return false;
  }
  var exists = false;
  var restored = false;
  list.querySelectorAll('[data-alias]').forEach(function (node) {
    if (aliasKey(node.getAttribute('data-alias')) !== aliasKey(alias)) return;
    if (aliasChipRemoved(node) || aliasChipRemoved(node.closest('li'))) {
      restoreAliasChip(node);
      restored = true;
      return;
    }
    exists = true;
  });
  if (restored) return true;
  if (exists) return false;
  var item = document.createElement('li');
  if (removable === false) {
    item.className = 'alias-chip';
    item.setAttribute('data-alias', alias);
    item.title = alias;
    var frozen = document.createElement('span');
    frozen.className = 'alias-label';
    frozen.textContent = alias;
    item.append(frozen);
    list.append(item);
    return true;
  }
  var chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'alias-chip';
  chip.setAttribute('data-alias', alias);
  chip.setAttribute('data-alias-remove', '1');
  chip.setAttribute('aria-label', 'Remove alias ' + alias);
  chip.title = alias;
  var text = document.createElement('span');
  text.className = 'alias-label';
  text.textContent = alias;
  var mark = document.createElement('span');
  mark.className = 'alias-x';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '\u00d7';
  chip.append(text, mark);
  item.append(chip);
  list.append(item);
  return true;
}
function lockPendingAlias(root, status) {
  var input = root.querySelector('[data-alias-input]');
  var list = root.querySelector('[data-alias-list]');
  if (!input || !list || !input.value.trim()) return;
  if (addAliasChip(list, input.value, status)) input.value = '';
}
function discordHandle(name) {
  var raw = String(name || '').trim();
  if (!raw) return '';
  return raw.charAt(0) === '@' ? raw : '@' + raw;
}
function mentionNode(name) {
  var span = document.createElement('span');
  span.className = 'mention';
  span.textContent = discordHandle(name);
  return span;
}
function fillLastEdited(root, name) {
  var line = root.querySelector('[data-last-edit]');
  if (!line) return;
  line.replaceChildren();
  if (!name) {
    line.textContent = 'No edits yet.';
    return;
  }
  line.append(mentionNode(name));
}
function seriesDisplay(seriesKey, series) {
  var key = String(seriesKey || '');
  var rows = series || [];
  if (!key) return '';
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].name;
  }
  return key;
}
function collectChipAliases(root) {
  var values = [];
  if (!root) return values;
  root.querySelectorAll('[data-alias]').forEach(function (node) {
    if (aliasChipRemoved(node) || aliasChipRemoved(node.closest('li'))) return;
    var alias = node.getAttribute('data-alias') || '';
    if (alias) values.push(alias);
  });
  return values;
}
function collectRemovedAliases(root) {
  var values = [];
  if (!root) return values;
  root.querySelectorAll('[data-alias-removed]').forEach(function (node) {
    var alias = node.getAttribute('data-alias') || '';
    if (alias) values.push(alias);
  });
  return values;
}
function aliasesEqual(left, right) {
  if (left.length !== right.length) return false;
  var a = left.map(aliasKey).sort();
  var b = right.map(aliasKey).sort();
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function canRestoreActivity() {
  var list = document.getElementById('draft-activity');
  return !!(list && list.getAttribute('data-restore') === '1');
}
function restoreIcon() {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', 'M3.5 8a4.5 4.5 0 1 0 1.3-3.1M3.5 2.5v3h3');
  svg.appendChild(path);
  return svg;
}
function activityItem(entry, options) {
  options = options || {};
  var item = document.createElement('li');
  if (entry.id != null) item.dataset.auditId = String(entry.id);
  if (!options.compact) {
    var stamp = document.createElement('div');
    stamp.className = 'stamp';
    var when = document.createElement('time');
    when.className = 'when';
    when.textContent = entry.createdAt || '';
    stamp.append(when);
    if (entry.saveId != null) {
      var saveId = document.createElement('span');
      saveId.className = 'save-id';
      saveId.textContent = '#' + entry.saveId;
      stamp.append(saveId);
    }
    item.append(stamp);
  }
  var line = document.createElement('p');
  var actor = document.createElement('span');
  actor.className = 'actor';
  actor.textContent = entry.actor || String(entry.username || '').replace(/^@/, '') || 'unknown';
  line.append(actor);
  var spans = Array.isArray(entry.spans) ? entry.spans : [];
  if (spans.length) {
    spans.forEach(function (span) {
      if (span.entity) {
        var name = document.createElement('strong');
        name.textContent = span.text || '';
        line.append(name);
        return;
      }
      line.append(document.createTextNode(span.text || ''));
    });
  } else {
    line.append(document.createTextNode(' ' + (entry.summary || '')));
  }
  item.append(line);
  return item;
}
function activityGroup(group) {
  if (group.kind === 'note') return activityItem(group.events[0]);
  var wrap = document.createElement('li');
  wrap.className = 'activity-group ' + group.kind;
  if (group.saveId != null) wrap.dataset.saveId = String(group.saveId);
  var head = document.createElement('div');
  head.className = 'activity-group-head stamp';
  if (group.kind === 'save' && canRestoreActivity() && group.saveId != null) {
    wrap.classList.add('has-restore');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'restore';
    button.dataset.restoreEvent = String(group.saveId);
    button.setAttribute('aria-label', 'Restore');
    button.title = 'Restore';
    button.append(restoreIcon());
    head.append(button);
  }
  var when = document.createElement('time');
  when.className = 'when';
  when.textContent = group.events[0] && group.events[0].createdAt ? group.events[0].createdAt : '';
  head.append(when);
  var label = document.createElement('span');
  label.className = 'save-id';
  label.textContent = group.kind === 'save' && group.saveId != null ? '#' + group.saveId : 'Import';
  head.append(label);
  wrap.append(head);
  var inner = document.createElement('ol');
  inner.className = 'activity-group-events';
  group.events.forEach(function (entry) {
    inner.append(activityItem(entry, { compact: true }));
  });
  wrap.append(inner);
  return wrap;
}
function presenceKey(list) {
  return (list || []).map(function (person) {
    return String(person.discordId || '') + '\\0' + String(person.username || '');
  }).sort().join('\\n');
}
function reviewKey(list) {
  return (list || []).map(function (item) {
    return String(item.discordId || '') + '\\0' + String(item.decision || '');
  }).sort().join('\\n');
}
function reviewIcon(kind) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.75');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', kind === 'approve' ? 'M3 8.5 6.5 12 13 4.5' : 'M4 4l8 8M12 4l-8 8');
  svg.appendChild(path);
  return svg;
}
function entityRow(entity, locked, series) {
  var wrap = document.createElement('tr');
  wrap.className = 'row';
  wrap.dataset.type = entity.type;
  wrap.dataset.key = entity.key;
  wrap.dataset.revision = String(entity.revision);
  wrap.dataset.importAction = entity.importAction || 'add';
  if (entity.type === 'character') wrap.dataset.seriesKey = entity.seriesKey || '';
  var historyBtn = entity.lastEditorName
    ? '<button type="button" data-audit="1" aria-haspopup="dialog">History</button>'
    : '<button type="button" class="is-idle" disabled tabindex="-1" aria-hidden="true">History</button>';
  var live = entity.importAction === 'update';
  var liveTag = live
    ? '<span class="import-tag" title="Imported as an update. The name cannot be edited or deleted.">Update</span>'
    : '';
  var nameCell = locked
    ? '<td class="name" data-label="Name"><div class="name-row"></div></td>'
    : '<td class="name" data-label="Name"><div class="name-row"><input data-field="name" aria-label="Name" autocomplete="off" maxlength="200">' + liveTag + '</div></td>';
  var seriesCell = entity.type === 'character'
    ? (locked
      ? '<td class="series" data-label="Series"></td>'
      : '<td class="series" data-label="Series"><input data-field="seriesKey" aria-label="Series" autocomplete="off" maxlength="200"></td>')
    : '';
  var aliasCell = locked
    ? '<td class="aliases-cell" data-label="Aliases"><div class="aliases"><ul class="alias-list" data-alias-list></ul></div></td>'
    : '<td class="aliases-cell" data-label="Aliases">' + aliasEditorHtml() + '</td>';
  var deleteBtn = live || locked
    ? '<button type="button" class="danger is-idle" disabled tabindex="-1" aria-hidden="true">Delete</button>'
    : '<button type="button" class="danger" data-delete="1">Delete</button>';
  var acts = locked
    ? '<td class="acts"><div class="acts-row">' + historyBtn + '<span class="acts-edit"><button type="button" class="is-idle" disabled tabindex="-1" aria-hidden="true">Save</button><button type="button" class="is-idle" disabled tabindex="-1" aria-hidden="true">Discard</button>' + deleteBtn + '</span></div></td>'
    : '<td class="acts"><div class="acts-row">' + historyBtn + '<span class="acts-edit"><button type="button" class="is-idle" data-save="1" disabled>Save</button><button type="button" class="is-idle" data-discard="1" disabled>Discard</button>' + deleteBtn + '</span></div></td>';
  wrap.innerHTML =
    nameCell +
    seriesCell +
    aliasCell +
    '<td class="edited"><span data-last-edit></span></td>' +
    acts;
  if (locked) {
    var nameBox = wrap.querySelector('.name-row') || wrap.querySelector('.name');
    nameBox.textContent = entity.name;
    if (live && nameBox) {
      var tag = document.createElement('span');
      tag.className = 'import-tag';
      tag.title = 'Imported as an update. The name cannot be edited or deleted.';
      tag.textContent = 'Update';
      nameBox.append(tag);
    }
    var seriesCellEl = wrap.querySelector('.series');
    if (seriesCellEl) seriesCellEl.textContent = seriesDisplay(entity.seriesKey, series);
  }
  fillLastEdited(wrap, entity.lastEditorName);
  var nameInput = wrap.querySelector('[data-field="name"]');
  if (nameInput) {
    nameInput.value = entity.name;
    if (live) nameInput.disabled = true;
  }
  var seriesInput = wrap.querySelector('[data-field="seriesKey"]');
  if (seriesInput) {
    seriesInput.value = seriesDisplay(entity.seriesKey, series);
    if (live) seriesInput.disabled = true;
  }
  var aliasList = wrap.querySelector('[data-alias-list]');
  if (aliasList) {
    var base = {};
    (entity.baseAliases || []).forEach(function (alias) {
      base[aliasKey(alias)] = true;
    });
    entity.aliases.forEach(function (alias) {
      addAliasChip(aliasList, alias, null, !locked && !base[aliasKey(alias)]);
    });
  }
  return wrap;
}
function catalogSortMode(id) {
  var sel = document.getElementById(id);
  var value = sel && sel.value;
  if (value === 'edited' || value === 'name') return value;
  return 'added';
}
function sortEntities(list, mode) {
  return list.slice().sort(function (left, right) {
    if (mode === 'name') {
      var named = String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
      if (named) return named;
      return String(left.key || '').localeCompare(String(right.key || ''));
    }
    var leftTime = mode === 'edited' ? (left.lastEditedAt || 0) : (left.addedAt || 0);
    var rightTime = mode === 'edited' ? (right.lastEditedAt || 0) : (right.addedAt || 0);
    if (rightTime !== leftTime) return rightTime - leftTime;
    var byName = String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
    if (byName) return byName;
    return String(left.key || '').localeCompare(String(right.key || ''));
  });
}
function emptyState(list, label, cols) {
  if (list.children.length) return;
  var tr = document.createElement('tr');
  var td = document.createElement('td');
  td.colSpan = cols;
  td.className = 'empty';
  td.textContent = 'No ' + label + ' yet.';
  tr.append(td);
  list.append(tr);
}
async function api(path, options) {
  var response = await fetch(path, Object.assign({
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin'
  }, options));
  var body = null;
  try { body = await response.json(); } catch (e) { body = null; }
  return { response: response, body: body };
}
window.krtaDraftEditor = function () {
  var dataEl = document.getElementById('draft-data');
  var status = document.getElementById('draft-status');
  if (!dataEl) return;
  var state = JSON.parse(dataEl.textContent || '{}');
  var addSeriesRow = document.getElementById('add-series-card');
  var addCharacterRow = document.getElementById('add-character-card');
  var after = 0;
  var eventLog = [];
  var lastPresence = '';
  var polling = false;
  var pollTimer = null;
  var historyTarget = null;
  var descriptionBusy = false;
  var saveAllBusy = false;
  if (typeof state.description !== 'string') state.description = '';
  if (!Array.isArray(state.reviews)) state.reviews = [];
  var lastReviews = reviewKey(state.reviews);
  var reviewBusy = false;
  function findEntity(type, key) {
    var list = type === 'series' ? state.series : state.characters;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function resolvedSeriesKey(label) {
    var trimmed = String(label || '').trim();
    if (!trimmed) return '';
    if (seriesOnDraft(trimmed, state.series)) {
      for (var i = 0; i < state.series.length; i++) {
        var item = state.series[i];
        var slug = draftKey(trimmed);
        if (item.key === trimmed || item.key === slug) return item.key;
        if (String(item.name || '').toLowerCase() === trimmed.toLowerCase()) return item.key;
        if (slug && draftKey(item.name) === slug) return item.key;
      }
    }
    return draftKey(trimmed);
  }
  function characterDuplicate(name, seriesLabel, exceptKey) {
    var seriesKey = resolvedSeriesKey(seriesLabel);
    if (!name || !seriesKey) return false;
    var identity = String(name).trim().toLowerCase() + '\\0' + seriesKey;
    return state.characters.some(function (item) {
      if (exceptKey && item.key === exceptKey) return false;
      return (String(item.name || '').trim().toLowerCase() + '\\0' + item.seriesKey) === identity;
    });
  }
  function syncSeriesHint(input) {
    if (!input) return;
    var td = input.closest('td');
    if (!td) return;
    var hint = td.querySelector('.field-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'field-hint';
      td.append(hint);
    }
    var label = input.value.trim();
    var warn = !!label && !seriesOnDraft(label, state.series);
    hint.hidden = !warn;
    hint.textContent = warn ? seriesHintText() : '';
  }
  function captureEdit(row) {
    var type = row.dataset.type;
    var key = row.dataset.key;
    var entity = findEntity(type, key);
    if (!entity) return null;
    var nameInput = row.querySelector('[data-field="name"]');
    var seriesInput = row.querySelector('[data-field="seriesKey"]');
    var pending = row.querySelector('[data-alias-input]');
    var aliases = collectChipAliases(row);
    var pendingValue = pending ? pending.value : '';
    var name = nameInput ? nameInput.value : entity.name;
    var seriesLabel = seriesInput ? seriesInput.value : '';
    var seriesDirty = entity.type === 'character'
      && seriesLabel.trim() !== seriesDisplay(entity.seriesKey, state.series);
    var pendingDelete = !!row.dataset.userRemoved;
    var dirty = pendingDelete
      || name.trim() !== entity.name
      || seriesDirty
      || pendingValue.trim() !== ''
      || !aliasesEqual(aliases, entity.aliases);
    if (!dirty) return null;
    return {
      type: type,
      key: key,
      name: name,
      seriesLabel: seriesLabel,
      seriesDirty: seriesDirty,
      aliases: aliases,
      removed: collectRemovedAliases(row),
      pending: pendingValue,
      pendingDelete: pendingDelete
    };
  }
  function setPending(el, on) {
    if (!el) return;
    if (on) el.classList.add('pending');
    else el.classList.remove('pending');
  }
  function aliasCell(row) {
    var box = row.querySelector('.aliases');
    return box ? box.closest('td') : null;
  }
  function syncSaveButton(row) {
    var entity = findEntity(row.dataset.type, row.dataset.key);
    var nameInput = row.querySelector('[data-field="name"]');
    var seriesInput = row.querySelector('[data-field="seriesKey"]');
    var pending = row.querySelector('[data-alias-input]');
    var aliases = collectChipAliases(row);
    var nameDirty = !!(entity && nameInput && nameInput.value.trim() !== entity.name);
    var seriesDirty = !!(entity && entity.type === 'character' && seriesInput
      && seriesInput.value.trim() !== seriesDisplay(entity.seriesKey, state.series));
    var aliasDirty = !!(entity && ((pending && pending.value.trim() !== '')
      || !aliasesEqual(aliases, entity.aliases)));
    var pendingDelete = !!row.dataset.userRemoved || !!row.dataset.cascadeRemoved;
    var conflicted = !!row.querySelector('[data-conflict]');
    var dirty = !!(pendingDelete || nameDirty || seriesDirty || aliasDirty);
    var named = !!(nameInput && nameInput.value.trim());
    var seriesNamed = !entity || entity.type !== 'character'
      || !!(seriesInput && seriesInput.value.trim());
    var ready = !!(pendingDelete || (dirty && named && seriesNamed));
    var deleteBtn = row.querySelector('[data-delete]');
    if (deleteBtn) deleteBtn.textContent = pendingDelete ? 'Restore' : 'Delete';
    var button = row.querySelector('[data-save]');
    if (button) {
      button.disabled = !ready || conflicted;
      setPending(button, ready && !conflicted);
    }
    var discard = row.querySelector('[data-discard]');
    if (discard) {
      discard.disabled = !dirty;
      discard.classList.toggle('is-idle', !dirty);
    }
    if (button) button.classList.toggle('is-idle', !dirty);
    setPending(row.querySelector('td.name'), nameDirty);
    setPending(row.querySelector('td.series'), seriesDirty);
    setPending(aliasCell(row), aliasDirty);
    syncSeriesHint(seriesInput);
    syncSaveAll();
  }
  function syncAddRow(row) {
    if (!row) return;
    var name = row.querySelector('#add-series-name, #add-character-name');
    var series = row.querySelector('#add-character-series');
    var pending = row.querySelector('[data-alias-input]');
    var aliases = collectChipAliases(row);
    var nameDirty = !!(name && name.value.trim());
    var seriesDirty = !!(series && series.value.trim());
    var aliasDirty = !!(pending && pending.value.trim()) || aliases.length > 0;
    var dirty = nameDirty || seriesDirty || aliasDirty;
    var ready = nameDirty && (!series || seriesDirty);
    setPending(name ? name.closest('td') : null, nameDirty);
    setPending(series ? series.closest('td') : null, seriesDirty);
    setPending(aliasCell(row), aliasDirty);
    var button = row.querySelector('#add-series, #add-character');
    if (button) button.disabled = !ready;
    syncSeriesHint(series);
    var discard = row.querySelector('#discard-series, #discard-character');
    if (discard) {
      discard.disabled = !dirty;
      discard.classList.toggle('is-idle', !dirty);
    }
    syncSaveAll();
  }
  function syncDescriptionPending() {
    var field = document.getElementById('draft-description');
    if (!field) return;
    var next = field.value.replace(/^\s+|\s+$/g, '');
    setPending(field, next !== state.description);
    syncSaveAll();
  }
  function restoreEdit(edit) {
    var match = null;
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (row.dataset.type === edit.type && row.dataset.key === edit.key) match = row;
    });
    if (!match) return;
    clearConflicts(match);
    var nameInput = match.querySelector('[data-field="name"]');
    var seriesInput = match.querySelector('[data-field="seriesKey"]');
    var pending = match.querySelector('[data-alias-input]');
    var list = match.querySelector('[data-alias-list]');
    if (nameInput) nameInput.value = edit.name;
    if (seriesInput) seriesInput.value = edit.seriesLabel;
    if (list) {
      var entity = findEntity(edit.type, edit.key);
      var base = {};
      if (entity && entity.baseAliases) {
        entity.baseAliases.forEach(function (alias) {
          base[aliasKey(alias)] = true;
        });
      }
      list.replaceChildren();
      edit.aliases.forEach(function (alias) {
        addAliasChip(list, alias, null, !state.locked && !base[aliasKey(alias)]);
      });
      (edit.removed || []).forEach(function (alias) {
        if (!addAliasChip(list, alias, null, !state.locked && !base[aliasKey(alias)])) return;
        list.querySelectorAll('[data-alias-remove]').forEach(function (chip) {
          if (aliasKey(chip.getAttribute('data-alias')) === aliasKey(alias)) markAliasRemoved(chip);
        });
      });
    }
    if (pending) pending.value = edit.pending;
    if (edit.pendingDelete) {
      match.classList.add('removed');
      match.dataset.userRemoved = '1';
    } else {
      match.classList.remove('removed');
      delete match.dataset.userRemoved;
    }
    syncSaveButton(match);
    if (edit.type === 'series') syncCascadeDeletes();
  }
  function historyEntries(type, key) {
    return eventLog.filter(function (entry) {
      return entry.entityType === type && entry.entityKey === key;
    }).slice().reverse();
  }
  function fillHistoryList(list, type, key) {
    var rows = historyEntries(type, key);
    list.replaceChildren();
    if (!rows.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No history yet.';
      list.append(empty);
      return;
    }
    rows.forEach(function (entry) { list.append(activityItem(entry)); });
    syncActivityTimeline();
  }
  async function openHistory(type, key, row) {
    var dialog = document.getElementById('draft-history');
    var list = document.getElementById('draft-history-list');
    var title = document.getElementById('draft-history-title');
    var kind = document.getElementById('draft-history-kind');
    var seriesLine = document.getElementById('draft-history-series');
    if (!dialog || !list) return;
    var nameInput = row.querySelector('[data-field="name"]');
    var name = nameInput ? nameInput.value : (row.querySelector('.name') ? row.querySelector('.name').textContent : '');
    var seriesInput = row.querySelector('[data-field="seriesKey"]');
    var seriesName = seriesInput
      ? seriesInput.value
      : (row.querySelector('.series') ? row.querySelector('.series').textContent : '');
    historyTarget = { type: type, key: key };
    if (kind) kind.textContent = type === 'character' ? 'Character' : 'Series';
    title.textContent = name || 'History';
    if (seriesLine) {
      if (type === 'character' && seriesName) {
        seriesLine.hidden = false;
        seriesLine.textContent = seriesName;
      } else {
        seriesLine.hidden = true;
        seriesLine.textContent = '';
      }
    }
    if (!historyEntries(type, key).length) {
      var audit = await api('/api/v1/drafts/' + state.id + '/entities/' + type + '/' + encodeURIComponent(key) + '/audit');
      if (audit.response.ok && audit.body && Array.isArray(audit.body.entries)) {
        audit.body.entries.slice().reverse().forEach(function (entry) {
          if (entry.id != null && eventLog.some(function (item) { return item.id === entry.id; })) return;
          eventLog.push({
            id: entry.id,
            entityType: type,
            entityKey: key,
            action: entry.action,
            targetId: entry.targetId,
            saveId: entry.saveId,
            actor: entry.actor,
            spans: entry.spans,
            username: entry.username,
            createdAt: entry.createdAt,
            summary: entry.summary
          });
        });
      }
    }
    fillHistoryList(list, type, key);
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  }
  function renderPresence(list) {
    var root = document.getElementById('draft-presence');
    if (!root) return;
    root.replaceChildren();
    (list || []).forEach(function (person) {
      root.append(mentionNode(person.username));
    });
  }
  function ownReview() {
    var mine = String(state.discordId || '');
    if (!mine) return null;
    for (var i = 0; i < state.reviews.length; i++) {
      if (state.reviews[i].discordId === mine) return state.reviews[i].decision;
    }
    return null;
  }
  function renderReviews(list) {
    state.reviews = Array.isArray(list) ? list : [];
    lastReviews = reviewKey(state.reviews);
    var approveBtn = document.getElementById('review-approve');
    var rejectBtn = document.getElementById('review-reject');
    var mine = ownReview();
    if (approveBtn) approveBtn.classList.toggle('is-on', mine === 'approve');
    if (rejectBtn) rejectBtn.classList.toggle('is-on', mine === 'reject');
    var root = document.getElementById('draft-review-votes');
    if (!root) return;
    root.replaceChildren();
    state.reviews.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'review-vote';
      chip.setAttribute(
        'aria-label',
        item.decision === 'approve'
          ? discordHandle(item.username) + ' approved.'
          : discordHandle(item.username) + ' rejected.'
      );
      chip.append(mentionNode(item.username));
      var flag = document.createElement('span');
      flag.className = 'review-flag is-' + item.decision;
      flag.append(reviewIcon(item.decision));
      chip.append(flag);
      root.append(chip);
    });
  }
  async function submitReview(next) {
    if (!state.locked || reviewBusy) return;
    var current = ownReview();
    var decision = current === next ? null : next;
    reviewBusy = true;
    var result = await api('/api/v1/drafts/' + state.id + '/review', {
      method: 'POST',
      body: JSON.stringify({ decision: decision })
    });
    reviewBusy = false;
    if (!result.response.ok) {
      showStatus(status, result.body && result.body.error ? result.body.error : 'The review could not be saved.', true);
      return;
    }
    renderReviews(result.body && result.body.reviews);
  }
  function appendActivity(events) {
    var list = document.getElementById('draft-activity');
    if (!list || !events.length) return;
    var pin = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    events.forEach(function (entry) {
      if (entry.id != null && eventLog.some(function (item) { return item.id === entry.id; })) return;
      eventLog.push(entry);
    });
    renderActivityList(list);
    if (pin) list.scrollTop = list.scrollHeight;
  }
  function renderActivityList(list) {
    list.replaceChildren();
    groupDraftActivity(eventLog).forEach(function (group) {
      list.append(activityGroup(group));
    });
    syncActivityTimeline();
  }
  function syncActivityTimeline() {
    var live = {};
    liveActivityIds(eventLog).forEach(function (id) { live[id] = true; });
    document.querySelectorAll('#draft-history-list [data-audit-id]').forEach(function (li) {
      li.classList.toggle('superseded', !live[Number(li.dataset.auditId)]);
    });
    document.querySelectorAll('#draft-activity > li').forEach(function (li) {
      if (li.classList.contains('activity-group')) {
        var anyLive = false;
        li.querySelectorAll('[data-audit-id]').forEach(function (child) {
          if (live[Number(child.dataset.auditId)]) anyLive = true;
        });
        li.classList.toggle('superseded', !anyLive);
        return;
      }
      li.classList.toggle('superseded', li.dataset.auditId != null && !live[Number(li.dataset.auditId)]);
    });
  }
  function syncOpenHistory(events) {
    var dialog = document.getElementById('draft-history');
    var list = document.getElementById('draft-history-list');
    if (!dialog || !list || !dialog.open || !historyTarget) return;
    events.forEach(function (entry) {
      if (entry.entityType !== historyTarget.type || entry.entityKey !== historyTarget.key) return;
      if (entry.id != null && list.querySelector('[data-audit-id="' + entry.id + '"]')) return;
      var empty = list.querySelector('li:not([data-audit-id])');
      if (empty) empty.remove();
      list.prepend(activityItem(entry));
    });
  }
  function entityBaseline(entity) {
    if (!entity) return null;
    return {
      name: entity.name,
      seriesLabel: entity.type === 'character' ? seriesDisplay(entity.seriesKey, state.series) : '',
      aliases: entity.aliases ? entity.aliases.slice() : []
    };
  }
  function findRow(type, key) {
    var match = null;
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (row.dataset.type === type && row.dataset.key === key) match = row;
    });
    return match;
  }
  function syncCascadeDeletes() {
    var doomed = {};
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (row.dataset.type === 'series' && row.dataset.userRemoved) doomed[row.dataset.key] = true;
    });
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (row.dataset.type !== 'character') return;
      var entity = findEntity('character', row.dataset.key);
      var seriesKey = entity ? entity.seriesKey : row.dataset.seriesKey;
      var cascade = !!(seriesKey && doomed[seriesKey]);
      if (cascade) {
        row.classList.add('removed');
        row.dataset.cascadeRemoved = '1';
      } else if (row.dataset.cascadeRemoved) {
        delete row.dataset.cascadeRemoved;
        if (!row.dataset.userRemoved) row.classList.remove('removed');
      }
      syncSaveButton(row);
    });
  }
  function clearConflicts(row) {
    if (!row) return;
    row.querySelectorAll('[data-conflict]').forEach(function (cell) {
      cell.removeAttribute('data-conflict');
      cell.classList.remove('conflict');
    });
  }
  function markConflicts(row, conflicts) {
    clearConflicts(row);
    (conflicts || []).forEach(function (field) {
      var cell = null;
      if (field === 'name') cell = row.querySelector('td.name');
      else if (field === 'series') cell = row.querySelector('td.series');
      else if (field === 'aliases') cell = aliasCell(row);
      else if (field === 'delete') cell = row.querySelector('td.acts');
      if (!cell) return;
      cell.setAttribute('data-conflict', field);
      cell.classList.add('conflict');
    });
    if (row) syncSaveButton(row);
  }
  function applyPendingRebase(edit, base, theirs) {
    var result = rebaseDraftPending(base, theirs, {
      name: edit.name,
      seriesLabel: edit.seriesLabel,
      aliases: edit.aliases,
      removed: edit.removed || [],
      pending: edit.pending,
      pendingDelete: !!edit.pendingDelete
    });
    if (result.gone) return result;
    restoreEdit({
      type: edit.type,
      key: edit.key,
      name: result.name,
      seriesLabel: result.seriesLabel,
      aliases: result.aliases,
      removed: result.removed,
      pending: result.pending,
      pendingDelete: result.pendingDelete
    });
    markConflicts(findRow(edit.type, edit.key), result.conflicts);
    return result;
  }
  function applyCatalog(series, characters) {
    var pending = [];
    document.querySelectorAll('tr.row').forEach(function (row) {
      var edit = captureEdit(row);
      if (!edit) return;
      pending.push({
        edit: edit,
        base: entityBaseline(findEntity(edit.type, edit.key))
      });
    });
    state.series = series;
    state.characters = characters;
    render();
    var gone = 0;
    var conflicted = 0;
    pending.forEach(function (item) {
      var theirs = entityBaseline(findEntity(item.edit.type, item.edit.key));
      var result = applyPendingRebase(item.edit, item.base, theirs);
      if (result.gone) gone += 1;
      else if (result.conflicts.length) conflicted += 1;
    });
    if (gone) {
      showStatus(status, gone === 1
        ? 'Someone else deleted a row you were editing.'
        : 'Someone else deleted rows you were editing.', true);
      return;
    }
    if (conflicted) {
      showStatus(status, conflicted === 1
        ? 'Someone else changed a field you also edited.'
        : 'Someone else changed fields you also edited.', true);
    }
    syncCascadeDeletes();
  }
  function render() {
    var seriesList = document.getElementById('series-list');
    var characterList = document.getElementById('character-list');
    if (seriesList) {
      seriesList.replaceChildren();
      if (addSeriesRow && !state.locked) seriesList.append(addSeriesRow);
      sortEntities(state.series, catalogSortMode('series-sort')).forEach(function (entity) {
        seriesList.append(entityRow(entity, state.locked));
      });
      if (!state.series.length && state.locked) emptyState(seriesList, 'series', 4);
    }
    if (characterList) {
      characterList.replaceChildren();
      if (addCharacterRow && !state.locked) characterList.append(addCharacterRow);
      sortEntities(state.characters, catalogSortMode('character-sort')).forEach(function (entity) {
        characterList.append(entityRow(entity, state.locked, state.series));
      });
      if (!state.characters.length && state.locked) emptyState(characterList, 'characters', 5);
    }
    if (addSeriesRow) syncAddRow(addSeriesRow);
    if (addCharacterRow) syncAddRow(addCharacterRow);
    syncSaveAll();
    syncActivityHeight();
  }
  function catalogFitsOnPage() {
    var catalog = document.querySelector('.catalog');
    if (!catalog) return false;
    var bottom = catalog.getBoundingClientRect().top + window.scrollY + catalog.offsetHeight;
    return bottom <= document.documentElement.clientHeight + 1;
  }
  function syncActivityHeight() {
    var workspace = document.querySelector('.workspace');
    var panel = document.querySelector('.activity-panel');
    if (!workspace || !panel) return;
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      workspace.classList.remove('activity-fill');
      panel.style.maxHeight = '';
      return;
    }
    var fill = catalogFitsOnPage();
    workspace.classList.toggle('activity-fill', fill);
    if (!fill) {
      panel.style.maxHeight = '';
      return;
    }
    var room = document.documentElement.clientHeight - panel.getBoundingClientRect().top - 12;
    panel.style.maxHeight = Math.max(0, room) + 'px';
  }
  function replaceEntity(entity) {
    if (!entity) return;
    var list = entity.type === 'series' ? state.series : state.characters;
    var index = list.findIndex(function (item) { return item.key === entity.key; });
    if (index >= 0) list[index] = entity;
    else list.push(entity);
  }
  function removeEntity(type, key) {
    if (type === 'series') {
      state.series = state.series.filter(function (item) { return item.key !== key; });
    } else {
      state.characters = state.characters.filter(function (item) { return item.key !== key; });
    }
  }
  async function save(mutation, options) {
    var silent = !!(options && options.silent);
    if (mutation.action !== 'delete') {
      var saveName = String(mutation.name || '').trim();
      if (saveName.length > MAX_NAME) {
        if (!silent) showStatus(status, 'Name is too long.', true);
        return { ok: false, body: { error: 'Name is too long.', code: 'INVALID_INPUT' } };
      }
      var nameFont = draftFontError(saveName, 'name');
      if (saveName && nameFont) {
        if (!silent) showStatus(status, nameFont, true);
        return { ok: false, body: { error: nameFont, code: 'INVALID_INPUT' } };
      }
      var seriesName = String(mutation.seriesKey || '').trim();
      if (seriesName.length > MAX_NAME) {
        if (!silent) showStatus(status, 'Name is too long.', true);
        return { ok: false, body: { error: 'Name is too long.', code: 'INVALID_INPUT' } };
      }
      var seriesFont = draftFontError(seriesName, 'name');
      if (seriesName && seriesFont) {
        if (!silent) showStatus(status, seriesFont, true);
        return { ok: false, body: { error: seriesFont, code: 'INVALID_INPUT' } };
      }
      var saveAliases = mutation.aliases || [];
      for (var ai = 0; ai < saveAliases.length; ai++) {
        var saveAlias = String(saveAliases[ai] || '').trim();
        if (saveAlias.length > MAX_ALIAS) {
          if (!silent) showStatus(status, 'An alias is too long.', true);
          return { ok: false, body: { error: 'An alias is too long.', code: 'INVALID_INPUT' } };
        }
        var aliasErr = draftFontError(saveAlias, 'alias');
        if (aliasErr) {
          if (!silent) showStatus(status, aliasErr, true);
          return { ok: false, body: { error: aliasErr, code: 'INVALID_INPUT' } };
        }
      }
    }
    if (mutation.type === 'character' && mutation.action !== 'delete') {
      var seriesLabel = mutation.seriesKey;
      if (!seriesLabel && mutation.key) {
        var currentCharacter = findEntity('character', mutation.key);
        seriesLabel = currentCharacter
          ? seriesDisplay(currentCharacter.seriesKey, state.series)
          : '';
      }
      if (characterDuplicate(mutation.name, seriesLabel, mutation.key)) {
        if (!silent) showStatus(status, 'That character is already on this series.', true);
        return { ok: false, body: { error: 'That character is already on this series.', code: 'INVALID_INPUT' } };
      }
    }
    var cascadeCount = 0;
    if (mutation.action === 'delete' && mutation.type === 'series') {
      cascadeCount = state.characters.filter(function (item) {
        return item.seriesKey === mutation.key;
      }).length;
    }
    var payload = Object.assign({}, mutation);
    if (options && options.saveId != null) payload.saveId = options.saveId;
    var result = await api('/api/v1/drafts/' + state.id + '/entities', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (result.response.status === 409 || result.response.status === 423) {
      var prior = entityBaseline(findEntity(mutation.type, mutation.key));
      var liveRow = findRow(mutation.type, mutation.key);
      var edit = liveRow ? captureEdit(liveRow) : null;
      if (result.body && result.body.code === 'ENTITY_GONE') {
        removeEntity(mutation.type, mutation.key);
      } else if (result.body && result.body.entity) {
        replaceEntity(result.body.entity);
      }
      if (!silent) {
        render();
        if (result.body && result.body.code === 'CONFLICT' && edit) {
          var rebased = applyPendingRebase(edit, prior, entityBaseline(result.body.entity));
          showStatus(status, rebased.conflicts.length
            ? 'Someone else changed a field you also edited.'
            : 'Someone else updated this row. Your other edits are still pending.', true);
        } else {
          showStatus(status, result.body && result.body.error ? result.body.error : 'The save did not apply.', true);
        }
      }
      return { ok: false, body: result.body, prior: prior, edit: edit };
    }
    if (!result.response.ok) {
      if (!silent) {
        showStatus(status, result.body && result.body.error ? result.body.error : 'The save did not apply.', true);
      }
      return { ok: false, body: result.body };
    }
    if (mutation.action === 'delete') {
      removeEntity(mutation.type, mutation.key);
      if (mutation.type === 'series') {
        state.characters.filter(function (item) {
          return item.seriesKey === mutation.key;
        }).forEach(function (item) {
          removeEntity('character', item.key);
        });
      }
    } else if (result.body && result.body.entity) {
      if (result.body.adoptedSeries) replaceEntity(result.body.adoptedSeries);
      replaceEntity(result.body.entity);
    }
    if (!silent) {
      render();
      showStatus(status, cascadeCount
        ? (cascadeCount === 1
          ? 'Saved. Deleted this series and 1 character.'
          : 'Saved. Deleted this series and ' + cascadeCount + ' characters.')
        : 'Saved.', false);
    }
    return { ok: true, body: result.body };
  }
  function dirtyRows() {
    var rows = [];
    document.querySelectorAll('tr.row').forEach(function (row) {
      var edit = captureEdit(row);
      if (!edit) return;
      rows.push({
        edit: edit,
        revision: Number(row.dataset.revision),
        base: entityBaseline(findEntity(edit.type, edit.key))
      });
    });
    return rows;
  }
  function descriptionDirty() {
    var field = document.getElementById('draft-description');
    if (!field) return false;
    return field.value.replace(/^\s+|\s+$/g, '') !== state.description;
  }
  function addFormsDirty() {
    var dirty = false;
    document.querySelectorAll('tr.add-row').forEach(function (row) {
      var name = row.querySelector('#add-series-name, #add-character-name');
      var series = row.querySelector('#add-character-series');
      var pending = row.querySelector('[data-alias-input]');
      if (name && name.value.trim()) dirty = true;
      if (series && series.value.trim()) dirty = true;
      if (pending && pending.value.trim()) dirty = true;
      if (collectChipAliases(row).length) dirty = true;
    });
    return dirty;
  }
  function rowReadyToSave(edit) {
    if (!edit) return false;
    if (edit.pendingDelete) return true;
    if (!String(edit.name || '').trim()) return false;
    if (edit.type === 'character' && !String(edit.seriesLabel || '').trim()) return false;
    return true;
  }
  function syncSaveAll() {
    var saveButton = document.getElementById('save-all');
    var discardButton = document.getElementById('discard-all');
    var savable = dirtyRows().some(function (item) { return rowReadyToSave(item.edit); });
    var anyDirty = dirtyRows().length > 0 || descriptionDirty() || addFormsDirty();
    if (saveButton) {
      saveButton.disabled = !savable || saveAllBusy;
      setPending(saveButton, savable && !saveAllBusy);
    }
    if (discardButton) discardButton.disabled = !anyDirty;
  }
  function editorHasPending() {
    return dirtyRows().length > 0 || descriptionDirty() || addFormsDirty();
  }
  function lockNoticeKey() {
    return 'krta-draft-lock-' + state.id;
  }
  function rememberLockNotice(kind) {
    try { sessionStorage.setItem(lockNoticeKey(), kind); } catch (e) {}
  }
  function showLockNotice() {
    var kind = '';
    try {
      kind = sessionStorage.getItem(lockNoticeKey()) || '';
      sessionStorage.removeItem(lockNoticeKey());
    } catch (e) { kind = ''; }
    if (kind === 'locked') showStatus(status, 'This draft was locked.', false);
    if (kind === 'unlocked') showStatus(status, 'This draft was unlocked.', false);
    if (kind === 'restored') showStatus(status, 'This draft was restored to an earlier save.', false);
  }
  async function saveAll() {
    if (saveAllBusy || state.locked) return;
    saveAllBusy = true;
    syncSaveAll();
    var batchSaveId = null;
    var pending = dirtyRows().filter(function (item) {
      var row = findRow(item.edit.type, item.edit.key);
      if (row && row.querySelector('[data-conflict]')) return false;
      if (item.edit.type === 'character' && row && row.dataset.cascadeRemoved && !row.dataset.userRemoved) {
        return false;
      }
      return rowReadyToSave(item.edit);
    });
    var failed = [];
    var rebased = [];
    var saved = 0;
    var conflicted = 0;
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      var result = await save(item.edit.pendingDelete ? {
        type: item.edit.type,
        action: 'delete',
        key: item.edit.key,
        expectedRevision: item.revision
      } : {
        type: item.edit.type,
        action: 'update',
        key: item.edit.key,
        expectedRevision: item.revision,
        name: item.edit.name,
        seriesKey: item.edit.seriesDirty ? item.edit.seriesLabel : undefined,
        aliases: item.edit.aliases
      }, { silent: true, saveId: batchSaveId });
      if (result.ok) {
        saved += 1;
        if (result.body && result.body.saveId != null) batchSaveId = result.body.saveId;
      }
      else if (result.body && result.body.code === 'CONFLICT') {
        rebased.push({
          edit: result.edit || item.edit,
          base: result.prior || item.base,
          theirs: entityBaseline(result.body.entity)
        });
      } else if (result.body && result.body.code === 'ENTITY_GONE') {
        failed.push(item.edit);
      } else {
        failed.push(item.edit);
      }
    }
    saveAllBusy = false;
    render();
    rebased.forEach(function (item) {
      var next = applyPendingRebase(item.edit, item.base, item.theirs);
      if (next.conflicts.length) conflicted += 1;
    });
    failed.forEach(function (edit) {
      if (findRow(edit.type, edit.key)) restoreEdit(edit);
    });
    if (conflicted) {
      showStatus(status, conflicted === 1
        ? 'Someone else changed a field you also edited.'
        : 'Someone else changed fields you also edited.', true);
      syncSaveAll();
      return;
    }
    if (failed.length) {
      showStatus(status, failed.length === 1
        ? 'One row could not be saved.'
        : failed.length + ' rows could not be saved.', true);
      syncSaveAll();
      return;
    }
    if (rebased.length) {
      showStatus(status, 'Someone else updated a row. Your other edits are still pending.', true);
      syncSaveAll();
      return;
    }
    if (saved) {
      showStatus(status, saved === 1 ? 'Saved.' : 'Saved all changes.', false);
    }
    syncSaveAll();
  }
  function discardRow(row) {
    var entity = findEntity(row.dataset.type, row.dataset.key);
    if (!entity) return;
    restoreEdit({
      type: entity.type,
      key: entity.key,
      name: entity.name,
      seriesLabel: seriesDisplay(entity.seriesKey, state.series),
      aliases: entity.aliases.slice(),
      removed: [],
      pending: ''
    });
  }
  function discardAddRow(row) {
    if (!row) return;
    var name = row.querySelector('#add-series-name, #add-character-name');
    var series = row.querySelector('#add-character-series');
    var pending = row.querySelector('[data-alias-input]');
    var list = row.querySelector('[data-alias-list]');
    if (name) name.value = '';
    if (series) series.value = '';
    if (pending) pending.value = '';
    if (list) list.replaceChildren();
    syncAddRow(row);
  }
  function discardDescription() {
    var field = document.getElementById('draft-description');
    if (!field) return;
    field.value = state.description;
    syncDescriptionPending();
  }
  function discardAll() {
    if (state.locked) return;
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (captureEdit(row)) discardRow(row);
    });
    document.querySelectorAll('tr.add-row').forEach(discardAddRow);
    discardDescription();
    syncSaveAll();
    showStatus(status, 'Discarded unsaved changes.', false);
  }
  document.addEventListener('click', async function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var row = target.closest('.row');
    if (target.dataset.aliasAdd) {
      var box = target.closest('.aliases');
      if (box) lockPendingAlias(box, status);
      var aliasAddRow = target.closest('tr.row');
      if (aliasAddRow) syncSaveButton(aliasAddRow);
      var aliasAddForm = target.closest('tr.add-row');
      if (aliasAddForm) syncAddRow(aliasAddForm);
      return;
    }
    var aliasChip = target.closest('[data-alias-remove]');
    if (aliasChip) {
      var aliasItem = aliasChip.closest('li');
      var aliasRow = aliasChip.closest('tr.row');
      var aliasForm = aliasChip.closest('tr.add-row');
      var entity = aliasRow ? findEntity(aliasRow.dataset.type, aliasRow.dataset.key) : null;
      var alias = aliasChip.getAttribute('data-alias') || '';
      var saved = !!(entity && entity.aliases.some(function (value) {
        return aliasKey(value) === aliasKey(alias);
      }));
      if (aliasChipRemoved(aliasChip)) {
        restoreAliasChip(aliasChip);
      } else if (saved) {
        markAliasRemoved(aliasChip);
      } else if (aliasItem) {
        aliasItem.remove();
      }
      if (aliasRow) syncSaveButton(aliasRow);
      if (aliasForm) syncAddRow(aliasForm);
      return;
    }
    if (target.id === 'save-all') {
      await saveAll();
      return;
    }
    if (target.id === 'discard-all') {
      discardAll();
      return;
    }
    if (target.id === 'discard-series' || target.id === 'discard-character') {
      discardAddRow(target.closest('tr.add-row'));
      return;
    }
    if (target.id === 'lock-draft') {
      if (editorHasPending()) {
        showStatus(status, 'Save or discard your edits before locking.', true);
        return;
      }
      var locked = await api('/api/v1/drafts/' + state.id + '/lock', { method: 'POST', body: '{}' });
      if (!locked.response.ok) {
        showStatus(status, locked.body && locked.body.error ? locked.body.error : 'The draft could not be locked.', true);
        return;
      }
      window.location.reload();
      return;
    }
    if (target.id === 'unlock-draft') {
      var unlocked = await api('/api/v1/drafts/' + state.id + '/unlock', { method: 'POST', body: '{}' });
      if (!unlocked.response.ok) {
        showStatus(status, unlocked.body && unlocked.body.error ? unlocked.body.error : 'The draft could not be unlocked.', true);
        return;
      }
      window.location.reload();
      return;
    }
    var reviewBtn = target.closest('[data-review]');
    if (reviewBtn && (reviewBtn.id === 'review-approve' || reviewBtn.id === 'review-reject')) {
      await submitReview(reviewBtn.getAttribute('data-review'));
      return;
    }
    var restoreBtn = target.closest('[data-restore-event]');
    if (restoreBtn) {
      if (editorHasPending()) {
        showStatus(status, 'Save or discard your edits before restoring.', true);
        return;
      }
      var restoreId = Number(restoreBtn.getAttribute('data-restore-event'));
      if (!window.confirm('Restore this draft to save #' + restoreId + '? Later saves stay in the log.')) {
        return;
      }
      var restored = await api('/api/v1/drafts/' + state.id + '/restore', {
        method: 'POST',
        body: JSON.stringify({ saveId: restoreId })
      });
      if (!restored.response.ok) {
        showStatus(status, restored.body && restored.body.error ? restored.body.error : 'The draft could not be restored.', true);
        return;
      }
      rememberLockNotice('restored');
      window.location.reload();
      return;
    }
    if (!row) return;
    var type = row.dataset.type;
    var key = row.dataset.key;
    var revision = Number(row.dataset.revision);
    if (target.dataset.audit) {
      await openHistory(type, key, row);
      return;
    }
    if (target.dataset.discard) {
      discardRow(row);
      return;
    }
    if (target.dataset.save) {
      if (row.querySelector('[data-conflict]')) return;
      var pendingEdit = captureEdit(row);
      if (!pendingEdit) return;
      if (!row.classList.contains('removed') && !rowReadyToSave(pendingEdit)) return;
      if (row.classList.contains('removed')) {
        await save({
          type: type,
          action: 'delete',
          key: key,
          expectedRevision: revision
        });
        return;
      }
      var name = row.querySelector('[data-field="name"]');
      var seriesKey = row.querySelector('[data-field="seriesKey"]');
      var entity = findEntity(type, key);
      var seriesDirty = !!(entity && entity.type === 'character' && seriesKey
        && seriesKey.value.trim() !== seriesDisplay(entity.seriesKey, state.series));
      await save({
        type: type,
        action: 'update',
        key: key,
        expectedRevision: revision,
        name: name ? name.value : '',
        seriesKey: seriesDirty ? seriesKey.value : undefined,
        aliases: collectAliases(row.querySelector('.aliases'))
      });
      return;
    }
    if (target.dataset.delete) {
      if (row.dataset.userRemoved) {
        delete row.dataset.userRemoved;
        row.classList.remove('removed');
      } else {
        if (row.dataset.type === 'series') {
          var doomed = findEntity('series', key);
          var nameField = row.querySelector('[data-field="name"]');
          var seriesName = nameField && nameField.value.trim()
            ? nameField.value.trim()
            : (doomed ? doomed.name : 'this series');
          var assigned = state.characters.filter(function (item) {
            return item.seriesKey === key;
          }).length;
          if (assigned) {
            var question = assigned === 1
              ? 'Delete ' + seriesName + ' and the 1 character on this series?'
              : 'Delete ' + seriesName + ' and the ' + assigned + ' characters on this series?';
            if (!window.confirm(question)) return;
          }
        }
        row.dataset.userRemoved = '1';
        row.classList.add('removed');
      }
      if (row.dataset.type === 'series') syncCascadeDeletes();
      syncSaveButton(row);
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-alias-input')) return;
    event.preventDefault();
    var box = target.closest('.aliases');
    if (box) lockPendingAlias(box, status);
    var aliasRow = target.closest('tr.row');
    if (aliasRow) syncSaveButton(aliasRow);
    var aliasForm = target.closest('tr.add-row');
    if (aliasForm) syncAddRow(aliasForm);
  });
  document.addEventListener('input', function (event) {
    var field = event.target;
    if (!(field instanceof HTMLElement)) return;
    if (field.id === 'draft-description') {
      syncDescriptionPending();
      return;
    }
    if (field instanceof HTMLInputElement && (
      field.getAttribute('data-field') === 'name'
      || field.getAttribute('data-field') === 'seriesKey'
      || field.hasAttribute('data-alias-input')
      || field.id === 'add-series-name'
      || field.id === 'add-character-name'
      || field.id === 'add-character-series'
    )) {
      var kept = keepDraftFontText(field.value);
      if (kept !== field.value) field.value = kept;
    }
    var fieldRow = field.closest('tr.row');
    if (fieldRow) syncSaveButton(fieldRow);
    var addRow = field.closest('tr.add-row');
    if (addRow) syncAddRow(addRow);
  });
  var addSeries = document.getElementById('add-series');
  if (addSeries) {
    addSeries.addEventListener('click', async function () {
      var name = document.getElementById('add-series-name');
      if (!name || !name.value.trim()) return;
      var result = await save({
        type: 'series',
        action: 'add',
        name: name ? name.value : '',
        aliases: collectAliases(document.getElementById('add-series-aliases'))
      });
      if (result.ok) discardAddRow(addSeriesRow);
    });
  }
  var addCharacter = document.getElementById('add-character');
  if (addCharacter) {
    addCharacter.addEventListener('click', async function () {
      var name = document.getElementById('add-character-name');
      var seriesKey = document.getElementById('add-character-series');
      if (!name || !name.value.trim() || !seriesKey || !seriesKey.value.trim()) return;
      if (characterDuplicate(name.value, seriesKey.value)) {
        showStatus(status, 'That character is already on this series.', true);
        return;
      }
      var result = await save({
        type: 'character',
        action: 'add',
        name: name ? name.value : '',
        seriesKey: seriesKey ? seriesKey.value : '',
        aliases: collectAliases(document.getElementById('add-character-aliases'))
      });
      if (result.ok) discardAddRow(addCharacterRow);
    });
  }
  function applyDescription(value) {
    var next = typeof value === 'string' ? value : '';
    if (next === state.description) return;
    var field = document.getElementById('draft-description');
    if (field && document.activeElement === field) return;
    state.description = next;
    if (field) field.value = next;
    var view = document.getElementById('draft-description-view');
    if (view) {
      view.hidden = !next;
      view.textContent = next;
    }
  }
  async function commitDescription(saveId) {
    var field = document.getElementById('draft-description');
    if (!field || !state.canLock || descriptionBusy) return;
    var next = field.value.replace(/^\s+|\s+$/g, '');
    if (next === state.description) {
      field.value = next;
      syncDescriptionPending();
      return { saveId: saveId };
    }
    descriptionBusy = true;
    var payload = { description: next };
    var result = await api('/api/v1/drafts/' + state.id, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    descriptionBusy = false;
    if (!result.response.ok) {
      showStatus(status, result.body && result.body.error ? result.body.error : 'The description could not be saved.', true);
      return;
    }
    state.description = result.body && typeof result.body.description === 'string' ? result.body.description : next;
    field.value = state.description;
    syncDescriptionPending();
    return { saveId: result.body && result.body.saveId != null ? result.body.saveId : saveId };
  }
  async function poll() {
    if (document.hidden || polling) return;
    polling = true;
    try {
      var result = await api('/api/v1/drafts/' + state.id + '/events?after=' + after);
      if (!result.response.ok || !result.body) return;
      var body = result.body;
      if (Boolean(body.lockedAt) !== Boolean(state.locked)) {
        if (body.lockedAt && !state.locked) rememberLockNotice('locked');
        else if (!body.lockedAt && state.locked) rememberLockNotice('unlocked');
        window.location.reload();
        return;
      }
      var events = Array.isArray(body.events) ? body.events : [];
      if (after > 0 && events.some(function (entry) { return entry.action === 'restore'; })) {
        rememberLockNotice('restored');
        window.location.reload();
        return;
      }
      applyDescription(body.description);
      var nextPresence = presenceKey(body.presence);
      var presenceChanged = nextPresence !== lastPresence;
      var nextReviews = reviewKey(body.reviews);
      var reviewsChanged = nextReviews !== lastReviews;
      if (!events.length && !presenceChanged && !reviewsChanged && body.after === after) return;
      if (events.length) appendActivity(events);
      if (typeof body.after === 'number') after = body.after;
      if (presenceChanged) {
        lastPresence = nextPresence;
        renderPresence(body.presence);
      }
      if (reviewsChanged) renderReviews(body.reviews);
      var catalogEvents = events.filter(function (entry) {
        return entry.entityType !== 'draft';
      });
      if (catalogEvents.length) {
        applyCatalog(body.series || [], body.characters || []);
        syncOpenHistory(catalogEvents);
      }
    } finally {
      polling = false;
    }
  }
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, 2000);
  }
  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
      return;
    }
    poll();
    startPolling();
  });
  var historyDialog = document.getElementById('draft-history');
  var historyClose = document.getElementById('draft-history-close');
  if (historyClose) {
    historyClose.addEventListener('click', function () {
      if (historyDialog && historyDialog.open) historyDialog.close();
    });
  }
  if (historyDialog) {
    historyDialog.addEventListener('click', function (event) {
      if (event.target === historyDialog) historyDialog.close();
    });
    historyDialog.addEventListener('close', function () {
      historyTarget = null;
    });
  }
  var descriptionField = document.getElementById('draft-description');
  if (descriptionField) {
    descriptionField.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      commitDescription();
    });
    descriptionField.addEventListener('blur', function () {
      commitDescription();
    });
  }
  function bindCatalogSort(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.addEventListener('change', function () {
      applyCatalog(state.series, state.characters);
    });
  }
  bindCatalogSort('series-sort');
  bindCatalogSort('character-sort');
  renderReviews(state.reviews);
  render();
  window.addEventListener('resize', syncActivityHeight);
  var catalog = document.querySelector('.catalog');
  if (catalog && typeof ResizeObserver === 'function') {
    new ResizeObserver(syncActivityHeight).observe(catalog);
  }
  poll();
  startPolling();
  showLockNotice();
};
window.krtaDraftImport = function () {
  var status = document.getElementById('import-status');
  var storageKey = 'krta-draft-import';
  async function submit(catalog) {
    sessionStorage.setItem(storageKey, JSON.stringify(catalog));
    var result = await api('/api/v1/drafts', {
      method: 'POST',
      body: JSON.stringify(catalog)
    });
    if (!result.response.ok) {
      showStatus(status, result.body && result.body.error ? result.body.error : 'The draft could not be created.', true);
      return;
    }
    sessionStorage.removeItem(storageKey);
    window.location.href = '/drafts/' + result.body.id;
  }
  window.addEventListener('message', function (event) {
    if (event.origin !== 'https://karuta.gswaccess.com') return;
    if (!event.data || event.data.type !== 'krta-draft-catalog') return;
    submit(event.data.catalog);
  });
  if (window.opener) {
    window.opener.postMessage('krta-draft-ready', 'https://karuta.gswaccess.com');
  }
  try {
    var pending = sessionStorage.getItem(storageKey);
    if (pending) submit(JSON.parse(pending));
  } catch (error) {
    showStatus(status, 'The stored catalog is invalid.', true);
  }
};
`
