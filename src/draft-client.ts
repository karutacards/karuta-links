export const DRAFT_CLIENT_SCRIPT = `
function showStatus(el, message, isError) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = 'banner ' + (isError ? 'error' : 'ok');
}
function aliasEditorHtml() {
  return '<div class="aliases">' +
    '<input data-alias-input aria-label="Add alias" autocomplete="off">' +
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
    var alias = node.getAttribute('data-alias') || '';
    var key = aliasKey(alias);
    if (!key || seen[key]) return;
    seen[key] = true;
    values.push(alias);
  });
  return values;
}
function addAliasChip(list, raw, status, removable) {
  var alias = String(raw || '').trim();
  if (!alias) return false;
  if (alias.indexOf('|') !== -1) {
    showStatus(status, 'An alias cannot contain |.', true);
    return false;
  }
  var exists = false;
  list.querySelectorAll('[data-alias]').forEach(function (node) {
    if (aliasKey(node.getAttribute('data-alias')) === aliasKey(alias)) exists = true;
  });
  if (exists) return false;
  var item = document.createElement('li');
  if (removable === false) {
    item.className = 'alias-chip';
    item.setAttribute('data-alias', alias);
    item.textContent = alias;
    list.append(item);
    return true;
  }
  var chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'alias-chip';
  chip.setAttribute('data-alias', alias);
  chip.setAttribute('data-alias-remove', '1');
  chip.setAttribute('aria-label', 'Remove alias ' + alias);
  var text = document.createElement('span');
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
function activityItem(entry) {
  var item = document.createElement('li');
  if (entry.id != null) item.dataset.auditId = String(entry.id);
  var when = document.createElement('time');
  when.className = 'when';
  when.textContent = entry.createdAt || '';
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
  item.append(when, line);
  return item;
}
function presenceKey(list) {
  return (list || []).map(function (person) {
    return String(person.discordId || '') + '\\0' + String(person.username || '');
  }).sort().join('\\n');
}
function entityRow(entity, locked, series) {
  var wrap = document.createElement('tr');
  wrap.className = 'row';
  wrap.dataset.type = entity.type;
  wrap.dataset.key = entity.key;
  wrap.dataset.revision = String(entity.revision);
  var historyBtn = entity.lastEditorName
    ? '<button type="button" data-audit="1" aria-haspopup="dialog">History</button>'
    : '';
  var nameCell = locked
    ? '<td class="name"></td>'
    : '<td class="name"><input data-field="name" aria-label="Name" autocomplete="off"></td>';
  var seriesCell = entity.type === 'character'
    ? (locked
      ? '<td class="series"></td>'
      : '<td class="series"><input data-field="seriesKey" aria-label="Series" autocomplete="off"></td>')
    : '';
  var aliasCell = locked
    ? '<td><div class="aliases"><ul class="alias-list" data-alias-list></ul></div></td>'
    : '<td>' + aliasEditorHtml() + '</td>';
  var acts = locked
    ? '<td class="acts"><div class="acts-row">' + historyBtn + '</div></td>'
    : '<td class="acts"><div class="acts-row">' + historyBtn + '<span class="acts-edit"><button type="button" data-save="1" disabled>Save</button><button type="button" class="danger" data-delete="1">Delete</button></span></div></td>';
  wrap.innerHTML =
    nameCell +
    seriesCell +
    aliasCell +
    '<td class="edited"><span data-last-edit></span></td>' +
    acts;
  if (locked) {
    wrap.querySelector('.name').textContent = entity.name;
    var seriesCellEl = wrap.querySelector('.series');
    if (seriesCellEl) seriesCellEl.textContent = seriesDisplay(entity.seriesKey, series);
  }
  fillLastEdited(wrap, entity.lastEditorName);
  var live = entity.importAction === 'update';
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
  if (typeof state.description !== 'string') state.description = '';
  function findEntity(type, key) {
    var list = type === 'series' ? state.series : state.characters;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
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
    var dirty = name.trim() !== entity.name
      || (entity.type === 'character' && seriesLabel.trim() !== seriesDisplay(entity.seriesKey, state.series))
      || pendingValue.trim() !== ''
      || !aliasesEqual(aliases, entity.aliases);
    if (!dirty) return null;
    return {
      type: type,
      key: key,
      name: name,
      seriesLabel: seriesLabel,
      aliases: aliases,
      pending: pendingValue
    };
  }
  function syncSaveButton(row) {
    var button = row.querySelector('[data-save]');
    if (!button) return;
    button.disabled = !captureEdit(row);
  }
  function restoreEdit(edit) {
    var match = null;
    document.querySelectorAll('tr.row').forEach(function (row) {
      if (row.dataset.type === edit.type && row.dataset.key === edit.key) match = row;
    });
    if (!match) return;
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
    }
    if (pending) pending.value = edit.pending;
    syncSaveButton(match);
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
  function appendActivity(events) {
    var list = document.getElementById('draft-activity');
    if (!list || !events.length) return;
    var pin = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    events.forEach(function (entry) {
      if (entry.id != null && list.querySelector('[data-audit-id="' + entry.id + '"]')) return;
      list.append(activityItem(entry));
      eventLog.push(entry);
    });
    if (pin) list.scrollTop = list.scrollHeight;
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
  function mergeEntities(current, incoming, type, dirtyKeys) {
    var incomingKeys = {};
    var stale = false;
    incoming.forEach(function (entity) { incomingKeys[entity.key] = entity; });
    var next = incoming.map(function (entity) {
      if (!dirtyKeys[type + ':' + entity.key]) return entity;
      var local = null;
      current.forEach(function (item) { if (item.key === entity.key) local = item; });
      if (local && local.revision !== entity.revision) stale = true;
      return local || entity;
    });
    current.forEach(function (entity) {
      if (dirtyKeys[type + ':' + entity.key] && !incomingKeys[entity.key]) {
        next.push(entity);
        stale = true;
      }
    });
    return { list: next, stale: stale };
  }
  function applyCatalog(series, characters) {
    var dirtyRows = [];
    var dirtyKeys = {};
    document.querySelectorAll('tr.row').forEach(function (row) {
      var edit = captureEdit(row);
      if (!edit) return;
      dirtyRows.push(edit);
      dirtyKeys[edit.type + ':' + edit.key] = true;
    });
    var mergedSeries = mergeEntities(state.series, series, 'series', dirtyKeys);
    var mergedCharacters = mergeEntities(state.characters, characters, 'character', dirtyKeys);
    state.series = mergedSeries.list;
    state.characters = mergedCharacters.list;
    render();
    dirtyRows.forEach(restoreEdit);
    if (mergedSeries.stale || mergedCharacters.stale) {
      showStatus(status, 'Someone else changed a row you are editing.', true);
    }
  }
  function render() {
    var seriesList = document.getElementById('series-list');
    var characterList = document.getElementById('character-list');
    if (seriesList) {
      seriesList.replaceChildren();
      if (addSeriesRow && !state.locked) seriesList.append(addSeriesRow);
      state.series.forEach(function (entity) {
        seriesList.append(entityRow(entity, state.locked));
      });
      if (!state.series.length && state.locked) emptyState(seriesList, 'series', 4);
    }
    if (characterList) {
      characterList.replaceChildren();
      if (addCharacterRow && !state.locked) characterList.append(addCharacterRow);
      state.characters.forEach(function (entity) {
        characterList.append(entityRow(entity, state.locked, state.series));
      });
      if (!state.characters.length && state.locked) emptyState(characterList, 'characters', 5);
    }
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
  async function save(mutation) {
    var result = await api('/api/v1/drafts/' + state.id + '/entities', {
      method: 'PATCH',
      body: JSON.stringify(mutation)
    });
    if (result.response.status === 409 || result.response.status === 423) {
      if (result.body && result.body.entity) replaceEntity(result.body.entity);
      if (result.body && result.body.code === 'ENTITY_GONE') {
        removeEntity(mutation.type, mutation.key);
      }
      render();
      showStatus(status, result.body && result.body.error ? result.body.error : 'The save did not apply.', true);
      return;
    }
    if (!result.response.ok) {
      showStatus(status, result.body && result.body.error ? result.body.error : 'The save did not apply.', true);
      return;
    }
    if (mutation.action === 'delete') removeEntity(mutation.type, mutation.key);
    else if (result.body && result.body.entity) replaceEntity(result.body.entity);
    render();
    showStatus(status, 'Saved.', false);
  }
  document.addEventListener('click', async function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) return;
    var row = target.closest('.row');
    if (target.dataset.aliasAdd) {
      var box = target.closest('.aliases');
      if (box) lockPendingAlias(box, status);
      var aliasAddRow = target.closest('tr.row');
      if (aliasAddRow) syncSaveButton(aliasAddRow);
      return;
    }
    var aliasChip = target.closest('[data-alias-remove]');
    if (aliasChip) {
      var aliasItem = aliasChip.closest('li');
      var aliasRow = aliasChip.closest('tr.row');
      if (aliasItem) aliasItem.remove();
      if (aliasRow) syncSaveButton(aliasRow);
      return;
    }
    if (target.id === 'lock-draft') {
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
    if (!row) return;
    var type = row.dataset.type;
    var key = row.dataset.key;
    var revision = Number(row.dataset.revision);
    if (target.dataset.audit) {
      await openHistory(type, key, row);
      return;
    }
    if (target.dataset.save) {
      if (!captureEdit(row)) return;
      var name = row.querySelector('[data-field="name"]');
      var seriesKey = row.querySelector('[data-field="seriesKey"]');
      await save({
        type: type,
        action: 'update',
        key: key,
        expectedRevision: revision,
        name: name ? name.value : '',
        seriesKey: seriesKey ? seriesKey.value : undefined,
        aliases: collectAliases(row.querySelector('.aliases'))
      });
      return;
    }
    if (target.dataset.delete) {
      if (!window.confirm('Delete this ' + type + '?')) return;
      await save({ type: type, action: 'delete', key: key, expectedRevision: revision });
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
  });
  document.addEventListener('input', function (event) {
    var field = event.target;
    if (!(field instanceof HTMLElement)) return;
    var fieldRow = field.closest('tr.row');
    if (fieldRow) syncSaveButton(fieldRow);
  });
  var addSeries = document.getElementById('add-series');
  if (addSeries) {
    addSeries.addEventListener('click', async function () {
      var name = document.getElementById('add-series-name');
      await save({
        type: 'series',
        action: 'add',
        name: name ? name.value : '',
        aliases: collectAliases(document.getElementById('add-series-aliases'))
      });
    });
  }
  var addCharacter = document.getElementById('add-character');
  if (addCharacter) {
    addCharacter.addEventListener('click', async function () {
      var name = document.getElementById('add-character-name');
      var seriesKey = document.getElementById('add-character-series');
      await save({
        type: 'character',
        action: 'add',
        name: name ? name.value : '',
        seriesKey: seriesKey ? seriesKey.value : '',
        aliases: collectAliases(document.getElementById('add-character-aliases'))
      });
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
  async function commitDescription() {
    var field = document.getElementById('draft-description');
    if (!field || !state.canLock || descriptionBusy) return;
    var next = field.value.replace(/^\s+|\s+$/g, '');
    if (next === state.description) {
      field.value = next;
      return;
    }
    descriptionBusy = true;
    var result = await api('/api/v1/drafts/' + state.id, {
      method: 'PATCH',
      body: JSON.stringify({ description: next })
    });
    descriptionBusy = false;
    if (!result.response.ok) {
      showStatus(status, result.body && result.body.error ? result.body.error : 'The description could not be saved.', true);
      return;
    }
    state.description = result.body && typeof result.body.description === 'string' ? result.body.description : next;
    field.value = state.description;
  }
  async function poll() {
    if (document.hidden || polling) return;
    polling = true;
    try {
      var result = await api('/api/v1/drafts/' + state.id + '/events?after=' + after);
      if (!result.response.ok || !result.body) return;
      var body = result.body;
      if (Boolean(body.lockedAt) !== Boolean(state.locked)) {
        window.location.reload();
        return;
      }
      applyDescription(body.description);
      var events = Array.isArray(body.events) ? body.events : [];
      var nextPresence = presenceKey(body.presence);
      var presenceChanged = nextPresence !== lastPresence;
      if (!events.length && !presenceChanged && body.after === after) return;
      if (events.length) appendActivity(events);
      if (typeof body.after === 'number') after = body.after;
      if (presenceChanged) {
        lastPresence = nextPresence;
        renderPresence(body.presence);
      }
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
  render();
  poll();
  startPolling();
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
