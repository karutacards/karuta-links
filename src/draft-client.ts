export const DRAFT_CLIENT_SCRIPT = `
function parseAliases(value) {
  return String(value || '').split('|').map(function (item) { return item.trim(); }).filter(Boolean);
}
function showStatus(el, message, isError) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = 'banner ' + (isError ? 'error' : 'ok');
}
function pillList(aliases) {
  if (!aliases.length) return '';
  return '<div class="pills">' + aliases.map(function (alias) {
    return '<span class="pill"></span>';
  }).join('') + '</div>';
}
function fillPills(root, aliases) {
  var nodes = root.querySelectorAll('.pill');
  aliases.forEach(function (alias, index) {
    if (nodes[index]) nodes[index].textContent = alias;
  });
}
function entityRow(entity, locked) {
  var wrap = document.createElement('article');
  wrap.className = 'row';
  wrap.dataset.type = entity.type;
  wrap.dataset.key = entity.key;
  wrap.dataset.revision = String(entity.revision);
  var chip = entity.lastEditorName
    ? '<button type="button" class="chip" data-audit="1"></button>'
    : '<span class="meta">No edits yet.</span>';
  var editor = locked ? '' : (
    '<div class="editor">' +
      '<input data-field="name">' +
      (entity.type === 'character' ? '<input data-field="seriesKey">' : '') +
      '<input data-field="aliases">' +
      '<div class="row-actions">' +
        '<button type="button" data-save="1">Save</button>' +
        '<button type="button" data-delete="1">Delete</button>' +
      '</div>' +
    '</div>'
  );
  wrap.innerHTML =
    '<div class="row-head">' +
      '<span class="kind"></span>' +
      '<strong data-title="1"></strong>' +
      chip +
    '</div>' +
    pillList(entity.aliases) +
    '<ol class="audit" data-history="1"></ol>' +
    editor;
  wrap.querySelector('.kind').textContent = entity.type === 'series' ? 'SERIES' : 'CHARACTER';
  wrap.querySelector('[data-title]').textContent = entity.name;
  var chipBtn = wrap.querySelector('[data-audit]');
  if (chipBtn) chipBtn.textContent = entity.lastEditorName;
  fillPills(wrap, entity.aliases);
  var nameInput = wrap.querySelector('[data-field="name"]');
  if (nameInput) nameInput.value = entity.name;
  var seriesInput = wrap.querySelector('[data-field="seriesKey"]');
  if (seriesInput) seriesInput.value = entity.seriesKey || '';
  var aliasInput = wrap.querySelector('[data-field="aliases"]');
  if (aliasInput) aliasInput.value = entity.aliases.join('|');
  return wrap;
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
  function render() {
    var seriesList = document.getElementById('series-list');
    var characterList = document.getElementById('character-list');
    if (seriesList) {
      seriesList.replaceChildren();
      state.series.forEach(function (entity) {
        seriesList.append(entityRow(entity, state.locked));
      });
    }
    if (characterList) {
      characterList.replaceChildren();
      state.characters.forEach(function (entity) {
        characterList.append(entityRow(entity, state.locked));
      });
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
      history.classList.toggle('open');
      if (!history.classList.contains('open') || history.childElementCount) return;
      var audit = await api('/api/v1/drafts/' + state.id + '/entities/' + type + '/' + encodeURIComponent(key) + '/audit');
      if (!audit.response.ok || !audit.body || !Array.isArray(audit.body.entries)) {
        history.textContent = 'Audit history is unavailable.';
        return;
      }
      history.replaceChildren();
      audit.body.entries.forEach(function (entry) {
        var item = document.createElement('li');
        item.textContent = entry.username + ' ' + entry.action + ' at ' + entry.createdAt + '.';
        history.append(item);
      });
      return;
    }
    if (target.dataset.save) {
      var name = row.querySelector('[data-field="name"]');
      var seriesKey = row.querySelector('[data-field="seriesKey"]');
      var aliases = row.querySelector('[data-field="aliases"]');
      await save({
        type: type,
        action: 'update',
        key: key,
        expectedRevision: revision,
        name: name ? name.value : '',
        seriesKey: seriesKey ? seriesKey.value : undefined,
        aliases: aliases ? parseAliases(aliases.value) : []
      });
      return;
    }
    if (target.dataset.delete) {
      await save({ type: type, action: 'delete', key: key, expectedRevision: revision });
    }
  });
  var addSeries = document.getElementById('add-series');
  if (addSeries) {
    addSeries.addEventListener('click', async function () {
      var name = document.getElementById('add-series-name');
      var aliases = document.getElementById('add-series-aliases');
      await save({
        type: 'series',
        action: 'add',
        name: name ? name.value : '',
        aliases: aliases ? parseAliases(aliases.value) : []
      });
    });
  }
  var addCharacter = document.getElementById('add-character');
  if (addCharacter) {
    addCharacter.addEventListener('click', async function () {
      var name = document.getElementById('add-character-name');
      var seriesKey = document.getElementById('add-character-series');
      var aliases = document.getElementById('add-character-aliases');
      await save({
        type: 'character',
        action: 'add',
        name: name ? name.value : '',
        seriesKey: seriesKey ? seriesKey.value : '',
        aliases: aliases ? parseAliases(aliases.value) : []
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
