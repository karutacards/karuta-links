export const DRAFT_CLIENT_SCRIPT = `
function showStatus(el, message, isError) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = 'banner ' + (isError ? 'error' : 'ok');
}
function aliasEditorHtml() {
  return '<div class="aliases">' +
    '<ul class="alias-list" data-alias-list></ul>' +
    '<input data-alias-input aria-label="Add alias" autocomplete="off">' +
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
function entityRow(entity, locked) {
  var wrap = document.createElement('tr');
  wrap.className = 'row';
  wrap.dataset.type = entity.type;
  wrap.dataset.key = entity.key;
  wrap.dataset.revision = String(entity.revision);
  var historyId = 'audit-' + entity.type + '-' + entity.key;
  var historyBtn = entity.lastEditorName
    ? '<button type="button" class="quiet" data-audit="1" aria-expanded="false" aria-controls="' + historyId + '">History</button>'
    : '';
  var nameCell = locked
    ? '<td class="name"></td>'
    : '<td class="name"><input data-field="name" aria-label="Name" autocomplete="off"></td>';
  var seriesCell = entity.type === 'character'
    ? (locked
      ? '<td class="series"></td>'
      : '<td class="series"><input data-field="seriesKey" aria-label="Series key" autocomplete="off"></td>')
    : '';
  var aliasCell = locked
    ? '<td><div class="aliases"><ul class="alias-list" data-alias-list></ul></div></td>'
    : '<td>' + aliasEditorHtml() + '</td>';
  var acts = locked
    ? '<td class="acts">' + historyBtn + '</td>'
    : '<td class="acts">' + historyBtn + '<button type="button" data-save="1">Save</button><button type="button" class="danger" data-delete="1">Delete</button></td>';
  wrap.innerHTML =
    nameCell +
    seriesCell +
    aliasCell +
    '<td class="edited"><span data-last-edit></span><ol class="audit" id="' + historyId + '" hidden data-history="1"></ol></td>' +
    acts;
  if (locked) {
    wrap.querySelector('.name').textContent = entity.name;
    var seriesCellEl = wrap.querySelector('.series');
    if (seriesCellEl) seriesCellEl.textContent = entity.seriesKey || '';
  }
  fillLastEdited(wrap, entity.lastEditorName);
  var nameInput = wrap.querySelector('[data-field="name"]');
  if (nameInput) nameInput.value = entity.name;
  var seriesInput = wrap.querySelector('[data-field="seriesKey"]');
  if (seriesInput) seriesInput.value = entity.seriesKey || '';
  var aliasList = wrap.querySelector('[data-alias-list]');
  if (aliasList) {
    entity.aliases.forEach(function (alias) {
      addAliasChip(aliasList, alias, null, !locked);
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
        characterList.append(entityRow(entity, state.locked));
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
      return;
    }
    var aliasChip = target.closest('[data-alias-remove]');
    if (aliasChip) {
      var aliasItem = aliasChip.closest('li');
      if (aliasItem) aliasItem.remove();
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
    if (!row) return;
    var type = row.dataset.type;
    var key = row.dataset.key;
    var revision = Number(row.dataset.revision);
    if (target.dataset.audit) {
      var history = row.querySelector('[data-history]');
      if (!history) return;
      var open = history.hidden;
      history.hidden = !open;
      target.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open || history.childElementCount) return;
      var audit = await api('/api/v1/drafts/' + state.id + '/entities/' + type + '/' + encodeURIComponent(key) + '/audit');
      if (!audit.response.ok || !audit.body || !Array.isArray(audit.body.entries)) {
        history.textContent = 'Audit history is unavailable.';
        return;
      }
      history.replaceChildren();
      if (!audit.body.entries.length) {
        var empty = document.createElement('li');
        empty.textContent = 'No history yet.';
        history.append(empty);
        return;
      }
      audit.body.entries.forEach(function (entry) {
        var item = document.createElement('li');
        item.append(mentionNode(entry.username));
        item.append(document.createTextNode(' ' + entry.action + ' at ' + entry.createdAt + '.'));
        history.append(item);
      });
      return;
    }
    if (target.dataset.save) {
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
  render();
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
