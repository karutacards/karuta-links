export const ALBUM_CLIENT_SCRIPT = `
(function () {
  var boot = window.__ALBUMS__;
  if (!boot || !boot.snapshot) return;
  var PREFIX = "k!";
  var MAX_PAGES = 100;
  var WINDOW = 48;
  var BG_ORIGIN = "https://karuta-bot.s3.us-east-2.amazonaws.com/images/backgrounds";
  var DEFAULT_BG = "default";
  var names = boot.names || {};
  var state = {
    snapshot: boot.snapshot,
    fetchedAt: boot.fetchedAt,
    albums: [],
    current: 0,
    held: null,
    query: "",
    bgQuery: "",
    window: WINDOW,
    copied: false,
    refreshBusy: false,
    refreshNote: ""
  };

  var app = document.getElementById("app");
  var stack = document.getElementById("stack");
  var search = document.getElementById("search");
  var albumList = document.getElementById("album-list");
  var nameHint = document.getElementById("name-hint");
  var slotsEl = document.getElementById("slots");
  var pagesEl = document.getElementById("pages");
  var backdrop = document.getElementById("backdrop");
  var commandsEl = document.getElementById("commands");
  var bgGrid = document.getElementById("bg-grid");
  var bgSearch = document.getElementById("bg-search");
  var copyDesktop = document.getElementById("copy-desktop");
  var copyDock = document.getElementById("copy-dock");
  var stageNote = document.getElementById("stage-note");
  var refreshBtn = document.getElementById("refresh");
  var refreshNote = document.getElementById("refresh-note");

  function slotKey(page, slot) { return page + ":" + slot; }
  function normalizeName(value) { return String(value || "").trim().toLowerCase(); }
  function isValidAlbumName(value) {
    return value.length > 0 && value.length <= 16 && value.charAt(0) !== "_" && /^[a-zA-Z][a-zA-Z0-9\\-_]*$/.test(value);
  }
  function bgName(key) { return names[key] || key; }
  function bgUrl(key) { return BG_ORIGIN + "/" + key + ".jpg"; }
  function backgroundKeys() {
    var keys = Object.keys(names);
    var seen = {};
    keys.forEach(function (key) { seen[key] = true; });
    function add(key) {
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    }
    (state.snapshot.backgrounds || []).forEach(add);
    (state.snapshot.albums || []).forEach(function (item) { add(item.background); });
    state.albums.forEach(function (item) { add(item.background); });
    return keys;
  }
  function portraitUrl(card) {
    var file = encodeURIComponent(card.character) + "-" + card.edition;
    if (card.version > 0) file = "versioned/" + file + "-" + card.version;
    return "/images/characters/" + file + ".jpg";
  }
  function stars(quality) {
    var good = Math.max(0, 4 - Number(quality || 0));
    return "★".repeat(good) + "☆".repeat(4 - good);
  }
  function snapshotPages(album) {
    return Math.max(1, Math.ceil((album.cards || []).length / 8) || 1);
  }
  function cardMap() {
    var map = {};
    state.snapshot.cards.forEach(function (card) { map[card.instanceKey] = card; });
    return map;
  }
  function slotsFromSnapshot(album) {
    var cards = cardMap();
    var slots = {};
    (album.cards || []).forEach(function (key, index) {
      if (!key || !cards[key]) return;
      slots[slotKey(Math.floor(index / 8) + 1, (index % 8) + 1)] = cards[key];
    });
    return slots;
  }
  function editorsFromSnapshot(snapshot) {
    return snapshot.albums.map(function (album) {
      return {
        sourceId: album.id,
        name: album.id,
        page: 1,
        pages: snapshotPages(album),
        slots: slotsFromSnapshot(album),
        background: album.background || DEFAULT_BG
      };
    });
  }
  function album() { return state.albums[state.current]; }
  function createAlbum() {
    state.albums.push({
      sourceId: null,
      name: uniqueAlbumName(),
      page: 1,
      pages: 1,
      slots: {},
      background: DEFAULT_BG
    });
    state.current = state.albums.length - 1;
    return album();
  }
  function ensureAlbum() {
    return album() || createAlbum();
  }
  function uniqueAlbumName() {
    var taken = {};
    state.albums.forEach(function (item) { taken[normalizeName(item.name)] = true; });
    if (!taken.album) return "album";
    var index = 2;
    while (taken["album" + index]) index += 1;
    return "album" + index;
  }
  function usedInAlbum(target) {
    var used = {};
    Object.keys(target.slots).forEach(function (key) {
      used[target.slots[key].instanceKey] = true;
    });
    return used;
  }
  var drag = {
    card: null,
    source: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    active: false,
    ignoreClick: false,
    html5: false,
    dropped: false,
    ghost: null
  };
  function cardByKey(key) {
    var found = null;
    state.snapshot.cards.forEach(function (card) {
      if (card.instanceKey === key) found = card;
    });
    return found;
  }
  function setDragging(on) {
    document.body.classList.toggle("is-dragging", on);
    document.querySelectorAll(".slot.is-target").forEach(function (el) {
      el.classList.remove("is-target");
    });
    if (!on && drag.ghost) {
      drag.ghost.remove();
      drag.ghost = null;
    }
  }
  function slotFromPoint(x, y) {
    var node = document.elementFromPoint(x, y);
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("slot") && node.dataset.slot) return node;
      node = node.parentElement;
    }
    return null;
  }
  function bindDrag(el, card) {
    el.setAttribute("draggable", "true");
    el.addEventListener("pointerdown", function (event) {
      if (event.button && event.button !== 0) return;
      drag.card = card;
      drag.source = el;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.active = false;
    });
    el.addEventListener("dragstart", function (event) {
      drag.html5 = true;
      drag.dropped = false;
      drag.card = card;
      state.held = card;
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", card.instanceKey);
        event.dataTransfer.effectAllowed = "copyMove";
      }
      setDragging(true);
      closeSheets();
    });
    el.addEventListener("dragend", function () {
      var dropped = drag.dropped;
      drag.html5 = false;
      drag.dropped = false;
      drag.card = null;
      drag.source = null;
      setDragging(false);
      if (!dropped) state.held = null;
      render();
    });
  }
  function nameStatus() {
    if (!album()) return "ok";
    var name = normalizeName(album().name);
    if (!isValidAlbumName(name)) return "invalid";
    if (state.albums.some(function (item, index) {
      return index !== state.current && normalizeName(item.name) === name;
    })) return "taken";
    return "ok";
  }
  function commandDiff() {
    if (nameStatus() === "invalid") {
      return "# Album names start with a letter and stay under 16 characters.";
    }
    if (nameStatus() === "taken") return "# That name is already used by another album.";
    var byId = {};
    state.snapshot.albums.forEach(function (item) { byId[item.id] = item; });
    var lines = [];
    state.albums.forEach(function (editor) {
      var name = normalizeName(editor.name);
      var source = editor.sourceId ? byId[editor.sourceId] : null;
      var working = source ? source.id : name;
      if (!source) {
        lines.push(PREFIX + "acreate " + name);
        working = name;
      } else if (source.id !== name) {
        lines.push(PREFIX + "arename " + source.id + " " + name);
        working = name;
      }
      var beforePages = source ? snapshotPages(source) : 1;
      var page;
      if (editor.pages > beforePages) {
        for (page = beforePages + 1; page <= editor.pages; page += 1) {
          lines.push(PREFIX + "apage " + working + " " + page);
        }
      } else if (source && editor.pages < beforePages) {
        for (page = beforePages; page > editor.pages; page -= 1) {
          lines.push(PREFIX + "apageremove " + working + " " + page);
        }
      }
      var beforeBg = source && source.background ? source.background : DEFAULT_BG;
      if ((editor.background || DEFAULT_BG) !== beforeBg) {
        lines.push(PREFIX + "abg " + working + " " + bgName(editor.background || DEFAULT_BG));
      }
      var beforeSlots = source ? slotsFromSnapshot(source) : {};
      var maxPages = Math.max(editor.pages, beforePages);
      var slot;
      for (page = 1; page <= maxPages; page += 1) {
        for (slot = 1; slot <= 8; slot += 1) {
          var key = slotKey(page, slot);
          var before = beforeSlots[key];
          var after = editor.slots[key];
          if (before && (!after || before.instanceKey !== after.instanceKey)) {
            lines.push(PREFIX + "aremove " + working + " " + before.code);
          }
        }
      }
      for (page = 1; page <= editor.pages; page += 1) {
        for (slot = 1; slot <= 8; slot += 1) {
          var addKey = slotKey(page, slot);
          var prev = beforeSlots[addKey];
          var next = editor.slots[addKey];
          if (next && (!prev || prev.instanceKey !== next.instanceKey)) {
            lines.push(PREFIX + "aadd " + working + " " + next.code + " " + page + " " + slot);
          }
        }
      }
    });
    return lines.length ? lines.join("\\n") : "# No changes to paste.";
  }
  function chrome(card) {
    var dye = card.dye ? '<i class="dye" style="background:' + card.dye + '"></i>' : "";
    return '<div class="tile"><img class="portrait" src="' + portraitUrl(card) + '" alt="" decoding="async">' +
      '<div class="chrome"><strong>' + card.code + '</strong>#' + card.number +
      ' · ◈' + card.edition + ' <span class="stars">' + stars(card.quality) + "</span>" + dye + "</div></div>";
  }
  function closeSheets() { app.dataset.sheet = ""; }
  function openSheet(name) { app.dataset.sheet = app.dataset.sheet === name ? "" : name; }
  function filteredCards() {
    var query = state.query;
    return state.snapshot.cards.filter(function (card) {
      return !query || card.code.indexOf(query) !== -1;
    });
  }
  function renderStack() {
    if (!stack) return;
    var used = album() ? usedInAlbum(album()) : {};
    var rows = filteredCards();
    stack.replaceChildren();
    rows.slice(0, state.window).forEach(function (card) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "pick";
      if (used[card.instanceKey]) button.classList.add("is-used");
      if (state.held && state.held.instanceKey === card.instanceKey) button.classList.add("is-held");
      button.innerHTML = chrome(card);
      bindDrag(button, card);
      button.addEventListener("click", function (event) {
        if (drag.ignoreClick) {
          event.preventDefault();
          drag.ignoreClick = false;
          return;
        }
        state.held = state.held && state.held.instanceKey === card.instanceKey ? null : card;
        closeSheets();
        render();
      });
      stack.append(button);
    });
  }
  function renderAlbums() {
    if (!albumList) return;
    albumList.hidden = state.albums.length === 0;
    albumList.replaceChildren();
    state.albums.forEach(function (item, index) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "album-row";
      if (index === state.current) row.setAttribute("aria-current", "true");
      var count = Object.keys(item.slots).length;
      row.innerHTML = "<strong></strong><span></span>";
      if (index === state.current) {
        var input = document.createElement("input");
        input.value = item.name;
        input.maxLength = 16;
        input.addEventListener("input", function () {
          item.name = input.value;
          render();
        });
        row.replaceChild(input, row.firstChild);
        if (nameStatus() !== "ok") row.classList.add("is-bad");
      } else {
        row.firstChild.textContent = item.name;
      }
      row.lastChild.textContent = count + " cards · " + item.pages + " pages";
      row.addEventListener("click", function () {
        state.current = index;
        render();
      });
      albumList.append(row);
    });
    if (nameHint) {
      var status = nameStatus();
      nameHint.hidden = status === "ok" || !album();
      nameHint.textContent = status === "invalid"
        ? "Start with a letter. Use letters, numbers, hyphens, or underscores."
        : status === "taken" ? "That name is already used by another album." : "";
    }
  }
  function renderPages() {
    if (!pagesEl || !album()) {
      if (pagesEl) pagesEl.replaceChildren();
      return;
    }
    pagesEl.replaceChildren();
    var current = album();
    for (var page = 1; page <= current.pages; page += 1) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "page";
      button.setAttribute("role", "tab");
      button.textContent = String(page);
      button.setAttribute("aria-selected", page === current.page ? "true" : "false");
      button.addEventListener("click", function (next) {
        return function () { current.page = next; render(); };
      }(page));
      pagesEl.append(button);
    }
    var add = document.createElement("button");
    add.type = "button";
    add.className = "add-page";
    add.textContent = "+";
    add.title = "Add a page. This spends an empty page.";
    add.disabled = current.pages >= MAX_PAGES;
    add.addEventListener("click", function () {
      if (current.pages >= MAX_PAGES) return;
      current.pages += 1;
      current.page = current.pages;
      render();
    });
    pagesEl.append(add);
  }
  function place(card, slot) {
    var current = ensureAlbum();
    if (!current) return;
    Object.keys(current.slots).forEach(function (key) {
      if (current.slots[key].instanceKey === card.instanceKey) delete current.slots[key];
    });
    current.slots[slotKey(current.page, slot)] = card;
    state.held = null;
  }
  function renderSlots() {
    if (!slotsEl) return;
    slotsEl.replaceChildren();
    var current = album();
    for (var slot = 1; slot <= 8; slot += 1) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "slot";
      button.dataset.slot = String(slot);
      var card = current ? current.slots[slotKey(current.page, slot)] : null;
      if (card) {
        button.classList.add("is-filled");
        button.innerHTML = chrome(card);
        bindDrag(button, card);
      }
      button.addEventListener("dragover", function (event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        button.classList.add("is-target");
      });
      button.addEventListener("dragleave", function () {
        button.classList.remove("is-target");
      });
      button.addEventListener("drop", function (next) {
        return function (event) {
          event.preventDefault();
          var key = event.dataTransfer ? event.dataTransfer.getData("text/plain") : "";
          var moving = cardByKey(key) || state.held || drag.card;
          if (moving) {
            place(moving, next);
            drag.dropped = true;
          }
          setDragging(false);
          render();
        };
      }(slot));
      button.addEventListener("click", function (next) {
        return function (event) {
          if (drag.ignoreClick) {
            event.preventDefault();
            drag.ignoreClick = false;
            return;
          }
          if (state.held) place(state.held, next);
          else if (current && current.slots[slotKey(current.page, next)]) {
            delete current.slots[slotKey(current.page, next)];
          }
          render();
        };
      }(slot));
      slotsEl.append(button);
    }
  }
  function renderBackgrounds() {
    if (!bgGrid) return;
    var query = state.bgQuery;
    var current = album();
    bgGrid.replaceChildren();
    backgroundKeys().filter(function (key) {
      return !query || bgName(key).toLowerCase().indexOf(query) !== -1 || key.indexOf(query) !== -1;
    }).forEach(function (key) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "bg-pick";
      if (current && current.background === key) button.classList.add("is-on");
      button.innerHTML = "<figure><img src=\\"" + bgUrl(key) + "\\" alt=\\"\\"><figcaption>" + bgName(key) + "</figcaption></figure>";
      button.addEventListener("click", function () {
        ensureAlbum().background = key;
        render();
      });
      bgGrid.append(button);
    });
  }
  function renderCommands() {
    var text = commandDiff();
    if (commandsEl) commandsEl.textContent = text;
    var ready = text.charAt(0) !== "#";
    [copyDesktop, copyDock].forEach(function (button) {
      if (!button) return;
      button.disabled = !ready;
      button.classList.toggle("is-done", state.copied && ready);
    });
  }
  function renderStage() {
    var current = album();
    if (backdrop) backdrop.src = bgUrl(current ? current.background : DEFAULT_BG);
    if (stageNote) {
      stageNote.textContent = current
        ? "Eight slots to a page. Drag a card onto a slot, or tap a card and then a slot."
        : "Drag a card onto a slot to start an album.";
    }
  }
  function refreshLabel() {
    if (!refreshBtn) return;
    var wait = Math.max(0, 10 * 60 * 1000 - (Date.now() - state.fetchedAt));
    refreshBtn.disabled = state.refreshBusy || wait > 0;
    refreshBtn.textContent = state.refreshBusy ? "Refreshing" : "Refresh";
    if (refreshNote) {
      refreshNote.textContent = state.refreshNote;
      refreshNote.hidden = !state.refreshNote;
    }
  }
  function render() {
    renderAlbums();
    renderStack();
    renderPages();
    renderSlots();
    renderBackgrounds();
    renderCommands();
    renderStage();
    refreshLabel();
  }
  function applySnapshot(payload) {
    state.snapshot = payload.snapshot;
    state.fetchedAt = payload.fetchedAt;
    state.albums = editorsFromSnapshot(payload.snapshot);
    state.current = 0;
    state.held = null;
    state.window = WINDOW;
    state.copied = false;
    state.refreshNote = "";
    render();
  }
  state.albums = editorsFromSnapshot(state.snapshot);
  if (search) {
    search.addEventListener("input", function () {
      state.query = search.value.trim().toLowerCase();
      state.window = WINDOW;
      renderStack();
    });
  }
  if (bgSearch) {
    bgSearch.addEventListener("input", function () {
      state.bgQuery = bgSearch.value.trim().toLowerCase();
      renderBackgrounds();
    });
  }
  if (stack) {
    stack.addEventListener("scroll", function () {
      if (stack.scrollTop + stack.clientHeight < stack.scrollHeight - 80) return;
      var total = filteredCards().length;
      if (state.window >= total) return;
      state.window += WINDOW;
      renderStack();
    });
  }
  var newAlbum = document.getElementById("new-album");
  if (newAlbum) {
    newAlbum.addEventListener("click", function () {
      createAlbum();
      render();
    });
  }
  document.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeSheets);
  });
  var openCards = document.getElementById("open-cards");
  var openScript = document.getElementById("open-script");
  if (openCards) openCards.addEventListener("click", function () { openSheet("cards"); });
  if (openScript) openScript.addEventListener("click", function () { openSheet("script"); });
  function copyScript() {
    var text = commandDiff();
    if (text.charAt(0) === "#") return;
    navigator.clipboard.writeText(text).then(function () {
      state.copied = true;
      renderCommands();
    });
  }
  if (copyDesktop) copyDesktop.addEventListener("click", copyScript);
  if (copyDock) copyDock.addEventListener("click", copyScript);
  if (slotsEl) {
    slotsEl.addEventListener("dragover", function (event) {
      event.preventDefault();
    });
  }
  document.addEventListener("pointermove", function (event) {
    if (drag.html5 || !drag.card || event.pointerId !== drag.pointerId) return;
    var dx = event.clientX - drag.startX;
    var dy = event.clientY - drag.startY;
    if (!drag.active && dx * dx + dy * dy < 64) return;
    if (!drag.active) {
      drag.active = true;
      drag.ignoreClick = true;
      if (drag.source) {
        drag.source.setPointerCapture(event.pointerId);
        drag.source.classList.add("is-held");
      }
      state.held = drag.card;
      setDragging(true);
      closeSheets();
      drag.ghost = document.createElement("div");
      drag.ghost.className = "drag-ghost";
      drag.ghost.innerHTML = chrome(drag.card);
      document.body.append(drag.ghost);
    }
    event.preventDefault();
    if (drag.ghost) {
      drag.ghost.style.transform = "translate(" + (event.clientX + 12) + "px," + (event.clientY + 12) + "px)";
    }
    document.querySelectorAll(".slot.is-target").forEach(function (node) {
      node.classList.remove("is-target");
    });
    var over = slotFromPoint(event.clientX, event.clientY);
    if (over) over.classList.add("is-target");
  });
  function endPointerDrag(event) {
    if (!drag.card || event.pointerId !== drag.pointerId) return;
    var moving = drag.card;
    var source = drag.source;
    var wasActive = drag.active;
    var over = wasActive ? slotFromPoint(event.clientX, event.clientY) : null;
    if (source && source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
    drag.card = null;
    drag.source = null;
    drag.pointerId = null;
    drag.active = false;
    setDragging(false);
    if (!wasActive) return;
    if (over) place(moving, Number(over.dataset.slot));
    else state.held = null;
    render();
  }
  document.addEventListener("pointerup", endPointerDrag);
  document.addEventListener("pointercancel", endPointerDrag);
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      if (state.refreshBusy) return;
      state.refreshBusy = true;
      state.refreshNote = "";
      refreshLabel();
      fetch("/albums/refresh", { method: "POST", credentials: "same-origin" })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, status: response.status, body: body };
          });
        })
        .then(function (result) {
          state.refreshBusy = false;
          if (result.ok && result.body.snapshot) {
            applySnapshot(result.body);
            return;
          }
          state.refreshNote = result.body && result.body.message
            ? result.body.message
            : "The collection could not be refreshed.";
          refreshLabel();
        })
        .catch(function () {
          state.refreshBusy = false;
          state.refreshNote = "The collection could not be refreshed.";
          refreshLabel();
        });
    });
  }
  render();
})();
`
