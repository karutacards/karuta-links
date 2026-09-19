# Architecture

One Cloudflare Worker serves HTML, redirects, content ingest and a one-minute Card Hunt poll. One D1 database stores documents, slugs and per-section sequences.

```
POST /api/v1/content  -->  D1 documents + slugs
GET  /content/{id}    <--  snapshot HTML
GET  /contests        <--  recent Card Hunt dumps
GET  /contests/{id}   <--  contest snapshot HTML
GET  /{slug}          -->  302 /{section}/{id}
GET  /                <--  recent content dumps
GET  /api/auth/*      -->  Discord identify (unadvertised)
GET  /drafts/{id}     -->  OAuth-gated draft editor
GET  /api/v1/drafts/{id}/events -->  Draft audit cursor, presence heartbeat
POST /api/v1/drafts   -->  Session cookie, not INGEST_TOKEN
cron * * * * *        -->  Firestore poll, then D1 + R2
```

## Why a Worker

karuta.today is a static Pages site. That model cannot accept writes. karuta.cards uses Pages Functions, which fight a single-segment slug next to `/{section}/{id}`. A Worker owns the whole hostname.

## Data

Tables: `sequences`, `documents`, `slugs`, `contest_dumps`, `drafts`, `draft_entities`, `draft_audit`, `draft_presence`. A dump is an immutable JSON snapshot on `documents`. The matching short link is one row in `slugs`. `contest_dumps` records which Card Hunt `eventCounter` values already have a page. Drafts are mutable: one row per draft, one versioned entity per series or character, and an append-only audit stream that also records lock and unlock. An imported entity keeps `import_action` and `base_aliases` so live rows export as updates. Open editors poll that stream and heartbeat `draft_presence`.

Content-dump HTML uses same-origin `/images/cards/…` paths. Those objects are unframed edition art. The Worker reads private R2 `karuta-images` and falls back to Karuta's uncached CloudFront host on a miss.

Contest HTML uses `/images/contests/card/{event}/{place}`. The reference card is `/images/contests/card/{event}/ref`. Those objects are framed cards copied from the URLs saved on the Firestore entries. A miss does not fall back to character-art CloudFront. Contest image responses are cached for one year at the browser and the Cloudflare edge. They do not change after the dump.

## Card Hunt poll

Every minute the Worker reads `contests/card_hunt`. If `eventCounter` is greater than the last claimed event and that event's `rewarded` field is true, it claims the event, then writes `/contests/{eventCounter}` and copies framed-card images. A later cron does not pick up a claimed event. It does not npm-install `karuta-data-interface`. Firestore REST uses `FIRESTORE_PROJECT_ID` and `FIRESTORE_SERVICE_ACCOUNT`.

## Auth

`INGEST_TOKEN` is a Worker secret for content ingest. Local development reads `.dev.vars`. Public routes do not require auth. Contest dumps are not ingested over HTTP.

Discord identify is wired and unadvertised. Start and callback routes live under `/api/auth`. A signed session cookie is issued when the Discord application credentials and a session signing key are set. Missing credentials return `503` on those two routes. `GET /api/auth/me` reports the cookie. `POST /api/auth/logout` clears it. Dumps stay public. There is no login control on dump HTML. Draft pages require a session and drafts.config.json.

## Rendering

Hono handlers return server-rendered HTML. Dump pages have no client application. The draft editor polls `/api/v1/drafts/{id}/events` while the tab is visible. Escaping is the XSS defense.
