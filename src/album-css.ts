export const ALBUM_CSS = `
:root {
  color-scheme: dark;
  --void: #0f0d12;
  --panel: #16141c;
  --ink: #f3efe6;
  --mute: #9a9388;
  --line: rgba(243, 239, 230, 0.1);
  --accent: #d7b36a;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --dock: 0px;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body {
  margin: 0;
  min-height: 100%;
  height: 100dvh;
  overflow: hidden;
}
body {
  display: flex;
  flex-direction: column;
  color: var(--ink);
  background: var(--void);
  font: 15px/1.35 "Segoe UI", ui-sans-serif, Helvetica, Arial, sans-serif;
}
button, input { font: inherit; color: inherit; }
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 56px;
  padding: max(0.55rem, var(--safe-top)) max(0.85rem, var(--safe-right)) 0.55rem max(0.85rem, var(--safe-left));
  border-bottom: 1px solid var(--line);
}
.mark {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.25rem;
  font-style: italic;
  letter-spacing: -0.03em;
}
.session {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.session img, .face {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}
.bar-tools { display: flex; align-items: center; flex-shrink: 0; gap: 0.55rem; }
.bar-tools .script-note { margin: 0; }
.app {
  display: grid;
  grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr) minmax(15rem, 18rem);
  flex: 1;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1rem;
  background: var(--panel);
}
.shelf {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--line);
}
.collection { flex: 1 1 auto; min-height: 0; }
.albums {
  flex: 0 1 32%;
  max-height: 36%;
  min-height: 8rem;
  border-top: 1px solid var(--line);
}
.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--line);
}
.script {
  flex: 0 1 34%;
  max-height: 38%;
  min-height: 8.5rem;
  border-bottom: 1px solid var(--line);
}
.backgrounds { flex: 1 1 auto; min-height: 0; }
.panel-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.8rem;
}
.panel-head h1, .stage-note, .script-note { margin: 0; }
.panel-head h1 {
  flex: 1;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute);
}
#search, #bg-search {
  width: 7.5rem;
  padding: 0.35rem 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
}
#search:focus, #bg-search:focus { outline: none; border-bottom-color: var(--accent); }
.ghost, .copy, .page, .add-page, .dock-btn {
  min-height: 44px;
  padding: 0 0.85rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--mute);
  cursor: pointer;
}
.ghost { border: 0; min-height: 36px; }
.ghost:hover, .copy:not(:disabled):hover, .page:hover, .add-page:hover, .dock-btn:hover { color: var(--ink); }
.copy:not(:disabled):hover, .page[aria-selected="true"] { border-color: var(--accent); color: var(--ink); }
.copy:disabled, .page:disabled, .add-page:disabled, .dock-btn:disabled { opacity: 0.4; cursor: default; }
.copy.is-done { color: var(--accent); }
.close-sheet { display: none; }
.gate { margin: auto 0; color: var(--mute); font-size: 0.92rem; }
.scroll {
  overflow: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(243, 239, 230, 0.32) transparent;
  scrollbar-gutter: stable;
}
.stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 0.7rem;
  flex: 1;
}
.pick, .slot {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.pick { text-align: left; cursor: grab; touch-action: none; }
.pick.is-used { opacity: 0.32; }
.pick.is-held .portrait, .pick:hover .portrait { transform: translateY(-3px); }
.portrait {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 520 / 720;
  object-fit: cover;
  pointer-events: none;
  -webkit-user-drag: none;
  transition: transform 160ms ease;
}
.chrome { pointer-events: none; }
body.is-dragging { cursor: grabbing; }
body.is-dragging .slot .tile { pointer-events: none; }
.tile {
  position: relative;
  overflow: hidden;
}
.chrome {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 0.28rem 0.32rem 0.22rem;
  background: linear-gradient(transparent, rgba(8, 6, 10, 0.86));
  color: #f3efe6;
  font-size: 0.62rem;
  letter-spacing: 0.03em;
  line-height: 1.25;
}
.chrome strong { display: block; font-size: 0.68rem; }
.stars { color: var(--accent); letter-spacing: 0.04em; }
.dye {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  margin-left: 0.25rem;
  border-radius: 50%;
  vertical-align: -0.05rem;
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 1rem;
}
.spread {
  position: relative;
  width: min(100%, calc((100dvh - 11rem - var(--dock)) * 4 / 3));
  max-width: 64rem;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #1a1612;
}
.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.slots {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  padding: 7% 6%;
  gap: 3.4%;
}
.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}
.slot::before {
  content: attr(data-slot);
  position: absolute;
  inset: 8%;
  border: 1px dashed rgba(243, 239, 230, 0.42);
  background: rgba(10, 8, 12, 0.28);
  color: rgba(243, 239, 230, 0.78);
  font-family: Georgia, serif;
  font-size: clamp(1.1rem, 3vw, 2.4rem);
  display: grid;
  place-items: center;
}
.slot.is-filled::before { display: none; }
.slot.is-target::before { border-color: var(--accent); color: var(--accent); }
.drag-ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 80;
  width: 5.5rem;
  pointer-events: none;
  opacity: 0.92;
  filter: drop-shadow(0 12px 16px rgba(0, 0, 0, 0.5));
}
.slot .tile {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 12px 16px rgba(0, 0, 0, 0.55));
}
.slot .portrait { height: 100%; object-fit: cover; }
.stage-tools {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  width: min(100%, 40rem);
  margin-top: 0.85rem;
}
.pages {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 0;
  overflow: auto;
}
.page, .add-page { min-width: 2.5rem; padding: 0 0.7rem; }
.stage-note, .script-note {
  margin: 0.7rem 0 0;
  color: var(--mute);
  font-size: 0.82rem;
  text-align: center;
}
.script pre {
  flex: 1;
  margin: 0;
  color: #e6d9b8;
  font: 12px/1.45 ui-monospace, "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
}
.dock { display: none; }
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(7, 6, 10, 0.55);
}
.bg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 0.65rem;
  flex: 1;
}
.bg-pick {
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.bg-pick.is-on { border-color: var(--accent); }
.bg-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.bg-pick figcaption, .pick figcaption {
  margin: 0.35rem 0 0;
  color: var(--mute);
  font-size: 0.72rem;
}
.album-list { display: flex; flex-direction: column; gap: 0.45rem; flex: 1; }
.album-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  width: 100%;
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.album-row[aria-current="true"] { border-color: var(--accent); color: var(--ink); }
.album-row span { color: var(--mute); font-size: 0.72rem; }
.album-row input {
  width: 100%;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--ink);
  font-size: 0.95rem;
  font-weight: 650;
  text-transform: lowercase;
}
.album-row input:focus { outline: none; border-bottom-color: var(--accent); }
.album-row.is-bad input { border-bottom-color: #c45b4a; }
.name-hint { display: none; margin: 0.45rem 0 0; color: #c45b4a; font-size: 0.75rem; }
.name-hint:not([hidden]) { display: block; }
.start {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 28rem;
  margin: auto;
  padding: 2rem 1.25rem;
}
.start p { margin: 0; color: var(--ink); }
.start a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 1rem;
  border-radius: 999px;
  background: #5865f2;
  color: #fff;
  text-decoration: none;
}
@media (max-width: 1080px) {
  .app {
    grid-template-columns: minmax(0, 1fr) minmax(14rem, 17rem);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .shelf {
    grid-column: 1 / -1;
    grid-row: 2;
    flex-direction: row;
    border-right: 0;
    border-top: 1px solid var(--line);
    max-height: 28dvh;
  }
  .collection { flex: 1 1 auto; border-right: 1px solid var(--line); }
  .albums { flex: 0 0 14rem; max-height: none; min-height: 0; border-top: 0; }
  .stack { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  :root { --dock: calc(4.15rem + var(--safe-bottom)); }
  .app { display: flex; flex-direction: column; }
  .shelf, .rail { display: none; }
  .app[data-sheet="cards"] .shelf,
  .app[data-sheet="script"] .rail {
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--dock);
    z-index: 50;
    max-height: min(70dvh, 36rem);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 1.1rem 1.1rem 0 0;
    background: var(--panel);
  }
  .app[data-sheet="cards"] .collection {
    flex: 1 1 auto;
    border-right: 0;
    min-height: 0;
  }
  .app[data-sheet="cards"] .albums {
    flex: 0 0 auto;
    width: 100%;
    max-height: 28%;
    min-height: 6.5rem;
    border-top: 1px solid var(--line);
    border-right: 0;
  }
  .app[data-sheet="cards"] .close-sheet,
  .app[data-sheet="script"] .close-sheet { display: inline-flex; }
  .app[data-sheet="cards"] .sheet-backdrop,
  .app[data-sheet="script"] .sheet-backdrop {
    display: block;
    bottom: var(--dock);
  }
  .desktop-copy { display: none; }
  .stage { flex: 1; justify-content: flex-start; padding: 0.7rem 0.7rem 0; }
  .spread { width: 100%; }
  .stack { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    position: relative;
    z-index: 45;
    padding: 0.45rem max(0.7rem, var(--safe-right)) max(0.45rem, var(--safe-bottom)) max(0.7rem, var(--safe-left));
    border-top: 1px solid var(--line);
    background: #121018;
  }
  .dock-btn, .dock-copy { flex: 1; }
  .dock-copy { background: var(--accent); border-color: var(--accent); color: #1a1408; }
  .dock-copy:disabled { background: transparent; border-color: var(--line); color: var(--mute); }
}
`
